// Technical/Chart analyst (QUANT_DESIGN.md §2.3 #3) — deterministic TS over price
// action alone: RSI, MACD histogram + signal-line crossover, Bollinger %B + bandwidth
// squeeze, HMA(21) slope (lag-reduced trend), and proximity to recent
// support/resistance. <30 bars → abstain (never guess). Bars arrive through
// PointInTimeContext, which only ever serves closed bars ≤ asOf — no forming candle
// can repaint a value here. Indicator math uses Number (direction, not money)
// (skills: quant-strategy, backtesting-rigor).
import type { Analyst, AnalystSignal, Stance, Evidence } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';

/**
 * Versioned strategy parameters — every threshold/window the analyst uses lives here,
 * never inline in the function body, so walk-forward studies can vary them and a
 * signal is always attributable to an exact parameter version.
 *
 * `convictionCap` is the calibration ceiling: the directional hit rate of this
 * composite measured point-in-time (20-day forward horizon, closed bars only) on the
 * frozen captured-real dual-momentum-rotation fixture (7 halal-universe names,
 * 2025-01 → 2026-02). Conviction is scaled into [0, cap] so a reported conviction
 * never exceeds the frequency at which the signal has actually been right —
 * re-measured by technical.test.ts against the same frozen fixture.
 */
export const TECHNICAL_PARAMS = {
  version: 'technical.v2',
  minBars: 30,
  horizonDays: 20, // near-term, chart-driven
  deadband: 0.1, // |composite| below this ⇒ NEUTRAL
  rsiPeriod: 14,
  macd: { fast: 12, slow: 26, signal: 9, histNormPct: 0.01, crossoverBoost: 0.5 },
  bollinger: { period: 20, mult: 2, squeezeLookback: 60, squeezeQuantile: 0.25 },
  hmaPeriod: 21,
  weights: { rsi: 0.25, macd: 0.25, bollinger: 0.15, supportResistance: 0.15, hmaTrend: 0.2 },
  squeezeConvictionBoost: 0.15, // volatility squeeze ⇒ breakout potential, boosts conviction only
  // Measured 2026-07-20: 1,464 signals, aggregate hit rate 0.639 (per-name 0.41–0.79).
  // Cap set conservatively below the aggregate; technical.test.ts re-measures and
  // fails if the cap ever exceeds the fixture-measured hit rate.
  convictionCap: 0.6,
} as const;

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

/**
 * WMA series: linearly weighted mean of the trailing `period` values (most recent
 * weighted highest). Indices before a full window use the available prefix.
 */
export function wma(values: readonly number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const n = Math.min(period, i + 1);
    let weighted = 0;
    for (let j = 0; j < n; j++) {
      weighted += values[i - j] * (n - j);
    }
    out.push(weighted / ((n * (n + 1)) / 2));
  }
  return out;
}

/** HMA_k = WMA_⌊√k⌋(2·WMA_⌊k/2⌋(P) − WMA_k(P)) — trend with materially less lag. */
export function hma(values: readonly number[], period: number): number[] {
  const half = wma(values, Math.max(1, Math.floor(period / 2)));
  const full = wma(values, period);
  const raw = half.map((v, i) => 2 * v - full[i]);
  return wma(raw, Math.max(1, Math.floor(Math.sqrt(period))));
}

/** +1 fresh bullish cross, −1 fresh bearish cross, 0 otherwise — on the LAST CLOSED bar. */
export function macdCrossover(macdLine: readonly number[], signalLine: readonly number[]): -1 | 0 | 1 {
  const n = macdLine.length;
  if (n < 2) return 0;
  const prev = macdLine[n - 2] - signalLine[n - 2];
  const curr = macdLine[n - 1] - signalLine[n - 1];
  if (prev <= 0 && curr > 0) return 1;
  if (prev >= 0 && curr < 0) return -1;
  return 0;
}

/** Bollinger bandwidth (upper−lower)/middle at the last index of each rolling window. */
export function bollingerBandwidth(closes: readonly number[], period: number, mult: number): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const w = closes.slice(i - period + 1, i + 1);
    const m = mean(w);
    out.push(m === 0 ? 0 : (2 * mult * std(w)) / m);
  }
  return out;
}

/**
 * Volatility squeeze: the latest bandwidth sits at/below the `quantile` of the trailing
 * `lookback` bandwidth observations. Needs a full lookback — otherwise no squeeze call.
 */
export function isBollingerSqueeze(bandwidths: readonly number[], lookback: number, quantile: number): boolean {
  if (bandwidths.length < lookback + 1) return false;
  const trailing = bandwidths.slice(-(lookback + 1), -1).slice().sort((a, b) => a - b);
  const threshold = trailing[Math.max(0, Math.min(trailing.length - 1, Math.floor(quantile * (trailing.length - 1))))];
  return bandwidths[bandwidths.length - 1] <= threshold;
}

export const technicalAnalyst: Analyst = {
  agent: 'TECHNICAL',
  async run(ctx: PointInTimeContext): Promise<AnalystSignal> {
    const p = TECHNICAL_PARAMS;
    const bars = ctx.bars(120);
    const base = {
      agent: 'TECHNICAL' as const,
      symbol: ctx.symbol,
      market: ctx.market,
      asOf: ctx.asOf,
      horizonDays: p.horizonDays,
      determinism: 'deterministic' as const,
      costCents: 0,
    };

    if (bars.length < p.minBars) {
      return {
        ...base,
        stance: 'NEUTRAL',
        conviction: 0,
        evidence: [],
        failureMode: 'abstain',
        rationaleEn: `Insufficient history (${bars.length} < ${p.minBars} bars).`,
        rationaleAr: `بيانات تاريخية غير كافية (${bars.length} < ${p.minBars} شمعة).`,
      };
    }

    const closes = bars.map((b) => num(b.close));
    const highs = bars.map((b) => num(b.high));
    const lows = bars.map((b) => num(b.low));
    const last = closes[closes.length - 1];

    // RSI: normalized around the neutral 50 midpoint.
    const rsiVal = rsi(closes, p.rsiPeriod);
    const rsiScore = clamp((rsiVal - 50) / 50);

    // MACD: histogram magnitude relative to histNormPct of price, plus a fresh
    // signal-line crossover pushing the score toward ±1 on the bar it happens.
    const emaFast = ema(closes, p.macd.fast);
    const emaSlow = ema(closes, p.macd.slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = ema(macdLine, p.macd.signal);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);
    const lastHist = histogram[histogram.length - 1];
    const crossover = macdCrossover(macdLine, signalLine);
    const macdScore = clamp(
      (last ? clamp(lastHist / (last * p.macd.histNormPct)) : 0) + p.macd.crossoverBoost * crossover,
    );

    // Bollinger %B: position within the bands; bandwidth squeeze flags volatility contraction.
    const wBB = closes.slice(-p.bollinger.period);
    const smaBB = mean(wBB);
    const sdBB = std(wBB);
    const upper = smaBB + p.bollinger.mult * sdBB;
    const lower = smaBB - p.bollinger.mult * sdBB;
    const percentB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
    const bbScore = clamp((percentB - 0.5) * 2);
    const bandwidths = bollingerBandwidth(closes, p.bollinger.period, p.bollinger.mult);
    const squeeze = isBollingerSqueeze(bandwidths, p.bollinger.squeezeLookback, p.bollinger.squeezeQuantile);

    // HMA slope: lag-reduced trend direction, magnitude normalized to 1% of price.
    const hmaSeries = hma(closes, p.hmaPeriod);
    const hmaSlope = hmaSeries.length >= 2 ? hmaSeries[hmaSeries.length - 1] - hmaSeries[hmaSeries.length - 2] : 0;
    const hmaScore = last ? clamp(hmaSlope / (last * 0.01)) : 0;

    // Support/resistance: recent high/low proximity over the loaded window.
    const recentHigh = Math.max(...highs);
    const recentLow = Math.min(...lows);
    const srRange = recentHigh - recentLow;
    const srPos = srRange === 0 ? 0.5 : (last - recentLow) / srRange;
    const srScore = clamp((srPos - 0.5) * 2);

    const w = p.weights;
    const composite = clamp(
      w.rsi * rsiScore + w.macd * macdScore + w.bollinger * bbScore + w.supportResistance * srScore + w.hmaTrend * hmaScore,
    );
    const stance: Stance = composite > p.deadband ? 'BULLISH' : composite < -p.deadband ? 'BEARISH' : 'NEUTRAL';
    // A squeeze raises breakout odds, so it boosts conviction — never flips direction.
    const squeezeBoost = squeeze && stance !== 'NEUTRAL' ? 1 + p.squeezeConvictionBoost : 1;
    const conviction = clamp(Math.abs(composite) * squeezeBoost, 0, 1) * p.convictionCap;

    const evidence: Evidence[] = [
      { kind: 'feature', ref: `RSI(${p.rsiPeriod})`, value: rsiVal.toFixed(2) },
      { kind: 'feature', ref: `MACD(${p.macd.fast},${p.macd.slow},${p.macd.signal})_histogram`, value: lastHist.toFixed(4) },
      { kind: 'feature', ref: 'MACD_signal_crossover', value: String(crossover) },
      { kind: 'feature', ref: `Bollinger_%B(${p.bollinger.period},${p.bollinger.mult})`, value: percentB.toFixed(3) },
      { kind: 'feature', ref: 'Bollinger_bandwidth_squeeze', value: String(squeeze) },
      { kind: 'feature', ref: `HMA(${p.hmaPeriod})_slope`, value: hmaSlope.toFixed(4) },
      { kind: 'feature', ref: 'support_resistance_position', value: srPos.toFixed(3) },
      { kind: 'feature', ref: 'params_version', value: p.version },
    ];

    return {
      ...base,
      stance,
      conviction,
      evidence,
      failureMode: 'ok',
      rationaleEn: `Composite ${composite.toFixed(2)}: RSI ${rsiVal.toFixed(1)}, MACD histogram ${lastHist.toFixed(3)} (crossover ${crossover}), %B ${percentB.toFixed(2)}${squeeze ? ', bandwidth squeeze' : ''}, HMA slope ${hmaSlope.toFixed(3)}, S/R position ${srPos.toFixed(2)}.`,
      rationaleAr: `المؤشر المركّب ${composite.toFixed(2)}: RSI ${rsiVal.toFixed(1)}، مدرج MACD ${lastHist.toFixed(3)} (تقاطع ${crossover})، %B ${percentB.toFixed(2)}${squeeze ? '، انضغاط النطاق' : ''}، ميل HMA ${hmaSlope.toFixed(3)}، موقع الدعم/المقاومة ${srPos.toFixed(2)}.`,
    };
  },
};
