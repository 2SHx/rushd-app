// src/quant/strategies/gapperCalibration.ts — pure, deterministic calibration math for the
// gapper-orb v1-iex volume threshold. No I/O, no DB, no network — the measured ratios are
// gathered by scripts/calibrate-iex-ratio.ts and reduced here so the derivation is unit-testable.

/** Median of a numeric sample (NaN for empty). Pure. */
export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface IexThreshold {
  median: number; // median IEX/consolidated volume ratio
  raw: number; // baseline × median (unrounded)
  rounded: number; // deliberate config value
}

/**
 * v1-iex `minCumVolume` = round(baseline × median(IEX/consolidated ratio)). The consolidated
 * baseline (v1 = 10e6) is scaled down by the fraction of consolidated volume the IEX feed prints,
 * then rounded so the config reads as a deliberate choice — never a hand-tuned magic number.
 */
export function deriveIexMinCumVolume(
  ratios: readonly number[],
  baseline = 10_000_000,
  roundTo = 50_000,
): IexThreshold {
  const m = median(ratios);
  const raw = baseline * m;
  const rounded = Math.round(raw / roundTo) * roundTo;
  return { median: m, raw, rounded };
}
