// Quant Core analyst (QUANT_DESIGN.md §2.3 #1) — deterministic, backtestable, the
// committee's trustworthy anchor. Composite of classic factors over ~1y of daily bars:
// 12-1 momentum, MA(50/200) trend, 20-day mean-reversion z-score, volume trend, with
// realized volatility scaling conviction down. <60 bars → abstain (never guess).
// Indicator math uses Number (direction, not money); position/money math stays Decimal
// downstream (skills: quant-strategy, backtesting-rigor).
import type { Analyst, AnalystSignal, Stance, Evidence } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';

const MIN_BARS = 60;
const HORIZON_DAYS = 63; // ~one quarter (position horizon)
const DEADBAND = 0.1; // |composite| below this ⇒ NEUTRAL

const num = (x: unknown): number => Number(x as number);
const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const clamp = (x: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, x));

export const quantCoreAnalyst: Analyst = {
  agent: 'QUANT_CORE',
  async run(ctx: PointInTimeContext): Promise<AnalystSignal> {
    const bars = ctx.bars(365); // ≈252 trading days
    const base = {
      agent: 'QUANT_CORE' as const,
      symbol: ctx.symbol,
      market: ctx.market,
      asOf: ctx.asOf,
      horizonDays: HORIZON_DAYS,
      determinism: 'deterministic' as const,
      costCents: 0,
    };

    if (bars.length < MIN_BARS) {
      return {
        ...base,
        stance: 'NEUTRAL',
        conviction: 0,
        evidence: [],
        failureMode: 'abstain',
        rationaleEn: `Insufficient history (${bars.length} < ${MIN_BARS} bars).`,
        rationaleAr: `بيانات تاريخية غير كافية (${bars.length} < ${MIN_BARS} شمعة).`,
      };
    }

    const closes = bars.map((b) => num(b.close));
    const vols = bars.map((b) => num(b.volume));
    const n = closes.length;
    const last = closes[n - 1];

    // 12-1 momentum: return from ~252d ago to ~21d ago (skip the last month)
    const iStart = Math.max(0, n - 252);
    const iEnd = Math.max(iStart + 1, n - 21);
    const mom = closes[iStart] ? (closes[iEnd - 1] - closes[iStart]) / closes[iStart] : 0;

    // Trend: MA50 vs MA200, confirmed by price vs MA200
    const ma = (w: number): number => mean(closes.slice(-Math.min(w, n)));
    const ma50 = ma(50);
    const ma200 = ma(200);
    const trend = Math.sign(ma50 - ma200) * (last > ma200 ? 1 : 0.5);

    // Mean-reversion: 20-day z-score (oversold ⇒ mildly bullish)
    const w20 = closes.slice(-20);
    const sd20 = std(w20);
    const z = sd20 ? (last - mean(w20)) / sd20 : 0;
    const reversion = clamp(-z / 2);

    // Realized volatility of 20 daily returns ⇒ scales conviction down
    const rw = closes.slice(-21);
    const rets = rw.slice(1).map((c, i) => (rw[i] ? (c - rw[i]) / rw[i] : 0));
    const rvol = std(rets);

    // Volume trend: recent 20d vs prior 60d average
    const volTrend = Math.sign(mean(vols.slice(-20)) - mean(vols.slice(-60)));

    const composite = clamp(
      0.45 * Math.sign(mom) * Math.min(1, Math.abs(mom) * 5) +
        0.3 * trend +
        0.15 * reversion +
        0.1 * volTrend,
    );

    const stance: Stance = composite > DEADBAND ? 'BULLISH' : composite < -DEADBAND ? 'BEARISH' : 'NEUTRAL';
    const conviction = clamp(Math.abs(composite) * (1 / (1 + rvol * 10)), 0, 1);

    const evidence: Evidence[] = [
      { kind: 'feature', ref: 'momentum_12_1', value: mom.toFixed(4) },
      { kind: 'feature', ref: 'ma50_ma200', value: `${ma50.toFixed(2)}/${ma200.toFixed(2)}` },
      { kind: 'feature', ref: 'zscore_20', value: z.toFixed(2) },
      { kind: 'feature', ref: 'realized_vol_20', value: rvol.toFixed(4) },
      { kind: 'feature', ref: 'volume_trend', value: String(volTrend) },
    ];

    return {
      ...base,
      stance,
      conviction,
      evidence,
      failureMode: 'ok',
      rationaleEn: `Composite ${composite.toFixed(2)}: 12-1 momentum ${(mom * 100).toFixed(1)}%, MA50/200 ${ma50 > ma200 ? 'up' : 'down'}-trend, z=${z.toFixed(2)}.`,
      rationaleAr: `المؤشر المركّب ${composite.toFixed(2)}: زخم ${(mom * 100).toFixed(1)}%، اتجاه المتوسط ${ma50 > ma200 ? 'صاعد' : 'هابط'}، z=${z.toFixed(2)}.`,
    };
  },
};
