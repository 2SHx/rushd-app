// src/quant/backtest/runLab.ts — QDR-6/QDR-lab: the extracted run pipeline. Both the CLI
// (scripts/backtest.ts, a thin argv → options wrapper) and the API (src/app/api/quant/lab/run)
// call `runLab()` so both invoke byte-identical universe/period/simulate/assemble/persist logic.
// No shell-out: this module runs the simulation in-process (the API's caller decides whether to
// await it inline or fire it off detached — see route.ts for that tradeoff).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { STRATEGY_SETUP_CATALOG } from '../strategies/catalog';
import { GAPPER_ORB_V1_IEX } from '../strategies/gapperOrb';
import { bollingerV3BookPolicy, type BollingerMrLongV3Params } from '../strategies/bollingerMrLongV3';
import {
  tsMomentumV3BookPolicy,
  type TsMomentumHalalBasketV3Params,
} from '../strategies/tsMomentumHalalBasketV3';
import {
  tsMomentumV4BookPolicy,
  type TsMomentumHalalBasketV4Params,
} from '../strategies/tsMomentumHalalBasketV4';
import { DUAL_MOMENTUM_UNIVERSE } from '../strategies/dualMomentumRotation';
import { dualMomentumRotationBookPolicy } from '../strategies/dualMomentumRotation';
import { TOM_OVERLAY_UNIVERSE, tomOverlayBookPolicy } from '../strategies/tomOverlay';
import {
  G6B_LINEAR_FACTOR_UNIVERSE,
  g6bLinearFactorBookPolicy,
} from '../strategies/g6bLinearFactor';
import { g6bLinearFactorWideBookPolicy } from '../strategies/g6bLinearFactorWide';
import { MULTI_MODE_UNIVERSE, multiModeBookPolicy } from '../strategies/multiModeBook';
import { multiModeBookV2Policy, type MultiModeBookV2Params } from '../strategies/multiModeBookV2';
import {
  buildStocksInPlayBook, STOCKS_IN_PLAY_UNIVERSE_V1,
  stocksInPlayPrehistoryStart,
  type SourcedDailyRow, type SourcedMinuteRow, type StocksInPlayAggregate,
} from '../strategies/stocksInPlayOrb';
import { NASDAQ_HALAL_UNIVERSE } from '../strategies/bollingerMrLong';
import type { StrategySetup, UniverseCompatibility } from '../strategies/types';
import { loadAllFixtures } from '../data/fixtureLoader';
import { nasdaqDateKey } from '../data/snapshot';
import {
  parseCandidateArtifact,
  type ParsedCandidateArtifact,
  type SnapshotArtifactCandidate,
} from '../data/gapperCandidates';
import { LookaheadError } from '../data/pointInTime';
import {
  simulateIntraday, DEFAULT_INTRADAY_LIMITS,
  type DayContext, type IntradayBarInput, type TradeRecord,
} from './intradayEngine';
import {
  simulateSetupDaily, filterRealDailyBars, DEFAULT_BT_LIMITS,
  type BacktestBar, type DailyBarInput,
} from './engine';
import {
  collapseMaxOnePositionEpisodes,
  simulateStrategyBook,
  type StrategyBookDailyPoint, type StrategyBookPolicy, type StrategyBookResult, type StrategyBookSeries,
} from './portfolioEngine';
import { computeMetrics, type EquityPoint } from './metrics';
import { summarizeDailyReturns, toDailyReturns, toIndependentPeriodReturns } from './distribution';
import {
  bootstrapMonthlyBlocks, bootstrapTradeOutcomes, signFlipPermutationTest, kellySizedDecision,
} from './monteCarlo';
import { assembleReportCard, renderReportCard, type DataFeed, type ReportCard, type ShariaValidationState } from './reportCard';
import { buildHistoricalComparisonEvidence } from './historicalComparison';
import { buildTradeEvidence, type AttributedTradeRecord } from './tradeEvidence';
import { assertWalkForward } from './walkForward';
import { evaluateProfitPlateau, type PlateauEvaluation, type PlateauNeighborResult } from './profitPlateau';
import { buildShariaRunSnapshot } from './shariaSnapshot';
import { buildC1ShariaRunSnapshot } from './shariaSnapshot';
import { buildVerifiedUniverse } from '../universe/buildVerifiedUniverse';
import { selectDollarVolumeSleeve } from '../universe/sleeveSelector';
import type { UniverseEntry } from '../universe/types';
import type { RiskLimits } from '../risk/envelope';

const D = Prisma.Decimal;

export type DailyBacktestRoute = 'legacy' | 'shared';
export type BacktestRunMode = 'TERMINAL' | 'DIAGNOSTIC_NON_TERMINAL';

export function backtestRunMode(value?: string): BacktestRunMode {
  if (value === undefined || value === 'false') return 'TERMINAL';
  if (value === 'true') return 'DIAGNOSTIC_NON_TERMINAL';
  throw new Error('--diagnostic must be true or false');
}

export function diagnosticReportOutput(rendered: string, runMode: BacktestRunMode): string {
  if (runMode === 'TERMINAL') return rendered;
  return `DIAGNOSTIC_NON_TERMINAL\n${rendered.replace(
    /  STATUS: [^\n]*/,
    '  DIAGNOSTIC CHECKLIST (NON-TERMINAL): standard gates shown for context only',
  )}`;
}

/** R3-1 may opt a strategy version into the shared route without changing any existing setup. */
export const SHARED_BOOK_SETUP_IDS: ReadonlySet<string> = new Set([
  'ts-momentum-halal-basket-v3',
  'ts-momentum-halal-basket-v4',
  'bollinger-mr-long-v3',
  'dual-momentum-rotation',
  'tom-overlay',
  'g6b-linear-factor',
  'g6b-linear-factor-wide',
  'multi-mode-book-v1',
  'multi-mode-book-v2',
]);

const C1_VERIFIED_SLEEVE_SETUP_IDS: ReadonlySet<string> = new Set([
  'ts-momentum-halal-basket-v4',
  'bollinger-mr-long-v3',
]);

const C1_VERIFIED_FIXED_SETUP_IDS: ReadonlySet<string> = new Set(['multi-mode-book-v1', 'multi-mode-book-v2']);

export function selectDailyBacktestRoute(
  setupId: string,
  requested?: string,
): DailyBacktestRoute {
  if (requested !== undefined && requested !== 'legacy' && requested !== 'shared') {
    throw new Error('--engine must be legacy or shared');
  }
  return requested ?? (SHARED_BOOK_SETUP_IDS.has(setupId) ? 'shared' : 'legacy');
}

export interface ValidationReturnInputs {
  riskReturns: number[];
  permutationReturns: number[];
  observationUnit: 'book-day' | 'trade';
}

/** Shared risk evidence uses true book NAV; entry permutation remains position-trade based. */
export function validationReturnInputs(
  route: DailyBacktestRoute,
  sharedCurve: readonly EquityPoint[] | null,
  tradeReturns: number[],
): ValidationReturnInputs {
  if (route === 'legacy') {
    return { riskReturns: tradeReturns, permutationReturns: tradeReturns, observationUnit: 'trade' };
  }
  if (!sharedCurve) throw new Error('Shared validation requires the shared daily NAV curve');
  const riskReturns = sharedCurve.slice(1).map((point, index) => {
    const previous = sharedCurve[index].equity;
    return previous !== 0 ? point.equity / previous - 1 : 0;
  });
  return { riskReturns, permutationReturns: tradeReturns, observationUnit: 'book-day' };
}

export function validationTrialsForSetup(setupId: string, effectiveParams: unknown): number {
  if (!SHARED_BOOK_SETUP_IDS.has(setupId)) return 1;
  const trials = (effectiveParams as { validationTrials?: unknown } | null)?.validationTrials;
  if (!Number.isInteger(trials) || Number(trials) <= 1) {
    throw new Error(`${setupId} requires validationTrials > 1`);
  }
  return Number(trials);
}

// ── R3-3.5 first-class universe + period selection ──────────────────────────────────────────────
export type UniverseSelection = 'halal' | 'wide' | 'custom';
export type PeriodPreset = 'FULL' | '3Y' | '2Y' | '1Y' | 'CUSTOM';

/** FULL preset lower bound (contract R3-3.5): FULL = 2018-01-02 → latest complete trading date. */
export const FULL_PERIOD_START = '2018-01-02';
/**
 * `--universe wide` threshold: a symbol joins the wide universe only if it has ≥ this many REAL
 * (YAHOO/ALPACA) daily MarketBar rows inside the resolved range — one trading month of history, so
 * a symbol with a scrap of data does not enter as noise. Documented + exported so it is test-pinned.
 */
export const WIDE_MIN_DAILY_BARS = 20;

/** Setups whose fixed research book the CLI must never override, absent an explicit declaration. */
const FIXED_BOOK_FALLBACK_SETUP_IDS: ReadonlySet<string> = new Set([
  'dual-momentum-rotation', 'tom-overlay',
  'stocks-in-play-orb', 'stop-hunt-reversal-long', 'bagholder-bounce', 'time-of-day', 'vwap-reclaim', 'gapper-orb',
]);

/** Resolved universe compatibility for a setup: its declaration, else the conservative fallback. */
export function universeCompatibilityForSetup(setup: StrategySetup<unknown>): UniverseCompatibility {
  return setup.universeCompatibility
    ?? (FIXED_BOOK_FALLBACK_SETUP_IDS.has(setup.id) ? 'fixed' : 'halal-only');
}

/** Subtract whole calendar years from a YYYY-MM-DD date (UTC), returning YYYY-MM-DD. */
export function subtractYears(dateYmd: string, years: number): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) throw new Error(`invalid date "${dateYmd}"`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() - years);
  return dt.toISOString().slice(0, 10);
}

function isPeriodPreset(value: string): value is Exclude<PeriodPreset, 'CUSTOM'> {
  return value === 'FULL' || value === '3Y' || value === '2Y' || value === '1Y';
}

/**
 * Resolve `--period` + explicit dates to a concrete [from,to] and a periodPreset tag. Explicit
 * `--from/--to` ALWAYS wins (⇒ 'CUSTOM'); otherwise the named preset anchors `to` at the latest
 * complete MarketBar trading date and `from` at FULL_PERIOD_START (FULL) or latest−N years.
 */
export function resolvePeriodDates(
  periodArg: string | undefined,
  latestTradingDate: string | null,
  explicit: { from?: string; to?: string },
): { from: string; to: string; periodPreset: PeriodPreset } {
  if (explicit.from && explicit.to) return { from: explicit.from, to: explicit.to, periodPreset: 'CUSTOM' };
  if (explicit.from || explicit.to) throw new Error('provide BOTH --from and --to, or use --period');
  if (!periodArg) throw new Error('provide --period FULL|3Y|2Y|1Y or explicit --from/--to');
  if (!isPeriodPreset(periodArg)) throw new Error('--period must be FULL, 3Y, 2Y, or 1Y');
  if (!latestTradingDate) throw new Error('--period presets require MarketBar data to anchor the latest trading date');
  const to = latestTradingDate;
  const from = periodArg === 'FULL'
    ? FULL_PERIOD_START
    : subtractYears(latestTradingDate, periodArg === '3Y' ? 3 : periodArg === '2Y' ? 2 : 1);
  return { from, to, periodPreset: periodArg };
}

/** Normalize the `--universe` flag; default 'custom' when --symbols present, else 'halal'. */
export function resolveUniverseSelection(
  universeArg: string | undefined,
  wantSymbols: readonly string[] | null,
): UniverseSelection {
  if (universeArg === undefined) return wantSymbols && wantSymbols.length ? 'custom' : 'halal';
  if (universeArg === 'halal' || universeArg === 'wide' || universeArg === 'custom') return universeArg;
  throw new Error('--universe must be halal, wide, or custom');
}

/** A custom basket is unscreened when any name is outside the NASDAQ halal core; wide is always. */
export function universeUnscreened(selection: UniverseSelection, symbols: readonly string[]): boolean {
  if (selection === 'wide') return true;
  if (selection === 'custom') return symbols.some((s) => !NASDAQ_HALAL_UNIVERSE.includes(s));
  return false;
}

/** Human/UI universe tag written onto the card and BacktestRun. */
export function universeLabel(selection: UniverseSelection, symbols: readonly string[]): string {
  if (selection === 'custom') return `custom:${symbols.length}-symbols`;
  return selection;
}

/**
 * Enforce a setup's declared universe policy against the requested selection. `fixed` setups reject
 * ANY explicit override; `halal-only` setups reject `wide` and unscreened custom baskets; `any-
 * equities` accepts everything. Throws a clear, user-facing error on rejection.
 */
export function assertUniverseAllowed(
  setup: StrategySetup<unknown>,
  compat: UniverseCompatibility,
  selection: UniverseSelection,
  symbols: readonly string[],
  overrideProvided: boolean,
): void {
  if (compat === 'fixed') {
    if (overrideProvided) {
      throw new Error(`${setup.id} owns a fixed research book; --universe/--symbols overrides are rejected (run it without a universe override)`);
    }
    return;
  }
  if (compat === 'halal-only') {
    if (selection === 'wide') {
      throw new Error(`${setup.id} is halal-only: --universe wide is not allowed (its edge is defined only on the NASDAQ halal core)`);
    }
    if (selection === 'custom' && universeUnscreened('custom', symbols)) {
      const bad = symbols.filter((s) => !NASDAQ_HALAL_UNIVERSE.includes(s));
      throw new Error(`${setup.id} is halal-only: custom basket has unscreened name(s) ${bad.join(', ')} outside the halal core`);
    }
  }
}

/**
 * Guard against accidental multi-hour `--universe wide` runs (thousands of symbols): a wide run is
 * only permitted on the 1Y preset OR with explicit --from/--to, unless --confirm-full is passed.
 */
export function assertWideRunBounded(
  selection: UniverseSelection,
  periodPreset: PeriodPreset,
  hasExplicitDates: boolean,
  confirmFull: boolean,
): void {
  if (selection !== 'wide') return;
  if (confirmFull || hasExplicitDates || periodPreset === '1Y') return;
  throw new Error('--universe wide requires --period 1Y OR explicit --from/--to (guards multi-hour runs); pass --confirm-full to override');
}

/** Fixed-universe setups cannot silently degrade to whichever symbols happen to have DB rows. */
export function dailyUniverseForSetup(setupId: string, requested: readonly string[] | null): string[] | null {
  const universe = setupId === 'dual-momentum-rotation'
    ? DUAL_MOMENTUM_UNIVERSE
    : setupId === 'tom-overlay'
      ? TOM_OVERLAY_UNIVERSE
      : setupId === 'g6b-linear-factor'
        ? G6B_LINEAR_FACTOR_UNIVERSE
      : null;
  if (!universe) return null;
  if (requested && (requested.length !== universe.length || universe.some((symbol) => !requested.includes(symbol)))) {
    const label = setupId === 'tom-overlay'
      ? 'exact SPUS universe'
      : setupId === 'g6b-linear-factor'
        ? 'exact 25-name halal research universe'
        : 'exact seven-asset universe';
    throw new Error(`${setupId} requires its ${label}`);
  }
  return [...universe];
}

/** Rotation is single-winner; the unchanged 25% name cap and all other envelope limits remain binding. */
export function limitsForDailySetup(setupId: string, base: RiskLimits): RiskLimits {
  return setupId === 'dual-momentum-rotation' || setupId === 'tom-overlay'
    ? { ...base, maxOpenPositions: 1 }
    : base;
}

export function strategyBookPolicyForSetup(setupId: string, params: unknown): StrategyBookPolicy | undefined {
  if (setupId === 'ts-momentum-halal-basket-v3') {
    return tsMomentumV3BookPolicy(params as TsMomentumHalalBasketV3Params | undefined);
  }
  if (setupId === 'ts-momentum-halal-basket-v4') {
    return tsMomentumV4BookPolicy(params as TsMomentumHalalBasketV4Params | undefined);
  }
  if (setupId === 'bollinger-mr-long-v3') {
    return bollingerV3BookPolicy(params as BollingerMrLongV3Params | undefined);
  }
  if (setupId === 'dual-momentum-rotation') return dualMomentumRotationBookPolicy();
  if (setupId === 'tom-overlay') return tomOverlayBookPolicy();
  if (setupId === 'g6b-linear-factor-wide') return g6bLinearFactorWideBookPolicy();
  if (setupId === 'multi-mode-book-v1') return multiModeBookPolicy();
  if (setupId === 'multi-mode-book-v2') {
    return multiModeBookV2Policy(params as MultiModeBookV2Params | undefined);
  }
  return setupId === 'g6b-linear-factor' ? g6bLinearFactorBookPolicy() : undefined;
}

/** Max-one setups use closed position episodes as their independent statistical unit. */
export function validationTradeRecordsForSetup(
  setupId: string,
  records: readonly TradeRecord[],
): readonly TradeRecord[] {
  return setupId === 'dual-momentum-rotation' || setupId === 'tom-overlay'
    ? collapseMaxOnePositionEpisodes(records)
    : records;
}

/**
 * Independent inference unit for monthly target-weight books: one active month-end-to-month-end
 * NAV return. Partial name trims are execution details and must never inflate the sample gate.
 */
// Monthly cross-sectional factors count ACTIVE BOOK-MONTHS as the validation
// observation unit (v1 precedent): name-level exits inside one rebalance month
// are correlated and would pseudo-replicate the sample.
export const MONTHLY_BOOK_OBSERVATION_SETUP_IDS: ReadonlySet<string> = new Set([
  'g6b-linear-factor',
  'g6b-linear-factor-wide',
]);

export function activeMonthlyBookReturnRecords(
  points: readonly StrategyBookDailyPoint[],
): TradeRecord[] {
  const ordered = [...points].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const monthEnds = new Map<string, StrategyBookDailyPoint>();
  for (const point of ordered) {
    const key = `${point.ts.getUTCFullYear()}-${String(point.ts.getUTCMonth() + 1).padStart(2, '0')}`;
    monthEnds.set(key, point);
  }
  const ends = Array.from(monthEnds.values()).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const records: TradeRecord[] = [];
  for (let index = 1; index < ends.length; index++) {
    const entry = ends[index - 1];
    const exit = ends[index];
    const active = ordered.some((point) => (
      point.ts > entry.ts && point.ts <= exit.ts && point.positionsValue.gt(0)
    ));
    if (!active || entry.nav.lte(0)) continue;
    const entryNav = Number(entry.nav.toString());
    const exitNav = Number(exit.nav.toString());
    records.push({
      entryTs: entry.ts, exitTs: exit.ts, qty: 1,
      entryPrice: entryNav, exitPrice: exitNav, ret: exitNav / entryNav - 1,
      reason: 'active_monthly_book_return', partial: false,
    });
  }
  return records;
}

/** Include entry-close through exit-open NAV moves, grouped as whole contiguous TOM windows. */
export function exposureReturnBlocks(daily: readonly StrategyBookDailyPoint[]): number[][] {
  const blocks: number[][] = [];
  let current: number[] | null = null;
  for (let index = 1; index < daily.length; index++) {
    const previous = daily[index - 1];
    const point = daily[index];
    const exposed = previous.positions.length > 0 || point.positions.length > 0;
    if (!exposed) {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      blocks.push(current);
    }
    current.push(previous.nav.eq(0) ? 0 : Number(point.nav.div(previous.nav).minus(1).toString()));
  }
  return blocks;
}

function gitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function gitWorktreeStatus(): string | null {
  try {
    return execSync('git status --porcelain=v1 --untracked-files=all', { encoding: 'utf-8' });
  } catch {
    return null;
  }
}

const QUANT_RUNTIME_FILES = new Set([
  'scripts/backtest.ts', 'prisma/schema.prisma', 'package.json', 'package-lock.json', 'tsconfig.json',
]);

function isQuantRuntimeDependencyPath(filePath: string): boolean {
  const normalized = filePath.replace(/^"|"$/g, '');
  return normalized.startsWith('src/quant/') || QUANT_RUNTIME_FILES.has(normalized);
}

function hasDirtyQuantRuntimeDependency(porcelainStatus: string): boolean {
  return porcelainStatus.split(/\r?\n/).some((line) => {
    if (!line.trim()) return false;
    const paths = line.slice(3).split(' -> ');
    return paths.some(isQuantRuntimeDependencyPath);
  });
}

/** A deterministic run is reproducible when HEAD describes every exact quant runtime dependency. */
export function isReproducibleRun(seed: number, sha: string, porcelainStatus: string | null): boolean {
  return Number.isSafeInteger(seed) && seed >= 0 && sha !== 'unknown'
    && porcelainStatus !== null && !hasDirtyQuantRuntimeDependency(porcelainStatus);
}

/** Strict candidate runs are reproducible only from a clean tracked/untracked, non-ignored tree. */
export function assertCandidateWorktreeClean(porcelainStatus: string): void {
  if (porcelainStatus.trim()) {
    throw new Error('Candidate-scoped backtest requires a clean Git worktree; commit or remove all non-ignored changes first');
  }
}

/** Candidate evidence is reproducible only with a valid deterministic seed and real OOS split. */
export function assertCandidateValidationConfig(seed: number, oosFraction: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('--seed must be a finite non-negative safe integer for candidate-scoped backtests');
  }
  if (!Number.isFinite(oosFraction) || oosFraction <= 0 || oosFraction >= 1) {
    throw new Error('--oos must be finite and strictly between 0 and 1 for candidate-scoped backtests');
  }
}

function assertCurrentCandidateWorktreeClean(): void {
  const status = execSync('git status --porcelain=v1 --untracked-files=all', { encoding: 'utf-8' });
  assertCandidateWorktreeClean(status);
}

/** A trade-sequenced curve has one initial point; only transitions fully inside the slice count. */
export function transitionCountInsideSlice(pointCount: number, sliceStart: number): number {
  return Math.max(0, pointCount - Math.max(0, sliceStart) - 1);
}

interface SymbolSeries {
  symbol: string;
  bars: IntradayBarInput[];
  dayContext: Map<string, DayContext>;
}

/** Fail closed even when a mocked or faulty DB ignores the execution query predicates. */
export function assertAlpacaNasdaqExecutionRows(rows: readonly { market: string; source: string }[]): void {
  if (rows.some((row) => row.market !== 'NASDAQ' || row.source !== 'ALPACA')) {
    throw new Error('Intraday DB execution rows must be NASDAQ/ALPACA only');
  }
}

/** Exact report-card state routing; noncandidate legacy setups retain their prior default. */
export function shariaStateForSetup(
  setupId: string,
  candidateState?: ShariaValidationState,
): ShariaValidationState {
  return candidateState ?? (
    setupId === 'stocks-in-play-orb' || setupId === 'vwap-reclaim' || setupId === 'stop-hunt-reversal-long' || setupId === 'bagholder-bounce' || setupId === 'time-of-day'
      ? 'UNSCREENED_EXECUTION_BLOCKED'
      : 'UNVERIFIED'
  );
}

interface CandidateArtifactEvidence {
  inputPath: string;
  absolutePath: string;
  relativePath: string;
  sha256Digest: string;
  candidateCount: number;
  symbolCount: number;
  generatedAt: string | null;
  corporateActionScreen: Record<string, unknown> | null;
  shariaStatus: ParsedCandidateArtifact['shariaStatus'];
}

export function backtestResultFilename(
  setup: string,
  from: string,
  to: string,
  candidateDigest?: string,
  universeTag?: string,
): string {
  const digestSuffix = candidateDigest ? `-${candidateDigest.slice(0, 16)}` : '';
  // 'halal'/'fixed'/'custom' default runs keep the historical filename; wide + custom baskets get a
  // universe token so two universes over the same period don't clobber each other's artifact.
  const universeSuffix = universeTag && universeTag !== 'halal' && universeTag !== 'fixed'
    ? `-${universeTag.replace(/[^a-zA-Z0-9]+/g, '_')}`
    : '';
  return `${setup}-${from}-${to}${universeSuffix}${digestSuffix}.json`;
}

function loadCandidateArtifactFile(inputPath: string): {
  artifact: ParsedCandidateArtifact;
  evidence: CandidateArtifactEvidence;
} {
  const absolutePath = path.resolve(inputPath);
  const bytes = fs.readFileSync(absolutePath);
  const artifact = parseCandidateArtifact(JSON.parse(bytes.toString('utf8')), {
    requireCompletedCorporateActionScreen: true,
  });
  return {
    artifact,
    evidence: {
      inputPath,
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath) || '.',
      sha256Digest: crypto.createHash('sha256').update(bytes).digest('hex'),
      candidateCount: artifact.candidates.length,
      symbolCount: new Set(artifact.candidates.map((candidate) => candidate.symbol)).size,
      generatedAt: artifact.generatedAt,
      corporateActionScreen: artifact.corporateActionScreen,
      shariaStatus: artifact.shariaStatus,
    },
  };
}

/** Split chronological bars into per-NASDAQ-trading-day chunks (preserving order). */
function groupBarsByDay(bars: IntradayBarInput[]): IntradayBarInput[][] {
  const byDay = new Map<string, IntradayBarInput[]>();
  for (const b of bars) {
    const key = nasdaqDateKey(b.ts);
    const arr = byDay.get(key) ?? [];
    arr.push(b);
    byDay.set(key, arr);
  }
  return Array.from(byDay.values());
}

/** Distinct symbols with IntradayBar rows in [from,to] (optionally filtered by --symbols). */
async function listDbSymbols(want: string[] | null, from: string, to: string): Promise<string[]> {
  const { prisma } = await import('../../lib/prisma');
  const distinct = await prisma.intradayBar.findMany({
    where: {
      symbol: want ? { in: want } : undefined,
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    distinct: ['symbol'], select: { symbol: true }, orderBy: { symbol: 'asc' },
  });
  return distinct.map((d) => d.symbol);
}

/**
 * DB source (`--source db`): loads ONE symbol's REAL IntradayBar spine (Alpaca IEX) with per-day
 * priorClose from the DAY MarketBar spine and mcap from the SEC-XBRL-backed SymbolSnapshot.
 * Called per symbol so only one symbol's minute bars are ever resident (memory-bounded; the
 * previous whole-range load OOM-killed the run). Reads only; never fabricates a bar. DAY bars are
 * stored at 00:00 UTC labeled with their trading date, so their UTC calendar date equals the
 * Eastern trading date used by intraday nasdaqDateKey — that alignment lands priorClose correctly.
 */
export async function loadDbSymbol(symbol: string, from: string, to: string): Promise<SymbolSeries> {
  const { prisma } = await import('../../lib/prisma');
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const ibars = await prisma.intradayBar.findMany({
    where: { symbol, market: 'NASDAQ', source: 'ALPACA', ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
  });
  assertAlpacaNasdaqExecutionRows(ibars);
  const bars: IntradayBarInput[] = ibars.map((b) => ({
    ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    session: b.session, source: b.source,
  }));
  const dayRows = await prisma.marketBar.findMany({
    where: { symbol, market: 'NASDAQ', interval: 'DAY' }, orderBy: { ts: 'asc' },
    select: { ts: true, close: true },
  });
  const priorByDay = new Map<string, number>();
  for (let i = 1; i < dayRows.length; i++) {
    priorByDay.set(dayRows[i].ts.toISOString().slice(0, 10), Number(dayRows[i - 1].close));
  }
  const snaps = await prisma.symbolSnapshot.findMany({
    where: { symbol, mcap: { not: null } }, select: { asOf: true, mcap: true, mcapSource: true },
    orderBy: { asOf: 'asc' },
  });
  const mcapByDay = new Map<string, { mcap: number; src: DayContext['mcapSource'] }>();
  for (const s of snaps) mcapByDay.set(nasdaqDateKey(s.asOf), { mcap: Number(s.mcap), src: s.mcapSource });
  const dayContext = new Map<string, DayContext>();
  for (const key of Array.from(new Set(bars.map((b) => nasdaqDateKey(b.ts))))) {
    const mc = mcapByDay.get(key);
    dayContext.set(key, { priorClose: priorByDay.get(key) ?? null, mcap: mc?.mcap ?? null, mcapSource: mc?.src ?? null });
  }
  return { symbol, bars, dayContext };
}

/** Candidate mode: artifact pairs and PIT facts are authoritative; unrelated DB days are dropped. */
export async function loadDbCandidateSymbol(
  symbol: string,
  candidates: readonly SnapshotArtifactCandidate[],
): Promise<SymbolSeries> {
  if (!candidates.length || candidates.some((candidate) => candidate.symbol !== symbol)) {
    throw new Error(`Candidate artifact has no consistent entries for ${symbol}`);
  }
  const { prisma } = await import('../../lib/prisma');
  const dates = new Set(candidates.map((candidate) => candidate.date));
  const orderedDates = Array.from(dates).sort();
  // NASDAQ POST bars can land after 00:00 UTC on the following calendar day. Query a safe
  // timezone margin, then make nasdaqDateKey + the artifact set the authoritative filter.
  const queryStart = new Date(`${orderedDates[0]}T00:00:00.000Z`);
  queryStart.setUTCHours(queryStart.getUTCHours() - 12);
  const queryEnd = new Date(`${orderedDates.at(-1)!}T00:00:00.000Z`);
  queryEnd.setUTCHours(queryEnd.getUTCHours() + 36);
  const rows = await prisma.intradayBar.findMany({
    where: {
      symbol,
      market: 'NASDAQ',
      source: 'ALPACA',
      ts: {
        gte: queryStart,
        lte: queryEnd,
      },
    },
    orderBy: { ts: 'asc' },
  });
  const selected = rows.filter((bar) => dates.has(nasdaqDateKey(bar.ts)));
  if (selected.some((bar) => bar.market !== 'NASDAQ' || bar.source !== 'ALPACA')) {
    throw new Error(`Non-NASDAQ/Alpaca bar leaked into candidate series for ${symbol}`);
  }
  const foundDates = new Set(selected.map((bar) => nasdaqDateKey(bar.ts)));
  const missing = orderedDates.filter((date) => !foundDates.has(date));
  if (missing.length) {
    throw new Error(`Candidate pair(s) have no minute bars: ${missing.map((date) => `${symbol} ${date}`).join(', ')}`);
  }

  const bars: IntradayBarInput[] = selected.map((bar) => ({
    ts: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    session: bar.session,
    source: bar.source,
  }));
  const dayContext = new Map<string, DayContext>();
  for (const candidate of candidates) {
    dayContext.set(candidate.date, {
      priorClose: candidate.mcapPrice,
      mcap: candidate.mcap,
      mcapSource: 'FUNDAMENTALS',
    });
  }
  return { symbol, bars, dayContext };
}

/** Fixtures source: builds all (small) per-symbol series up-front from committed real fixtures. */
function buildFixtureSeries(want: string[] | null, from: string, to: string): SymbolSeries[] {
  const fixtures = loadAllFixtures().filter((f) => {
    if (want && !want.includes(f.symbol)) return false;
    return f.date >= from && f.date <= to;
  });
  const fxSymbols = Array.from(new Set(fixtures.map((f) => f.symbol))).sort();
  return fxSymbols.map((symbol) => {
    const symFixtures = fixtures.filter((f) => f.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));
    const bars: IntradayBarInput[] = [];
    const dayContext = new Map<string, DayContext>();
    for (const fx of symFixtures) {
      for (const b of fx.bars) {
        bars.push({
          ts: new Date(new Date(b.ts).getTime() + 60_000), // minute-start → bar-close (DB convention)
          open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, session: b.session,
          source: fx.source,
        });
      }
      const key = nasdaqDateKey(new Date(new Date(fx.bars.at(-1)!.ts).getTime() + 60_000));
      dayContext.set(key, {
        priorClose: fx.verification.priorClose,
        mcap: fx.fundamentals?.marketCap ?? null,
        mcapSource: fx.fundamentals ? 'FUNDAMENTALS' : null,
      });
    }
    bars.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    return { symbol, bars, dayContext };
  });
}

/**
 * DAILY source: real MarketBar spine (interval=DAY, market=NASDAQ) for one symbol. Loads ALL
 * rows (incl. MOCK) then hands them through `filterRealDailyBars`, so the excluded-MOCK count is
 * observed and asserted in-path (user no-mock directive). Returns {} when the symbol has no real
 * daily bars.
 */
async function loadDailySymbol(
  symbol: string, from: string, to: string,
): Promise<{ bars: DailyBarInput[]; excludedMock: number }> {
  const { prisma } = await import('../../lib/prisma');
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol, market: 'NASDAQ', interval: 'DAY',
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    orderBy: { ts: 'asc' },
  });
  const withSource: DailyBarInput[] = rows.map((r) => ({
    ts: r.ts, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, source: r.source,
  }));
  const { real, excludedMock } = filterRealDailyBars(withSource);
  // Assertion (no-mock guard): no MOCK bar may reach the simulator.
  if (real.some((b) => b.source === 'MOCK')) throw new Error(`MOCK bar leaked into ${symbol} daily series`);
  return { bars: real, excludedMock };
}

/** Latest complete NASDAQ trading date (YYYY-MM-DD) in the REAL daily MarketBar spine, for presets. */
async function latestCompleteTradingDate(): Promise<string | null> {
  const { prisma } = await import('../../lib/prisma');
  const row = await prisma.marketBar.aggregate({
    where: { market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    _max: { ts: true },
  });
  return row._max.ts ? row._max.ts.toISOString().slice(0, 10) : null;
}

/**
 * `--universe wide`: every distinct NASDAQ symbol with ≥ WIDE_MIN_DAILY_BARS REAL (YAHOO/ALPACA)
 * daily bars inside [from,to]. Grouped in one query; only symbols are held (each series is streamed
 * later, one at a time, so peak memory stays bounded exactly as the halal path).
 */
async function listWideDailySymbols(from: string, to: string, minBars: number): Promise<string[]> {
  const { prisma } = await import('../../lib/prisma');
  const grouped = await prisma.marketBar.groupBy({
    by: ['symbol'],
    where: {
      market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] },
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    _count: { symbol: true },
  });
  return grouped
    .filter((g) => g._count.symbol >= minBars)
    .map((g) => g.symbol)
    .sort();
}

/** Distinct NASDAQ-halal symbols with REAL daily bars in [from,to] (MOCK excluded at source). */
async function listDailySymbols(want: string[] | null, from: string, to: string): Promise<string[]> {
  const { prisma } = await import('../../lib/prisma');
  const universe = want ?? [...NASDAQ_HALAL_UNIVERSE];
  const distinct = await prisma.marketBar.findMany({
    where: {
      symbol: { in: universe }, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] },
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    distinct: ['symbol'], select: { symbol: true }, orderBy: { symbol: 'asc' },
  });
  return distinct.map((d) => d.symbol);
}

/** Read only the bounded OR prehistory plus daily liquidity facts; return compact aggregates. */
export async function loadStocksInPlayReferenceBook(from: string, to: string) {
  const { prisma } = await import('../../lib/prisma');
  const fromDate = stocksInPlayPrehistoryStart(from);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const symbols = [...STOCKS_IN_PLAY_UNIVERSE_V1];
  const book = new Map<string, StocksInPlayAggregate[]>();
  let excludedNonAlpacaMinute = 0;
  let excludedUnsupportedDaily = 0;
  // Bound peak memory to one symbol's raw bars; only compact aggregates survive each iteration.
  for (const symbol of symbols) {
    const [minuteRows, dailyRows] = await Promise.all([
      prisma.intradayBar.findMany({
        where: { symbol, market: 'NASDAQ', source: 'ALPACA', ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
        select: { symbol: true, market: true, ts: true, open: true, high: true, low: true, close: true, volume: true, session: true, source: true },
      }),
      prisma.marketBar.findMany({
        where: { symbol, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] }, ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
        select: { symbol: true, ts: true, high: true, low: true, close: true, volume: true, source: true },
      }),
    ]);
    assertAlpacaNasdaqExecutionRows(minuteRows);
    const built = buildStocksInPlayBook(
      minuteRows.map((r): SourcedMinuteRow => ({ symbol: r.symbol, ts: r.ts, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume), session: r.session, source: r.source })),
      dailyRows.map((r): SourcedDailyRow => ({ symbol: r.symbol, ts: r.ts, high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume), source: r.source })),
    );
    if (dailyRows.some((row) => row.source !== 'YAHOO' && row.source !== 'ALPACA')) {
      throw new Error(`Stocks-in-play daily liquidity rows must be YAHOO/ALPACA only (${symbol})`);
    }
    const aggregate = built.book.get(symbol);
    if (aggregate) book.set(symbol, aggregate);
    excludedNonAlpacaMinute += built.excludedNonAlpacaMinute;
    excludedUnsupportedDaily += built.excludedUnsupportedDaily;
  }
  return { book, excludedNonAlpacaMinute, excludedUnsupportedDaily };
}

/** Thrown for the two setup-lookup usage errors the CLI reports with exit code 2. */
export class UsageError extends Error {}

export interface RunLabOptions {
  setup: string;
  /** 'FULL' | '3Y' | '2Y' | '1Y'; omit and pass explicit from/to instead. */
  period?: string;
  from?: string;
  to?: string;
  /** 'halal' | 'wide' | 'custom' */
  universe?: string;
  symbols?: string[] | null;
  /** CLI-only override of the wide-run-bounded guard (QDR-5 §confirm-full). */
  confirmFull?: boolean;
  /** CLI-only: a snapshot-candidate artifact path (intraday --source db only). */
  candidatesPath?: string;
  seed?: number;
  oosFraction?: number;
  engine?: string;
  feed?: string;
  source?: 'fixtures' | 'db';
  diagnostic?: boolean;
  /** Default true (CLI parity). The API passes false — a webserver has no durable results/ dir. */
  writeResultsFile?: boolean;
  /** Default true (CLI parity). The API passes false and updates its own pre-claimed row instead. */
  persistRun?: boolean;
}

export interface RunLabResult {
  card: ReportCard & Record<string, unknown>;
  outFile: string | null;
  backtestRunId: string | null;
  diagnostic: boolean;
  symbols: string[];
  universeTag: string;
  periodPreset: PeriodPreset;
  from: string;
  to: string;
}

/**
 * The QDR-6 validation pipeline: resolve period/universe → simulate on stored real bars (ZERO LLM
 * calls) → assemble the report card → optionally write results/*.json and persist a BacktestRun.
 * Throws `UsageError` for the two setup-lookup mistakes (CLI maps this to exit code 2); throws
 * `LookaheadError` (already logged) or a plain `Error` for every other validation failure.
 */
export async function runLab(options: RunLabOptions): Promise<RunLabResult> {
  const runMode: BacktestRunMode = options.diagnostic ? 'DIAGNOSTIC_NON_TERMINAL' : 'TERMINAL';
  const setupId = options.setup;
  const seed = options.seed ?? 42;
  const oosFraction = options.oosFraction ?? 0.3;
  const initialWorktreeStatus = gitWorktreeStatus();

  if (!setupId) {
    throw new UsageError('usage: --setup <id> (--period FULL|3Y|2Y|1Y | --from <YYYY-MM-DD> --to <YYYY-MM-DD>) [--universe halal|wide|custom] [--symbols A,B] [--confirm-full] [--candidates=path.json] [--seed N] [--engine legacy|shared] [--diagnostic]');
  }
  const setup = (STRATEGY_SETUP_CATALOG as Record<string, StrategySetup<unknown>>)[setupId] as
    | StrategySetup<unknown>
    | undefined;
  if (!setup) {
    throw new UsageError(`unknown setup "${setupId}". known: ${Object.keys(STRATEGY_SETUP_CATALOG).join(', ')}`);
  }

  // ── R3-3.5 period: explicit from/to wins; else a period preset anchored at the latest complete
  // MarketBar trading date. Every card + BacktestRun is tagged with the resolved preset.
  const hasExplicitDates = Boolean(options.from && options.to);
  const latestTradingDate = hasExplicitDates ? null : await latestCompleteTradingDate();
  const { from, to, periodPreset } = resolvePeriodDates(options.period, latestTradingDate, { from: options.from, to: options.to });
  const confirmFull = options.confirmFull === true;

  const wantSymbols = options.symbols && options.symbols.length ? options.symbols.map((s) => s.trim()) : null;
  const startingCash = new D(100_000);
  // stocks-in-play-orb validates on the REAL Alpaca-IEX minute spine (DB), not the small committed
  // fixture set — so it defaults to --source db unless overridden.
  const source = (options.source ?? (setupId === 'stocks-in-play-orb' || setupId === 'bagholder-bounce' || setupId === 'time-of-day' ? 'db' : 'fixtures')) as 'fixtures' | 'db';

  const cadence = setup.cadence;

  // ── R3-3.5 universe: resolve --universe halal|wide|custom against the setup's declared policy.
  // Fixed-book setups reject any override; halal-only setups reject wide/unscreened custom baskets;
  // any-equities accepts everything (wide + unscreened custom ⇒ Sharia execution-blocked below).
  const universeCompat = universeCompatibilityForSetup(setup);
  const universeOverrideProvided = options.universe !== undefined || Boolean(wantSymbols);
  let universeTag: string;
  let universeIsUnscreened: boolean;
  let dailySelection: UniverseSelection | null = null;
  if (cadence === 'daily' && universeCompat !== 'fixed') {
    const selection = resolveUniverseSelection(options.universe, wantSymbols);
    if (selection === 'custom' && (!wantSymbols || !wantSymbols.length)) {
      throw new Error('--universe custom requires --symbols A,B,…');
    }
    if (selection === 'wide' && wantSymbols) {
      throw new Error('--universe wide is the whole real-bar spine and cannot be combined with --symbols');
    }
    assertUniverseAllowed(setup, universeCompat, selection, wantSymbols ?? [], universeOverrideProvided);
    assertWideRunBounded(selection, periodPreset, hasExplicitDates, confirmFull);
    dailySelection = selection;
    universeTag = universeLabel(selection, wantSymbols ?? []);
    universeIsUnscreened = universeUnscreened(selection, wantSymbols ?? []);
  } else if (universeCompat === 'fixed') {
    // Reject a --universe/--symbols override for a fixed-book setup (daily or intraday).
    assertUniverseAllowed(setup, universeCompat, 'halal', [], universeOverrideProvided);
    universeTag = 'fixed';
    universeIsUnscreened = false;
  } else {
    // Intraday non-fixed: keep existing --symbols behavior; tag the card honestly.
    universeTag = wantSymbols ? `custom:${wantSymbols.length}-symbols` : 'halal';
    universeIsUnscreened = universeUnscreened(wantSymbols ? 'custom' : 'halal', wantSymbols ?? []);
  }

  const dailyRoute = selectDailyBacktestRoute(setupId, options.engine);
  if (cadence !== 'daily' && dailyRoute === 'shared') {
    throw new Error('--engine shared is valid only for daily setups');
  }
  if (setup.targetWeight && dailyRoute !== 'shared') {
    throw new Error(`${setupId} target-weight rebalancing requires --engine shared`);
  }
  const feed = (options.feed ?? (cadence === 'daily' ? 'yahoo-daily' : (options.candidatesPath || source === 'db') ? 'alpaca-iex' : 'fixtures-real')) as DataFeed;

  // Versioned-config selection (QDR-6): gapper-orb on the IEX feed uses the MEASURED v1-iex
  // calibration (minCumVolume rescaled from the consolidated tape); every other case keeps v1.
  const params = setupId === 'gapper-orb' && feed === 'alpaca-iex' ? GAPPER_ORB_V1_IEX : undefined;
  const effectiveParams = params ?? setup.defaultParams;
  const validationTrials = validationTrialsForSetup(setupId, effectiveParams);
  const dailyLimits = limitsForDailySetup(setupId, DEFAULT_BT_LIMITS);
  const sharedPolicy = strategyBookPolicyForSetup(setupId, params);

  let candidateArtifact: ParsedCandidateArtifact | null = null;
  let candidateEvidence: CandidateArtifactEvidence | null = null;
  if (options.candidatesPath) {
    if (source !== 'db' || cadence !== 'intraday') {
      throw new Error('--candidates is valid only for intraday --source db backtests');
    }
    if (feed !== 'alpaca-iex') throw new Error('--candidates requires --feed alpaca-iex');
    if (wantSymbols) throw new Error('--symbols cannot be combined with --candidates; the artifact is the exact universe');
    assertCandidateValidationConfig(seed, oosFraction);
    assertCurrentCandidateWorktreeClean();
    const loaded = loadCandidateArtifactFile(options.candidatesPath);
    candidateArtifact = loaded.artifact;
    candidateEvidence = loaded.evidence;
    const outsideRange = candidateArtifact.candidates.find((candidate) => candidate.date < from || candidate.date > to);
    if (outsideRange) {
      throw new Error(`Candidate ${outsideRange.symbol} ${outsideRange.date} is outside --from/--to; the artifact cannot be partially simulated`);
    }
  }

  const pooledTradeReturns: number[] = [];
  const pooledTradeRecords: AttributedTradeRecord[] = [];
  const pooledDailyReturns: number[] = [];
  let lastPrice = 0;
  let symbols: string[] = [];
  let excludedMock = 0;
  // Data/PIT integrity signal: every bar the engine consumed passed the real-source filter (MOCK
  // excluded + asserted, loaders throw on any leak) AND the engine re-ran assertNoLookahead on it
  // (simulateSetupDaily / simulateIntraday abort the whole run via LookaheadError on violation).
  // Counting bars actually simulated is the observable proof both guards executed and passed.
  let pitBarsProcessed = 0;
  // Walk-forward evidence: total PIT-guarded decision windows the engine evaluated (one per bar it
  // decided on using only ≤ asOf data). Accumulated so the walkForward flag is EARNED via a window-
  // count assertion, not aliased to the trade count. The daily engine reports its own count; the
  // intraday engine's PIT-guarded bars serve the same role.
  let walkForwardWindows = 0;
  let sharedDailyCurve: EquityPoint[] | null = null;
  let sharedSeriesForPlateau: StrategyBookSeries[] | null = null;
  let sharedCalendarForPlateau: Date[] | undefined;
  let sharedBookResult: StrategyBookResult | null = null;
  let resolvedUniverseBars = 0;
  let verifiedShariaEntries: UniverseEntry[] | null = null;
  const sharedReplayScope = {};

  try {
    if (cadence === 'daily') {
      // ── DAILY path: real MarketBar spine, one symbol streamed at a time, positions held across
      // days by the setup engine. MOCK rows are excluded at load and the count is asserted+printed.
      if (C1_VERIFIED_FIXED_SETUP_IDS.has(setupId)) {
        const universe = buildVerifiedUniverse();
        const bySymbol = new Map(universe.entries.map((entry) => [entry.symbol, entry]));
        const missing = MULTI_MODE_UNIVERSE.filter((symbol) => !bySymbol.has(symbol));
        if (missing.length) throw new Error(`${setupId} C1 verification missing: ${missing.join(', ')}`);
        verifiedShariaEntries = MULTI_MODE_UNIVERSE.map((symbol) => bySymbol.get(symbol)!);
        symbols = [...MULTI_MODE_UNIVERSE];
        universeTag = 'c1-verified:multi-mode-16';
        universeIsUnscreened = false;
      } else if (C1_VERIFIED_SLEEVE_SETUP_IDS.has(setupId)) {
        const universe = buildVerifiedUniverse();
        const selected = await selectDollarVolumeSleeve(universe.entries, {
          asOf: new Date(`${to}T23:59:59.999Z`),
          maxNames: 100,
        });
        if (!selected.sleeve.length) {
          throw new Error(`${setupId} requires C1 verified names with real daily bars as of ${to}`);
        }
        const bySymbol = new Map(universe.entries.map((entry) => [entry.symbol, entry]));
        verifiedShariaEntries = selected.sleeve.map(({ symbol }) => bySymbol.get(symbol)!);
        symbols = verifiedShariaEntries.map(({ symbol }) => symbol);
        universeTag = `c1-verified:${symbols.length}`;
        universeIsUnscreened = false;
        console.log(`resolved C1 verified sleeve → ${symbols.length} symbol(s), top by trailing real dollar volume`);
      } else if (universeCompat === 'fixed') {
        symbols = dailyUniverseForSetup(setupId, null)!;
      } else if (dailySelection === 'wide') {
        symbols = await listWideDailySymbols(from, to, WIDE_MIN_DAILY_BARS);
        console.log(`resolved --universe wide → ${symbols.length} symbol(s) with ≥${WIDE_MIN_DAILY_BARS} real daily bars in ${from}..${to}`);
      } else {
        symbols = await listDailySymbols(wantSymbols, from, to);
      }
      if (dailyRoute === 'shared') {
        const sharedSeries: StrategyBookSeries[] = [];
        let engineSymbols = symbols;
        if (setup.prepareUniverse && setup.tradableBookSymbols) {
          // Memory-bound wide path: pass 1 feeds the setup COMPACT rows only (no Decimal engine
          // bars retained), the setup names its ever-selected union across center + plateau
          // params, and only that union's full series is loaded for the engine. Names outside
          // the union always carry weight 0. Their compact date union is retained so cash/NAV and
          // OOS book-day measurements keep the exact full-universe calendar.
          const dailyBarsBySymbol = new Map<string, { ts: Date; close: number; volume: number }[]>();
          const calendarTimes = new Set<number>();
          for (const symbol of symbols) {
            const loaded = await loadDailySymbol(symbol, from, to);
            excludedMock += loaded.excludedMock;
            resolvedUniverseBars += loaded.bars.length;
            if (loaded.bars.length) lastPrice = Number(loaded.bars.at(-1)!.close);
            for (const bar of loaded.bars) calendarTimes.add(bar.ts.getTime());
            dailyBarsBySymbol.set(symbol, loaded.bars.map((bar) => ({
              ts: bar.ts, close: Number(bar.close), volume: Number(bar.volume),
            })));
          }
          setup.prepareUniverse({
            symbols,
            replayScope: sharedReplayScope,
            closesBySymbol: new Map(),
            dailyBarsBySymbol,
          });
          dailyBarsBySymbol.clear();
          sharedCalendarForPlateau = Array.from(calendarTimes)
            .sort((a, b) => a - b)
            .map((time) => new Date(time));
          const neighborParams = setup.plateauNeighborhood
            ? setup.plateauNeighborhood(params).neighbors.map((n) => n.params)
            : [];
          engineSymbols = setup.tradableBookSymbols(sharedReplayScope, [effectiveParams, ...neighborParams]);
          console.log(`prepared cross-name book for ${symbols.length} symbol(s); engine restricted to ${engineSymbols.length} ever-selected symbol(s)`);
          for (const symbol of engineSymbols) {
            const loaded = await loadDailySymbol(symbol, from, to);
            sharedSeries.push({ symbol, market: 'NASDAQ', bars: loaded.bars });
          }
        } else {
        for (const symbol of symbols) {
          const loaded = await loadDailySymbol(symbol, from, to);
          excludedMock += loaded.excludedMock;
          resolvedUniverseBars += loaded.bars.length;
          if (loaded.bars.length) lastPrice = Number(loaded.bars.at(-1)!.close);
          sharedSeries.push({ symbol, market: 'NASDAQ', bars: loaded.bars });
        }
        if (setup.prepareUniverse) {
          const dailyBarsBySymbol = new Map(sharedSeries.map((item) => [
            item.symbol,
            item.bars.map((bar) => ({
              ts: bar.ts, close: Number(bar.close), volume: Number(bar.volume),
            })),
          ]));
          setup.prepareUniverse({
            symbols,
            replayScope: sharedReplayScope,
            closesBySymbol: new Map(sharedSeries.map((item) => [
              item.symbol,
              item.bars.map((bar) => ({ ts: bar.ts, close: Number(bar.close) })),
            ])),
            dailyBarsBySymbol,
          });
          console.log(`prepared cross-name book for ${sharedSeries.length} symbol(s) [pairs/cross-sectional]`);
        }
        }
        console.log(`\nprocessing ${symbols.length} symbol(s) [engine=shared, source=daily MarketBar, YAHOO/ALPACA only] …`);
        const sim = simulateStrategyBook({
          setup, params, series: sharedSeries, startingCash, limits: dailyLimits,
          calendar: sharedCalendarForPlateau,
          replayScope: sharedReplayScope,
          policy: sharedPolicy,
        });
        sharedSeriesForPlateau = sharedSeries;
        sharedBookResult = sim;
        pitBarsProcessed += sim.barsProcessed;
        walkForwardWindows += sim.decisionWindows;
        pooledTradeReturns.push(...sim.tradeReturns);
        const sellFills = sim.fills.filter((fill) => fill.action === 'SELL');
        if (sellFills.length !== sim.tradeRecords.length) {
          throw new Error('Shared-book trade attribution invariant failed');
        }
        pooledTradeRecords.push(...sim.tradeRecords.map((record, index) => ({
          ...record,
          symbol: sellFills[index].symbol,
        })));
        sharedDailyCurve = sim.daily.map((point) => ({ ts: point.ts, equity: Number(point.nav) }));
        pooledDailyReturns.push(...toDailyReturns(sharedDailyCurve, nasdaqDateKey));
        console.log(`${resolvedUniverseBars || sim.barsProcessed} resolved real bars / ${sim.barsProcessed} engine bars → ${sim.fills.length} fills / ${sim.tradeRecords.length} closed trades`);
      } else {
      // Cross-name preload (pairs/cross-sectional setups): hand the setup every symbol's REAL daily
      // closes once, before the per-symbol loop, so a setup whose ctx is single-symbol (the engine
      // is single-symbol) can still reason across names. MOCK is already excluded by loadDailySymbol;
      // the setup PIT-filters ≤ asOf on read. Single-name setups omit prepareUniverse (no-op here).
      if (setup.prepareUniverse) {
        const closesBySymbol = new Map<string, { ts: Date; close: number }[]>();
        const dailyBarsBySymbol = new Map<string, { ts: Date; close: number; volume: number }[]>();
        for (const s of symbols) {
          const { bars: sb } = await loadDailySymbol(s, from, to);
          closesBySymbol.set(s, sb.map((b) => ({ ts: b.ts, close: Number(b.close) })));
          dailyBarsBySymbol.set(s, sb.map((b) => ({
            ts: b.ts, close: Number(b.close), volume: Number(b.volume),
          })));
        }
        setup.prepareUniverse({ symbols, closesBySymbol, dailyBarsBySymbol });
        console.log(`prepared cross-name book for ${closesBySymbol.size} symbol(s) [pairs/cross-sectional]`);
      }
      console.log(`\nprocessing ${symbols.length} symbol(s) [source=daily MarketBar, YAHOO/ALPACA only] …`);
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const t0 = Date.now();
        process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol} … `);
        const { bars, excludedMock: dropped } = await loadDailySymbol(symbol, from, to);
        excludedMock += dropped;
        if (bars.length) lastPrice = Number(bars.at(-1)!.close);
        const sim = simulateSetupDaily({ setup, params, symbol, market: 'NASDAQ', bars, startingCash, limits: dailyLimits });
        pitBarsProcessed += sim.barsProcessed;
        walkForwardWindows += sim.decisionWindows;
        pooledTradeReturns.push(...sim.tradeReturns);
        pooledTradeRecords.push(...sim.tradeRecords.map((record) => ({ ...record, symbol })));
        pooledDailyReturns.push(...toDailyReturns(sim.equityCurve, nasdaqDateKey));
        console.log(`${bars.length} real bars (${dropped} MOCK excl.) → ${sim.trades} trades  (${((Date.now() - t0) / 1000).toFixed(1)}s; pooled ${pooledTradeRecords.length})`);
      }
      }
    } else {
      // ── INTRADAY path (unchanged). DB is STREAMED one symbol at a time (bounded memory); fixtures
      // are tiny, built up-front and served from a lookup. Per-day batching applies to DB source.
      const fixtureSeries = source === 'db' ? null : buildFixtureSeries(wantSymbols, from, to);
      const candidatesBySymbol = new Map<string, SnapshotArtifactCandidate[]>();
      for (const candidate of candidateArtifact?.candidates ?? []) {
        const entries = candidatesBySymbol.get(candidate.symbol) ?? [];
        entries.push(candidate);
        candidatesBySymbol.set(candidate.symbol, entries);
      }
      // Setups that reason over the shared stocks-in-play PIT book (OR facts + REAL consolidated
      // DAY-spine liquidity/levels) on the fixed 11-name deep-minute liquid universe. stop-hunt
      // reads the book's dailyLow to derive prior-day lows PIT; the verified metrics/annualization/
      // PIT/reproducibility path below is untouched — this only routes the already-built book in.
      const usesStocksInPlayBook = setupId === 'stocks-in-play-orb' || setupId === 'stop-hunt-reversal-long' || setupId === 'bagholder-bounce' || setupId === 'time-of-day';
      symbols = candidateArtifact
        ? Array.from(candidatesBySymbol.keys()).sort()
        : usesStocksInPlayBook
          ? [...STOCKS_IN_PLAY_UNIVERSE_V1]
        : source === 'db'
          ? await listDbSymbols(wantSymbols, from, to)
        : fixtureSeries!.map((s) => s.symbol);
      if (usesStocksInPlayBook) {
        const requested = wantSymbols?.slice().sort().join(',');
        const v1 = [...STOCKS_IN_PLAY_UNIVERSE_V1].sort().join(',');
        if (requested && requested !== v1) throw new Error(`${setupId}@v1 requires its exact 11-symbol deep-minute universe`);
        symbols = [...STOCKS_IN_PLAY_UNIVERSE_V1];
        if (source !== 'db' || feed !== 'alpaca-iex') throw new Error(`${setupId}@v1 requires --source db --feed alpaca-iex`);
        const prepared = await loadStocksInPlayReferenceBook(from, to);
        excludedMock += prepared.excludedUnsupportedDaily + prepared.excludedNonAlpacaMinute;
        setup.prepareUniverse?.({ symbols, closesBySymbol: new Map(), stocksInPlayBook: prepared.book });
        console.log(`prepared stocks-in-play PIT book for ${prepared.book.size}/11 symbols [OR=ALPACA-IEX; daily liquidity=YAHOO/ALPACA consolidated; ${prepared.excludedNonAlpacaMinute} non-ALPACA minute + ${prepared.excludedUnsupportedDaily} unsupported daily rows excluded; ${from}..${to}; 35d prehistory]`);
      }
      const fixtureByName = new Map((fixtureSeries ?? []).map((s) => [s.symbol, s] as const));
      const loadSeries = (symbol: string): Promise<SymbolSeries> =>
        candidateArtifact
          ? loadDbCandidateSymbol(symbol, candidatesBySymbol.get(symbol)!)
          : source === 'db'
            ? loadDbSymbol(symbol, from, to)
            : Promise.resolve(fixtureByName.get(symbol)!);
      const batchPerDay = source === 'db';
      console.log(`\nprocessing ${symbols.length} symbol(s) [source=${source}${batchPerDay ? ', per-day batched' : ''}] …`);
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const t0 = Date.now();
        process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol} … `);
        const { bars, dayContext } = await loadSeries(symbol); // one symbol resident; released next loop
        if (bars.length) lastPrice = Number(bars.at(-1)!.close);
        const chunks: IntradayBarInput[][] = batchPerDay ? groupBarsByDay(bars) : [bars];
        let symTrades = 0;
        for (const chunk of chunks) {
          const sim = simulateIntraday({
            setup, params, symbol, market: 'NASDAQ', bars: chunk, dayContext, startingCash,
            limits: DEFAULT_INTRADAY_LIMITS,
          });
          pitBarsProcessed += sim.barsProcessed;
          walkForwardWindows += sim.barsProcessed; // intraday PIT-guarded bars are the walk-forward windows
          pooledTradeReturns.push(...sim.tradeReturns);
          pooledTradeRecords.push(...sim.tradeRecords.map((record) => ({ ...record, symbol })));
          pooledDailyReturns.push(...(
            batchPerDay
              ? toIndependentPeriodReturns([sim.equityCurve], Number(startingCash))
              : toDailyReturns(sim.equityCurve, nasdaqDateKey)
          ));
          symTrades += sim.trades;
        }
        console.log(`${bars.length} bars, ${chunks.length} days → ${symTrades} trades  (${((Date.now() - t0) / 1000).toFixed(1)}s; pooled ${pooledTradeRecords.length})`);
      }
    }
  } catch (err) {
    if (err instanceof LookaheadError) {
      console.error(`\n\x1b[31mLOOK-AHEAD DETECTED — run aborted: ${err.message}\x1b[0m`);
    }
    throw err;
  }
  if (cadence === 'daily') console.log(`\nexcluded ${excludedMock} MOCK bar(s) across the universe (no-mock directive)`);

  // ── Single trade-sequenced equity curve for headline metrics (chronological by exit).
  const validationTradeRecords = MONTHLY_BOOK_OBSERVATION_SETUP_IDS.has(setupId)
    ? activeMonthlyBookReturnRecords(sharedBookResult?.daily ?? [])
    : validationTradeRecordsForSetup(setupId, pooledTradeRecords);
  const validationTradeReturns = setupId === 'dual-momentum-rotation'
    || setupId === 'tom-overlay'
    || MONTHLY_BOOK_OBSERVATION_SETUP_IDS.has(setupId)
    ? validationTradeRecords.map((record) => record.ret)
    : pooledTradeReturns;
  const sortedTrades = [...validationTradeRecords].sort((a, b) => a.exitTs.getTime() - b.exitTs.getTime());
  const curve: EquityPoint[] = sharedDailyCurve ?? [{ ts: new Date(`${from}T00:00:00.000Z`), equity: Number(startingCash) }];
  if (!sharedDailyCurve) {
    let running = Number(startingCash);
    for (const tr of sortedTrades) {
      running *= 1 + tr.ret;
      curve.push({ ts: tr.exitTs, equity: running });
    }
  }
  const turnover = pooledTradeRecords.length; // count proxy; per-symbol notional pooled below is noisy
  // `curve` is a POOLED TRADE-SEQUENCED curve (one point per trade exit), NOT a per-trading-day
  // series — so it must be annualized by its OWN calendar span (trades/year), never a fixed √252.
  // Fixed √252 here treated ~28 sparse trades/year as consecutive daily returns and false-tripped
  // the Sharpe>3 implausible guard (v2 at 3.06). See computeMetrics `annualization` doc.
  const full = computeMetrics(curve, {
    trades: sortedTrades.length, turnover,
    annualization: sharedDailyCurve ? 'fixed' : 'calendar',
    trials: validationTrials,
  });
  const oosStart = Math.floor(curve.length * (1 - oosFraction));
  const oosTrades = sharedDailyCurve
    ? sortedTrades.filter((trade) => trade.exitTs >= curve[oosStart].ts).length
    : transitionCountInsideSlice(curve.length, oosStart);
  const oosTurnover = sharedDailyCurve
    ? pooledTradeRecords.filter((trade) => trade.exitTs >= curve[oosStart].ts).length
    : oosTrades;
  const oos = computeMetrics(curve.slice(oosStart), {
    trades: oosTrades, turnover: oosTurnover,
    annualization: sharedDailyCurve ? 'fixed' : 'calendar',
    trials: validationTrials,
  });

  // Persist a truthful, compact learning comparison when both real ETF benchmark histories exist.
  // Legacy/missing data remains null; the UI must never synthesize a replacement curve.
  let comparison = null;
  try {
    const { prisma } = await import('../../lib/prisma');
    const benchmarkRows = await prisma.marketBar.findMany({
      where: {
        symbol: { in: ['SPY', 'SPUS'] }, market: 'NASDAQ', interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] },
        ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      },
      select: { symbol: true, ts: true, close: true, source: true },
      orderBy: { ts: 'asc' },
    });
    comparison = buildHistoricalComparisonEvidence({
      strategyCurve: curve,
      // Guarded: an empty curve must degrade to a null comparison, never throw a raw
      // "reading 'ts'" out of the benchmark block.
      oosStart: curve[oosStart]?.ts ?? curve.at(-1)?.ts ?? new Date(`${to}T00:00:00.000Z`),
      benchmarkBars: benchmarkRows.flatMap((row) => (
        (row.symbol === 'SPY' || row.symbol === 'SPUS') && (row.source === 'YAHOO' || row.source === 'ALPACA')
          ? [{ symbol: row.symbol, ts: row.ts, close: Number(row.close), source: row.source }]
          : []
      )),
    });
  } catch (err) {
    console.warn(`\x1b[33mHistorical benchmark comparison unavailable: ${(err as Error).message}\x1b[0m`);
  }

  const distribution = summarizeDailyReturns(pooledDailyReturns);
  const validationReturns = validationReturnInputs(dailyRoute, sharedDailyCurve, validationTradeReturns);
  const bootstrap = bootstrapTradeOutcomes(validationReturns.riskReturns, {
    resamples: 1000, seed, startEquity: Number(startingCash),
    ...(validationReturns.observationUnit === 'book-day' ? { observationUnit: 'book-day' as const } : {}),
  });
  const permutation = signFlipPermutationTest(validationReturns.permutationReturns, { permutations: 1000, seed });
  const tomExposureBlocks = setupId === 'tom-overlay' && sharedBookResult
    ? exposureReturnBlocks(sharedBookResult.daily)
    : [];
  const tomWindowValidation = setupId === 'tom-overlay'
    ? {
      exposureDayDistribution: summarizeDailyReturns(tomExposureBlocks.flat()),
      nDays: tomExposureBlocks.reduce((sum, block) => sum + block.length, 0),
      nWindows: tomExposureBlocks.length,
      monthlyBlockBootstrap: bootstrapMonthlyBlocks(tomExposureBlocks, { resamples: 1000, seed }),
      windowPermutation: permutation,
      observationNote: 'Adapted TOM evidence is diagnostic only; it cannot override the standard <100 sample rejection gate.',
    }
    : null;

  // Fractional-Kelly sizing, clamped by the envelope (never bypassed).
  const price = new D((lastPrice || 1).toFixed(4));
  const kelly = kellySizedDecision(
    validationReturns.riskReturns,
    { equity: startingCash, cash: startingCash, positions: [], peakEquity: startingCash },
    { symbol: symbols[0] ?? 'NA', price, atr: price.mul(0.02), adv: new D(1_000_000), stopPrice: price.mul(0.95) },
    DEFAULT_INTRADAY_LIMITS,
  );

  const resultsDir = path.join(process.cwd(), 'results');
  const outFile = path.join(
    resultsDir,
    backtestResultFilename(setupId, from, to, candidateEvidence?.sha256Digest, universeTag),
  );

  const runGitSha = gitSha();
  // dataQualityPitOk — VERIFIED, not asserted-true-by-fiat: the run reached here only after the
  // real-source filter kept MOCK bars out (loaders throw on any MOCK/non-Alpaca leak) and the
  // engine re-ran the point-in-time look-ahead guard on every one of `pitBarsProcessed` bars
  // (a violation raises LookaheadError → nonzero exit, never this line). Zero bars = nothing
  // verified ⇒ false.
  const dataQualityPitOk = pitBarsProcessed > 0;
  // Capture cleanliness before simulation: a SHA cannot reproduce uncommitted input code.
  const reproducible = isReproducibleRun(seed, runGitSha, initialWorktreeStatus);

  // Walk-forward flag EARNED via a window-count assertion (never aliased to trade count): the daily
  // engine is structurally expanding-window and reported one PIT-guarded decision window per bar.
  const walkForwardEvidence = assertWalkForward(walkForwardWindows);
  const walkForward = walkForwardEvidence.passed;

  // ── QDR-6 profit-plateau robustness sweep. For daily setups that declare a neighborhood, re-run
  // each off-center neighbor on the SAME real bars, measure OOS expectancy, and confirm the edge
  // stays same-sign and within the degradation bound. ROBUSTNESS PROOF ONLY — the chosen params are
  // NEVER updated from the sweep; a better neighbor does not become the headline calibration.
  const oosMeanTradeReturn = (records: TradeRecord[]): number => {
    const sorted = [...records].sort((a, b) => a.exitTs.getTime() - b.exitTs.getTime());
    const start = Math.floor(sorted.length * (1 - oosFraction));
    const slice = sorted.slice(start);
    return slice.length ? slice.reduce((s, r) => s + r.ret, 0) / slice.length : 0;
  };
  let profitPlateau: boolean | undefined;
  let plateauEvaluation: PlateauEvaluation | null = null;
  if (cadence === 'daily' && setup.plateauNeighborhood) {
    const neighborhood = setup.plateauNeighborhood(params);
    const centerExpectancy = oosMeanTradeReturn([...validationTradeRecords]);
    const neighborResults: PlateauNeighborResult[] = [];
    for (const variant of neighborhood.neighbors) {
      const variantRecords: TradeRecord[] = [];
      if (dailyRoute === 'shared') {
        if (!sharedSeriesForPlateau) throw new Error('Shared plateau series unavailable');
        const sim = simulateStrategyBook({
          setup, params: variant.params, series: sharedSeriesForPlateau, startingCash,
          limits: dailyLimits,
          calendar: sharedCalendarForPlateau,
          replayScope: sharedReplayScope,
          policy: strategyBookPolicyForSetup(setupId, variant.params),
        });
        variantRecords.push(...(
          MONTHLY_BOOK_OBSERVATION_SETUP_IDS.has(setupId)
            ? activeMonthlyBookReturnRecords(sim.daily)
            : sim.tradeRecords
        ));
      } else {
        for (const s of symbols) {
          const { bars } = await loadDailySymbol(s, from, to);
          const sim = simulateSetupDaily({ setup, params: variant.params, symbol: s, market: 'NASDAQ', bars, startingCash, limits: dailyLimits });
          variantRecords.push(...sim.tradeRecords);
        }
      }
      const oosExpectancy = oosMeanTradeReturn([
        ...(MONTHLY_BOOK_OBSERVATION_SETUP_IDS.has(setupId)
          ? variantRecords
          : validationTradeRecordsForSetup(setupId, variantRecords)),
      ]);
      neighborResults.push({ label: variant.label, oosExpectancy });
      console.log(`  plateau neighbor ${variant.label}: OOS expectancy ${(oosExpectancy * 100).toFixed(4)}%`);
    }
    plateauEvaluation = evaluateProfitPlateau(centerExpectancy, neighborResults);
    profitPlateau = plateauEvaluation.passed;
    console.log(`profit-plateau sweep [${neighborhood.axes.join(' × ')}]: ${plateauEvaluation.passed ? 'PLATEAU' : 'SPIKY'} — ${plateauEvaluation.reason}`);
  }

  // ── Per-run, per-symbol Sharia snapshot. Keyless ⇒ UNSCREENED honestly (no mock verdict presented
  // as truth); a real source (Zoya, live) ⇒ VERIFIED_* from real verdicts. Intraday micro-cap lanes
  // stay execution-blocked; a candidate artifact's own screening status still takes priority.
  const shariaSnapshot = verifiedShariaEntries
    ? buildC1ShariaRunSnapshot(verifiedShariaEntries, new Date(`${to}T23:59:59.999Z`))
    : await buildShariaRunSnapshot(symbols, 'NASDAQ');
  const isIntradayUnscreened = setupId === 'stocks-in-play-orb' || setupId === 'vwap-reclaim' || setupId === 'stop-hunt-reversal-long' || setupId === 'bagholder-bounce' || setupId === 'time-of-day';
  const shariaState: ShariaValidationState = candidateArtifact?.shariaStatus
    ?? ((isIntradayUnscreened || universeIsUnscreened) ? 'UNSCREENED_EXECUTION_BLOCKED' : shariaSnapshot.state);

  const card = {
    ...assembleReportCard({
      setup: setupId, symbols, universe: universeTag, periodPreset, from, to, dataFeed: feed, seed, gitSha: runGitSha,
      full, oos, distribution, bootstrap, permutation,
      kellyFraction: kelly.kellyFraction, kellyClampedQty: Number(kelly.envelope.qty.toString()),
      oosFraction, drawdownBreakerPct: DEFAULT_INTRADAY_LIMITS.drawdownHaltPct,
      shariaState, walkForward, profitPlateau,
      dataQualityPitOk, reproducible,
    }),
    walkForwardEvidence,
    plateau: plateauEvaluation,
    sharia: shariaSnapshot,
    comparison,
    tradeEvidence: buildTradeEvidence(
      pooledTradeRecords,
      cadence === 'daily' && dailyRoute === 'shared' ? 'SHARED_BOOK' : 'INDEPENDENT_SYMBOL_SLEEVES',
    ),
    setupVersion: setup.version,
    effectiveParams,
    validationTrials,
    runMode,
    engineRoute: cadence === 'daily' ? dailyRoute : 'legacy',
    ...(tomWindowValidation ? { tomWindowValidation } : {}),
    ...(sharedBookResult ? {
      sharedBook: {
        turnoverNotional: sharedBookResult.turnoverNotional.toString(),
        averageExposure: sharedBookResult.daily.length
          ? sharedBookResult.daily.reduce((sum, point) => (
            sum + (point.nav.gt(0) ? Number(point.positionsValue.div(point.nav).toString()) : 0)
          ), 0) / sharedBookResult.daily.length
          : 0,
        capAudit: {
          targetGrossFraction: sharedPolicy?.maxGrossFraction ?? null,
          maxPostFillGrossExposure: sharedBookResult.fills.reduce((max, fill) => (
            fill.navAfter.gt(0)
              ? Math.max(max, Number(fill.positionsValueAfter.div(fill.navAfter).toString()))
              : max
          ), 0),
          maxCloseGrossExposure: sharedBookResult.daily.reduce((max, point) => (
            point.nav.gt(0)
              ? Math.max(max, Number(point.positionsValue.div(point.nav).toString()))
              : max
          ), 0),
        },
        ...(setupId === 'dual-momentum-rotation' || setupId === 'tom-overlay' ? {
          executionAudit: {
            buyEntries: sharedBookResult.fills.filter((fill) => fill.action === 'BUY').length,
            closedEpisodes: validationTradeRecords.length,
            rawSellRecords: pooledTradeRecords.length,
            partialTrims: pooledTradeRecords.filter((record) => record.partial).length,
            fullExits: pooledTradeRecords.filter((record) => !record.partial).length,
            oosBuyEntries: sharedBookResult.fills.filter((fill) => (
              fill.action === 'BUY' && fill.ts >= curve[oosStart].ts
            )).length,
            oosClosedEpisodes: oosTrades,
            oosRawSellRecords: oosTurnover,
          },
        } : {}),
        daily: sharedBookResult.daily.map((point) => ({
          ts: point.ts.toISOString(), nav: point.nav.toString(), cash: point.cash.toString(),
          drawdown: point.drawdown.toString(), realizedVolAnnual: point.realizedVolAnnual,
          grossExposureScalar: point.grossExposureScalar, positions: point.positions.length,
        })),
      },
    } : {}),
    ...(candidateEvidence ? {
      candidateArtifact: {
        ...candidateEvidence,
        resultPath: outFile,
        resultRelativePath: path.relative(process.cwd(), outFile),
      },
    } : {}),
  } as ReportCard & Record<string, unknown>;

  console.log('\n' + diagnosticReportOutput(renderReportCard(card), runMode));

  if (options.diagnostic) {
    console.log('\nDIAGNOSTIC_NON_TERMINAL: result JSON and BacktestRun persistence skipped');
    return { card, outFile: null, backtestRunId: null, diagnostic: true, symbols, universeTag, periodPreset, from, to };
  }

  const writeResultsFile = options.writeResultsFile ?? true;
  const persistRun = options.persistRun ?? true;

  // ── Persist results JSON.
  if (writeResultsFile) {
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(card, null, 2));
    console.log(`\nwrote ${outFile}`);
  }

  // ── Persist a BacktestRun (reproducibility). DB-optional: warn, never fail the run.
  let backtestRunId: string | null = null;
  if (persistRun) {
    try {
      const { prisma } = await import('../../lib/prisma');
      const run = await prisma.backtestRun.create({
        data: {
          strategyId: null,
          // Wide/large baskets store the compact universe tag; small books keep the explicit list.
          symbol: symbols.length > 40 ? `${universeTag}(${symbols.length})` : (symbols.join(',') || 'NONE'),
          market: 'NASDAQ',
          fromDate: new Date(`${from}T00:00:00.000Z`),
          toDate: new Date(`${to}T23:59:59.999Z`),
          oosFraction: new D(oosFraction),
          metrics: card as unknown as Prisma.InputJsonValue,
          implausible: card.implausible,
          pmSurrogateId: 'intraday-deterministic-no-llm',
          seed,
          gitSha: card.gitSha,
        },
      });
      backtestRunId = run.id;
      console.log(`persisted BacktestRun ${run.id}`);
      await prisma.$disconnect();
    } catch (err) {
      console.warn(`\x1b[33mBacktestRun not persisted (DB unavailable): ${(err as Error).message}\x1b[0m`);
    }
  }

  return { card, outFile: writeResultsFile ? outFile : null, backtestRunId, diagnostic: false, symbols, universeTag, periodPreset, from, to };
}
