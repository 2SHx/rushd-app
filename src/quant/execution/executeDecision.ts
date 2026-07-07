// Rushd Quant — executeDecision (QUANT_DESIGN.md §5, DR-9 audit rule).
// Turns an APPROVED Decision into a paper fill. Money-mutating, so:
//  - authz: owner only (checked here AND in the route, defense in depth);
//  - race-safe: the Order row (Order.decisionId @unique) is CLAIMED before the external
//    broker call, so two concurrent executes cannot both submit to the broker — the
//    claim-loser short-circuits (ALREADY_EXECUTED) and never calls out;
//  - atomic settle: one $transaction updates the Order to FILLED, writes a Transaction(TRADE)
//    audit row, debits/credits virtual cash, updates the PortfolioItem, flips Decision→EXECUTED;
//  - paper/sim only: the live broker path is gated in the AlpacaPaperBroker constructor.
import { Prisma } from '@prisma/client';
import type { Currency, OrderSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { selectBroker } from './registry';

const D = Prisma.Decimal;

export type ExecCode = 'not_found' | 'forbidden' | 'conflict' | 'no_market_data' | 'insufficient_funds';

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

function currencyFor(market: 'TASI' | 'NASDAQ'): Currency {
  return market === 'TASI' ? 'SAR' : 'USD';
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Execute an APPROVED decision for its owner. Idempotent; HOLD is a no-op. */
export async function executeDecision(decisionId: string, userId: string): Promise<ExecResult> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { order: true },
  });
  if (!decision) throw new ExecutionError('not_found', 'Decision not found.');
  if (decision.userId !== userId) throw new ExecutionError('forbidden', 'Not your decision.');
  if (decision.order) return { orderId: decision.order.id, status: 'ALREADY_EXECUTED' };
  if (decision.finalAction === 'HOLD') return { orderId: null, status: 'HOLD_NOOP' };
  if (decision.status !== 'APPROVED') {
    throw new ExecutionError('conflict', `Decision must be APPROVED to execute (is ${decision.status}).`);
  }

  const side: OrderSide = decision.finalAction === 'BUY' ? 'BUY' : 'SELL';
  const qty = decision.finalQty;

  // Fill reference = latest close on record.
  const bar = await prisma.marketBar.findFirst({
    where: { symbol: decision.symbol, market: decision.market },
    orderBy: { ts: 'desc' },
  });
  if (!bar) throw new ExecutionError('no_market_data', 'No market data to price the fill.');
  const refPrice = bar.close;

  // Constructing the broker asserts the live-execution gate for any live URL (dark by default).
  const broker = selectBroker(decision.market);

  // Affordability pre-check on estimated notional (BUY only).
  if (side === 'BUY') {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.cashVirtual.lt(qty.mul(refPrice))) {
      throw new ExecutionError('insufficient_funds', 'Insufficient virtual cash for this buy.');
    }
  }

  // CLAIM the decision via the Order unique constraint BEFORE any external submit.
  let orderId: string;
  try {
    const claimed = await prisma.order.create({
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
    orderId = claimed.id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await prisma.order.findUnique({ where: { decisionId: decision.id } });
      return { orderId: existing?.id ?? null, status: 'ALREADY_EXECUTED' };
    }
    throw e;
  }

  // External submit — now guarded by the claim above.
  let fill;
  try {
    fill = await broker.submitOrder({ symbol: decision.symbol, market: decision.market, side, qty, refPrice });
  } catch (e) {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'REJECTED' } });
    throw e;
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
        amount: notional,
        currency,
        type: 'TRADE',
        description: `${side} ${fill.filledQty.toString()} ${decision.symbol} @ ${fill.avgFillPrice.toString()}`,
      },
    });

    if (side === 'BUY') {
      await tx.user.update({ where: { id: userId }, data: { cashVirtual: { decrement: notional } } });
      await tx.portfolioItem.upsert({
        where: { userId_symbol: { userId, symbol: decision.symbol } },
        create: { userId, symbol: decision.symbol, shares: fill.filledQty, market: decision.market, currency },
        update: { shares: { increment: fill.filledQty } },
      });
    } else {
      await tx.user.update({ where: { id: userId }, data: { cashVirtual: { increment: notional } } });
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
  });

  return { orderId, status: fill.status };
}
