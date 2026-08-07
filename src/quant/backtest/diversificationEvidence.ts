// QDR-11 (G9-EVIDENCE): assemble the two-arm evidence `diversificationCriteria.ts` adjudicates.
//
// The criteria module decides; this module MEASURES, and the split matters — a criterion that also
// produced its own inputs could never be audited against them. Everything here is derived from
// realized series: the D1 effective-bet ratio is computed on each cycle's MEASUREMENT window (the
// sessions strictly after that cycle's formation), never on the formation window the selector
// optimized over, and the D2 series are the two arms' realized daily NAV returns.
//
// THE COMPARATOR IS THE INCUMBENT RULE AT THE SAME FORMATION DATES. Not a hand-written symbol list,
// not a different period, not the most-correlated sleeve, not a different sleeve size, not the
// incumbent's sealed card. `assertComparableArms` refuses every one of those it can detect, because
// a favourable comparator manufactures the result exactly as a post-hoc benchmark does — measured
// once at 29.6% where the honest same-rule figure was 11.6%, a 2.6x overstatement produced entirely
// by comparator choice, with no error in the mechanism at all.
//
// Pure: no DB, no clock, no randomness. Series come in as plain numbers.
import { effectiveBets, pearson } from '../universe/decorrelatedSleeve';
import { DataQualityPitError } from '../universe/pointInTimeMembership';
import type { PitSleeveEpoch, PitSleeveSchedule } from '../universe/pitSleeveSchedule';
import type { DiversificationCycle } from './diversificationCriteria';

/** One symbol's realized closes on the shared session calendar. */
export interface SymbolCloses {
  readonly ts: Date;
  readonly close: number;
}

export interface EquityPointLike {
  readonly ts: Date;
  readonly equity: number;
}

/** Simple daily returns from a NAV curve; the D2 observation unit. */
export function navDailyReturns(curve: readonly EquityPointLike[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    if (prev > 0 && Number.isFinite(curve[i].equity)) out.push(curve[i].equity / prev - 1);
  }
  return out;
}

/** Realized CAGR from a NAV curve. Disclosure only — it gates nothing under this class. */
export function navCagr(curve: readonly EquityPointLike[], sessionsPerYear = 252): number {
  if (curve.length < 2) return 0;
  const first = curve[0].equity;
  const last = curve[curve.length - 1].equity;
  if (!(first > 0) || !(last > 0)) return 0;
  const years = (curve.length - 1) / sessionsPerYear;
  return years > 0 ? (last / first) ** (1 / years) - 1 : 0;
}

/**
 * Mean pairwise correlation and effective bets for `symbols` over `[from, to)` — the MEASUREMENT
 * window. Names with fewer than two overlapping returns in the window are dropped from the
 * estimate rather than counted at correlation 0, which would silently inflate effective bets for
 * whichever arm holds the thinner names — and by construction that is the treatment arm.
 */
export function realizedEffectiveBets(
  symbols: readonly string[],
  closesBySymbol: ReadonlyMap<string, readonly SymbolCloses[]>,
  from: Date,
  to: Date | null,
): { readonly rho: number; readonly effectiveBets: number; readonly names: number } {
  const fromMs = from.getTime();
  const toMs = to === null ? Number.POSITIVE_INFINITY : to.getTime();

  const series: number[][] = [];
  for (const symbol of symbols) {
    const closes = closesBySymbol.get(symbol);
    if (!closes) continue;
    const window = closes.filter((bar) => bar.ts.getTime() >= fromMs && bar.ts.getTime() < toMs);
    const returns: number[] = [];
    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1].close;
      if (prev > 0) returns.push(window[i].close / prev - 1);
    }
    if (returns.length >= 2) series.push(returns);
  }

  const n = series.length;
  if (n < 2) return { rho: 1, effectiveBets: n, names: n };

  let sum = 0;
  let pairs = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) { sum += pearson(series[a], series[b]); pairs++; }
  }
  const rho = pairs > 0 ? sum / pairs : 1;
  return { rho, effectiveBets: effectiveBets(rho, n), names: n };
}

export interface ArmEvidenceInput {
  readonly schedule: PitSleeveSchedule;
  readonly closesBySymbol: ReadonlyMap<string, readonly SymbolCloses[]>;
}

/**
 * The two arms must be comparable in the only sense QDR-11 permits: the SAME formation dates, the
 * SAME cycle count, and each arm's sleeve capped at the same size. A binding sector cap and the
 * breadth floor can only make the TREATMENT sleeve smaller, so a treatment sleeve LARGER than its
 * comparator is a configuration error, not a result — size would then confound in the treatment's
 * favour, which the record forbids by construction.
 */
export function assertComparableArms(
  treatment: PitSleeveSchedule,
  comparator: PitSleeveSchedule,
): void {
  const fail = (field: string): never => {
    throw new DataQualityPitError({ failure: 'TERMINAL_DATE_INJECTION', field });
  };
  if (treatment.epochs.length !== comparator.epochs.length) {
    fail(`arms re-formed a different number of times (${treatment.epochs.length} vs `
      + `${comparator.epochs.length}); comparing them would compare information sets, not rules`);
  }
  for (let i = 0; i < treatment.epochs.length; i++) {
    const t = treatment.epochs[i];
    const c = comparator.epochs[i];
    if (t.formationAt.getTime() !== c.formationAt.getTime()) {
      fail(`cycle ${i} formed at ${t.formationAt.toISOString()} vs ${c.formationAt.toISOString()}; `
        + 'the comparator must be the incumbent RULE at the SAME formation dates');
    }
    if (t.effectiveFrom.getTime() !== c.effectiveFrom.getTime()) {
      fail(`cycle ${i} governs different sessions in each arm`);
    }
    if (t.symbols.length > c.symbols.length) {
      fail(`cycle ${i}: the treatment sleeve holds ${t.symbols.length} names against the comparator's `
        + `${c.symbols.length}. The sector cap and breadth floor can only SHRINK the treatment sleeve, `
        + 'so a larger one means the arms are not capped at the same size and breadth would confound');
    }
  }
  if (treatment.formationCadenceSessions !== comparator.formationCadenceSessions) {
    fail('arms declare different formation cadences');
  }
}

/**
 * One D1 cycle per formation epoch. The measurement window is the epoch itself — the sessions
 * strictly after that cycle's formation and before the next one — which is exactly QDR-11's "252
 * trading days strictly after t_c, the final cycle truncating at the OOS end".
 */
export function buildDiversificationCycles(
  treatment: ArmEvidenceInput,
  comparator: ArmEvidenceInput,
): DiversificationCycle[] {
  assertComparableArms(treatment.schedule, comparator.schedule);

  return treatment.schedule.epochs.map((epoch: PitSleeveEpoch, index) => {
    const peer = comparator.schedule.epochs[index];
    const t = realizedEffectiveBets(epoch.symbols, treatment.closesBySymbol, epoch.effectiveFrom, epoch.effectiveTo);
    const c = realizedEffectiveBets(peer.symbols, comparator.closesBySymbol, peer.effectiveFrom, peer.effectiveTo);
    return {
      formationAt: epoch.formationAt.toISOString().slice(0, 10),
      comparatorEffectiveBets: c.effectiveBets,
      treatmentEffectiveBets: t.effectiveBets,
      comparatorNames: c.names,
      treatmentNames: t.names,
      // Reported, never gated: this is the quantity the selector minimized.
      ...(epoch.diagnostics ? { treatmentFormationCorrelation: epoch.diagnostics.averageCorrelation } : {}),
    };
  });
}

/**
 * D2 requires the arms index-aligned on the SAME sessions — the pairing is what makes the test
 * powerful. Both curves come from the same engine over the same dates, so a length mismatch means a
 * session was dropped in one arm and not the other, and the honest response is to refuse rather than
 * to truncate silently (truncation would quietly re-pair mismatched days).
 */
export function pairedArmReturns(
  treatmentCurve: readonly EquityPointLike[],
  comparatorCurve: readonly EquityPointLike[],
): { readonly treatment: number[]; readonly comparator: number[] } {
  if (treatmentCurve.length !== comparatorCurve.length) {
    throw new Error(
      `D2 arms span ${treatmentCurve.length} and ${comparatorCurve.length} sessions; both run through the `
      + 'same engine over the same dates, so a mismatch means a dropped session, and truncating would '
      + 're-pair mismatched days rather than fix it',
    );
  }
  for (let i = 0; i < treatmentCurve.length; i++) {
    if (treatmentCurve[i].ts.getTime() !== comparatorCurve[i].ts.getTime()) {
      throw new Error(`D2 arms diverge at index ${i}: ${treatmentCurve[i].ts.toISOString()} vs `
        + `${comparatorCurve[i].ts.toISOString()}`);
    }
  }
  return {
    treatment: navDailyReturns(treatmentCurve),
    comparator: navDailyReturns(comparatorCurve),
  };
}
