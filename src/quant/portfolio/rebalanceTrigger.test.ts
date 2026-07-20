import { describe, it, expect } from 'vitest';
import { REBALANCE_TRIGGER_PARAMS, shouldRebalance } from './rebalanceTrigger';

const target = { SPUS: 0.4, HLAL: 0.3, AAPL: 0.3 };
const asOf = new Date('2026-07-20T00:00:00.000Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

describe('shouldRebalance (hybrid quarterly + 5% drift)', () => {
  it('does not trigger inside the quarter with weights on target', () => {
    const check = shouldRebalance({ asOf, lastRebalanceAt: daysAgo(30), currentWeights: target, targetWeights: target });
    expect(check).toMatchObject({ rebalance: false, reasons: [], maxDrift: 0, daysSinceLast: 30 });
  });

  it('triggers TIME at the quarterly boundary and when never rebalanced', () => {
    expect(shouldRebalance({ asOf, lastRebalanceAt: daysAgo(91), currentWeights: target, targetWeights: target }).reasons).toEqual(['TIME']);
    expect(shouldRebalance({ asOf, lastRebalanceAt: daysAgo(90), currentWeights: target, targetWeights: target }).rebalance).toBe(false);
    const never = shouldRebalance({ asOf, lastRebalanceAt: null, currentWeights: {}, targetWeights: target });
    expect(never.reasons).toContain('TIME');
    expect(never.daysSinceLast).toBeNull();
  });

  it('triggers DRIFT at ≥5% absolute per-name drift, including missing names', () => {
    const drifted = { SPUS: 0.46, HLAL: 0.24, AAPL: 0.3 };
    const check = shouldRebalance({ asOf, lastRebalanceAt: daysAgo(10), currentWeights: drifted, targetWeights: target });
    expect(check.rebalance).toBe(true);
    expect(check.reasons).toEqual(['DRIFT']);
    expect(check.maxDrift).toBeCloseTo(0.06, 12);
    expect(check.maxDriftSymbol).toBe('SPUS');
    // A name held but absent from the target (or vice versa) counts as full-weight drift.
    const stray = shouldRebalance({
      asOf,
      lastRebalanceAt: daysAgo(10),
      currentWeights: { ...target, MSFT: 0.06 },
      targetWeights: target,
    });
    expect(stray.reasons).toEqual(['DRIFT']);
    expect(stray.maxDriftSymbol).toBe('MSFT');
  });

  it('can fire both reasons together and stays below threshold at 4.9% drift', () => {
    const both = shouldRebalance({
      asOf,
      lastRebalanceAt: daysAgo(120),
      currentWeights: { SPUS: 0.46, HLAL: 0.24, AAPL: 0.3 },
      targetWeights: target,
    });
    expect(both.reasons).toEqual(['TIME', 'DRIFT']);
    const under = shouldRebalance({
      asOf,
      lastRebalanceAt: daysAgo(10),
      currentWeights: { SPUS: 0.449, HLAL: 0.251, AAPL: 0.3 },
      targetWeights: target,
    });
    expect(under.rebalance).toBe(false);
    expect(under.maxDrift).toBeCloseTo(0.049, 12);
  });

  it('rejects non-finite or negative weights and exposes versioned params', () => {
    expect(() => shouldRebalance({ asOf, lastRebalanceAt: null, currentWeights: { SPUS: -0.1 }, targetWeights: target })).toThrow(/non-negative/);
    expect(() => shouldRebalance({ asOf, lastRebalanceAt: null, currentWeights: target, targetWeights: { SPUS: NaN } })).toThrow(/finite/);
    expect(REBALANCE_TRIGGER_PARAMS).toMatchObject({ version: 'rebalance-trigger.v1', maxCalendarDays: 91, driftThreshold: 0.05 });
  });
});
