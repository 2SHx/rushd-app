// Technical/Chart analyst (QUANT_DESIGN.md §2.3 #3) — deterministic TS over price
// action alone: RSI(14), MACD(12,26,9) histogram, Bollinger %B(20,2), and proximity
// to recent support/resistance. <30 bars → abstain (never guess).
// Indicator math uses Number (direction, not money) (skills: quant-strategy,
// backtesting-rigor).
import type { Analyst, AnalystSignal, Stance, Evidence } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';

const MIN_BARS = 30;
const HORIZON_DAYS = 20; // near-term, chart-driven
const DEADBAND = 0.1; // |composite| below this ⇒ NEUTRAL

const num = (x: unknown): number => Number(x as number);
const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const clamp = (x: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, x));

/** Simple RSI over the trailing `period` closes. Always in [0, 100]. */
function rsi(closes: number[], period = 14): number {
  const w = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < w.length; i++) {
    const diff = w[i] - w[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** EMA series, seeded with the first value (deterministic, no external state). */
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export const technicalAnalyst: Analyst = {
  agent: 'TECHNICAL',
  async run(ctx: PointInTimeContext): Promise<AnalystSignal> {
    const bars = ctx.bars(120);
    const base = {
      agent: 'TECHNICAL' as const,
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
    const highs = bars.map((b) => num(b.high));
    const lows = bars.map((b) => num(b.low));
    const last = closes[closes.length - 1];

    // RSI(14): normalized around the neutral 50 midpoint.
    const rsiVal = rsi(closes, 14);
    const rsiScore = clamp((rsiVal - 50) / 50);

    // MACD(12,26,9): sign + magnitude of the histogram relative to 1% of price.
    const emaFast = ema(closes, 12);
    const emaSlow = ema(closes, 26);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, 9);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);
    const lastHist = histogram[histogram.length - 1];
    const macdScore = last ? clamp(lastHist / (last * 0.01)) : 0;

    // Bollinger %B(20,2): position within the bands.
    const w20 = closes.slice(-20);
    const sma20 = mean(w20);
    const sd20 = std(w20);
    const upper = sma20 + 2 * sd20;
    const lower = sma20 - 2 * sd20;
    const percentB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
    const bbScore = clamp((percentB - 0.5) * 2);

    // Support/resistance: recent high/low proximity over the loaded window.
    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);
    const srRange = recentHigh - recentLow;
    const srPos = srRange === 0 ? 0.5 : (last - recentLow) / srRange;
    const srScore = clamp((srPos - 0.5) * 2);

    const composite = clamp(0.3 * rsiScore + 0.3 * macdScore + 0.2 * bbScore + 0.2 * srScore);
    const stance: Stance = composite > DEADBAND ? 'BULLISH' : composite < -DEADBAND ? 'BEARISH' : 'NEUTRAL';
    const conviction = clamp(Math.abs(composite), 0, 1);

    const evidence: Evidence[] = [
      { kind: 'feature', ref: 'RSI(14)', value: rsiVal.toFixed(2) },
      { kind: 'feature', ref: 'MACD(12,26,9)_histogram', value: lastHist.toFixed(4) },
      { kind: 'feature', ref: 'Bollinger_%B(20,2)', value: percentB.toFixed(3) },
      { kind: 'feature', ref: 'support_resistance_position', value: srPos.toFixed(3) },
    ];

    return {
      ...base,
      stance,
      conviction,
      evidence,
      failureMode: 'ok',
      rationaleEn: `Composite ${composite.toFixed(2)}: RSI ${rsiVal.toFixed(1)}, MACD histogram ${lastHist.toFixed(3)}, %B ${percentB.toFixed(2)}, S/R position ${srPos.toFixed(2)}.`,
      rationaleAr: `المؤشر المركّب ${composite.toFixed(2)}: RSI ${rsiVal.toFixed(1)}، مدرج MACD ${lastHist.toFixed(3)}، %B ${percentB.toFixed(2)}، موقع الدعم/المقاومة ${srPos.toFixed(2)}.`,
    };
  },
};
