// src/quant/data/gapperCandidates.ts — pure, deterministic candidate-generation math for
// scripts/discover-gapper-universe.ts. No I/O, no DB, no network — unit-testable in isolation.
//
// IMPORTANT — this is a DAILY-BAR CANDIDATE GENERATOR, a deliberate SUPERSET of the real
// strategy screen: it flags a symbol-day as worth a minute-bar backfill using only a daily
// open/high/close/volume bar (open-gap >= openGapMinPct% OR intraday-range-vs-priorClose >=
// rangeMoveMinPct%, plus a daily-volume floor). The real PIT screen — premarket move >= 5%,
// v1-iex cumVolume >= 350k shares, mcap band — re-applies at the minute-bar level in the
// backtest (see src/quant/strategies/gapperOrb.ts). A symbol-day passing here is NOT guaranteed
// to pass the real screen; it only guarantees it is cheap and safe to skip symbol-days that fail
// here (superset property).

export interface DailyBarLike {
  open: number;
  high: number;
  close: number;
  volume: number;
}

export interface GapMetrics {
  /** (open - prevClose) / prevClose * 100 */
  openGapPct: number;
  /** (high - prevClose) / prevClose * 100 */
  rangeMovePct: number;
}

/** Pure. Returns null when prevClose is not usable (missing or non-positive). */
export function computeGapMetrics(bar: DailyBarLike, prevClose: number | null): GapMetrics | null {
  if (prevClose == null || prevClose <= 0) return null;
  return {
    openGapPct: ((bar.open - prevClose) / prevClose) * 100,
    rangeMovePct: ((bar.high - prevClose) / prevClose) * 100,
  };
}

export interface CandidateParams {
  openGapMinPct: number;
  rangeMoveMinPct: number;
  minVolume: number;
}

/** v1 candidate-generator defaults: deliberately looser than the real strategy screen. */
export const GAPPER_CANDIDATE_PARAMS_V1: CandidateParams = Object.freeze({
  openGapMinPct: 3,
  rangeMoveMinPct: 5,
  minVolume: 350_000, // matches GAPPER_ORB_V1_IEX.minCumVolume — never look for candidates below the real IEX floor
});

/** Pure candidate test: (openGap >= min) OR (rangeMove >= min), AND volume floor. */
export function isGapCandidate(
  metrics: GapMetrics,
  volume: number,
  params: CandidateParams = GAPPER_CANDIDATE_PARAMS_V1,
): boolean {
  if (volume < params.minVolume) return false;
  return metrics.openGapPct >= params.openGapMinPct || metrics.rangeMovePct >= params.rangeMoveMinPct;
}

export interface UniverseAsset {
  symbol: string;
  name: string;
}

// Heuristic, best-effort exclusion of non-common-stock NASDAQ assets (ETFs, ETNs, warrants,
// rights, units, preferreds, SPAC shells). Alpaca's /v2/assets response has no explicit
// "is common stock" flag, so this is a superset filter on name/symbol text — the AUTHORITATIVE
// filter downstream is whether SEC XBRL has a shares-outstanding fact for the symbol at all
// (ETFs/trusts registered as investment companies typically do not file dei:
// EntityCommonStockSharesOutstanding), which naturally corrects any heuristic misses here.
const EXCLUDE_NAME_PATTERN =
  /\b(ETF|Exchange-?Traded Fund|Depositary|Depository|Warrants?|Rights?|Units?|Acquisition|SPAC|Notes?|Preferred Stock|Preferred Shares|Fund)\b/i;
const EXCLUDE_SYMBOL_PATTERN = /^[A-Z]{2,4}(W|WS|R|RT|U|UN)$/;

/** Pure. Filters a raw Alpaca NASDAQ asset list down to a common-stock-shaped superset. */
export function filterCommonStockAssets(assets: readonly UniverseAsset[]): UniverseAsset[] {
  return assets.filter(
    (a) =>
      /^[A-Z]{1,5}$/.test(a.symbol) &&
      !EXCLUDE_SYMBOL_PATTERN.test(a.symbol) &&
      !EXCLUDE_NAME_PATTERN.test(a.name),
  );
}

export interface McapBand {
  mcapMin: number;
  mcapMax: number;
}

/** Pure. `mcap` in [mcapMin, mcapMax] inclusive. */
export function isInMcapBand(mcap: number, band: McapBand): boolean {
  return mcap >= band.mcapMin && mcap <= band.mcapMax;
}

export interface PitCandidateDay {
  metrics: GapMetrics;
  volume: number;
  /** Market cap computed from shares available on this day and this day's PIT price. */
  pitMcap: number | null;
}

/**
 * Pure final candidate-day gate. Market cap belongs to the candidate day itself, so a later
 * current-market-cap observation can neither admit nor censor an earlier historical day.
 */
export function isPitEligibleCandidateDay(
  day: PitCandidateDay,
  band: McapBand,
  params: CandidateParams = GAPPER_CANDIDATE_PARAMS_V1,
): boolean {
  return day.pitMcap != null && isGapCandidate(day.metrics, day.volume, params) && isInMcapBand(day.pitMcap, band);
}

export interface SplitCorporateAction {
  type: string;
  symbols: readonly string[];
  effectiveDate: string;
}

const SPLIT_ACTION_TYPES = new Set(['forward_split', 'reverse_split', 'unit_split']);

/**
 * SEC shares measure units at the fact's end date. They are stale when a supported split became
 * effective after that measurement and no later than the candidate day. Split day itself is
 * rejected; unrelated symbols/types are ignored.
 */
export function isCandidateSplitSafe(
  candidate: { symbol: string; date: string; endDate: string },
  actions: readonly SplitCorporateAction[],
): boolean {
  return !actions.some(
    (action) =>
      SPLIT_ACTION_TYPES.has(action.type) &&
      action.symbols.includes(candidate.symbol) &&
      action.effectiveDate > candidate.endDate &&
      action.effectiveDate <= candidate.date,
  );
}

/** Fail closed when an Alpaca process-date query starts after any selected fact measurement. */
export function assertSplitQueryCoversFacts(
  candidates: readonly { endDate: string }[],
  processDateStart: string,
): void {
  const uncovered = candidates.find((candidate) => candidate.endDate < processDateStart);
  if (uncovered) {
    throw new Error(
      `Corporate-action process-date coverage starts ${processDateStart} after SEC fact end ${uncovered.endDate}`,
    );
  }
}

/** Strict positive-integer parser for discovery/backfill cost caps. */
export function parsePositiveIntegerCap(raw: string | undefined, fallback: number, name: string): number {
  if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) {
    throw new Error(`--${name} must be a positive integer (got ${raw})`);
  }
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer (got ${raw ?? String(fallback)})`);
  }
  return value;
}

export interface CandidateDayKey {
  symbol: string;
  date: string;
}

/** Canonical deterministic order for external candidate artifacts. */
export function compareCandidateDays(a: CandidateDayKey, b: CandidateDayKey): number {
  return a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol);
}

export interface SnapshotArtifactCandidate extends CandidateDayKey {
  mcap: number;
  mcapPrice: number;
  sharesOutstanding: number;
  secFiledDate: string;
  endDate: string;
  mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE';
  mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE';
}

export interface ParsedCandidateArtifact {
  candidates: SnapshotArtifactCandidate[];
  candidateCount: number | null;
  totalDiscoveredCandidateCount: number | null;
  generatedAt: string | null;
  corporateActionScreen: Record<string, unknown> | null;
}

export interface CandidateArtifactParseOptions {
  requireCompletedCorporateActionScreen?: boolean;
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

/** Validates the authoritative raw-price PIT inputs consumed by snapshot candidate mode. */
export function parseSnapshotArtifactCandidate(value: unknown, index: number): SnapshotArtifactCandidate {
  const candidate = value as Partial<SnapshotArtifactCandidate> | null;
  const expectedMcap =
    typeof candidate?.sharesOutstanding === 'number' && typeof candidate.mcapPrice === 'number'
      ? candidate.sharesOutstanding * candidate.mcapPrice
      : Number.NaN;
  // Artifact generation multiplies the same IEEE-754 inputs. Allow at most one cent or 1e-9
  // relative error so harmless serialization rounding passes while corrupted values cannot.
  const mcapTolerance = Math.max(0.01, Math.abs(expectedMcap) * 1e-9);
  const valid =
    candidate != null &&
    typeof candidate.symbol === 'string' &&
    /^[A-Z]{1,10}$/.test(candidate.symbol) &&
    isValidDateKey(candidate.date) &&
    typeof candidate.mcap === 'number' &&
    Number.isFinite(candidate.mcap) &&
    candidate.mcap > 0 &&
    typeof candidate.mcapPrice === 'number' &&
    Number.isFinite(candidate.mcapPrice) &&
    candidate.mcapPrice > 0 &&
    typeof candidate.sharesOutstanding === 'number' &&
    Number.isFinite(candidate.sharesOutstanding) &&
    candidate.sharesOutstanding > 0 &&
    isValidDateKey(candidate.endDate) &&
    isValidDateKey(candidate.secFiledDate) &&
    candidate.endDate <= candidate.secFiledDate &&
    candidate.secFiledDate < candidate.date &&
    Number.isFinite(expectedMcap) &&
    Math.abs(candidate.mcap - expectedMcap) <= mcapTolerance &&
    candidate.mcapSource === 'SEC_XBRL_SHARES_X_PRIOR_CLOSE' &&
    candidate.mcapPriceSource === 'ALPACA_IEX_RAW_PRIOR_CLOSE';
  if (!valid) {
    throw new Error(
      `Candidate artifact entry ${index} requires valid dates with endDate <= secFiledDate < date, positive finite ` +
        'sharesOutstanding/mcapPrice/mcap, mcap≈sharesOutstanding×mcapPrice, ' +
        'mcapSource=SEC_XBRL_SHARES_X_PRIOR_CLOSE, and mcapPriceSource=ALPACA_IEX_RAW_PRIOR_CLOSE',
    );
  }
  return candidate as SnapshotArtifactCandidate;
}

/** Validates and canonicalizes the discovery artifact consumed by candidate-scoped backtests. */
export function parseCandidateArtifact(
  value: unknown,
  options: CandidateArtifactParseOptions = {},
): ParsedCandidateArtifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Candidate artifact must be an object');
  }
  const artifact = value as Record<string, unknown>;
  if (!Array.isArray(artifact.candidates)) {
    throw new Error('Candidate artifact requires a candidates array');
  }
  if (
    artifact.generatedAt !== undefined &&
    (typeof artifact.generatedAt !== 'string' || !Number.isFinite(Date.parse(artifact.generatedAt)))
  ) {
    throw new Error('Candidate artifact generatedAt must be a valid timestamp');
  }
  if (
    artifact.corporateActionScreen !== undefined &&
    (!artifact.corporateActionScreen ||
      typeof artifact.corporateActionScreen !== 'object' ||
      Array.isArray(artifact.corporateActionScreen))
  ) {
    throw new Error('Candidate artifact corporateActionScreen must be an object');
  }
  if (
    artifact.candidateCount !== undefined &&
    (!Number.isSafeInteger(artifact.candidateCount) || Number(artifact.candidateCount) < 0)
  ) {
    throw new Error('Candidate artifact candidateCount must be a nonnegative integer');
  }

  const byKey = new Map<string, SnapshotArtifactCandidate>();
  artifact.candidates.forEach((raw, index) => {
    const candidate = parseSnapshotArtifactCandidate(raw, index);
    const key = `${candidate.symbol}\u0000${candidate.date}`;
    const existing = byKey.get(key);
    const evidence = (item: SnapshotArtifactCandidate) => [
      item.symbol,
      item.date,
      item.mcap,
      item.mcapPrice,
      item.sharesOutstanding,
      item.endDate,
      item.secFiledDate,
      item.mcapSource,
      item.mcapPriceSource,
    ];
    if (existing && JSON.stringify(evidence(existing)) !== JSON.stringify(evidence(candidate))) {
      throw new Error(`Candidate artifact has conflicting duplicate evidence for ${candidate.symbol} ${candidate.date}`);
    }
    if (!existing) byKey.set(key, candidate);
  });

  const parsed: ParsedCandidateArtifact = {
    candidates: Array.from(byKey.values()).sort(compareCandidateDays),
    candidateCount: typeof artifact.candidateCount === 'number' ? artifact.candidateCount : null,
    totalDiscoveredCandidateCount:
      typeof artifact.totalDiscoveredCandidateCount === 'number' ? artifact.totalDiscoveredCandidateCount : null,
    generatedAt: typeof artifact.generatedAt === 'string' ? artifact.generatedAt : null,
    corporateActionScreen: (artifact.corporateActionScreen as Record<string, unknown> | undefined) ?? null,
  };
  if (parsed.candidateCount != null && parsed.candidateCount !== parsed.candidates.length) {
    throw new Error('Candidate artifact candidateCount must equal canonical candidates.length');
  }
  if (options.requireCompletedCorporateActionScreen && parsed.candidates.length) {
    assertCompletedCorporateActionScreen(parsed);
  }
  return parsed;
}

function assertCompletedCorporateActionScreen(artifact: ParsedCandidateArtifact): void {
  const screen = artifact.corporateActionScreen;
  const generatedDate = artifact.generatedAt?.slice(0, 10) ?? null;
  const range = screen?.processDateQueryRange as Record<string, unknown> | undefined;
  const eligibility = screen?.effectiveDateEligibilityRange as Record<string, unknown> | undefined;
  const dateFields = screen?.dateFields as Record<string, unknown> | undefined;
  const types = screen?.types;
  const requiredTypes = ['forward_split', 'reverse_split', 'unit_split'];
  const hasExactTypes =
    Array.isArray(types) &&
    types.length === requiredTypes.length &&
    requiredTypes.every((type) => types.includes(type));
  const count = (key: string) => screen?.[key];
  const countsAreIntegers = ['actionsFetched', 'candidatesScreened', 'candidatesRejected', 'candidatesPassed']
    .every((key) => Number.isSafeInteger(count(key)) && Number(count(key)) >= 0);
  const earliestFactEnd = artifact.candidates.reduce(
    (earliest, candidate) => candidate.endDate < earliest ? candidate.endDate : earliest,
    artifact.candidates[0].endDate,
  );
  const latestCandidateDate = artifact.candidates.reduce(
    (latest, candidate) => candidate.date > latest ? candidate.date : latest,
    artifact.candidates[0].date,
  );
  const valid =
    artifact.generatedAt != null &&
    screen != null &&
    screen.status === 'COMPLETE' &&
    screen.provider === 'ALPACA' &&
    screen.endpoint === '/v1/corporate-actions' &&
    hasExactTypes &&
    screen.queryFilterDateField === 'process_date' &&
    dateFields?.forward_split === 'ex_date' &&
    dateFields.reverse_split === 'ex_date' &&
    dateFields.unit_split === 'effective_date' &&
    range?.startDate === '1900-01-01' &&
    range.endDate === generatedDate &&
    range.coverageComplete === true &&
    range.coverageBasis === 'All pages returned by Alpaca for the declared process_date range.' &&
    isValidDateKey(eligibility?.strictlyAfterFactEnd) &&
    eligibility.strictlyAfterFactEnd <= earliestFactEnd &&
    isValidDateKey(eligibility.throughCandidateDate) &&
    eligibility.throughCandidateDate >= latestCandidateDate &&
    eligibility.predicate === 'effectiveDate > candidate.endDate && effectiveDate <= candidate.date' &&
    countsAreIntegers &&
    Number(screen.candidatesScreened) === Number(screen.candidatesRejected) + Number(screen.candidatesPassed) &&
    Number.isSafeInteger(artifact.totalDiscoveredCandidateCount) &&
    Number(artifact.totalDiscoveredCandidateCount) >= 0 &&
    artifact.candidateCount === artifact.candidates.length &&
    Number(screen.candidatesPassed) === artifact.totalDiscoveredCandidateCount &&
    artifact.candidates.length <= Number(screen.candidatesPassed) &&
    typeof screen.limitation === 'string' &&
    screen.limitation.length > 0;
  if (!valid) {
    throw new Error('Candidate artifact requires a complete, internally consistent Alpaca split-safe corporateActionScreen');
  }
}
