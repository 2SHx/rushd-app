import { describe, expect, it } from 'vitest';
import { computeMetrics, type EquityPoint } from './metrics';
import { trialCountEvidence } from './trialFamilies';

function knownPositiveCurve(): EquityPoint[] {
  let seed = 42;
  let equity = 100;
  const curve: EquityPoint[] = [{ ts: new Date('2024-01-01T00:00:00.000Z'), equity }];
  for (let day = 1; day < 250; day++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    equity *= 1 + 0.001 + (seed / 2147483648 - 0.5) * 0.02;
    curve.push({ ts: new Date(Date.UTC(2024, 0, 1 + day)), equity });
  }
  return curve;
}

describe('terminal DSR trial-family registry', () => {
  it('uses all 90 related halal-core trials and never falls below the local plateau', () => {
    const evidence = trialCountEvidence('halal-fast-momentum-core', 9);
    const raisedPlateau = trialCountEvidence('halal-fast-momentum-core', 100);

    expect(evidence.familyTrials).toBe(90);
    expect(evidence.familyTrials).toBeGreaterThan(evidence.plateauTrials);
    expect(raisedPlateau.familyTrials).toBe(100);
    expect(raisedPlateau.familyTrials).toBeGreaterThanOrEqual(raisedPlateau.plateauTrials);
  });

  it('a larger related family cannot improve DSR for a known positive sample', () => {
    const curve = knownPositiveCurve();
    const local = computeMetrics(curve, { trades: 249, turnover: 1, trials: 9 });
    const family = trialCountEvidence('halal-fast-momentum-core', 9);
    const corrected = computeMetrics(curve, { trades: 249, turnover: 1, trials: family.familyTrials });

    expect(corrected.deflatedSharpe).toBeLessThanOrEqual(local.deflatedSharpe);
  });
});
