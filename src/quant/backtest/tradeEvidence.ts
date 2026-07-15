import { z } from 'zod';
import type { TradeRecord } from './intradayEngine';

const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const whole = z.number().int().nonnegative();

const tradeSchema = z.object({
  symbol: z.string().min(1),
  entryTs: z.string().datetime(),
  exitTs: z.string().datetime(),
  qty: nonNegative,
  entryPrice: nonNegative,
  exitPrice: nonNegative,
  netPnl: finite,
  netReturn: finite,
  reason: z.string().min(1),
  partial: z.boolean(),
});

const symbolSummarySchema = z.object({
  symbol: z.string().min(1),
  closedTrades: whole,
  wins: whole,
  losses: whole,
  flat: whole,
  netPnl: finite,
  averageReturn: finite,
});

export const tradeEvidenceSchema = z.object({
  basis: z.enum(['SHARED_BOOK', 'INDEPENDENT_SYMBOL_SLEEVES']),
  currency: z.literal('USD'),
  totalClosedTrades: whole,
  totalNetPnl: finite,
  truncated: z.boolean(),
  maxRecords: z.number().int().positive(),
  bySymbol: z.array(symbolSummarySchema),
  trades: z.array(tradeSchema),
}).superRefine((evidence, context) => {
  const symbols = new Set(evidence.bySymbol.map((row) => row.symbol));
  const summaryCount = evidence.bySymbol.reduce((sum, row) => sum + row.closedTrades, 0);
  const summaryPnl = evidence.bySymbol.reduce((sum, row) => sum + row.netPnl, 0);
  const pnlTolerance = Math.max(1, Math.abs(evidence.totalNetPnl)) * 1e-9;
  const invalidOutcomes = evidence.bySymbol.some((row) => (
    row.wins + row.losses + row.flat !== row.closedTrades
  ));
  const invalidTruncation = evidence.truncated
    ? evidence.trades.length >= evidence.totalClosedTrades
    : evidence.trades.length !== evidence.totalClosedTrades;

  if (
    symbols.size !== evidence.bySymbol.length
    || summaryCount !== evidence.totalClosedTrades
    || Math.abs(summaryPnl - evidence.totalNetPnl) > pnlTolerance
    || invalidOutcomes
    || invalidTruncation
    || evidence.trades.length > evidence.maxRecords
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'trade evidence summary conflicts with its ledger' });
  }
});

export type TradeEvidence = z.infer<typeof tradeEvidenceSchema>;
export type AttributedTradeRecord = TradeRecord & { symbol: string };
export type TradeEvidenceBasis = TradeEvidence['basis'];

export const MAX_PERSISTED_TRADE_RECORDS = 1_000;

/** Persist exact closed-fill economics; no open-position or mark-to-market P&L is inferred. */
export function buildTradeEvidence(
  records: readonly AttributedTradeRecord[],
  basis: TradeEvidenceBasis,
  maxRecords = MAX_PERSISTED_TRADE_RECORDS,
): TradeEvidence {
  if (!Number.isInteger(maxRecords) || maxRecords <= 0) throw new Error('maxRecords must be a positive integer');

  const allTrades = [...records]
    .sort((a, b) => b.exitTs.getTime() - a.exitTs.getTime())
    .map((record) => ({
      symbol: record.symbol,
      entryTs: record.entryTs.toISOString(),
      exitTs: record.exitTs.toISOString(),
      qty: record.qty,
      entryPrice: record.entryPrice,
      exitPrice: record.exitPrice,
      netPnl: record.entryPrice * record.qty * record.ret,
      netReturn: record.ret,
      reason: record.reason,
      partial: record.partial,
    }));

  const summaries = new Map<string, Omit<TradeEvidence['bySymbol'][number], 'averageReturn'> & { returnSum: number }>();
  for (const trade of allTrades) {
    const row = summaries.get(trade.symbol) ?? {
      symbol: trade.symbol, closedTrades: 0, wins: 0, losses: 0, flat: 0, netPnl: 0, returnSum: 0,
    };
    row.closedTrades += 1;
    row.netPnl += trade.netPnl;
    row.returnSum += trade.netReturn;
    if (trade.netPnl > 0) row.wins += 1;
    else if (trade.netPnl < 0) row.losses += 1;
    else row.flat += 1;
    summaries.set(trade.symbol, row);
  }

  const bySymbol = Array.from(summaries.values())
    .map(({ returnSum, ...row }) => ({ ...row, averageReturn: returnSum / row.closedTrades }))
    .sort((a, b) => b.netPnl - a.netPnl || a.symbol.localeCompare(b.symbol));

  return tradeEvidenceSchema.parse({
    basis,
    currency: 'USD',
    totalClosedTrades: allTrades.length,
    totalNetPnl: bySymbol.reduce((sum, row) => sum + row.netPnl, 0),
    truncated: allTrades.length > maxRecords,
    maxRecords,
    bySymbol,
    trades: allTrades.slice(0, maxRecords),
  });
}
