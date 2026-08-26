import { Prisma } from '@prisma/client';
import type { BrokerKind, DecisionMode, OrderSide, OrderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isHalted } from '../automation/control';
import { validateOrderFill, type BrokerAdapter, type OrderResult } from '../execution/broker';
import { selectBroker } from '../execution/registry';
import { acquireUserExecutionLock, releaseUserExecutionLock } from '../execution/userLock';
import { constructHalalPortfolio } from './construction';
import {
  PERIOD_DAYS, heldDaysBetween, purificationOwed, type PurificationResult,
} from './purification';

const D = Prisma.Decimal;
const MAX_MARK_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_BUY_SLIPPAGE = new D('1.01');

/**
 * Loads the point-in-time fundamentals backing one holding's purification and applies AAOIFI SS 21
 * income attribution. `releasedAt` gates visibility so a filing published after `asOf` can never
 * inform a decision made at `asOf`.
 *
 * Falls back to the disclosed dividend floor when no covering filing exists; the caller records
 * which basis was used rather than presenting the two as equivalent.
 */
async function computeHoldingPurification(args: {
  symbol: string;
  ratio: number;
  heldShares: number;
  openedAt: Date;
  asOf: Date;
}): Promise<PurificationResult> {
  const row = await prisma.fundamentals.findFirst({
    where: { symbol: args.symbol, market: 'NASDAQ', releasedAt: { lte: args.asOf } },
    orderBy: { releasedAt: 'desc' },
    select: { metrics: true, period: true },
  });

  const metrics = (row?.metrics ?? {}) as Record<string, unknown>;
  const numeric = (key: string): number | null => {
    const value = metrics[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  return purificationOwed({
    ratio: args.ratio,
    totalRevenueUsd: numeric('totalRevenueUsd'),
    sharesOutstanding: numeric('sharesOutstanding'),
    heldShares: args.heldShares,
    heldDays: heldDaysBetween(args.openedAt, args.asOf),
    periodDays: row?.period === 'QUARTERLY' ? PERIOD_DAYS.QUARTERLY : PERIOD_DAYS.ANNUAL,
  });
}

export interface RebalanceLog {
  rebalanced: boolean;
  nav: number;
  tradesPlaced: number;
  purificationOwed: number;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

async function releaseClaim(key: string): Promise<void> {
  await prisma.autoRunClaim.deleteMany({ where: { key } });
}

async function loadFreshNasdaqMark(symbol: string, asOf: Date): Promise<Prisma.Decimal> {
  const freshAfter = new Date(asOf.getTime() - MAX_MARK_AGE_MS);
  const bar = await prisma.marketBar.findFirst({
    where: {
      symbol,
      market: 'NASDAQ',
      interval: 'DAY',
      ts: { gte: freshAfter, lte: asOf },
    },
    orderBy: { ts: 'desc' },
  });

  if (
    !bar
    || bar.ts < freshAfter
    || bar.ts > asOf
    || !bar.close.isPositive()
  ) {
    throw new Error(`Missing or stale NASDAQ mark for ${symbol}`);
  }
  return bar.close;
}

async function loadHistoricalNasdaqMark(symbol: string, asOf: Date): Promise<Prisma.Decimal> {
  const bar = await prisma.marketBar.findFirst({
    where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: asOf } },
    orderBy: { ts: 'desc' },
  });
  if (!bar || !bar.close.isPositive()) {
    throw new Error(`Missing historical NASDAQ mark for ${symbol} at ${asOf.toISOString()}`);
  }
  return bar.close;
}

type UserWithPortfolio = Prisma.UserGetPayload<{ include: { portfolioItems: true } }>;

interface RebalanceUnit {
  key: string;
  isNew: boolean;
  decision: {
    id: string;
    status: string;
  };
  order: {
    id: string;
    brokerRef: string | null;
    status: OrderStatus;
    qty: Prisma.Decimal;
    filledQty: Prisma.Decimal;
    avgFillPrice: Prisma.Decimal;
  };
}

async function claimRebalanceUnit(args: {
  key: string;
  userId: string;
  strategyId: string;
  symbol: string;
  side: OrderSide;
  qty: Prisma.Decimal;
  asOf: Date;
  mode: DecisionMode;
  broker: BrokerKind;
}): Promise<RebalanceUnit> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.autoRunClaim.create({ data: { key: args.key } });
      const decision = await tx.decision.create({
        data: {
          strategyId: args.strategyId,
          userId: args.userId,
          symbol: args.symbol,
          market: 'NASDAQ',
          asOf: args.asOf,
          proposedAction: args.side,
          proposedQty: args.qty,
          finalAction: args.side,
          finalQty: args.qty,
          shariaGate: { compliant: true, source: 'portfolio-construction' },
          riskAdjustments: { source: 'portfolio-rebalance' },
          debateTranscript: [],
          temperature: new D(0),
          seed: 0,
          mode: args.mode,
          status: 'APPROVED',
        },
      });
      const order = await tx.order.create({
        data: {
          decisionId: decision.id,
          symbol: args.symbol,
          market: 'NASDAQ',
          side: args.side,
          qty: args.qty,
          filledQty: new D(0),
          avgFillPrice: new D(0),
          status: 'NEW',
          broker: args.broker,
        },
      });
      return { key: args.key, isNew: true, decision, order };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const decision = await prisma.decision.findFirst({
      where: {
        strategyId: args.strategyId,
        userId: args.userId,
        symbol: args.symbol,
        asOf: args.asOf,
        finalAction: args.side,
      },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!decision?.order) {
      throw new Error(`Rebalance unit ${args.key} is already in progress`);
    }
    return { key: args.key, isNew: false, decision, order: decision.order };
  }
}

async function closeUnsubmittedUnit(
  unit: RebalanceUnit,
  status: Extract<OrderStatus, 'CANCELLED' | 'REJECTED'>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: unit.order.id }, data: { status } });
    await tx.decision.update({ where: { id: unit.decision.id }, data: { status: 'REJECTED' } });
    await tx.autoRunClaim.delete({ where: { key: unit.key } });
  });
}

async function persistBrokerResult(
  orderId: string,
  requestedQty: Prisma.Decimal,
  fill: OrderResult,
): Promise<OrderResult> {
  validateOrderFill(fill, requestedQty);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      brokerRef: fill.brokerRef,
      status: fill.status,
      filledQty: fill.filledQty,
      avgFillPrice: fill.avgFillPrice,
    },
  });
  return fill;
}

async function obtainFinalFill(args: {
  unit: RebalanceUnit;
  broker: BrokerAdapter;
  request: {
    symbol: string;
    side: OrderSide;
    qty: Prisma.Decimal;
    refPrice: Prisma.Decimal;
    limitPrice?: Prisma.Decimal;
  };
}): Promise<OrderResult | null> {
  const { unit, broker, request } = args;
  if (unit.decision.status === 'EXECUTED') return null;

  let fill: OrderResult;
  const brokerRequest = {
    ...request,
    qty: unit.order.qty,
    market: 'NASDAQ' as const,
    clientOrderId: `rushd-${unit.order.id}`,
  };
  if (unit.isNew) {
    // This is intentionally adjacent to submitOrder: QuantControl can halt between units.
    if (await isHalted()) {
      await closeUnsubmittedUnit(unit, 'CANCELLED');
      throw new Error('Quant execution halted before broker submission');
    }

    try {
      fill = await broker.submitOrder(brokerRequest);
    } catch (error) {
      // InternalSim has no remote ambiguity: a throw means no order was accepted. A remote
      // timeout may have been accepted by the broker, so retain its NEW Order + unit claim
      // for operator reconciliation instead of risking a duplicate submission on retry.
      if (broker.kind === 'INTERNAL_SIM') {
        await closeUnsubmittedUnit(unit, 'REJECTED');
      }
      throw error;
    }
    fill = await persistBrokerResult(unit.order.id, unit.order.qty, fill);
  } else {
    if (!unit.order.brokerRef) {
      if (await isHalted()) {
        throw new Error(`Rebalance order ${unit.order.id} requires broker reconciliation while halted`);
      }
      fill = await broker.submitOrder(brokerRequest);
      fill = await persistBrokerResult(unit.order.id, unit.order.qty, fill);
    } else {
      fill = {
        brokerRef: unit.order.brokerRef,
        status: unit.order.status,
        filledQty: unit.order.filledQty,
        avgFillPrice: unit.order.avgFillPrice,
      };
      if (fill.status === 'NEW' || fill.status === 'PARTIAL') {
        fill = await persistBrokerResult(unit.order.id, unit.order.qty, await broker.getOrder(fill.brokerRef));
      }
    }
  }

  if (fill.status === 'NEW' || fill.status === 'PARTIAL') {
    // Freeze cumulative quantity before settlement. If cancellation/reconciliation is not
    // terminal yet, the persisted Order remains the recoverable audit root for a later retry.
    await broker.cancelOrder(fill.brokerRef);
    fill = await persistBrokerResult(unit.order.id, unit.order.qty, await broker.getOrder(fill.brokerRef));
  }

  if (fill.status === 'NEW' || fill.status === 'PARTIAL') {
    throw new Error(`Rebalance order ${unit.order.id} is pending broker reconciliation`);
  }
  if (fill.filledQty.lte(0)) {
    if (fill.status === 'CANCELLED' || fill.status === 'REJECTED') {
      await closeUnsubmittedUnit(unit, fill.status);
    }
    throw new Error(`Rebalance order ${unit.order.id} completed without a fill`);
  }
  return fill;
}

/**
 * Executes a paper rebalance for one NASDAQ strategy.
 *
 * The strategy/day claim prevents concurrent passes. Each symbol/side unit separately owns
 * an AutoRunClaim + Decision + Order created atomically before broker submission. Broker
 * status is persisted before the money transaction, so a database settlement failure can be
 * retried from the Order without submitting twice. The broker call itself is external and is
 * deliberately not described or treated as transactionally atomic with PostgreSQL.
 */
export async function executePortfolioRebalance(
  userId: string,
  strategyId: string,
  asOf = new Date(),
): Promise<RebalanceLog> {
  const [initialUser, strategy] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { portfolioItems: { where: { market: 'NASDAQ' } } },
    }),
    prisma.strategy.findFirst({
      where: { id: strategyId, ownerUserId: userId, market: 'NASDAQ' },
      select: { autonomyTier: true },
    }),
  ]);

  if (!initialUser) throw new Error('User not found');
  if (!strategy) throw new Error('NASDAQ strategy not found for user');
  if (initialUser.tier !== 'ULTRA') {
    throw new Error('Unauthorized: Strategy owner must be ULTRA tier');
  }

  const today = asOf.toISOString().slice(0, 10);
  await acquireUserExecutionLock(userId);
  const passClaimKey = `rebalance-${strategyId}-${today}`;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { portfolioItems: { where: { market: 'NASDAQ' } } },
    });
    if (!user) throw new Error('User not found after execution lock');
    try {
      await prisma.autoRunClaim.create({ data: { key: passClaimKey } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const lastSnapshot = await prisma.portfolioSnapshot.findFirst({
        where: { userId, strategyId },
        orderBy: { asOf: 'desc' },
      });
      return {
        rebalanced: false,
        nav: (lastSnapshot?.nav ?? user.cashVirtual).toNumber(),
        tradesPlaced: 0,
        purificationOwed: 0,
      };
    }

    try {
      return await runRebalancePass(
        user,
        strategyId,
        strategy.autonomyTier,
        asOf,
        today,
      );
    } catch (error) {
      // Release only the strategy/day pass. Per-order claims survive ambiguous or filled
      // broker outcomes and are the reconciliation key used by the retry.
      await releaseClaim(passClaimKey);
      throw error;
    }
  } finally {
    await releaseUserExecutionLock(userId);
  }
}

async function runRebalancePass(
  user: UserWithPortfolio,
  strategyId: string,
  mode: DecisionMode,
  asOf: Date,
  today: string,
): Promise<RebalanceLog> {
  const userId = user.id;
  const currentPrices = new Map<string, Prisma.Decimal>();
  let totalHoldingsValue = new D(0);

  // Only NASDAQ positions are admitted to this pass, even if a mock/caller bypasses the
  // relation filter above. TASI positions never enter NAV, order generation, or snapshots.
  const currentItems = user.portfolioItems.filter((item) => item.market === 'NASDAQ');
  for (const item of currentItems) {
    const price = await loadFreshNasdaqMark(item.symbol, asOf);
    currentPrices.set(item.symbol, price);
    totalHoldingsValue = totalHoldingsValue.plus(item.shares.mul(price));
  }
  const currentNAV = user.cashVirtual.plus(totalHoldingsValue);

  const proposal = await constructHalalPortfolio('NASDAQ', asOf);
  const targetHoldings = new Map<string, { qty: Prisma.Decimal; ratio: number }>();
  for (const target of proposal.weights) {
    const price = currentPrices.get(target.symbol) ?? await loadFreshNasdaqMark(target.symbol, asOf);
    currentPrices.set(target.symbol, price);
    const targetQty = currentNAV.mul(target.weight.toString()).div(price);
    targetHoldings.set(target.symbol, { qty: targetQty, ratio: target.purificationRatio });
  }

  // Snapshot dependencies are also validated before the first broker call. This prevents a
  // successful fill followed by a late snapshot failure caused by a fabricated benchmark.
  const [spyPrice, spusPrice, lastSnapshot] = await Promise.all([
    loadFreshNasdaqMark('SPY', asOf),
    loadFreshNasdaqMark('SPUS', asOf),
    prisma.portfolioSnapshot.findFirst({
      where: { userId, strategyId },
      orderBy: { asOf: 'desc' },
    }),
  ]);
  let spyNav = spyPrice;
  let spusNav = spusPrice;
  if (lastSnapshot) {
    const [previousSpyPrice, previousSpusPrice] = await Promise.all([
      loadHistoricalNasdaqMark('SPY', lastSnapshot.asOf),
      loadHistoricalNasdaqMark('SPUS', lastSnapshot.asOf),
    ]);
    spyNav = lastSnapshot.benchmarkNavSpy.mul(spyPrice).div(previousSpyPrice);
    spusNav = lastSnapshot.benchmarkNavSpus.mul(spusPrice).div(previousSpusPrice);
  }

  const broker = selectBroker('NASDAQ');
  const unitAsOf = dayStart(today);
  let tradesPlaced = 0;
  let purificationOwed = new D(0);

  // SELL first to free virtual cash.
  for (const item of currentItems) {
    const target = targetHoldings.get(item.symbol);
    const targetQty = target?.qty ?? new D(0);
    if (!item.shares.gt(targetQty)) continue;

    const sellQty = item.shares.minus(targetQty);
    const price = currentPrices.get(item.symbol);
    if (!price) throw new Error(`Missing NASDAQ mark for ${item.symbol}`);
    const key = `rebalance-order-${strategyId}-${today}-${item.symbol}-SELL`;
    const unit = await claimRebalanceUnit({
      key,
      userId,
      strategyId,
      symbol: item.symbol,
      side: 'SELL',
      qty: sellQty,
      asOf: unitAsOf,
      mode,
      broker: broker.kind,
    });
    const fill = await obtainFinalFill({
      unit,
      broker,
      request: { symbol: item.symbol, side: 'SELL', qty: sellQty, refPrice: price },
    });
    if (!fill) continue;

    const notional = fill.filledQty.mul(fill.avgFillPrice);
    const ratio = target?.ratio ?? 0.005;
    // QDR-23 (R4): purification is the investor's share of the investee's non-permissible INCOME
    // over the holding period (AAOIFI SS 21 §3/4) — NOT a levy on realized capital gain. The
    // previous `max(0, avgFillPrice - costBasis) x filledQty x ratio` charged a price movement and
    // floored losses away; QDR-23 measured that base as a 30-80x overstatement. Price, cost basis
    // and gain are deliberately no longer inputs here.
    const purificationResult = await computeHoldingPurification({
      symbol: item.symbol,
      ratio,
      heldShares: fill.filledQty.toNumber(),
      openedAt: item.createdAt,
      asOf,
    });
    const purification = new D(purificationResult.amountUsd.toFixed(8));
    // Realized gain is still RECORDED — it is a true fact about the trade — but it is no longer the
    // purification base. `PurificationEntry.profit` is a required column whose name now describes
    // its provenance rather than its role; repurposing it to hold the attributed income base would
    // make historical rows and new rows mean different things in the same column. Adding a `basis`
    // column so the two are distinguishable is a separate migration on a live money table.
    const costBasis = item.costBasis ?? price;
    const profit = D.max(0, fill.avgFillPrice.minus(costBasis).mul(fill.filledQty));

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId,
          amount: notional,
          currency: 'USD',
          type: 'TRADE',
          description: `SELL REBALANCE ${fill.filledQty.toString()} ${item.symbol} @ ${fill.avgFillPrice.toString()}`,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { cashVirtual: { increment: notional } },
      });

      const holdingUpdate = await tx.portfolioItem.updateMany({
        where: { id: item.id, shares: { gte: fill.filledQty } },
        data: { shares: { decrement: fill.filledQty } },
      });
      if (holdingUpdate.count !== 1) {
        throw new Error(`Insufficient shares to settle ${item.symbol} rebalance`);
      }
      await tx.portfolioItem.deleteMany({ where: { id: item.id, shares: { lte: 0 } } });

      if (purification.gt(0)) {
        await tx.purificationEntry.create({
          data: {
            userId,
            symbol: item.symbol,
            amount: purification,
            ratio: new D(ratio.toString()),
            profit,
          },
        });
        await tx.transaction.create({
          data: {
            userId,
            amount: purification,
            currency: 'USD',
            type: 'PROFIT_SHARE',
            description: `Purification logged for non-compliant income attributable to ${item.symbol}`,
          },
        });
      }
      await tx.decision.update({ where: { id: unit.decision.id }, data: { status: 'EXECUTED' } });
    });
    purificationOwed = purificationOwed.plus(purification);
    tradesPlaced += 1;
  }

  // BUY second.
  for (const [symbol, target] of Array.from(targetHoldings.entries())) {
    const currentItem = currentItems.find((item) => item.symbol === symbol);
    const currentQty = currentItem?.shares ?? new D(0);
    if (!target.qty.gt(currentQty)) continue;

    const requestedQty = target.qty.minus(currentQty);
    const price = currentPrices.get(symbol);
    if (!price) throw new Error(`Missing NASDAQ mark for ${symbol}`);
    const maxFillPrice = price.mul(MAX_BUY_SLIPPAGE);
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    const currentCash = currentUser?.cashVirtual ?? new D(0);
    const buyQty = D.min(requestedQty, currentCash.div(maxFillPrice));
    if (buyQty.lte(0)) continue;

    const key = `rebalance-order-${strategyId}-${today}-${symbol}-BUY`;
    const unit = await claimRebalanceUnit({
      key,
      userId,
      strategyId,
      symbol,
      side: 'BUY',
      qty: buyQty,
      asOf: unitAsOf,
      mode,
      broker: broker.kind,
    });
    const fill = await obtainFinalFill({
      unit,
      broker,
      request: { symbol, side: 'BUY', qty: buyQty, refPrice: price, limitPrice: maxFillPrice },
    });
    if (!fill) continue;

    const notional = fill.filledQty.mul(fill.avgFillPrice);
    if (fill.avgFillPrice.gt(maxFillPrice) || notional.gt(currentCash)) {
      throw new Error(`BUY fill exceeded reserved cash for ${symbol}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId,
          amount: notional.negated(),
          currency: 'USD',
          type: 'TRADE',
          description: `BUY REBALANCE ${fill.filledQty.toString()} ${symbol} @ ${fill.avgFillPrice.toString()}`,
        },
      });
      const cashUpdate = await tx.user.updateMany({
        where: { id: userId, cashVirtual: { gte: notional } },
        data: { cashVirtual: { decrement: notional } },
      });
      if (cashUpdate.count !== 1) {
        throw new Error(`Insufficient cash to settle ${symbol} rebalance`);
      }

      const existing = await tx.portfolioItem.findUnique({
        where: { userId_symbol: { userId, symbol } },
      });
      const oldQty = existing?.shares ?? new D(0);
      const oldBasis = existing?.costBasis ?? fill.avgFillPrice;
      const newQty = oldQty.plus(fill.filledQty);
      const newCostBasis = oldQty.mul(oldBasis)
        .plus(fill.filledQty.mul(fill.avgFillPrice))
        .div(newQty);

      await tx.portfolioItem.upsert({
        where: { userId_symbol: { userId, symbol } },
        create: {
          userId,
          symbol,
          shares: fill.filledQty,
          market: 'NASDAQ',
          currency: 'USD',
          costBasis: fill.avgFillPrice,
        },
        update: { shares: newQty, costBasis: newCostBasis },
      });
      await tx.decision.update({ where: { id: unit.decision.id }, data: { status: 'EXECUTED' } });
    });
    tradesPlaced += 1;
  }

  const finalHoldings = await prisma.portfolioItem.findMany({
    where: { userId, market: 'NASDAQ' },
  });
  const positionsJson: Record<string, { qty: number; costBasis: number | null }> = {};
  let finalHoldingsValue = new D(0);
  for (const item of finalHoldings) {
    const price = currentPrices.get(item.symbol);
    if (!price) throw new Error(`Missing NASDAQ mark for final position ${item.symbol}`);
    positionsJson[item.symbol] = {
      qty: item.shares.toNumber(),
      costBasis: item.costBasis?.toNumber() ?? null,
    };
    finalHoldingsValue = finalHoldingsValue.plus(item.shares.mul(price));
  }

  const finalUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!finalUser) throw new Error('User not found after rebalance');
  const finalNAV = finalUser.cashVirtual.plus(finalHoldingsValue);
  await prisma.portfolioSnapshot.create({
    data: {
      strategyId,
      userId,
      asOf,
      cashVirtual: finalUser.cashVirtual,
      currency: 'USD',
      positions: positionsJson,
      nav: finalNAV,
      benchmarkNavSpy: spyNav,
      benchmarkNavSpus: spusNav,
    },
  });

  return {
    rebalanced: true,
    nav: finalNAV.toNumber(),
    tradesPlaced,
    purificationOwed: purificationOwed.toNumber(),
  };
}
