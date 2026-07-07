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

/**
 * Executes a simulated or paper rebalance pass for a user, diffing current positions
 * against target optimized weights and writing purification ledger entries.
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

  // 1. Calculate current total NAV
  let totalHoldingsValue = 0;
  const currentPrices: Record<string, number> = {};

  for (const item of user.portfolioItems) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: item.symbol, market: 'NASDAQ' },
      orderBy: { ts: 'desc' }
    });
    const price = bar ? Number(bar.close.toString()) : 1.0;
    currentPrices[item.symbol] = price;
    totalHoldingsValue += Number(item.shares.toString()) * price;
  }

  const currentNAV = Number(user.cashVirtual.toString()) + totalHoldingsValue;

  // 2. Fetch target optimized portfolio weights
  const proposal = await constructHalalPortfolio('NASDAQ', asOf);

  // 3. Diff and generate orders
  let tradesPlaced = 0;
  let purificationOwed = 0;

  // Track target allocations
  const targetHoldings: Record<string, { qty: number; ratio: number }> = {};
  for (const target of proposal.weights) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: target.symbol, market: 'NASDAQ' },
      orderBy: { ts: 'desc' }
    });
    const price = bar ? Number(bar.close.toString()) : 1.0;
    currentPrices[target.symbol] = price;

    const targetVal = currentNAV * target.weight;
    const targetQty = price > 0 ? targetVal / price : 0;
    targetHoldings[target.symbol] = { qty: targetQty, ratio: target.purificationRatio };
  }

  // Broker selection
  const broker = selectBroker('NASDAQ');

  // We execute SELL orders first to free up virtual cash
  for (const item of user.portfolioItems) {
    const currentQty = Number(item.shares.toString());
    const target = targetHoldings[item.symbol];
    const targetQty = target ? target.qty : 0;

    if (currentQty > targetQty) {
      // We sell the difference
      const sellQty = currentQty - targetQty;
      const price = currentPrices[item.symbol] || 1.0;
      const notional = sellQty * price;

      // Submit order via broker
      const fill = await broker.submitOrder({
        symbol: item.symbol,
        market: 'NASDAQ',
        side: 'SELL',
        qty: new D(sellQty),
        refPrice: new D(price)
      });

      tradesPlaced++;

      // Settle SELL transaction in database
      const filledNotional = fill.filledQty.mul(fill.avgFillPrice);
      
      // Calculate purification if there was realized profit (simplified cost basis tracking)
      // costBasis is stored as Decimal on PortfolioItem. We fallback to 80% of price if empty.
      const costBasis = item.costBasis ? Number(item.costBasis.toString()) : price * 0.8;
      const profit = Math.max(0, (price - costBasis) * sellQty);
      const ratio = target ? target.ratio : 0.0050; // default 0.5%
      const purifyAmt = profit * ratio;

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
        if (targetQty <= 0) {
          await tx.portfolioItem.delete({ where: { id: item.id } });
        } else {
          await tx.portfolioItem.update({
            where: { id: item.id },
            data: { shares: { decrement: fill.filledQty } }
          });
        }

        // Record purification ledger entry if profit realized
        if (purifyAmt > 0) {
          purificationOwed += purifyAmt;
          await tx.purificationEntry.create({
            data: {
              userId,
              symbol: item.symbol,
              amount: new D(purifyAmt),
              ratio: new D(ratio),
              profit: new D(profit)
            }
          });

          // Log audit transaction of type PROFIT_SHARE
          await tx.transaction.create({
            data: {
              userId,
              amount: new D(purifyAmt),
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
    const currentQty = currentItem ? Number(currentItem.shares.toString()) : 0;
    
    if (target.qty > currentQty) {
      // Buy difference
      const buyQty = target.qty - currentQty;
      const price = currentPrices[symbol] || 1.0;
      const notional = buyQty * price;

      // Ensure user has sufficient funds (safety constraint)
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      const currentCash = Number(currentUser?.cashVirtual.toString() || '0');
      
      if (currentCash >= notional && buyQty > 0) {
        const fill = await broker.submitOrder({
          symbol,
          market: 'NASDAQ',
          side: 'BUY',
          qty: new D(buyQty),
          refPrice: new D(price)
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
              shares: { increment: fill.filledQty },
              costBasis: fill.avgFillPrice // reset/average costBasis
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

  const spyPrice = latestSpy ? Number(latestSpy.close.toString()) : 500.0;
  const spusPrice = latestSpus ? Number(latestSpus.close.toString()) : 40.0;

  // Retrieve last snapshot to scale benchmark NAVs proportionally
  const lastSnapshot = await prisma.portfolioSnapshot.findFirst({
    where: { userId, strategyId },
    orderBy: { asOf: 'desc' }
  });

  let spyNav = 100.0;
  let spusNav = 100.0;

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

    const prevSpyPrice = prevSpy ? Number(prevSpy.close.toString()) : spyPrice;
    const prevSpusPrice = prevSpus ? Number(prevSpus.close.toString()) : spusPrice;

    const lastSpyNav = Number(lastSnapshot.benchmarkNavSpy.toString());
    const lastSpusNav = Number(lastSnapshot.benchmarkNavSpus.toString());

    spyNav = prevSpyPrice > 0 ? lastSpyNav * (spyPrice / prevSpyPrice) : lastSpyNav;
    spusNav = prevSpusPrice > 0 ? lastSpusNav * (spusPrice / prevSpusPrice) : lastSpusNav;
  }

  // Save PortfolioSnapshot
  const finalHoldings = await prisma.portfolioItem.findMany({ where: { userId } });
  const positionsJson: Record<string, any> = {};
  let finalHoldingsValue = 0;

  finalHoldings.forEach(item => {
    const price = currentPrices[item.symbol] || 1.0;
    positionsJson[item.symbol] = {
      qty: Number(item.shares.toString()),
      costBasis: item.costBasis ? Number(item.costBasis.toString()) : price
    };
    finalHoldingsValue += Number(item.shares.toString()) * price;
  });

  const finalUser = await prisma.user.findUnique({ where: { id: userId } });
  const finalCash = Number(finalUser?.cashVirtual.toString() || '0');
  const finalNAV = finalCash + finalHoldingsValue;

  await prisma.portfolioSnapshot.create({
    data: {
      strategyId,
      userId,
      asOf,
      cashVirtual: new D(finalCash),
      currency: 'USD',
      positions: positionsJson as any,
      nav: new D(finalNAV),
      benchmarkNavSpy: new D(spyNav),
      benchmarkNavSpus: new D(spusNav)
    }
  });

  return {
    rebalanced: true,
    nav: finalNAV,
    tradesPlaced,
    purificationOwed
  };
}
