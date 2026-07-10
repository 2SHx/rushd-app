import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructHalalPortfolio } from './construction';
import { selectBroker } from '../execution/registry';

const D = Prisma.Decimal;

export interface RebalanceLog {
  rebalanced: boolean;
  nav: number;
  tradesPlaced: number;
  purificationOwed: number;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Release AutoRunClaim rows a (failed) pass created, so a retry can re-claim them. */
async function releaseClaims(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.autoRunClaim.deleteMany({ where: { key: { in: keys } } });
}

/**
 * Executes a simulated or paper rebalance pass for a user, diffing current positions
 * against target optimized weights and writing purification ledger entries.
 *
 * Crash-safety: every order is claimed (unique AutoRunClaim key) BEFORE the broker call —
 * mirrors executeDecision's Order@@unique[decisionId] claim-before-submit pattern. If
 * anything in the pass throws (broker failure, DB error), every claim this pass created
 * (the day/strategy claim + any per-order claims) is released so a retry can re-attempt
 * cleanly; the diff-based design makes retries naturally idempotent (already-settled
 * symbols simply show no further diff).
 */
export async function executePortfolioRebalance(
  userId: string,
  strategyId: string,
  asOf = new Date()
): Promise<RebalanceLog> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { portfolioItems: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Tier-gate authorization check: rebalancing requires ULTRA tier.
  if (user.tier !== 'ULTRA') {
    throw new Error('Unauthorized: Strategy owner must be ULTRA tier');
  }

  // Idempotency and Race-safety guard: ensure rebalance is executed at most once per strategy per day
  const todayStr = asOf.toISOString().slice(0, 10);
  const claimKey = `rebalance-${strategyId}-${todayStr}`;
  try {
    await prisma.autoRunClaim.create({ data: { key: claimKey } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // a dropped connection etc. must propagate, not be reported as success

    console.log(`Rebalance already executed or in progress for strategy ${strategyId} on ${todayStr}. Skipping.`);

    // Fetch latest snapshot to return correct NAV
    const lastSnap = await prisma.portfolioSnapshot.findFirst({
      where: { userId, strategyId },
      orderBy: { asOf: 'desc' }
    });
    return {
      rebalanced: false,
      nav: lastSnap ? lastSnap.nav.toNumber() : 100000,
      tradesPlaced: 0,
      purificationOwed: 0
    };
  }

  const claimedKeys: string[] = [claimKey];

  try {
    return await runRebalancePass(user, strategyId, asOf, todayStr, claimedKeys);
  } catch (err) {
    // Crash-safety: release every claim this pass made so a retry is possible today,
    // instead of being locked out until the next UTC day.
    await releaseClaims(claimedKeys);
    throw err;
  }
}

type UserWithPortfolio = Prisma.UserGetPayload<{ include: { portfolioItems: true } }>;

async function runRebalancePass(
  user: UserWithPortfolio,
  strategyId: string,
  asOf: Date,
  todayStr: string,
  claimedKeys: string[]
): Promise<RebalanceLog> {
  const userId = user.id;

  // 1. Calculate current total NAV
  let totalHoldingsValue = new D(0);
  const currentPrices: Record<string, Prisma.Decimal> = {};

  for (const item of user.portfolioItems) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: item.symbol, market: 'NASDAQ' },
      orderBy: { ts: 'desc' }
    });
    const price = bar ? bar.close : new D(1);
    currentPrices[item.symbol] = price;
    totalHoldingsValue = totalHoldingsValue.plus(item.shares.mul(price));
  }

  const currentNAV = user.cashVirtual.plus(totalHoldingsValue);

  // 2. Fetch target optimized portfolio weights
  const proposal = await constructHalalPortfolio('NASDAQ', asOf);

  // 3. Diff and generate orders
  let tradesPlaced = 0;
  let purificationOwed = new D(0);

  // Track target allocations
  const targetHoldings: Record<string, { qty: Prisma.Decimal; ratio: number }> = {};
  for (const target of proposal.weights) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: target.symbol, market: 'NASDAQ' },
      orderBy: { ts: 'desc' }
    });
    const price = bar ? bar.close : new D(1);
    currentPrices[target.symbol] = price;

    const targetVal = currentNAV.mul(target.weight);
    const targetQty = price.gt(0) ? targetVal.div(price) : new D(0);
    targetHoldings[target.symbol] = { qty: targetQty, ratio: target.purificationRatio };
  }

  // Broker selection
  const broker = selectBroker('NASDAQ');

  // We execute SELL orders first to free up virtual cash
  for (const item of user.portfolioItems) {
    const currentQty = item.shares;
    const target = targetHoldings[item.symbol];
    const targetQty = target ? target.qty : new D(0);

    if (currentQty.gt(targetQty)) {
      // We sell the difference
      const sellQty = currentQty.minus(targetQty);
      const price = currentPrices[item.symbol] || new D(1);

      // Claim this order BEFORE calling the broker (mirrors executeDecision's Order claim).
      const orderClaimKey = `rebalance-order-${strategyId}-${todayStr}-${item.symbol}-SELL`;
      try {
        await prisma.autoRunClaim.create({ data: { key: orderClaimKey } });
      } catch (err) {
        if (isUniqueViolation(err)) continue; // already claimed this pass — skip, don't double-submit
        throw err;
      }
      claimedKeys.push(orderClaimKey);

      // Submit order via broker
      const fill = await broker.submitOrder({
        symbol: item.symbol,
        market: 'NASDAQ',
        side: 'SELL',
        qty: sellQty,
        refPrice: price
      });

      tradesPlaced++;

      // Settle SELL transaction in database
      const filledNotional = fill.filledQty.mul(fill.avgFillPrice);

      // Calculate purification if there was realized profit (simplified cost basis tracking)
      // costBasis is stored as Decimal on PortfolioItem. We fallback to 80% of price if empty.
      const costBasis = item.costBasis ?? price.mul(0.8);
      const profit = D.max(0, price.minus(costBasis).mul(sellQty));
      const ratio = target ? target.ratio : 0.005; // default 0.5%
      const purifyAmt = profit.mul(ratio);

      await prisma.$transaction(async (tx) => {
        // Log transaction
        await tx.transaction.create({
          data: {
            userId,
            amount: filledNotional,
            currency: 'USD',
            type: 'TRADE',
            description: `SELL REBALANCE ${fill.filledQty.toString()} ${item.symbol} @ ${fill.avgFillPrice.toString()}`
          }
        });

        // Update User cash
        await tx.user.update({
          where: { id: userId },
          data: { cashVirtual: { increment: filledNotional } }
        });

        // Update or remove PortfolioItem
        if (targetQty.lte(0)) {
          await tx.portfolioItem.delete({ where: { id: item.id } });
        } else {
          await tx.portfolioItem.update({
            where: { id: item.id },
            data: { shares: { decrement: fill.filledQty } }
          });
        }

        // Record purification ledger entry if profit realized
        if (purifyAmt.gt(0)) {
          purificationOwed = purificationOwed.plus(purifyAmt);
          await tx.purificationEntry.create({
            data: {
              userId,
              symbol: item.symbol,
              amount: purifyAmt,
              ratio: new D(ratio),
              profit
            }
          });

          // Log audit transaction of type PROFIT_SHARE
          await tx.transaction.create({
            data: {
              userId,
              amount: purifyAmt,
              currency: 'USD',
              type: 'PROFIT_SHARE',
              description: `Purification fee logged for realized gains on ${item.symbol}`
            }
          });
        }
      });
    }
  }

  // Execute BUY orders next
  for (const [symbol, target] of Object.entries(targetHoldings)) {
    const currentItem = user.portfolioItems.find(i => i.symbol === symbol);
    const currentQty = currentItem ? currentItem.shares : new D(0);

    if (target.qty.gt(currentQty)) {
      // Buy difference
      const buyQty = target.qty.minus(currentQty);
      const price = currentPrices[symbol] || new D(1);
      const notional = buyQty.mul(price);

      // Ensure user has sufficient funds (safety constraint)
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      const currentCash = currentUser?.cashVirtual ?? new D(0);

      if (currentCash.gte(notional) && buyQty.gt(0)) {
        // Claim this order BEFORE calling the broker.
        const orderClaimKey = `rebalance-order-${strategyId}-${todayStr}-${symbol}-BUY`;
        try {
          await prisma.autoRunClaim.create({ data: { key: orderClaimKey } });
        } catch (err) {
          if (isUniqueViolation(err)) continue; // already claimed this pass — skip
          throw err;
        }
        claimedKeys.push(orderClaimKey);

        const fill = await broker.submitOrder({
          symbol,
          market: 'NASDAQ',
          side: 'BUY',
          qty: buyQty,
          refPrice: price
        });

        tradesPlaced++;

        const filledNotional = fill.filledQty.mul(fill.avgFillPrice);

        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              userId,
              amount: filledNotional,
              currency: 'USD',
              type: 'TRADE',
              description: `BUY REBALANCE ${fill.filledQty.toString()} ${symbol} @ ${fill.avgFillPrice.toString()}`
            }
          });

          await tx.user.update({
            where: { id: userId },
            data: { cashVirtual: { decrement: filledNotional } }
          });

          // Weighted-average cost basis on BUY (never overwrite — misstates realized
          // profit, and therefore the purification/تطهير amount owed on the next SELL).
          const existing = await tx.portfolioItem.findUnique({
            where: { userId_symbol: { userId, symbol } }
          });
          const oldQty = existing?.shares ?? new D(0);
          const oldBasis = existing?.costBasis ?? fill.avgFillPrice;
          const newQty = oldQty.plus(fill.filledQty);
          const newCostBasis = newQty.gt(0)
            ? oldQty.mul(oldBasis).plus(fill.filledQty.mul(fill.avgFillPrice)).div(newQty)
            : fill.avgFillPrice;

          await tx.portfolioItem.upsert({
            where: { userId_symbol: { userId, symbol } },
            create: {
              userId,
              symbol,
              shares: fill.filledQty,
              market: 'NASDAQ',
              currency: 'USD',
              costBasis: fill.avgFillPrice
            },
            update: {
              shares: newQty,
              costBasis: newCostBasis
            }
          });
        });
      }
    }
  }

  // 4. Capture current normalized benchmark values for the snapshot
  const latestSpy = await prisma.marketBar.findFirst({
    where: { symbol: 'SPY', market: 'NASDAQ' },
    orderBy: { ts: 'desc' }
  });
  const latestSpus = await prisma.marketBar.findFirst({
    where: { symbol: 'SPUS', market: 'NASDAQ' },
    orderBy: { ts: 'desc' }
  });

  const spyPrice = latestSpy ? latestSpy.close : new D(500);
  const spusPrice = latestSpus ? latestSpus.close : new D(40);

  // Retrieve last snapshot to scale benchmark NAVs proportionally
  const lastSnapshot = await prisma.portfolioSnapshot.findFirst({
    where: { userId, strategyId },
    orderBy: { asOf: 'desc' }
  });

  let spyNav = new D(100);
  let spusNav = new D(100);

  if (lastSnapshot) {
    // Find the symbol price at the last snapshot's date (or fallback)
    const prevSpy = await prisma.marketBar.findFirst({
      where: { symbol: 'SPY', market: 'NASDAQ', ts: { lte: lastSnapshot.asOf } },
      orderBy: { ts: 'desc' }
    });
    const prevSpus = await prisma.marketBar.findFirst({
      where: { symbol: 'SPUS', market: 'NASDAQ', ts: { lte: lastSnapshot.asOf } },
      orderBy: { ts: 'desc' }
    });

    const prevSpyPrice = prevSpy ? prevSpy.close : spyPrice;
    const prevSpusPrice = prevSpus ? prevSpus.close : spusPrice;

    spyNav = prevSpyPrice.gt(0) ? lastSnapshot.benchmarkNavSpy.mul(spyPrice).div(prevSpyPrice) : lastSnapshot.benchmarkNavSpy;
    spusNav = prevSpusPrice.gt(0) ? lastSnapshot.benchmarkNavSpus.mul(spusPrice).div(prevSpusPrice) : lastSnapshot.benchmarkNavSpus;
  }

  // Save PortfolioSnapshot
  const finalHoldings = await prisma.portfolioItem.findMany({ where: { userId } });
  const positionsJson: Record<string, any> = {};
  let finalHoldingsValue = new D(0);

  finalHoldings.forEach(item => {
    const price = currentPrices[item.symbol] || new D(1);
    // JSON can't store Decimal — this is the display/serialization boundary, not arithmetic.
    positionsJson[item.symbol] = {
      qty: item.shares.toNumber(),
      costBasis: item.costBasis ? item.costBasis.toNumber() : price.toNumber()
    };
    finalHoldingsValue = finalHoldingsValue.plus(item.shares.mul(price));
  });

  const finalUser = await prisma.user.findUnique({ where: { id: userId } });
  const finalCash = finalUser?.cashVirtual ?? new D(0);
  const finalNAV = finalCash.plus(finalHoldingsValue);

  await prisma.portfolioSnapshot.create({
    data: {
      strategyId,
      userId,
      asOf,
      cashVirtual: finalCash,
      currency: 'USD',
      positions: positionsJson as any,
      nav: finalNAV,
      benchmarkNavSpy: spyNav,
      benchmarkNavSpus: spusNav
    }
  });

  return {
    rebalanced: true,
    nav: finalNAV.toNumber(),
    tradesPlaced,
    purificationOwed: purificationOwed.toNumber()
  };
}
