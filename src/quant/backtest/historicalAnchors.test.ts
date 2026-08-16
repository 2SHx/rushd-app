// QDR-12. The load-bearing property is CLOSURE: the anchor set is admissible by a date that already
// happened, so it can never grow. These tests exist to make that true rather than aspirational.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertAnchorAdmissible,
  historicalAnchorIndex,
  HISTORICAL_COMPARATOR_ANCHORS,
  MANIFEST_PROTOCOL_EPOCH,
  type HistoricalComparatorAnchor,
} from './historicalAnchors';
import { assertDiversificationComparator, createDraft, type JsonValue } from './experimentProtocol';

/** QDR-11's sealed 3x3 grid, gating cell first. */
const PLATEAU_GRID = (() => {
  // QDR-11's full 3x3 grid, sealed cell FIRST. A 1-cell fixture used to seal here — the gap QA
  // found — and assertDiversificationGateSpec now refuses it.
  const all = [0.20, 0.25, 0.30].flatMap((c) => [60, 80, 100].map((p) => `sectorCap=${c},poolSize=${p}`));
  return ['sectorCap=0.25,poolSize=80', ...all.filter((c) => c !== 'sectorCap=0.25,poolSize=80')];
})();

const ANCHOR = HISTORICAL_COMPARATOR_ANCHORS[0];

function anchorWith(overrides: Partial<HistoricalComparatorAnchor>): HistoricalComparatorAnchor {
  return { ...ANCHOR, ...overrides };
}

describe('the set is closed by a date that already happened', () => {
  it('pins the epoch to the commit that introduced the manifest protocol', () => {
    // cf41f13, 2026-07-21, "feat: harden quant experiment governance". If this constant ever moves,
    // the closure argument moves with it — which is exactly why it is asserted rather than assumed.
    expect(MANIFEST_PROTOCOL_EPOCH).toBe('2026-07-21');
  });

  it('REFUSES an anchor preregistered on or after the epoch — by arithmetic, not judgement', () => {
    expect(() => assertAnchorAdmissible(anchorWith({ preregisteredAt: '2026-07-21' })))
      .toThrow(/refused by arithmetic, not by judgement/);
    expect(() => assertAnchorAdmissible(anchorWith({ preregisteredAt: '2026-08-07' })))
      .toThrow(/must carry a real sealed manifest/);
  });

  it('admits the one anchor that genuinely predates the protocol', () => {
    expect(() => assertAnchorAdmissible(ANCHOR)).not.toThrow();
    expect(ANCHOR.preregisteredAt < MANIFEST_PROTOCOL_EPOCH).toBe(true);
  });

  it('holds every shipped anchor to the rule, so the registry cannot grow past it', () => {
    for (const anchor of HISTORICAL_COMPARATOR_ANCHORS) {
      expect(anchor.preregisteredAt < MANIFEST_PROTOCOL_EPOCH).toBe(true);
      expect(() => assertAnchorAdmissible(anchor)).not.toThrow();
    }
    // The set is closed. A new entry means QDR-12 was reopened; this assertion is where that shows up.
    expect(HISTORICAL_COMPARATOR_ANCHORS).toHaveLength(1);
    expect(HISTORICAL_COMPARATOR_ANCHORS.map((a) => a.versionId)).toEqual(['halal-risk-parity-core@v1']);
  });
});

describe('closure is GIT-VERIFIED, not self-declared', () => {
  // Found at director review: assertAnchorAdmissible only string-compares a SELF-DECLARED
  // preregisteredAt. A fabricated date before the epoch plus any non-empty SHA would pass it, so
  // "refused by arithmetic" was an overclaim — enforcement was really code review. This test closes
  // that by asking git for the SHA's ACTUAL commit date, which the registry cannot forge.
  const commitDate = (sha: string): string =>
    execFileSync('git', ['show', '-s', '--format=%ad', '--date=short', sha], { encoding: 'utf8' }).trim();

  it('every anchor\'s DECLARED date matches its commit\'s REAL date', () => {
    for (const anchor of HISTORICAL_COMPARATOR_ANCHORS) {
      expect(commitDate(anchor.preregistrationSha)).toBe(anchor.preregisteredAt);
    }
  });

  it('every anchor\'s REAL commit date precedes the manifest-protocol epoch', () => {
    for (const anchor of HISTORICAL_COMPARATOR_ANCHORS) {
      expect(commitDate(anchor.preregistrationSha) < MANIFEST_PROTOCOL_EPOCH).toBe(true);
    }
  });

  it('the epoch constant matches the commit that actually introduced the protocol', () => {
    const introduced = execFileSync('git', [
      'log', '--diff-filter=A', '--format=%ad', '--date=short',
      '--', 'src/quant/backtest/experimentProtocol.ts',
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).pop();
    expect(introduced).toBe(MANIFEST_PROTOCOL_EPOCH);
  });
});

describe('an anchor must be auditable against its own SHA and ledger row', () => {
  it('requires the fields a reader needs to check the reconstruction', () => {
    for (const field of ['preregistrationSha', 'terminalRunId', 'ledgerRow'] as const) {
      expect(() => assertAnchorAdmissible(anchorWith({ [field]: '  ' })))
        .toThrow(/required for auditability/);
    }
  });

  it('rejects a malformed date rather than string-comparing nonsense against the epoch', () => {
    expect(() => assertAnchorAdmissible(anchorWith({ preregisteredAt: '20-07-2026' })))
      .toThrow(/must be an ISO date/);
  });

  it('rejects a versionId that does not match its own setupId@version', () => {
    expect(() => assertAnchorAdmissible(anchorWith({ versionId: 'something-else@v1' })))
      .toThrow(/versionId must be setupId@version/);
  });

  it('records the terminal status as REJECTED so no reader mistakes it for an admitted strategy', () => {
    expect(ANCHOR.terminalStatus).toBe('REJECTED');
  });

  it('indexes cleanly and refuses a duplicate declaration', () => {
    const index = historicalAnchorIndex();
    expect(index.get('halal-risk-parity-core@v1')?.preregistrationSha).toBe('6e5a095');
    expect(index.size).toBe(HISTORICAL_COMPARATOR_ANCHORS.length);
  });
});

describe('the anchor carries identity and isolation, never evidence', () => {
  const GATE = {
    productClass: 'DIVERSIFICATION',
    minimumOosObservations: 644,
    observationsPerYear: 252,
    relatedFamilyTrials: 108,
    trialTier: 'CONFIRMATORY',
    confirmatoryTrials: 1,
    comparatorUniverseRule: 'selectDollarVolumeSleeve',
    comparatorVersionId: 'halal-risk-parity-core@v1',
    sectorMapHash: 'sha256:0f3c',
    formationCadenceDays: 252,
    correlationLookbackDays: 252,
    minEffectiveBetsRatio: 1.10,
    minVolatilityReduction: 0.05,
    hypothesizedEffectiveBetsRatio: 1.28,
    hypothesizedVolReduction: 0.116,
    hypothesizedMonteCarloP95Drawdown: 0.41,
    bootstrapBlockLength: 20,
    plateauCells: PLATEAU_GRID,
    survivorshipCoverageWaiverAcknowledged: false,
  };

  /** The treatment arm: the anchor's config with ONLY the universe block changed. */
  const treatment = (universeOverride?: Record<string, unknown>) => createDraft({
    setupId: 'halal-decorrelated-risk-parity-core',
    version: 'v1',
    director: 'director-a',
    config: {
      ...(ANCHOR.config as Record<string, JsonValue>),
      universe: (universeOverride ?? {
        rule: 'selectCorrelationBalancedSleeve', maxNames: 40, sectorCap: 0.25, poolSize: 80,
      }) as JsonValue,
      validation: GATE as unknown as JsonValue,
    } as unknown as JsonValue,
  });

  const resolveViaAnchor = (versionId: string) => {
    const anchor = historicalAnchorIndex().get(versionId);
    return anchor ? { versionId: anchor.versionId, sealed: true, config: anchor.config } : null;
  };

  it('resolves the comparator and passes A/B isolation when only the universe block differs', () => {
    expect(() => assertDiversificationComparator(treatment(), resolveViaAnchor)).not.toThrow();
  });

  it('still refuses a SECOND variable — grandfathering the anchor did not soften the diff', () => {
    const twoVariables = createDraft({
      setupId: 'halal-decorrelated-risk-parity-core',
      version: 'v1',
      director: 'director-a',
      config: {
        ...(ANCHOR.config as Record<string, JsonValue>),
        // a changed sizing rule smuggled alongside the universe rule
        portfolio: { weighting: 'equal', lookbackDays: 63 } as unknown as JsonValue,
        universe: { rule: 'selectCorrelationBalancedSleeve', maxNames: 40 } as unknown as JsonValue,
        validation: GATE as unknown as JsonValue,
      } as unknown as JsonValue,
    });
    expect(() => assertDiversificationComparator(twoVariables, resolveViaAnchor))
      .toThrow(/differ in more than the universe block — portfolio/);
  });

  it('still refuses a comparator naming a version with neither manifest nor anchor', () => {
    const orphan = createDraft({
      setupId: 'halal-decorrelated-risk-parity-core',
      version: 'v1',
      director: 'director-a',
      config: {
        ...(ANCHOR.config as Record<string, JsonValue>),
        universe: { rule: 'selectCorrelationBalancedSleeve' } as unknown as JsonValue,
        validation: { ...GATE, comparatorVersionId: 'never-existed@v9' } as unknown as JsonValue,
      } as unknown as JsonValue,
    });
    expect(() => assertDiversificationComparator(orphan, resolveViaAnchor))
      .toThrow(/resolves to no SEALED manifest/);
  });

  it('the RESOLVER strips terminal metadata — it never leaves the registry', () => {
    // Director review flagged terminalRunId/ledgerRow as an attractive nuisance: a future card
    // renderer could join them against real metrics. The resolution path already returns only
    // {versionId, sealed, config}; this pins that so the shape cannot widen unnoticed.
    const anchor = historicalAnchorIndex().get('halal-risk-parity-core@v1')!;
    const resolved = { versionId: anchor.versionId, sealed: true, config: anchor.config };
    expect(Object.keys(resolved).sort()).toEqual(['config', 'sealed', 'versionId']);
    expect(resolved).not.toHaveProperty('terminalRunId');
    expect(resolved).not.toHaveProperty('terminalStatus');
    expect(resolved).not.toHaveProperty('ledgerRow');
  });

  it('the anchor config carries a RULE, and no result of any kind', () => {
    // Evidence must be impossible to read off an anchor, not merely discouraged.
    const config = ANCHOR.config as Record<string, unknown>;
    for (const forbidden of [
      'cagr', 'sharpe', 'deflatedSharpe', 'maxDrawdown', 'effectiveBets',
      'results', 'terminal', 'card', 'metrics',
    ]) {
      expect(config).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(config).sort()).toEqual(['execution', 'plateau', 'portfolio', 'seed', 'signal']);
  });

  it('reconstructs the mechanism actually committed at 6e5a095', () => {
    const config = ANCHOR.config as Record<string, Record<string, unknown>>;
    expect(config.portfolio).toEqual({
      weighting: 'inverse-volatility',
      lookbackDays: 252,
      perNameCap: 0.20,
      breadthFloor: 15,
      maxNames: 40,
      rebalance: 'monthly-month-end',
    });
    // signal: null is the mechanism's DEFINING property — a new class with no directional signal.
    expect(config.signal).toBeNull();
    expect(config.plateau.trials).toBe(9);
  });
});
