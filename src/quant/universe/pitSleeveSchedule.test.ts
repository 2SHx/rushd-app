import { describe, expect, it, vi } from 'vitest';
import {
  assertRollingFormation,
  buildPitSleeveSchedule,
  DEFAULT_FORMATION_CADENCE_SESSIONS,
  formationSessionIndices,
  sleeveMembershipAt,
  sleeveMembershipResolver,
  type PitSleeveSchedule,
} from './pitSleeveSchedule';
import { DataQualityPitError } from './pointInTimeMembership';

/** A synthetic weekday-only calendar; enough to exercise the schedule with no DB and no keys. */
function sessions(count: number, startIso = '2019-01-02'): Date[] {
  const out: Date[] = [];
  const cursor = new Date(`${startIso}T00:00:00.000Z`);
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const CAL = sessions(900);
/** 100 warm-up sessions, so the first sleeve is formed on data the traded window never saw. */
const TRADE_FROM = CAL[100];

function scheduleOf(overrides: Partial<Parameters<typeof buildPitSleeveSchedule>[0]> = {}) {
  return buildPitSleeveSchedule({
    rule: 'correlation-balanced',
    sessions: CAL,
    tradeFrom: TRADE_FROM,
    formationCadenceSessions: 252,
    form: async (formationAt) => ({ symbols: [`E${formationAt.getUTCFullYear()}`, 'CORE'] }),
    ...overrides,
  });
}

describe('formationSessionIndices', () => {
  it('forms on the last session STRICTLY BEFORE the first traded one', () => {
    const indices = formationSessionIndices(CAL, TRADE_FROM, 252);
    expect(indices[0]).toBe(99);
    expect(CAL[99].getTime()).toBeLessThan(TRADE_FROM.getTime());
  });

  it('steps at the declared cadence and never forms on the final session', () => {
    expect(formationSessionIndices(CAL, TRADE_FROM, 252)).toEqual([99, 351, 603, 855]);
    // 855 governs 856..899; a formation at 899 would govern nothing and is not emitted.
    expect(formationSessionIndices(CAL.slice(0, 857), TRADE_FROM, 252)).toEqual([99, 351, 603, 855]);
    expect(formationSessionIndices(CAL.slice(0, 856), TRADE_FROM, 252)).toEqual([99, 351, 603]);
  });

  it('refuses to build when no session precedes tradeFrom — the first sleeve would see its own window', () => {
    try {
      formationSessionIndices(CAL, CAL[0], 252);
      throw new Error('expected a PIT failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DataQualityPitError);
      expect((error as DataQualityPitError).evidence.failure).toBe('EFFECTIVE_INTERVAL_GAP');
    }
  });

  it('rejects a non-ascending calendar and a non-positive cadence rather than silently coping', () => {
    const scrambled = [CAL[5], CAL[3], CAL[9]];
    expect(() => formationSessionIndices(scrambled, CAL[20], 252)).toThrow(DataQualityPitError);
    expect(() => formationSessionIndices(CAL, TRADE_FROM, 0)).toThrow(DataQualityPitError);
    expect(() => formationSessionIndices(CAL, TRADE_FROM, 1.5)).toThrow(DataQualityPitError);
  });
});

describe('buildPitSleeveSchedule', () => {
  it('holds the invariant formationAt < effectiveFrom on every epoch', async () => {
    const schedule = await scheduleOf();
    expect(schedule.epochs.length).toBe(4);
    for (const epoch of schedule.epochs) {
      expect(epoch.formationAt.getTime()).toBeLessThan(epoch.effectiveFrom.getTime());
      if (epoch.effectiveTo) {
        expect(epoch.effectiveFrom.getTime()).toBeLessThan(epoch.effectiveTo.getTime());
      }
    }
  });

  it('covers the traded window contiguously with no gap and no overlap', async () => {
    const schedule = await scheduleOf();
    expect(schedule.epochs[0].effectiveFrom.getTime()).toBe(TRADE_FROM.getTime());
    for (let i = 1; i < schedule.epochs.length; i++) {
      expect(schedule.epochs[i].effectiveFrom.getTime()).toBe(schedule.epochs[i - 1].effectiveTo!.getTime());
    }
    expect(schedule.epochs.at(-1)!.effectiveTo).toBeNull();
    // every traded session resolves to exactly one epoch
    for (const session of CAL.slice(100)) expect(sleeveMembershipAt(schedule, session).size).toBeGreaterThan(0);
  });

  it('never forms on data after the formation date — the whole point', async () => {
    const seen: Date[] = [];
    const schedule = await scheduleOf({
      form: async (formationAt) => { seen.push(formationAt); return { symbols: ['A', 'B'] }; },
    });
    for (let i = 0; i < seen.length; i++) {
      expect(seen[i].getTime()).toBeLessThan(schedule.epochs[i].effectiveFrom.getTime());
    }
  });

  it('unions every epoch as the LOAD set while membership stays per-epoch', async () => {
    const schedule = await scheduleOf({
      form: async (formationAt) => ({ symbols: [`Y${formationAt.getUTCFullYear()}`, 'CORE'] }),
    });
    expect(schedule.unionSymbols).toContain('CORE');
    expect(schedule.unionSymbols.length).toBeGreaterThan(2);
    // a name selected in one epoch is NOT eligible in another
    const first = sleeveMembershipAt(schedule, schedule.epochs[0].effectiveFrom);
    const last = sleeveMembershipAt(schedule, schedule.epochs.at(-1)!.effectiveFrom);
    expect(first).not.toEqual(last);
  });

  it('fails closed on an empty epoch instead of trading a cash window', async () => {
    await expect(scheduleOf({
      form: async (formationAt) => ({ symbols: formationAt.getUTCFullYear() === 2020 ? [] : ['A'] }),
    })).rejects.toBeInstanceOf(DataQualityPitError);
  });

  it('defaults the cadence to the 252-session year QDR-11 names', async () => {
    const schedule = await buildPitSleeveSchedule({
      rule: 'dollar-volume', sessions: CAL, tradeFrom: TRADE_FROM, form: async () => ({ symbols: ['A'] }),
    });
    expect(schedule.formationCadenceSessions).toBe(DEFAULT_FORMATION_CADENCE_SESSIONS);
  });
});

describe('sleeveMembershipAt / resolver', () => {
  it('fail-closes outside the schedule rather than returning an empty set', async () => {
    const schedule = await scheduleOf();
    // an empty set is indistinguishable from "liquidate everything", so it may never be a default
    expect(() => sleeveMembershipAt(schedule, CAL[0])).toThrow(DataQualityPitError);
  });

  it('memoizes per session without changing the answer', async () => {
    const schedule = await scheduleOf();
    const resolve = sleeveMembershipResolver(schedule);
    const session = CAL[400];
    expect(resolve(session)).toBe(resolve(new Date(session)));
    expect(Array.from(resolve(session)).sort()).toEqual(Array.from(sleeveMembershipAt(schedule, session)).sort());
  });
});

describe('assertRollingFormation — QDR-11 void condition', () => {
  it('accepts a genuinely rolling schedule', async () => {
    const schedule = await scheduleOf();
    expect(() => assertRollingFormation(schedule, 800)).not.toThrow();
  });

  it('VOIDS a sleeve formed once over a multi-year window', async () => {
    const single = await buildPitSleeveSchedule({
      rule: 'correlation-balanced',
      sessions: CAL,
      tradeFrom: TRADE_FROM,
      formationCadenceSessions: 10_000, // one cycle spanning everything — the old runLab behaviour
      form: async () => ({ symbols: ['A', 'B'] }),
    });
    expect(single.epochs.length).toBe(1);

    const posing = { ...single, formationCadenceSessions: 252 } as PitSleeveSchedule;
    try {
      assertRollingFormation(posing, 800);
      throw new Error('expected a PIT failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DataQualityPitError);
      expect((error as DataQualityPitError).reasonCode).toBe('DATA_QUALITY_PIT_FAILURE');
      expect((error as DataQualityPitError).evidence.failure).toBe('TERMINAL_DATE_INJECTION');
    }
  });

  it('VOIDS a schedule whose formation date reaches its own effective window', async () => {
    const schedule = await scheduleOf();
    const injected = {
      ...schedule,
      epochs: schedule.epochs.map((epoch, i) => (i === 1 ? { ...epoch, formationAt: epoch.effectiveFrom } : epoch)),
    } as PitSleeveSchedule;
    expect(() => assertRollingFormation(injected, 800)).toThrow(DataQualityPitError);
  });

  it('rejects a nonsense session count rather than dividing by it', async () => {
    const schedule = await scheduleOf();
    expect(() => assertRollingFormation(schedule, 0)).toThrow(DataQualityPitError);
  });
});

describe('engine integration shape', () => {
  it('resolver is the exact (ts) => Set signature StrategyBookPolicy.sleeveMembership expects', async () => {
    const schedule = await scheduleOf();
    const resolve = sleeveMembershipResolver(schedule);
    const policy: { sleeveMembership?: (ts: Date) => ReadonlySet<string> } = { sleeveMembership: resolve };
    expect(policy.sleeveMembership!(CAL[300]).has('CORE')).toBe(true);
  });

  it('propagates a formation failure instead of swallowing it into a smaller sleeve', async () => {
    const form = vi.fn(async () => { throw new Error('selector breadth floor breached'); });
    await expect(scheduleOf({ form })).rejects.toThrow(/breadth floor/);
  });
});
