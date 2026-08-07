// src/quant/universe/decorrelatedSleeve.ts — sleeve selection on CORRELATION and SECTOR BALANCE
// instead of dollar volume.
//
// Why this exists, measured on 10 years of real bars for the 98-name halal sleeve: average pairwise
// correlation is 0.326, so 98 names carry the risk of ~3.0 independent bets. Ranking by dollar
// volume selects the mega-cap growth names that move together — it optimises for liquidity and gets
// concentration for free. Selecting the least-correlated 20 instead lifts effective bets to ~4.2,
// about a x1.18 Sharpe multiplier. That was the single largest lever measured, and unlike sixteen
// preregistered strategy variants it attacks the real problem: the book only ever had three bets.
//
// Liquidity becomes a GATE, not the objective. The caller pre-filters to a tradeable pool (top-N by
// dollar volume) and this module chooses within it — you can never select a name you cannot trade.
//
// Pure: no DB, no network, no randomness. Deterministic, with symbol-ascending tie-breaks.
//
// NO LOOK-AHEAD: callers MUST pass return series computed only from bars available at the decision
// date. The measurement that motivated this module cherry-picked using the full 10-year matrix and
// reached 4.2 effective bets; a trailing-window selection will do less well, and that gap is the
// honest cost of not being able to see the future.

export interface SleeveCandidate {
  readonly symbol: string;
  /** GICS-style sector label. Callers supply the mapping; unclassified names are excluded. */
  readonly sector: string | null;
  /** Trailing returns available AT the decision date. Same length and alignment for every candidate. */
  readonly returns: readonly number[];
}

export type SleeveExclusionCode =
  | 'unclassified_sector'
  | 'insufficient_history'
  | 'zero_variance'
  | 'sector_cap_reached';

export interface SleeveExclusion {
  readonly symbol: string;
  readonly reasonCode: SleeveExclusionCode;
}

export interface DecorrelatedSleeveResult {
  readonly sleeve: string[];
  readonly excluded: SleeveExclusion[];
  /** Average pairwise correlation of the chosen sleeve. */
  readonly averageCorrelation: number;
  /** 1 / (rho + (1-rho)/n) — how many independent bets the sleeve actually carries. */
  readonly effectiveBets: number;
  readonly sectorCounts: Readonly<Record<string, number>>;
}

export interface DecorrelatedSleeveOptions {
  readonly maxNames: number;
  /** Max fraction of the sleeve from any one sector (default 0.25). */
  readonly sectorCap?: number;
  /** Minimum trailing observations required to trust a correlation (default 60). */
  readonly minObservations?: number;
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  // A relative floor, not `> 0`. A constant series does not sum to an exact zero variance in
  // floating point — [0.05, 0.05, 0.05] leaves sxx ~1e-34 — and dividing by that returns a
  // confident-looking correlation manufactured entirely from rounding error. Anything below this
  // floor is a flat series and must correlate with nothing.
  const scale = Math.max(Math.abs(mx), Math.abs(my), 1);
  const floor = n * scale * scale * 1e-20;
  return sxx > floor && syy > floor ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Effective independent bets for n assets at average pairwise correlation rho. */
export function effectiveBets(rho: number, n: number): number {
  if (n <= 0) return 0;
  const denom = rho + (1 - rho) / n;
  return denom > 0 ? 1 / denom : n;
}

function averagePairwise(indices: readonly number[], corr: readonly number[][]): number {
  if (indices.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      sum += corr[indices[a]][indices[b]];
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/**
 * Greedy minimum-average-correlation selection under a per-sector cap.
 *
 * Greedy rather than exhaustive on purpose: choosing the optimal k-subset is combinatorial, and the
 * greedy path is deterministic, inspectable, and — on the measured sleeve — captures effectively all
 * of the available benefit. An optimiser that squeezed out the last decimal here would be fitting
 * the correlation matrix, which is exactly the overfitting this repo exists to refuse.
 */
export function selectDecorrelatedSleeve(
  candidates: readonly SleeveCandidate[],
  options: DecorrelatedSleeveOptions,
): DecorrelatedSleeveResult {
  const { maxNames, sectorCap = 0.25, minObservations = 60 } = options;
  if (!Number.isInteger(maxNames) || maxNames < 1) throw new Error('maxNames must be a positive integer');
  if (!(sectorCap > 0) || sectorCap > 1) throw new Error('sectorCap must be in (0, 1]');

  const excluded: SleeveExclusion[] = [];
  const eligible = [...candidates]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .filter((c) => {
      if (c.sector === null) { excluded.push({ symbol: c.symbol, reasonCode: 'unclassified_sector' }); return false; }
      if (c.returns.length < minObservations) { excluded.push({ symbol: c.symbol, reasonCode: 'insufficient_history' }); return false; }
      const first = c.returns[0];
      if (c.returns.every((r) => r === first)) { excluded.push({ symbol: c.symbol, reasonCode: 'zero_variance' }); return false; }
      return true;
    });

  const n = eligible.length;
  const corr: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = pearson(eligible[i].returns, eligible[j].returns);
      corr[i][j] = c; corr[j][i] = c;
    }
  }

  const perSectorMax = Math.max(1, Math.floor(maxNames * sectorCap));
  const sectorCounts: Record<string, number> = {};
  const chosen: number[] = [];

  // Seed with the name least correlated to the field — deterministic, no arbitrary starting point.
  if (n > 0) {
    let seed = 0;
    let seedAvg = Infinity;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) if (j !== i) s += corr[i][j];
      const avg = n > 1 ? s / (n - 1) : 0;
      if (avg < seedAvg - 1e-12) { seedAvg = avg; seed = i; }
    }
    chosen.push(seed);
    sectorCounts[eligible[seed].sector!] = 1;
  }

  while (chosen.length < maxNames && chosen.length < n) {
    let best = -1;
    let bestAvg = Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      const sector = eligible[i].sector!;
      if ((sectorCounts[sector] ?? 0) >= perSectorMax) continue;
      const avg = averagePairwise([...chosen, i], corr);
      if (avg < bestAvg - 1e-12) { bestAvg = avg; best = i; }
    }
    if (best === -1) break; // every remaining candidate is sector-capped out
    chosen.push(best);
    const sector = eligible[best].sector!;
    sectorCounts[sector] = (sectorCounts[sector] ?? 0) + 1;
  }

  for (let i = 0; i < n; i++) {
    if (!chosen.includes(i)) excluded.push({ symbol: eligible[i].symbol, reasonCode: 'sector_cap_reached' });
  }

  const rho = averagePairwise(chosen, corr);
  return {
    sleeve: chosen.map((i) => eligible[i].symbol),
    excluded,
    averageCorrelation: rho,
    effectiveBets: effectiveBets(rho, chosen.length),
    sectorCounts,
  };
}
