import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  allocateTournamentCapital,
  MAX_MODE_WEIGHT,
  type AllocatorModeInput,
} from './allocator';

type ModeOverrides = Omit<Partial<AllocatorModeInput>, 'validation' | 'live'> & {
  validation?: Partial<NonNullable<AllocatorModeInput['validation']>> | null;
  live?: Partial<AllocatorModeInput['live']>;
};

function mode(
  modeId: string,
  overrides: ModeOverrides = {},
): AllocatorModeInput {
  return {
    modeId,
    validationStatus: overrides.validationStatus ?? 'ACCEPTED',
    incubationAuthorized: overrides.incubationAuthorized,
    evidenceCardComplete: overrides.evidenceCardComplete ?? true,
    shariaState: overrides.shariaState ?? 'VERIFIED_COMPLIANT',
    implausible: overrides.implausible ?? false,
    validation: overrides.validation === null ? null : {
      deflatedSharpe: overrides.validation?.deflatedSharpe ?? 0.8,
      maxDrawdown: overrides.validation?.maxDrawdown ?? 0.1,
    },
    live: {
      days: overrides.live?.days ?? 63,
      deflatedSharpe: overrides.live?.deflatedSharpe ?? 0.8,
      maxDrawdown: overrides.live?.maxDrawdown ?? 0.1,
      currentDrawdown: overrides.live?.currentDrawdown ?? 0.02,
      drawdownBreaker: overrides.live?.drawdownBreaker ?? 0.2,
      trackingError: overrides.live?.trackingError ?? 0.05,
      trackingErrorLimit: overrides.live?.trackingErrorLimit ?? 0.2,
    },
  };
}

describe('QDR-7 tournament allocator', () => {
  it('is deterministic across replays and input order; seed changes exact-score ties only', () => {
    const modes = [mode('alpha'), mode('beta'), mode('gamma')];
    const first = allocateTournamentCapital({ seed: 42, modes });
    const replay = allocateTournamentCapital({ seed: 42, modes: [modes[2], modes[0], modes[1]] });
    const anotherSeed = allocateTournamentCapital({ seed: 7, modes });

    expect(replay).toEqual(first);
    expect(anotherSeed.allocations).toEqual(first.allocations);
    expect(anotherSeed.modes).toEqual(first.modes);
    expect(new Set(anotherSeed.rankedModeIds)).toEqual(new Set(first.rankedModeIds));
  });

  it('shrinks a 21-day live window 75% toward the 63-day validation prior', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [mode('alpha', {
        validation: { deflatedSharpe: 0.8, maxDrawdown: 0.08 },
        live: { days: 21, deflatedSharpe: 0.4, maxDrawdown: 0.24 },
      })],
    });
    const evaluated = result.modes[0];

    expect(Number(evaluated.priorWeight)).toBeCloseTo(0.75, 12);
    expect(Number(evaluated.blendedDeflatedSharpe)).toBeCloseTo(0.7, 12);
    expect(Number(evaluated.blendedMaxDrawdown)).toBeCloseTo(0.12, 12);
    expect(Number(evaluated.score)).toBeCloseTo(0.58, 12);
  });

  it('never allocates a rejected, incomplete-evidence, or Sharia-unverified mode', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [
        mode('rejected', { validationStatus: 'REJECTED' }),
        mode('missing-card', { evidenceCardComplete: false, validation: null }),
        mode('unscreened', { shariaState: 'UNSCREENED_EXECUTION_BLOCKED' }),
      ],
    });

    expect(result.allocations).toEqual({ 'missing-card': '0', rejected: '0', unscreened: '0' });
    expect(result.cashAllocation).toBe('1');
    expect(result.reason).toBe('NO_ALLOCATABLE_MODES');
    expect(result.modes.map(item => item.reason)).toEqual([
      'MISSING_EVIDENCE_CARD', 'REJECTED', 'SHARIA_NOT_VERIFIED',
    ]);
  });

  it('admits only an explicitly authorized QDR-8 near-miss while retaining every other gate', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [mode('incubating', { validationStatus: 'REJECTED', incubationAuthorized: true })],
    });

    expect(result.allocations.incubating).toBe('0.4');
    expect(result.modes[0]).toMatchObject({ disposition: 'ALLOCATED', reason: 'ELIGIBLE' });
  });

  it('benches a drawdown breach immediately, before monthly scoring', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [mode('breached', {
        live: { currentDrawdown: 0.2, drawdownBreaker: 0.2, deflatedSharpe: 1 },
      })],
    });

    expect(result.modes[0]).toMatchObject({
      disposition: 'BENCH', reason: 'DRAWDOWN_BREAKER_BREACH', allocation: '0',
    });
    expect(result.cashAllocation).toBe('1');
  });

  it('requires revalidation on a tracking-error breach and disqualifies implausible evidence', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [
        mode('te-breach', { live: { trackingError: 0.21, trackingErrorLimit: 0.2 } }),
        mode('implausible', { implausible: true }),
      ],
    });

    expect(result.modes).toEqual(expect.arrayContaining([
      expect.objectContaining({ modeId: 'te-breach', disposition: 'REQUIRE_REVALIDATION', allocation: '0' }),
      expect.objectContaining({ modeId: 'implausible', disposition: 'DISQUALIFY', allocation: '0' }),
    ]));
  });

  it('enforces the 40% cap, keeps zero-score teams benched, and reconciles residual cash', () => {
    const result = allocateTournamentCapital({
      seed: 42,
      modes: [
        mode('strong', { validation: { deflatedSharpe: 1, maxDrawdown: 0.01 } }),
        mode('medium', { validation: { deflatedSharpe: 0.7, maxDrawdown: 0.1 } }),
        mode('weak', { validation: { deflatedSharpe: 0.4, maxDrawdown: 0.2 } }),
        mode('zero', {
          validation: { deflatedSharpe: 0.05, maxDrawdown: 0.2 },
          live: { deflatedSharpe: 0.05, maxDrawdown: 0.2 },
        }),
      ],
    });
    const weights = Object.values(result.allocations).map(value => new Prisma.Decimal(value));
    const reconciled = weights.reduce((sum, weight) => sum.add(weight), new Prisma.Decimal(0))
      .add(result.cashAllocation);

    expect(weights.every(weight => weight.lte(MAX_MODE_WEIGHT))).toBe(true);
    expect(result.allocations.zero).toBe('0');
    expect(result.modes.find(item => item.modeId === 'zero')).toMatchObject({
      disposition: 'BENCH', reason: 'NON_POSITIVE_SCORE',
    });
    expect(reconciled.eq(1)).toBe(true);
  });

  it('holds 100% cash for an empty league', () => {
    expect(allocateTournamentCapital({ seed: 42, modes: [] })).toEqual({
      seed: 42,
      priorWeightDays: 63,
      maxModeWeight: '0.4',
      allocations: {},
      cashAllocation: '1',
      rankedModeIds: [],
      modes: [],
      reason: 'NO_ALLOCATABLE_MODES',
    });
  });

  it('rejects duplicate modes and invalid metric ranges instead of normalizing bad evidence', () => {
    expect(() => allocateTournamentCapital({ seed: 42, modes: [mode('same'), mode('same')] }))
      .toThrow('duplicate modeId');
    expect(() => allocateTournamentCapital({
      seed: 42,
      modes: [mode('bad', { live: { currentDrawdown: Number.NaN } })],
    })).toThrow('must be finite');
  });
});
