// Rushd Quant — executeDecision (QUANT_DESIGN.md §5, DR-9 audit rule).
// Turns an APPROVED Decision into a paper fill. Money-mutating, so:
//  - authz: owner only (checked here AND in the route, defense in depth);
//  - race-safe: the Order row (Order.decisionId @unique) is CLAIMED before the external
//    broker call, so two concurrent executes cannot both submit to the broker — the
//    claim-loser short-circuits (ALREADY_EXECUTED) and never calls out;
//  - atomic settle: one $transaction updates the Order to FILLED, writes a Transaction(TRADE)
//    audit row, settles either the user wallet or an isolated engine-owned book, and flips
//    Decision→EXECUTED;
//  - paper/sim only: the live broker path is gated in the AlpacaPaperBroker constructor.
import { Prisma } from '@prisma/client';
import type { Currency, OrderSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { validateOrderFill, type OrderResult } from './broker';
import type { BrokerAdapter } from './broker';
import { selectBroker } from './registry';
import { acquireUserExecutionLock, releaseUserExecutionLock } from './userLock';

const D = Prisma.Decimal;

export type ExecCode = 'not_found' | 'forbidden' | 'conflict' | 'no_market_data' | 'insufficient_funds' | 'insufficient_shares';

export class ExecutionError extends Error {
  constructor(
    public readonly code: ExecCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

export interface ExecResult {
  orderId: string | null;
  status: string; // OrderStatus, or 'HOLD_NOOP' / 'ALREADY_EXECUTED'
}

export interface ExecutionOptions {
  /** Automation injects the persisted/env kill-switch here, immediately before broker submission. */
  beforeSubmit?: () => Promise<void>;
  /** Trusted automation may pin the paper adapter; user routes omit this and use the registry. */
  broker?: BrokerAdapter;
  /** Deterministic books pin the engine's next-open reference instead of repricing at latest close. */
  refPrice?: Prisma.Decimal;
  /** Keep incubation cash/positions in its strategy-scoped engine ledger, never the owner's wallet. */
  isolatedPaperBook?: boolean;
}

function currencyFor(market: 'TASI' | 'NASDAQ'): Currency {
  return market === 'TASI' ? 'SAR' : 'USD';
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Execute an APPROVED decision for its owner. Idempotent; HOLD is a no-op. */
async function executeLockedDecision(
  decisionId: string,
  userId: string,
  options: ExecutionOptions,
): Promise<ExecResult> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { order: true },
  });
  if (!decision) throw new ExecutionError('not_found', 'Decision not found.');
  if (decision.userId !== userId) throw new ExecutionError('forbidden', 'Not your decision.');
  if (decision.finalAction === 'HOLD') return { orderId: null, status: 'HOLD_NOOP' };
  if (decision.order && decision.status === 'EXECUTED') {
    return { orderId: decision.order.id, status: 'ALREADY_EXECUTED' };
  }
  if (decision.status !== 'APPROVED') {
    throw new ExecutionError('conflict', `Decision must be APPROVED to execute (is ${decision.status}).`);
  }

  const side: OrderSide = decision.finalAction === 'BUY' ? 'BUY' : 'SELL';
  const qty = decision.finalQty;

  let refPrice = options.refPrice;
  if (!refPrice) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: decision.symbol, market: decision.market },
      orderBy: { ts: 'desc' },
    });
    if (!bar) throw new ExecutionError('no_market_data', 'No market data to price the fill.');
    refPrice = bar.close;
  }
  if (!refPrice.isPositive()) throw new ExecutionError('no_market_data', 'Fill reference must be positive.');
  const limitPrice = side === 'BUY' ? refPrice.mul('1.01') : undefined;

  // Constructing the broker asserts the live-execution gate for any live URL (dark by default).
  const broker = options.broker ?? selectBroker(decision.market);
  if (options.isolatedPaperBook && (broker.kind !== 'INTERNAL_SIM' || !decision.strategyId)) {
    throw new ExecutionError('conflict', 'An isolated paper book requires InternalSimBroker and a strategy-scoped decision.');
  }

  // The shared user lock makes these reservations stable until atomic settlement.
  if (!options.isolatedPaperBook && side === 'BUY') {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !limitPrice || user.cashVirtual.lt(qty.mul(limitPrice))) {
      throw new ExecutionError('insufficient_funds', 'Insufficient virtual cash for this buy.');
    }
  } else if (!options.isolatedPaperBook) {
    const holding = await prisma.portfolioItem.findUnique({
      where: { userId_symbol: { userId, symbol: decision.symbol } },
    });
    if (!holding || holding.shares.lt(qty)) {
      throw new ExecutionError('insufficient_shares', 'Insufficient shares for this sell.');
    }
  }

  // CLAIM the decision via the Order unique constraint BEFORE any external submit.
  let order = decision.order;
  if (!order) {
    try {
      order = await prisma.order.create({
        data: {
          decisionId: decision.id,
          symbol: decision.symbol,
          market: decision.market,
          side,
          qty,
          filledQty: new D(0),
          avgFillPrice: new D(0),
          status: 'NEW',
          broker: broker.kind,
        },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      order = await prisma.order.findUnique({ where: { decisionId: decision.id } });
      if (!order) throw new ExecutionError('conflict', 'Order claim could not be recovered.');
    }
  }
  const orderId = order.id;

  const request = {
    symbol: decision.symbol,
    market: decision.market,
    side,
    qty,
    refPrice,
    limitPrice,
    clientOrderId: `rushd-${orderId}`,
  };
  let fill: OrderResult;
  if (order.brokerRef && order.status !== 'NEW' && order.status !== 'PARTIAL') {
    fill = {
      brokerRef: order.brokerRef,
      status: order.status,
      filledQty: order.filledQty,
      avgFillPrice: order.avgFillPrice,
    };
  } else {
    try {
      fill = order.brokerRef
        ? await broker.getOrder(order.brokerRef)
        : await (async () => {
          await options.beforeSubmit?.();
          return broker.submitOrder(request);
        })();
    } catch (e) {
      if (broker.kind === 'INTERNAL_SIM') {
        await prisma.order.update({ where: { id: orderId }, data: { status: 'REJECTED' } });
      }
      throw e;
    }
    validateOrderFill(fill, qty);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        brokerRef: fill.brokerRef,
        filledQty: fill.filledQty,
        avgFillPrice: fill.avgFillPrice,
        status: fill.status,
      },
    });
  }
  validateOrderFill(fill, qty);

  if (fill.status === 'NEW' || fill.status === 'PARTIAL') {
    await broker.cancelOrder(fill.brokerRef);
    fill = validateOrderFill(await broker.getOrder(fill.brokerRef), qty);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        brokerRef: fill.brokerRef,
        filledQty: fill.filledQty,
        avgFillPrice: fill.avgFillPrice,
        status: fill.status,
      },
    });
  }
  if (fill.status === 'NEW' || fill.status === 'PARTIAL' || fill.filledQty.lte(0)) {
    throw new ExecutionError('conflict', 'Broker order has no terminal fill to settle.');
  }

  const notional = fill.filledQty.mul(fill.avgFillPrice);
  const currency = currencyFor(decision.market);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        brokerRef: fill.brokerRef,
        filledQty: fill.filledQty,
        avgFillPrice: fill.avgFillPrice,
        status: fill.status,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        amount: side === 'BUY' ? notional.negated() : notional,
        currency,
        type: 'TRADE',
        description: `${side} ${fill.filledQty.toString()} ${decision.symbol} @ ${fill.avgFillPrice.toString()}${
          options.isolatedPaperBook ? ` [isolated:${decision.strategyId}]` : ''
        }`,
      },
    });

    if (options.isolatedPaperBook) {
      // The deterministic strategy engine owns this book's $1m cash/position ledger. We retain
      // Order + Transaction + Decision audit records without contaminating the user's wallet.
    } else if (side === 'BUY') {
      const cashUpdate = await tx.user.updateMany({
        where: { id: userId, cashVirtual: { gte: notional } },
        data: { cashVirtual: { decrement: notional } },
      });
      if (cashUpdate.count !== 1) {
        throw new ExecutionError('insufficient_funds', 'Insufficient virtual cash during settlement.');
      }
      await tx.portfolioItem.upsert({
        where: { userId_symbol: { userId, symbol: decision.symbol } },
        create: { userId, symbol: decision.symbol, shares: fill.filledQty, market: decision.market, currency },
        update: { shares: { increment: fill.filledQty } },
      });
    } else {
      const holdingUpdate = await tx.portfolioItem.updateMany({
        where: { userId, symbol: decision.symbol, shares: { gte: fill.filledQty } },
        data: { shares: { decrement: fill.filledQty } },
      });
      if (holdingUpdate.count !== 1) {
        throw new ExecutionError('insufficient_shares', 'Insufficient shares during settlement.');
      }
      await tx.portfolioItem.deleteMany({
        where: { userId, symbol: decision.symbol, shares: { lte: 0 } },
      });
      await tx.user.update({ where: { id: userId }, data: { cashVirtual: { increment: notional } } });
    }

    await tx.decision.update({ where: { id: decision.id }, data: { status: 'EXECUTED' } });
  });

  return { orderId, status: fill.status };
}

export async function executeDecision(
  decisionId: string,
  userId: string,
  options: ExecutionOptions = {},
): Promise<ExecResult> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    select: { userId: true },
  });
  if (!decision) throw new ExecutionError('not_found', 'Decision not found.');
  if (decision.userId !== userId) throw new ExecutionError('forbidden', 'Not your decision.');

  await acquireUserExecutionLock(userId);
  try {
    return await executeLockedDecision(decisionId, userId, options);
  } finally {
    await releaseUserExecutionLock(userId);
  }
}
