// Rushd Quant — executeDecision (QUANT_DESIGN.md §5, DR-9 audit rule).
// Turns an APPROVED Decision into a paper fill. Money-mutating, so: authz (owner only),
// idempotent (Order @@unique[decisionId] + an up-front check), atomic (one $transaction
// writes the Order, a Transaction(TRADE) audit row, and the PortfolioItem update, and
// flips the Decision to EXECUTED). Positions/cash are re-derived from the DB, never trusted
// from a caller. Paper/sim only — the live broker path is unreachable (liveGuard).
import { Prisma } from '@prisma/client';
import type { Currency, OrderSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { selectBroker } from './registry';

const D = Prisma.Decimal;

export type ExecCode = 'not_found' | 'forbidden' | 'conflict' | 'no_market_data';

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
  status: string; // OrderStatus or 'HOLD_NOOP' or 'ALREADY_EXECUTED'
}

function currencyFor(market: 'TASI' | 'NASDAQ'): Currency {
  return market === 'TASI' ? 'SAR' : 'USD';
}

/** Execute an APPROVED decision for its owner. Idempotent; HOLD is a no-op. */
export async function executeDecision(decisionId: string, userId: string): Promise<ExecResult> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { order: true },
  });
  if (!decision) throw new ExecutionError('not_found', 'Decision not found.');
  if (decision.userId !== userId) throw new ExecutionError('forbidden', 'Not your decision.');

  // Idempotency: a decision fills at most once.
  if (decision.order) return { orderId: decision.order.id, status: 'ALREADY_EXECUTED' };
  if (decision.finalAction === 'HOLD') return { orderId: null, status: 'HOLD_NOOP' };
  if (decision.status !== 'APPROVED') {
    throw new ExecutionError('conflict', `Decision must be APPROVED to execute (is ${decision.status}).`);
  }

  const side: OrderSide = decision.finalAction === 'BUY' ? 'BUY' : 'SELL';
  const qty = decision.finalQty;

  // Fill reference = latest close on record (point-in-time safe: <= now).
  const bar = await prisma.marketBar.findFirst({
    where: { symbol: decision.symbol, market: decision.market },
    orderBy: { ts: 'desc' },
  });
  if (!bar) throw new ExecutionError('no_market_data', 'No market data to price the fill.');

  const broker = selectBroker(decision.market);
  const fill = await broker.submitOrder({
    symbol: decision.symbol,
    market: decision.market,
    side,
    qty,
    refPrice: bar.close,
  });

  const notional = fill.filledQty.mul(fill.avgFillPrice);
  const currency = currencyFor(decision.market);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        decisionId: decision.id,
        brokerRef: fill.brokerRef,
        symbol: decision.symbol,
        market: decision.market,
        side,
        qty,
        limitPrice: null,
        filledQty: fill.filledQty,
        avgFillPrice: fill.avgFillPrice,
        status: fill.status,
        broker: broker.kind,
      },
    });

    // Money audit trail (DR-9): one Transaction(TRADE) per fill, human-readable.
    await tx.transaction.create({
      data: {
        userId,
        amount: notional,
        currency,
        type: 'TRADE',
        description: `${side} ${fill.filledQty.toString()} ${decision.symbol} @ ${fill.avgFillPrice.toString()}`,
      },
    });

    // Reconcile holdings.
    if (side === 'BUY') {
      await tx.portfolioItem.upsert({
        where: { userId_symbol: { userId, symbol: decision.symbol } },
        create: {
          userId,
          symbol: decision.symbol,
          shares: fill.filledQty,
          market: decision.market,
          currency,
        },
        update: { shares: { increment: fill.filledQty } },
      });
    } else {
      const held = await tx.portfolioItem.findUnique({
        where: { userId_symbol: { userId, symbol: decision.symbol } },
      });
      if (held) {
        const remaining = held.shares.minus(fill.filledQty);
        if (remaining.lte(0)) {
          await tx.portfolioItem.delete({ where: { id: held.id } });
        } else {
          await tx.portfolioItem.update({ where: { id: held.id }, data: { shares: remaining } });
        }
      }
    }

    await tx.decision.update({ where: { id: decision.id }, data: { status: 'EXECUTED' } });
    return created;
  });

  return { orderId: order.id, status: order.status };
}
