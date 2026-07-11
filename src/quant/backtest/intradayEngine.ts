// Rushd Quant — INTRADAY (1-minute) backtest engine variant (QDR-6, skill backtesting-rigor).
//
// Mirrors engine.ts's cardinal guarantees at minute granularity, driving a pure G2
// `StrategySetup` (screen/entry/exit) instead of the committee — so the whole path is
// deterministic and LLM-free (cost + reproducibility). Structural no-look-ahead: a decision
// is made on bar t's CLOSE and filled at bar t+1's OPEN; the context handed to the setup only
// ever contains bars with ts ≤ asOf, re-asserted at runtime (assertNoLookahead).
//
// Execution model (DECIDED, QDR-6):
//   • fill = next bar open crossing the spread; slippage scaled by that bar's volatility
//     (k·(high−low)/close) plus commission.
//   • participation cap ≤ `participationCap` × fill-bar volume → PARTIAL fills.
//   • LULD/halt: a fill bar whose ts is more than `haltGapMinutes` after the decision bar, or
//     whose volume is 0, is treated as halted → NO fill (documented detection rule below).
//   • intraday only: fills require the next bar to be the SAME NASDAQ trading day; any position
//     still open at a day's last bar is force-liquidated at that close (no overnight leakage).
//
// Sizing is NOT the setup's job — an oversized proposal is clamped by the risk envelope
// (never bypassed). No synthetic bars: this consumes real IntradayBar rows / real fixtures only.
import { Prisma } from '@prisma/client';
import type { IntradayBar, IntradaySession, Market, SymbolSnapshot } from '@prisma/client';
import { assertNoLookahead } from '../data/pointInTime';
import { nasdaqDateKey } from '../data/snapshot';
import { computeIntradayMetrics } from '../data/snapshot';
import { applyEnvelope, type MarketState, type PortfolioState, type RiskLimits } from '../risk/envelope';
import type { StrategySetup } from '../strategies/types';
import type { EquityPoint } from './metrics';

const D = Prisma.Decimal;
const BPS = new D(10_000);
const COMMISSION_BPS = new D(10); // 0.10%
const MINUTE_MS = 60_000;

const num = (x: Prisma.Decimal): number => Number(x.toString());
const meanN = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const dmin = (a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal => (a.lte(b) ? a : b);

export const DEFAULT_INTRADAY_LIMITS: RiskLimits = {
  maxNameWeight: 0.25,
  maxGrossExposure: 1.0,
  maxOpenPositions: 1,
  maxRiskPct: 0.02,
  volTargetPct: 0.02,
  liquidityAdvFraction: 0.05,
  drawdownHaltPct: 0.3,
};

/** A real minute bar as consumed by the engine (Decimal or number accepted for OHLCV). */
export interface IntradayBarInput {
  ts: Date;
  open: number | Prisma.Decimal;
  high: number | Prisma.Decimal;
  low: number | Prisma.Decimal;
  close: number | Prisma.Decimal;
  volume: number | Prisma.Decimal;
  session: IntradaySession;
  source?: IntradayBar['source'];
}

/** Per-day facts needed to derive a point-in-time snapshot (never fabricated — real provenance). */
export interface DayContext {
  priorClose: number | null;
  mcap: number | null;
  mcapSource: IntradayBar['source'] | null;
}

export interface IntradaySimInput<P> {
  setup: StrategySetup<P>;
  params?: P;
  symbol: string;
  market: Market;
  bars: IntradayBarInput[]; // chronological, real
  dayContext: Map<string, DayContext>; // nasdaqDateKey → priorClose/mcap
  startingCash: Prisma.Decimal;
  limits?: RiskLimits;
  participationCap?: number; // fraction of a bar's volume a single order may consume
  slippageK?: number; // slippage fraction = k·(high−low)/close of the fill bar
  haltGapMinutes?: number; // gap (minutes) beyond which the next bar is treated as halted
  entryJitterBars?: number; // delay entry fills by N bars (entry-jitter permutation support)
}

export interface TradeRecord {
  entryTs: Date;
  exitTs: Date;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  ret: number; // net per-trade return (already includes slippage+commission)
  reason: string;
  partial: boolean;
}

export interface IntradaySimResult {
  equityCurve: EquityPoint[];
  trades: number;
  turnover: number;
  tradeReturns: number[];
  tradeRecords: TradeRecord[];
  barsProcessed: number;
}

function toBar(symbol: string, market: Market, b: IntradayBarInput): IntradayBar {
  return {
    id: `${symbol}-${b.ts.getTime()}`,
    symbol,
    market,
    ts: b.ts,
    open: new D(b.open),
    high: new D(b.high),
    low: new D(b.low),
    close: new D(b.close),
    volume: new D(b.volume),
    session: b.session,
    source: b.source ?? 'ALPACA',
    createdAt: b.ts,
  } as IntradayBar;
}

/** Point-in-time snapshot derived from real bars ≤ asOf (same math as data/snapshot.ts). */
function buildSnapshot(
  symbol: string,
  market: Market,
  dayBars: IntradayBar[],
  asOf: Date,
  day: DayContext | undefined,
): SymbolSnapshot | null {
  if (!day) return null;
  const { premarketMovePct, cumVolume } = computeIntradayMetrics(dayBars, day.priorClose);
  return {
    id: `${symbol}-snap-${asOf.getTime()}`,
    symbol,
    market,
    asOf,
    mcap: day.mcap != null ? new D(day.mcap.toFixed(4)) : null,
    float: null,
    premarketMovePct: premarketMovePct != null ? new D(premarketMovePct.toFixed(4)) : null,
    cumVolume: new D(cumVolume.toFixed(4)),
    source: dayBars.at(-1)?.source ?? 'ALPACA',
    mcapSource: day.mcapSource ?? null,
    createdAt: asOf,
  } as SymbolSnapshot;
}

function atr(bars: IntradayBar[], period = 14): Prisma.Decimal {
  if (bars.length < 2) return new D(0);
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = num(bars[i].high);
    const l = num(bars[i].low);
    const pc = num(bars[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return new D(meanN(trs.slice(-period)).toFixed(6));
}

function avgVol(bars: IntradayBar[], n = 20): Prisma.Decimal {
  if (bars.length === 0) return new D(0);
  return new D(meanN(bars.slice(-n).map((b) => num(b.volume))).toFixed(4));
}

/**
 * Pure single-symbol intraday simulation. Every fill is net of commission + volatility-scaled
 * slippage, capped by participation in the fill bar, and blocked in halted bars. Returns the
 * mark-to-market equity curve plus per-trade outcomes for the Monte Carlo gate.
 */
export function simulateIntraday<P>(inp: IntradaySimInput<P>): IntradaySimResult {
  const limits = inp.limits ?? DEFAULT_INTRADAY_LIMITS;
  const participationCap = inp.participationCap ?? 0.1;
  const slippageK = inp.slippageK ?? 0.5;
  const haltGapMs = (inp.haltGapMinutes ?? 2) * MINUTE_MS;
  const jitter = Math.max(0, inp.entryJitterBars ?? 0);

  const bars = inp.bars.map((b) => toBar(inp.symbol, inp.market, b));
  const { symbol, market } = inp;

  let cash = inp.startingCash;
  let qty = new D(0);
  let peakEquity = inp.startingCash;
  let entryPrice = new D(0);
  let entryTs: Date | null = null;
  let entryReason = '';
  let entryPartial = false;
  let trades = 0;
  let turnoverNotional = new D(0);
  const equityCurve: EquityPoint[] = [];
  const tradeReturns: number[] = [];
  const tradeRecords: TradeRecord[] = [];

  const dateKey = (d: Date) => nasdaqDateKey(d);
  // pending entry fills queued by jitter: index at which the delayed fill should execute
  const pendingEntryAt = new Map<number, { proposalQty: Prisma.Decimal }>();

  const commissionFor = (price: Prisma.Decimal) => price.mul(COMMISSION_BPS).div(BPS);
  const slipFor = (fill: IntradayBar) => {
    const range = num(fill.high) - num(fill.low);
    const c = num(fill.close) || 1;
    return new D(fill.open).mul(new D((slippageK * (range / c)).toFixed(8)));
  };

  const doExit = (fill: IntradayBar, reason: string) => {
    if (qty.lte(0)) return;
    const slip = slipFor(fill);
    const comm = commissionFor(fill.open);
    const fillPrice = new D(fill.open).minus(slip).minus(comm);
    const proceeds = qty.mul(fillPrice);
    cash = cash.plus(proceeds);
    turnoverNotional = turnoverNotional.plus(proceeds.abs());
    const ret = entryPrice.gt(0) ? num(fillPrice.minus(entryPrice).div(entryPrice)) : 0;
    tradeReturns.push(ret);
    tradeRecords.push({
      entryTs: entryTs ?? fill.ts, exitTs: fill.ts, qty: num(qty),
      entryPrice: num(entryPrice), exitPrice: num(fillPrice), ret, reason, partial: entryPartial,
    });
    trades++;
    qty = new D(0);
    entryTs = null;
    entryPartial = false;
  };

  for (let t = 0; t < bars.length; t++) {
    const cur = bars[t];
    const next = bars[t + 1];
    const asOf = cur.ts;
    const key = dateKey(asOf);
    const sameDayNext = next && dateKey(next.ts) === key;
    const nextHalted = next && (next.ts.getTime() - cur.ts.getTime() > haltGapMs || new D(next.volume).lte(0));

    const equityNow = cash.plus(qty.mul(cur.close));
    if (equityNow.gt(peakEquity)) peakEquity = equityNow;

    // Execute any entry fill that was jittered to land on this bar.
    const pending = pendingEntryAt.get(t);
    if (pending && qty.lte(0) && !((cur.ts.getTime() - bars[t - 1]?.ts.getTime()) > haltGapMs)) {
      const slip = slipFor(cur);
      const comm = commissionFor(cur.open);
      const fillPrice = new D(cur.open).plus(slip).plus(comm);
      const capByVol = new D(cur.volume).mul(new D(participationCap));
      let fillQty = dmin(pending.proposalQty, capByVol);
      fillQty = dmin(fillQty, cash.div(fillPrice));
      if (fillQty.gt(0)) {
        entryPartial = fillQty.lt(pending.proposalQty);
        cash = cash.minus(fillQty.mul(fillPrice));
        qty = fillQty;
        entryPrice = fillPrice;
        entryTs = cur.ts;
      }
    }
    pendingEntryAt.delete(t);

    // Decide on this bar's close using a strictly-≤-asOf context.
    const slice = bars.slice(0, t + 1);
    const dayBars = slice.filter((b) => dateKey(b.ts) === key);
    assertNoLookahead(slice, asOf, 'ts');
    const snapshot = buildSnapshot(symbol, market, dayBars, asOf, inp.dayContext.get(key));
    const ctx = { symbol, market, asOf, bars: slice, snapshot, positionQty: qty };

    // Force-liquidate at the last bar of a trading day — no overnight holds.
    if (qty.gt(0) && (!next || !sameDayNext)) {
      doExit(cur, 'end_of_day_flat');
      equityCurve.push({ ts: cur.ts, equity: num(cash) });
      continue;
    }

    if (next && sameDayNext && !nextHalted) {
      if (qty.gt(0)) {
        const ex = inp.setup.exit(ctx, inp.params);
        if (ex.matched) doExit(next, ex.reasons[0] ?? 'exit');
      } else {
        const en = inp.setup.entry(ctx, inp.params);
        if (en.matched) {
          const price = cur.close;
          const a = atr(slice);
          const mkt: MarketState = {
            symbol, price, atr: a, adv: avgVol(slice), stopPrice: price.minus(a.mul(2)),
          };
          const pf: PortfolioState = { equity: cash.plus(qty.mul(price)), cash, positions: [], peakEquity };
          // Propose "all-in"; the envelope clamps it — sizing is never the setup's job.
          const proposalQty = price.gt(0) ? cash.div(price) : new D(0);
          const env = applyEnvelope({ action: 'BUY', qty: proposalQty }, pf, mkt, limits, false);
          if (env.action === 'BUY' && env.qty.gt(0)) {
            if (jitter > 0) {
              pendingEntryAt.set(t + 1 + jitter, { proposalQty: env.qty });
            } else {
              const slip = slipFor(next);
              const comm = commissionFor(next.open);
              const fillPrice = new D(next.open).plus(slip).plus(comm);
              const capByVol = new D(next.volume).mul(new D(participationCap));
              let fillQty = dmin(env.qty, capByVol);
              fillQty = dmin(fillQty, cash.div(fillPrice));
              if (fillQty.gt(0)) {
                entryPartial = fillQty.lt(env.qty);
                cash = cash.minus(fillQty.mul(fillPrice));
                qty = fillQty;
                entryPrice = fillPrice;
                entryTs = next.ts;
                entryReason = en.reasons[0] ?? 'entry';
                turnoverNotional = turnoverNotional.plus(fillQty.mul(fillPrice));
              }
            }
          }
        }
      }
    }

    equityCurve.push({ ts: cur.ts, equity: num(cash.plus(qty.mul(cur.close))) });
  }

  void entryReason;
  const avgEquity = meanN(equityCurve.map((p) => p.equity)) || 1;
  return {
    equityCurve,
    trades,
    turnover: num(turnoverNotional) / avgEquity,
    tradeReturns,
    tradeRecords,
    barsProcessed: bars.length,
  };
}
