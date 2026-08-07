import { describe, expect, it } from 'vitest';
import {
  assertComparableArms,
  buildDiversificationCycles,
  navCagr,
  navDailyReturns,
  pairedArmReturns,
  realizedEffectiveBets,
  type SymbolCloses,
} from './diversificationEvidence';
import { buildPitSleeveSchedule, type PitSleeveSchedule } from '../universe/pitSleeveSchedule';
import { DataQualityPitError } from '../universe/pointInTimeMembership';
import { mulberry32 } from './monteCarlo';

const DAY = 86_400_000;
const BASE = Date.UTC(2019, 0, 2);
const SESSIONS = Array.from({ length: 300 }, (_, i) => new Date(BASE + i * DAY));

/** Closes driven by a shared factor; `common` sets how much of it each name carries. */
function closes(seed: number, common: number, factor: readonly number[]): SymbolCloses[] {
  const rnd = mulberry32(seed);
  let price = 100;
  return SESSIONS.map((ts, i) => {
    const ret = common * factor[i] + (1 - common) * (rnd() - 0.5) * 0.04;
    price *= 1 + ret;
    return { ts, close: price };
  });
}

const FACTOR = (() => {
  const rnd = mulberry32(99);
  return SESSIONS.map(() => (rnd() - 0.5) * 0.03);
})();

/** CORR* barely load on the factor; MEGA* move together, as dollar-volume ranking selects them. */
const CLOSES = new Map<string, readonly SymbolCloses[]>([
  ...['MEGA1', 'MEGA2', 'MEGA3', 'MEGA4'].map((s, i) => [s, closes(100 + i, 0.95, FACTOR)] as const),
  ...['CORR1', 'CORR2', 'CORR3', 'CORR4'].map((s, i) => [s, closes(200 + i, 0.10, FACTOR)] as const),
]);

async function schedule(symbols: readonly string[], cadence = 100): Promise<PitSleeveSchedule> {
  return buildPitSleeveSchedule({
    rule: 'correlation-balanced', sessions: SESSIONS, tradeFrom: SESSIONS[10],
    formationCadenceSessions: cadence, form: async () => ({ symbols: [...symbols] }),
  });
}

describe('navDailyReturns / navCagr', () => {
  it('derives simple daily returns and skips a non-positive prior NAV', () => {
    const curve = [
      { ts: SESSIONS[0], equity: 100 },
      { ts: SESSIONS[1], equity: 110 },
      { ts: SESSIONS[2], equity: 99 },
    ];
    const returns = navDailyReturns(curve);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 12);
    expect(returns[1]).toBeCloseTo(-0.1, 12);
    expect(navDailyReturns([{ ts: SESSIONS[0], equity: 0 }, { ts: SESSIONS[1], equity: 5 }])).toEqual([]);
  });

  it('annualizes CAGR off the session count, and returns 0 for a degenerate curve', () => {
    const curve = Array.from({ length: 253 }, (_, i) => ({ ts: SESSIONS[0], equity: 100 * 1.2 ** (i / 252) }));
    expect(navCagr(curve)).toBeCloseTo(0.2, 6);
    expect(navCagr([])).toBe(0);
    expect(navCagr([{ ts: SESSIONS[0], equity: 100 }])).toBe(0);
  });
});

describe('realizedEffectiveBets — measured on the FORWARD window', () => {
  it('gives a decorrelated basket more effective bets than a correlated one of the same size', () => {
    const window = { from: SESSIONS[10], to: SESSIONS[200] };
    const mega = realizedEffectiveBets(['MEGA1', 'MEGA2', 'MEGA3', 'MEGA4'], CLOSES, window.from, window.to);
    const corr = realizedEffectiveBets(['CORR1', 'CORR2', 'CORR3', 'CORR4'], CLOSES, window.from, window.to);

    expect(mega.rho).toBeGreaterThan(corr.rho);
    expect(corr.effectiveBets).toBeGreaterThan(mega.effectiveBets);
    expect(corr.names).toBe(4);
  });

  it('reads ONLY the requested window — a different window gives a different estimate', () => {
    const early = realizedEffectiveBets(['MEGA1', 'CORR1'], CLOSES, SESSIONS[10], SESSIONS[100]);
    const late = realizedEffectiveBets(['MEGA1', 'CORR1'], CLOSES, SESSIONS[100], SESSIONS[200]);
    expect(early.rho).not.toBe(late.rho);
  });

  it('drops a name with too little history rather than counting it at correlation 0', () => {
    // Counting a thin name at rho=0 would inflate effective bets for whichever arm holds the
    // thinner names — and by construction that is the treatment arm.
    const thin = new Map(CLOSES);
    thin.set('THIN', [{ ts: SESSIONS[10], close: 100 }]);
    const withThin = realizedEffectiveBets(['CORR1', 'CORR2', 'THIN'], thin, SESSIONS[10], SESSIONS[100]);
    const without = realizedEffectiveBets(['CORR1', 'CORR2'], thin, SESSIONS[10], SESSIONS[100]);
    expect(withThin.names).toBe(2);
    expect(withThin.effectiveBets).toBeCloseTo(without.effectiveBets, 12);
  });

  it('handles a single-name and an empty sleeve without producing NaN', () => {
    expect(realizedEffectiveBets(['CORR1'], CLOSES, SESSIONS[10], SESSIONS[100]).effectiveBets).toBe(1);
    expect(realizedEffectiveBets([], CLOSES, SESSIONS[10], SESSIONS[100]).effectiveBets).toBe(0);
    expect(realizedEffectiveBets(['MISSING'], CLOSES, SESSIONS[10], SESSIONS[100]).names).toBe(0);
  });

  it('an open-ended final epoch reads to the end of the data', () => {
    const bounded = realizedEffectiveBets(['CORR1', 'CORR2'], CLOSES, SESSIONS[10], SESSIONS[100]);
    const open = realizedEffectiveBets(['CORR1', 'CORR2'], CLOSES, SESSIONS[10], null);
    expect(open.rho).not.toBe(bounded.rho);
  });
});

describe('assertComparableArms — the comparator is the INCUMBENT RULE at the SAME dates', () => {
  it('accepts arms formed on an identical schedule', async () => {
    const treatment = await schedule(['CORR1', 'CORR2', 'CORR3']);
    const comparator = await schedule(['MEGA1', 'MEGA2', 'MEGA3']);
    expect(() => assertComparableArms(treatment, comparator)).not.toThrow();
  });

  it('refuses arms formed on different dates — that compares information sets, not rules', async () => {
    const treatment = await schedule(['CORR1', 'CORR2'], 100);
    const comparator = await schedule(['MEGA1', 'MEGA2'], 90);
    try {
      assertComparableArms(treatment, comparator);
      throw new Error('expected a PIT failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DataQualityPitError);
      expect((error as DataQualityPitError).reasonCode).toBe('DATA_QUALITY_PIT_FAILURE');
    }
  });

  it('refuses a treatment sleeve LARGER than its comparator — size would confound in its favour', async () => {
    const treatment = await schedule(['CORR1', 'CORR2', 'CORR3', 'CORR4']);
    const comparator = await schedule(['MEGA1', 'MEGA2']);
    expect(() => assertComparableArms(treatment, comparator)).toThrow(DataQualityPitError);
  });

  it('permits a SMALLER treatment sleeve — the sector cap and breadth floor can only shrink it', async () => {
    const treatment = await schedule(['CORR1', 'CORR2']);
    const comparator = await schedule(['MEGA1', 'MEGA2', 'MEGA3', 'MEGA4']);
    expect(() => assertComparableArms(treatment, comparator)).not.toThrow();
  });
});

describe('buildDiversificationCycles', () => {
  it('produces one cycle per epoch, measured on that epoch, and favours the decorrelated arm', async () => {
    const treatment = await schedule(['CORR1', 'CORR2', 'CORR3', 'CORR4']);
    const comparator = await schedule(['MEGA1', 'MEGA2', 'MEGA3', 'MEGA4']);
    const cycles = buildDiversificationCycles(
      { schedule: treatment, closesBySymbol: CLOSES },
      { schedule: comparator, closesBySymbol: CLOSES },
    );

    expect(cycles).toHaveLength(treatment.epochs.length);
    for (const cycle of cycles) {
      expect(cycle.treatmentEffectiveBets).toBeGreaterThan(cycle.comparatorEffectiveBets);
      expect(cycle.formationAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('carries the formation correlation through as a REPORTED diagnostic', async () => {
    const treatment = await buildPitSleeveSchedule({
      rule: 'correlation-balanced', sessions: SESSIONS, tradeFrom: SESSIONS[10], formationCadenceSessions: 100,
      form: async () => ({ symbols: ['CORR1', 'CORR2'], diagnostics: { averageCorrelation: 0.249, effectiveBets: 4.2 } }),
    });
    const comparator = await schedule(['MEGA1', 'MEGA2']);
    const cycles = buildDiversificationCycles(
      { schedule: treatment, closesBySymbol: CLOSES },
      { schedule: comparator, closesBySymbol: CLOSES },
    );
    expect(cycles[0].treatmentFormationCorrelation).toBe(0.249);
  });

  it('refuses mismatched arms before measuring anything', async () => {
    const treatment = await schedule(['CORR1'], 100);
    const comparator = await schedule(['MEGA1'], 50);
    expect(() => buildDiversificationCycles(
      { schedule: treatment, closesBySymbol: CLOSES },
      { schedule: comparator, closesBySymbol: CLOSES },
    )).toThrow(DataQualityPitError);
  });
});

describe('pairedArmReturns', () => {
  it('returns index-aligned series for the paired bootstrap', () => {
    const t = SESSIONS.slice(0, 5).map((ts, i) => ({ ts, equity: 100 + i }));
    const c = SESSIONS.slice(0, 5).map((ts, i) => ({ ts, equity: 100 + i * 2 }));
    const { treatment, comparator } = pairedArmReturns(t, c);
    expect(treatment).toHaveLength(4);
    expect(comparator).toHaveLength(4);
  });

  it('refuses a length mismatch rather than truncating and re-pairing mismatched days', () => {
    const t = SESSIONS.slice(0, 5).map((ts, i) => ({ ts, equity: 100 + i }));
    const c = SESSIONS.slice(0, 4).map((ts, i) => ({ ts, equity: 100 + i }));
    expect(() => pairedArmReturns(t, c)).toThrow(/dropped session/);
  });

  it('refuses arms whose sessions diverge even at equal length', () => {
    const t = SESSIONS.slice(0, 5).map((ts, i) => ({ ts, equity: 100 + i }));
    const c = SESSIONS.slice(1, 6).map((ts, i) => ({ ts, equity: 100 + i }));
    expect(() => pairedArmReturns(t, c)).toThrow(/diverge at index 0/);
  });
});
