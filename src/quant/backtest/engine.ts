// Rushd Quant — backtest engine (QUANT_DESIGN.md §6, skill backtesting-rigor).
// Event-driven, single-symbol. At each bar t it decides on the CLOSE and fills at the
// NEXT bar's OPEN (t+1) — so a decision can never use information from its own fill bar
// (structural no-look-ahead). Uses the deterministic PM surrogate (not the LLM) so runs
// are reproducible (QDR-4). Fills model commission + slippage + a liquidity/ADV cap.
// `simulate` is pure (no DB); `runBacktest` loads bars, computes metrics (full + OOS),
// and persists a BacktestRun.
import { Prisma } from '@prisma/client';
import type { Market, MarketBar } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertNoLookahead, type PointInTimeContext } from '../data/pointInTime';
import { collectSignals } from '../committee/collect';
import { surrogateDecision, PM_SURROGATE_ID } from './pmSurrogate';
import { computeMetrics, type EquityPoint, type BacktestMetrics } from './metrics';
import type { PortfolioState, MarketState, RiskLimits } from '../risk/envelope';
import type { Analyst } from '../types';

const D = Prisma.Decimal;
const DAY_MS = 86_400_000;
const COMMISSION_BPS = new D(10); // 0.10%
const SLIPPAGE_BPS = new D(5); // 0.05% adverse
const BPS = new D(10_000);

export interface BacktestBar {
  ts: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
}

export const DEFAULT_BT_LIMITS: RiskLimits = {
  maxNameWeight: 0.25,
  maxGrossExposure: 1.0,
  maxOpenPositions: 5,
  maxRiskPct: 0.02,
  volTargetPct: 0.02,
  liquidityAdvFraction: 0.05,
  drawdownHaltPct: 0.3,
};

export interface SimInput {
  symbol: string;
  market: Market;
  bars: BacktestBar[];
  startingCash: Prisma.Decimal;
  limits?: RiskLimits;
  analysts?: Analyst[];
  minHistoryDays?: number;
}

export interface SimResult {
  equityCurve: EquityPoint[];
  trades: number;
  turnover: number;
}

const num = (x: Prisma.Decimal): number => Number(x.toString());
const meanN = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const dmin = (a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal => (a.lte(b) ? a : b);

function atr(bars: BacktestBar[], period = 14): Prisma.Decimal {
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

function avgVol(bars: BacktestBar[], n = 20): Prisma.Decimal {
  if (bars.length === 0) return new D(0);
  return new D(meanN(bars.slice(-n).map((b) => num(b.volume))).toFixed(4));
}

/**
 * Sync point-in-time context over a bar slice (bars ≤ asOf). Asserts no bar is dated
 * after asOf — the look-ahead guard, exported so the guarantee is directly testable.
 */
export function buildBacktestContext(
  symbol: string,
  market: Market,
  slice: BacktestBar[],
  asOf: Date,
): PointInTimeContext {
  assertNoLookahead(slice, asOf, 'ts');
  return {
    symbol,
    market,
    asOf,
    bars(lookbackDays: number) {
      const from = asOf.getTime() - lookbackDays * DAY_MS;
      return slice.filter((b) => b.ts.getTime() > from) as unknown as MarketBar[];
    },
    fundamentals: () => null,
    news: () => [],
  };
}

/** Pure single-symbol simulation. Decide on bar t close, fill at bar t+1 open. */
export async function simulate(inp: SimInput): Promise<SimResult> {
  const limits = inp.limits ?? DEFAULT_BT_LIMITS;
  const opts = inp.analysts ? { analysts: inp.analysts } : undefined;
  const { bars, symbol, market } = inp;
  const minHistory = inp.minHistoryDays ?? 60;

  let cash = inp.startingCash;
  let qty = new D(0);
  let peakEquity = inp.startingCash;
  let trades = 0;
  let turnoverNotional = new D(0);
  const equityCurve: EquityPoint[] = [];

  for (let t = 0; t < bars.length - 1; t++) {
    const asOf = bars[t].ts;
    const enoughHistory = asOf.getTime() - bars[0].ts.getTime() >= minHistory * DAY_MS;

    if (enoughHistory) {
      const slice = bars.slice(0, t + 1);
      const ctx = buildBacktestContext(symbol, market, slice, asOf);
      const result = await collectSignals(ctx, opts);

      const price = bars[t].close;
      const equityNow = cash.plus(qty.mul(price));
      if (equityNow.gt(peakEquity)) peakEquity = equityNow;
      const positions = qty.gt(0) ? [{ symbol, qty, price }] : [];
      const pf: PortfolioState = { equity: equityNow, cash, positions, peakEquity };
      const a = atr(slice);
      const mkt: MarketState = { symbol, price, atr: a, adv: avgVol(slice), stopPrice: price.minus(a.mul(2)) };

      const decision = surrogateDecision(result, pf, mkt, limits);

      if (decision.finalAction !== 'HOLD' && decision.finalQty.gt(0)) {
        const nextOpen = bars[t + 1].open;
        const slip = nextOpen.mul(SLIPPAGE_BPS).div(BPS);
        const comm = nextOpen.mul(COMMISSION_BPS).div(BPS);
        const advCap = bars[t + 1].volume.mul(new D(limits.liquidityAdvFraction));
        let fillQty = dmin(decision.finalQty, advCap);

        if (decision.finalAction === 'BUY') {
          const fillPrice = nextOpen.plus(slip).plus(comm);
          fillQty = dmin(fillQty, cash.div(fillPrice)); // affordability
          if (fillQty.gt(0)) {
            cash = cash.minus(fillQty.mul(fillPrice));
            qty = qty.plus(fillQty);
            trades++;
            turnoverNotional = turnoverNotional.plus(fillQty.mul(fillPrice));
          }
        } else {
          const fillPrice = nextOpen.minus(slip).minus(comm);
          fillQty = dmin(fillQty, qty); // cannot sell more than held
          if (fillQty.gt(0)) {
            cash = cash.plus(fillQty.mul(fillPrice));
            qty = qty.minus(fillQty);
            trades++;
            turnoverNotional = turnoverNotional.plus(fillQty.mul(fillPrice));
          }
        }
      }
    }

    // Mark-to-market at the fill bar's close (position now established at t+1 open).
    equityCurve.push({ ts: bars[t + 1].ts, equity: num(cash.plus(qty.mul(bars[t + 1].close))) });
  }

  const avgEquity = meanN(equityCurve.map((p) => p.equity)) || 1;
  return { equityCurve, trades, turnover: num(turnoverNotional) / avgEquity };
}

export interface RunBacktestInput {
  symbol: string;
  market: Market;
  fromDate: Date;
  toDate: Date;
  oosFraction?: number;
  startingCash?: Prisma.Decimal;
  limits?: RiskLimits;
  strategyId?: string;
  seed?: number;
}

/** Load bars, simulate, compute full + out-of-sample metrics, persist a BacktestRun. */
export async function runBacktest(
  input: RunBacktestInput,
): Promise<{ backtestRunId: string; metrics: BacktestMetrics; oosMetrics: BacktestMetrics }> {
  const oosFraction = input.oosFraction ?? 0.3;
  const startingCash = input.startingCash ?? new D(100_000);
  const seed = input.seed ?? Math.floor(input.fromDate.getTime() / 1000);

  const rows = await prisma.marketBar.findMany({
    where: { symbol: input.symbol, market: input.market, interval: 'DAY', ts: { gte: input.fromDate, lte: input.toDate } },
    orderBy: { ts: 'asc' },
  });
  const bars: BacktestBar[] = rows.map((r) => ({
    ts: r.ts,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));

  const sim = await simulate({ symbol: input.symbol, market: input.market, bars, startingCash, limits: input.limits });

  const full = computeMetrics(sim.equityCurve, { trades: sim.trades, turnover: sim.turnover });
  const oosStart = Math.floor(sim.equityCurve.length * (1 - oosFraction));
  const oos = computeMetrics(sim.equityCurve.slice(oosStart), { trades: sim.trades, turnover: sim.turnover });

  const run = await prisma.backtestRun.create({
    data: {
      strategyId: input.strategyId ?? null,
      symbol: input.symbol,
      market: input.market,
      fromDate: input.fromDate,
      toDate: input.toDate,
      oosFraction: new D(oosFraction),
      metrics: { full, oos } as unknown as Prisma.InputJsonValue,
      implausible: full.implausible || oos.implausible,
      pmSurrogateId: PM_SURROGATE_ID,
      seed,
      gitSha: process.env.GIT_SHA ?? 'unknown',
    },
  });

  return { backtestRunId: run.id, metrics: full, oosMetrics: oos };
}
