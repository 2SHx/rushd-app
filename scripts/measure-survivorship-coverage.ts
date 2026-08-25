import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  latestAvailableSpusNportSnapshot,
  loadCapturedSpusNportSnapshots,
  toPointInTimeUniverseSnapshot,
  type SpusNportSnapshot,
} from '../src/quant/universe/spusNport';

export const SURVIVORSHIP_MEMO_PATH = fileURLToPath(
  new URL('../docs/quant-experiments/survivorship-coverage-measurement.md', import.meta.url),
);

export const UNAVAILABLE_REASONS = Object.freeze({
  marketBars: 'M1_MARKET_BAR_DATE_INVENTORY_NOT_COMMITTED',
  unresolvedIdentities: 'M1_NPORT_HOLDING_IDENTITIES_UNRESOLVED',
  lifecycle: 'M2_CONFIRMED_DELISTING_LIFECYCLE_NOT_COMMITTED',
  intervalCensored: 'M2_63_TRADING_DAY_WINDOW_INTERVAL_CENSORED',
  m3Lifecycle: 'M3_CONFIRMED_DELISTING_INPUT_UNAVAILABLE',
  sleeve: 'M3_DOLLAR_VOLUME_SLEEVE_INPUTS_NOT_COMMITTED',
} as const);

export interface FormationMeasurement {
  readonly formationAt: string;
  readonly reportDate: string;
  readonly accession: string;
  readonly identifiedMemberCount: number;
  readonly unresolvedMemberCount: number;
  readonly identifiedSymbols: readonly string[];
}

export interface UnclassifiedRemoval {
  readonly symbol: string;
  readonly lastSeenReportDate: string;
  readonly lastSeenFormationAt: string;
  readonly finalFundWeight: string;
  readonly finalFundWeightRank: number;
  readonly top60FundWeightProxy: boolean;
}

export interface SurvivorshipMeasurement {
  readonly formationDates: readonly FormationMeasurement[];
  readonly historicalIdentifiedSymbolCount: number;
  readonly m1: Readonly<{
    status: 'UNAVAILABLE';
    reasonCodes: readonly string[];
  }>;
  readonly m2: Readonly<{
    status: 'UNAVAILABLE';
    confirmedDelistingAdjacentOpportunityCount: null;
    reasonCodes: readonly string[];
    unclassifiedPermanentRemovals: readonly UnclassifiedRemoval[];
  }>;
  readonly m3: Readonly<{
    status: 'UNAVAILABLE';
    confirmedDelistingExposureLowerBound: null;
    confirmedDelistingExposureUpperBound: null;
    reasonCodes: readonly string[];
    unclassifiedRemovalProxyLowerCount: number;
    unclassifiedRemovalProxyUpperCount: number;
  }>;
}

interface ExactDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

interface FundPosition {
  readonly key: string;
  readonly symbol: string | null;
  readonly valueUsd: string;
}

const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TWO = BigInt(2);
const BIG_TEN = BigInt(10);
const BIG_HUNDRED = BigInt(100);

function bigPowerOfTen(power: number): bigint {
  let result = BIG_ONE;
  for (let index = 0; index < power; index += 1) result *= BIG_TEN;
  return result;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decimal(value: string): ExactDecimal {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`invalid non-negative decimal: ${value}`);
  const fraction = match[2] ?? '';
  return { coefficient: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

function align(value: ExactDecimal, scale: number): bigint {
  return value.coefficient * bigPowerOfTen(scale - value.scale);
}

function compareDecimal(left: string, right: string): number {
  const a = decimal(left);
  const b = decimal(right);
  const scale = Math.max(a.scale, b.scale);
  const difference = align(a, scale) - align(b, scale);
  return difference < BIG_ZERO ? -1 : difference > BIG_ZERO ? 1 : 0;
}

function percentageOf(value: string, values: readonly string[], places = 4): string {
  const parts = values.map(decimal);
  const numerator = decimal(value);
  const scale = Math.max(numerator.scale, ...parts.map((part) => part.scale));
  const denominator = parts.reduce((sum, part) => sum + align(part, scale), BIG_ZERO);
  if (denominator === BIG_ZERO) throw new Error('cannot calculate weight against a zero-value snapshot');
  const factor = bigPowerOfTen(places);
  const scaled = (align(numerator, scale) * BIG_HUNDRED * factor + denominator / BIG_TWO) / denominator;
  const whole = scaled / factor;
  const fraction = (scaled % factor).toString().padStart(places, '0');
  return `${whole}.${fraction}%`;
}

function rankedFundPositions(snapshot: SpusNportSnapshot): readonly FundPosition[] {
  const positions: FundPosition[] = [
    ...snapshot.holdings.map((holding) => ({
      key: `identified:${holding.symbol}`,
      symbol: holding.symbol,
      valueUsd: holding.valueUsd,
    })),
    ...snapshot.unresolvedHoldings.map((holding, index) => ({
      key: `unresolved:${index}:${holding.isin}:${holding.cusip}`,
      symbol: null,
      valueUsd: holding.valueUsd,
    })),
  ];
  return positions.sort((a, b) => {
    const byValue = compareDecimal(b.valueUsd, a.valueUsd);
    return byValue || compareText(a.key, b.key);
  });
}

export function measureSurvivorshipCoverage(
  snapshots: readonly SpusNportSnapshot[],
): SurvivorshipMeasurement {
  if (snapshots.length === 0) throw new Error('at least one committed N-PORT snapshot is required');
  const ordered = [...snapshots].sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
  const selected = ordered.map((formation, index) => {
    const snapshot = latestAvailableSpusNportSnapshot(ordered, formation.availableAt);
    if (!snapshot) throw new Error(`no PIT snapshot at formation ${formation.availableAt.toISOString()}`);
    const nextFormationAt = ordered[index + 1]?.availableAt ?? null;
    const membership = toPointInTimeUniverseSnapshot(snapshot, nextFormationAt);
    const identifiedSymbols = membership.records
      .filter((record) => record.membership === 'IN')
      .map((record) => record.symbol)
      .sort();
    return { snapshot, identifiedSymbols };
  });

  const formationDates = selected.map(({ snapshot, identifiedSymbols }) => Object.freeze({
    formationAt: isoDate(snapshot.availableAt),
    reportDate: isoDate(snapshot.reportDate),
    accession: snapshot.accession,
    identifiedMemberCount: identifiedSymbols.length,
    unresolvedMemberCount: snapshot.unresolvedHoldings.length,
    identifiedSymbols: Object.freeze(identifiedSymbols),
  }));
  const historicalSymbols = new Set(formationDates.flatMap((row) => row.identifiedSymbols));
  const finalSymbols = new Set(formationDates.at(-1)?.identifiedSymbols ?? []);

  const unclassifiedPermanentRemovals = Array.from(historicalSymbols)
    .filter((symbol) => !finalSymbols.has(symbol))
    .map((symbol): UnclassifiedRemoval => {
      const last = [...selected].reverse().find(({ identifiedSymbols }) => identifiedSymbols.includes(symbol));
      if (!last) throw new Error(`missing last-seen snapshot for ${symbol}`);
      const ranking = rankedFundPositions(last.snapshot);
      const rank = ranking.findIndex((position) => position.symbol === symbol) + 1;
      const position = ranking[rank - 1];
      if (!position || rank < 1) throw new Error(`missing last-seen holding for ${symbol}`);
      return Object.freeze({
        symbol,
        lastSeenReportDate: isoDate(last.snapshot.reportDate),
        lastSeenFormationAt: isoDate(last.snapshot.availableAt),
        finalFundWeight: percentageOf(
          position.valueUsd,
          ranking.map((item) => item.valueUsd),
        ),
        finalFundWeightRank: rank,
        top60FundWeightProxy: rank <= 60,
      });
    })
    .sort((a, b) => compareText(a.symbol, b.symbol));

  const m1Reasons: string[] = [UNAVAILABLE_REASONS.marketBars];
  if (ordered.some((snapshot) => snapshot.unresolvedHoldings.length > 0)) {
    m1Reasons.push(UNAVAILABLE_REASONS.unresolvedIdentities);
  }
  const proxyLower = unclassifiedPermanentRemovals.filter((row) => row.top60FundWeightProxy).length;

  return Object.freeze({
    formationDates: Object.freeze(formationDates),
    historicalIdentifiedSymbolCount: historicalSymbols.size,
    m1: Object.freeze({ status: 'UNAVAILABLE', reasonCodes: Object.freeze(m1Reasons) }),
    m2: Object.freeze({
      status: 'UNAVAILABLE',
      confirmedDelistingAdjacentOpportunityCount: null,
      reasonCodes: Object.freeze([UNAVAILABLE_REASONS.lifecycle, UNAVAILABLE_REASONS.intervalCensored]),
      unclassifiedPermanentRemovals: Object.freeze(unclassifiedPermanentRemovals),
    }),
    m3: Object.freeze({
      status: 'UNAVAILABLE',
      confirmedDelistingExposureLowerBound: null,
      confirmedDelistingExposureUpperBound: null,
      reasonCodes: Object.freeze([UNAVAILABLE_REASONS.m3Lifecycle, UNAVAILABLE_REASONS.sleeve]),
      unclassifiedRemovalProxyLowerCount: proxyLower,
      unclassifiedRemovalProxyUpperCount: unclassifiedPermanentRemovals.length,
    }),
  });
}

export function buildSurvivorshipMeasurement(): SurvivorshipMeasurement {
  return measureSurvivorshipCoverage(loadCapturedSpusNportSnapshots());
}

function reasonList(codes: readonly string[]): string {
  return codes.map((code) => `\`${code}\``).join(', ');
}

export function renderSurvivorshipMemo(result: SurvivorshipMeasurement): string {
  const rows = result.formationDates.map((row) =>
    `| ${row.formationAt} | ${row.reportDate} | ${row.accession} | ${row.identifiedMemberCount} | ${row.unresolvedMemberCount} | unavailable | unavailable |`,
  );
  const removals = result.m2.unclassifiedPermanentRemovals.map((row) =>
    `| ${row.symbol} | ${row.lastSeenReportDate} | ${row.lastSeenFormationAt} | ${row.finalFundWeight} | ${row.finalFundWeightRank} | ${row.top60FundWeightProxy ? 'yes' : 'no'} |`,
  );
  const firstFormation = result.formationDates[0].formationAt;
  const lastFormation = result.formationDates.at(-1)?.formationAt ?? firstFormation;

  return `# Survivorship coverage measurement\n\n` +
    `## Decision: DEFER licensed-history purchase\n\n` +
    `Across ${result.formationDates.length} point-in-time formation dates (${firstFormation} through ${lastFormation}), exact bar coverage and confirmed delisting-adjacent opportunity counts are unavailable from the committed offline artifacts. The snapshots prove ${result.historicalIdentifiedSymbolCount} historical identified symbols and ${result.m2.unclassifiedPermanentRemovals.length} permanent fund removals, but removals are not delistings. **Recommendation: defer the purchase because the decisive exposure evidence cannot yet distinguish confirmed delistings or the 63-trading-day window. Capture and byte-pin the free lifecycle evidence and a date-keyed bar inventory first.**\n\n` +
    `This memo measures exposure only. It produces no corrected return statistic.\n\n` +
    `## Measurement status\n\n` +
    `- **M1 — unavailable, not zero.** Reasons: ${reasonList(result.m1.reasonCodes)}. The repository contains no committed symbol/date MarketBar inventory, so available-member counts, coverage ratios, and missing-symbol lists cannot be computed offline.\n` +
    `- **M2 — unavailable, not zero.** Confirmed count: unavailable. Reasons: ${reasonList(result.m2.reasonCodes)}. Quarterly holdings only bound a removal between observations; they do not locate it within an exact trading-day window. No committed lifecycle artifact identifies which removals are confirmed delistings.\n` +
    `- **M3 — unavailable, not zero.** Confirmed bounds: unavailable. Reasons: ${reasonList(result.m3.reasonCodes)}. The snapshot-only unclassified-removal proxy is ${result.m3.unclassifiedRemovalProxyLowerCount}–${result.m3.unclassifiedRemovalProxyUpperCount}: lower counts final holdings ranked in the fund's top 60 by weight; upper counts every permanent removal. This is not a confirmed-delisting exposure bound and cannot decide the purchase.\n\n` +
    `## M1 snapshot-only facts\n\n` +
    `Formation time is the SEC acceptance date. Each row was selected with \`latestAvailableSpusNportSnapshot()\`; report dates are not treated as dates when the filing was public.\n\n` +
    `| Formation | Report date | Accession | Identified members | Unresolved positive-value members | Available members | Coverage |\n` +
    `|---|---|---|---:|---:|---:|---:|\n${rows.join('\n')}\n\n` +
    `## M2 unclassified permanent removals\n\n` +
    `These ${result.m2.unclassifiedPermanentRemovals.length} symbols appear in at least one captured snapshot and never appear in a later captured snapshot. They remain ordinary/unclassified fund removals unless pinned Form 25 evidence proves otherwise. No row below contributes to a confirmed-delisting count. Fund weight denominators and ranks include every positive-value position, including unresolved holdings; unresolved holdings never become classified symbols.\n\n` +
    `| Symbol | Last-seen report | Last-seen formation | Final fund weight | Weight rank | Top-60 weight proxy |\n` +
    `|---|---|---|---:|---:|---|\n${removals.join('\n')}\n\n` +
    `## Reproduction and limits\n\n` +
    `Generate this memo with:\n\n` +
    `\`\`\`sh\n` +
    `env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/measure-survivorship-coverage.ts --write\n` +
    `\`\`\`\n\n` +
    `The script reads frozen SEC N-PORT fixtures only. It performs no network call, database access, migration, or write outside this memo. A current-symbol list is never an input.\n`;
}

export function writeSurvivorshipMemo(): SurvivorshipMeasurement {
  const result = buildSurvivorshipMeasurement();
  fs.writeFileSync(SURVIVORSHIP_MEMO_PATH, renderSurvivorshipMemo(result), 'utf8');
  return result;
}

function summary(result: SurvivorshipMeasurement): string {
  return [
    `formation_dates=${result.formationDates.length}`,
    `historical_identified_symbols=${result.historicalIdentifiedSymbolCount}`,
    `unclassified_permanent_removals=${result.m2.unclassifiedPermanentRemovals.length}`,
    `m1=${result.m1.status}:${result.m1.reasonCodes.join(',')}`,
    `m2=${result.m2.status}:${result.m2.reasonCodes.join(',')}`,
    `m3=${result.m3.status}:${result.m3.reasonCodes.join(',')}`,
  ].join('\n');
}

function main(): void {
  const shouldWrite = process.argv.slice(2).includes('--write');
  const result = shouldWrite ? writeSurvivorshipMemo() : buildSurvivorshipMeasurement();
  process.stdout.write(`${summary(result)}\n`);
  if (shouldWrite) process.stdout.write(`memo=${SURVIVORSHIP_MEMO_PATH}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
