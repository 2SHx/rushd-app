import { describe, expect, it } from 'vitest';
import { buildTradeEvidence, tradeEvidenceSchema, type AttributedTradeRecord } from './tradeEvidence';

function trade(symbol: string, exitDay: number, ret: number, qty = 10): AttributedTradeRecord {
  return {
    symbol,
    entryTs: new Date(`2026-01-0${exitDay - 1}T14:30:00.000Z`),
    exitTs: new Date(`2026-01-0${exitDay}T14:30:00.000Z`),
    qty,
    entryPrice: 100,
    exitPrice: 100 * (1 + ret),
    ret,
    reason: 'strategy_exit',
    partial: false,
  };
}

describe('buildTradeEvidence', () => {
  it('persists exact records and reconciles realized P&L by symbol', () => {
    const evidence = buildTradeEvidence([
      trade('AAPL', 2, 0.1),
      trade('AAPL', 4, -0.05),
      trade('MSFT', 3, 0.02, 5),
    ], 'SHARED_BOOK');

    expect(evidence).toMatchObject({
      totalClosedTrades: 3,
      totalNetPnl: 60,
      truncated: false,
      bySymbol: [
        { symbol: 'AAPL', closedTrades: 2, wins: 1, losses: 1, netPnl: 50, averageReturn: 0.025 },
        { symbol: 'MSFT', closedTrades: 1, wins: 1, losses: 0, netPnl: 10, averageReturn: 0.02 },
      ],
    });
    expect(evidence.trades.map((row) => row.symbol)).toEqual(['AAPL', 'MSFT', 'AAPL']);
  });

  it('keeps complete symbol totals while explicitly bounding the detailed ledger', () => {
    const evidence = buildTradeEvidence([
      trade('AAPL', 2, 0.01),
      trade('MSFT', 3, 0.02),
      trade('NVDA', 4, -0.01),
    ], 'INDEPENDENT_SYMBOL_SLEEVES', 2);

    expect(evidence).toMatchObject({ totalClosedTrades: 3, truncated: true, maxRecords: 2 });
    expect(evidence.bySymbol).toHaveLength(3);
    expect(evidence.trades).toHaveLength(2);
  });

  it('rejects a ledger whose totals contradict its symbol summary', () => {
    const evidence = buildTradeEvidence([trade('AAPL', 2, 0.01)], 'SHARED_BOOK');
    expect(tradeEvidenceSchema.safeParse({ ...evidence, totalClosedTrades: 2 }).success).toBe(false);
  });
});
