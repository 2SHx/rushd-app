// src/quant/universe/pitSleeveSchedule.ts — QDR-11 (G9-PIT): rolling point-in-time sleeve
// re-formation.
//
// runLab historically resolved a sleeve ONCE at the run's `to` date and replayed it backwards. For
// dollar-volume ranking that is ordinary survivor bias. For CORRELATION selection it is DIRECT
// LOOK-AHEAD ON THE EXACT STATISTIC BEING CLAIMED — the sleeve would be chosen for having been
// decorrelated over the very window whose decorrelation *is* the result. QDR-11 therefore makes
// rolling re-formation mandatory for BOTH arms and voids — not discounts, not annotates, voids —
// any run whose either arm is formed once at the terminal date.
//
// This module owns the SCHEDULE, never the selection: it decides WHEN a sleeve is formed and WHICH
// sessions each formation governs. Selection stays in `sleeveSelector.ts`. The module is pure and
// DB-free — the caller injects the trading calendar and the formation function — so the PIT
// invariant is testable with no database, no API key, and no bar loading.
//
// THE INVARIANT, in one line: `formationAt < effectiveFrom`, strictly. A sleeve decided on the
// close of session t governs sessions t+1 onward, which is exactly the engine's next-open fill
// convention. A schedule that lets a formation govern its own formation session is a look-ahead,
// and this module refuses to build one.
import { DataQualityPitError } from './pointInTimeMembership';

/** Reported-only formation-window diagnostics. NEVER gated — see QDR-11 (D1): the formation-window
 * correlation is the quantity the greedy selector explicitly minimized, so gating on it would be
 * certifying an optimizer against its own objective function. */
export interface SleeveFormationDiagnostics {
  readonly averageCorrelation: number;
  readonly effectiveBets: number;
}

export interface PitSleeveFormation {
  readonly symbols: readonly string[];
  readonly diagnostics?: SleeveFormationDiagnostics | null;
}

export interface PitSleeveEpoch {
  readonly index: number;
  /** Decision date. Selection may see bars at or before this instant and nothing after. */
  readonly formationAt: Date;
  /** Inclusive; always the session strictly AFTER `formationAt`. */
  readonly effectiveFrom: Date;
  /** Exclusive; null on the final epoch (open through the run's end). */
  readonly effectiveTo: Date | null;
  readonly symbols: readonly string[];
  readonly diagnostics: SleeveFormationDiagnostics | null;
}

export type SleeveRule = 'dollar-volume' | 'correlation-balanced';

export interface PitSleeveSchedule {
  readonly rule: SleeveRule;
  readonly formationCadenceSessions: number;
  readonly epochs: readonly PitSleeveEpoch[];
  /** Every name held in ANY epoch. This — not one epoch's sleeve — is the set of series to load. */
  readonly unionSymbols: readonly string[];
}

/** QDR-11: "Both arms re-form annually on a trailing 252-trading-day window (the protocol the 8/8
 * walk-forward validated), at the same formation dates." 252 sessions is that year. */
export const DEFAULT_FORMATION_CADENCE_SESSIONS = 252;

function fail(
  failure: 'INVALID_TIMESTAMP' | 'EFFECTIVE_INTERVAL_GAP' | 'TERMINAL_DATE_INJECTION' | 'MEMBERSHIP_COVERAGE_MISSING',
  detail: { decisionAt?: string; epoch?: string; field?: string } = {},
): never {
  throw new DataQualityPitError({ failure, ...detail });
}

/**
 * Indices into `sessions` at which a sleeve is FORMED. The first is the last session strictly
 * before `tradeFrom` — so the very first traded session is already governed by a sleeve chosen
 * without seeing it — then every `cadence` sessions thereafter.
 *
 * Exported because it is the whole PIT argument in six lines, and it deserves its own tests
 * independent of any selector, calendar source, or database.
 */
export function formationSessionIndices(
  sessions: readonly Date[],
  tradeFrom: Date,
  cadence: number,
): readonly number[] {
  if (!Number.isInteger(cadence) || cadence <= 0) {
    fail('INVALID_TIMESTAMP', { field: 'formationCadenceSessions' });
  }
  if (!(tradeFrom instanceof Date) || !Number.isFinite(tradeFrom.getTime())) {
    fail('INVALID_TIMESTAMP', { field: 'tradeFrom' });
  }
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (!(session instanceof Date) || !Number.isFinite(session.getTime())) {
      fail('INVALID_TIMESTAMP', { field: `sessions[${i}]` });
    }
    if (i > 0 && session.getTime() <= sessions[i - 1].getTime()) {
      fail('INVALID_TIMESTAMP', { field: `sessions[${i}] is not strictly ascending` });
    }
  }

  const cutoff = tradeFrom.getTime();
  let first = -1;
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].getTime() < cutoff) first = i; else break;
  }
  if (first < 0) {
    // Nothing to form ON. Forming at or after the first traded session would let the sleeve see the
    // session it governs — the exact look-ahead this module exists to prevent — so we refuse to
    // build a schedule rather than build a compromised one.
    fail('EFFECTIVE_INTERVAL_GAP', {
      decisionAt: tradeFrom.toISOString(),
      field: 'no trading session strictly before tradeFrom; the first sleeve cannot be formed point-in-time',
    });
  }

  const indices: number[] = [];
  // A formation is only useful if a session exists for it to govern, hence `< sessions.length - 1`.
  for (let i = first; i < sessions.length - 1; i += cadence) indices.push(i);
  return indices;
}

export interface BuildPitSleeveScheduleInput {
  readonly rule: SleeveRule;
  /** Ascending, strictly increasing trading sessions. MUST include warm-up sessions before
   * `tradeFrom`, or the first sleeve cannot be formed without look-ahead. */
  readonly sessions: readonly Date[];
  readonly tradeFrom: Date;
  readonly formationCadenceSessions?: number;
  /** Injected so this module never touches the database. Sees only bars at or before `formationAt`. */
  readonly form: (formationAt: Date) => Promise<PitSleeveFormation>;
}

export async function buildPitSleeveSchedule(
  input: BuildPitSleeveScheduleInput,
): Promise<PitSleeveSchedule> {
  const cadence = input.formationCadenceSessions ?? DEFAULT_FORMATION_CADENCE_SESSIONS;
  const { sessions } = input;
  const indices = formationSessionIndices(sessions, input.tradeFrom, cadence);

  const epochs: PitSleeveEpoch[] = [];
  const union = new Set<string>();
  for (let e = 0; e < indices.length; e++) {
    const at = indices[e];
    const formationAt = sessions[at];
    const effectiveFrom = sessions[at + 1];
    // Exclusive upper bound: the first session governed by the NEXT formation.
    const nextAt = indices[e + 1];
    const effectiveTo = nextAt === undefined ? null : sessions[nextAt + 1];

    if (formationAt.getTime() >= effectiveFrom.getTime()) {
      fail('TERMINAL_DATE_INJECTION', { epoch: String(e), decisionAt: formationAt.toISOString() });
    }
    if (effectiveTo !== null && effectiveTo.getTime() <= effectiveFrom.getTime()) {
      fail('TERMINAL_DATE_INJECTION', { epoch: String(e), decisionAt: formationAt.toISOString() });
    }

    const formed = await input.form(formationAt);
    const symbols = Array.from(new Set(formed.symbols.map((s) => s.trim().toUpperCase()))).sort();
    if (symbols.length === 0) {
      // A silently empty epoch would sit in the book as a cash window and quietly change the
      // measured volatility of BOTH arms. Fail closed.
      fail('MEMBERSHIP_COVERAGE_MISSING', { epoch: String(e), decisionAt: formationAt.toISOString() });
    }
    for (const symbol of symbols) union.add(symbol);

    epochs.push(Object.freeze({
      index: e,
      formationAt,
      effectiveFrom,
      effectiveTo,
      symbols: Object.freeze(symbols),
      diagnostics: formed.diagnostics ?? null,
    }));
  }

  if (epochs.length === 0) {
    fail('EFFECTIVE_INTERVAL_GAP', { decisionAt: input.tradeFrom.toISOString(), field: 'no formation cycle fits the window' });
  }

  return Object.freeze({
    rule: input.rule,
    formationCadenceSessions: cadence,
    epochs: Object.freeze(epochs),
    unionSymbols: Object.freeze(Array.from(union).sort()),
  });
}

/** The eligible sleeve at `ts`. Fail-closed: a date outside every epoch throws rather than
 * returning an empty set, because an empty set is indistinguishable from "everything liquidated". */
export function sleeveMembershipAt(schedule: PitSleeveSchedule, ts: Date): ReadonlySet<string> {
  const time = ts.getTime();
  for (const epoch of schedule.epochs) {
    if (epoch.effectiveFrom.getTime() <= time
      && (epoch.effectiveTo === null || time < epoch.effectiveTo.getTime())) {
      return new Set(epoch.symbols);
    }
  }
  fail('MEMBERSHIP_COVERAGE_MISSING', { decisionAt: ts.toISOString() });
}

/** Memoized `sleeveMembershipAt`, shaped for the engine's per-session hot loop. */
export function sleeveMembershipResolver(schedule: PitSleeveSchedule): (ts: Date) => ReadonlySet<string> {
  const cache = new Map<number, ReadonlySet<string>>();
  return (ts: Date) => {
    const key = ts.getTime();
    const hit = cache.get(key);
    if (hit) return hit;
    const resolved = sleeveMembershipAt(schedule, ts);
    cache.set(key, resolved);
    return resolved;
  };
}

/**
 * QDR-11's void condition, as executable code: "Any DIVERSIFICATION run whose either arm is formed
 * once at the terminal date earns `DATA_QUALITY_PIT_FAILURE` and its diversification numbers are
 * VOID." A window spanning `sessionCount` sessions at cadence `c` must carry `ceil(sessionCount/c)`
 * formation cycles; a single-shot sleeve over a multi-year window carries one, and is refused here.
 */
export function assertRollingFormation(
  schedule: PitSleeveSchedule,
  sessionCount: number,
): void {
  if (!Number.isInteger(sessionCount) || sessionCount <= 0) {
    fail('INVALID_TIMESTAMP', { field: 'sessionCount' });
  }
  const required = Math.ceil(sessionCount / schedule.formationCadenceSessions);
  if (schedule.epochs.length < required) {
    fail('TERMINAL_DATE_INJECTION', {
      field: `sleeve re-formed ${schedule.epochs.length}x over ${sessionCount} sessions; `
        + `rolling ${schedule.formationCadenceSessions}-session cadence requires ${required}`,
    });
  }
  for (const epoch of schedule.epochs) {
    if (epoch.formationAt.getTime() >= epoch.effectiveFrom.getTime()) {
      fail('TERMINAL_DATE_INJECTION', { epoch: String(epoch.index), decisionAt: epoch.formationAt.toISOString() });
    }
  }
}
