import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ShariaScreener, ShariaVerdict } from '@/services/marketData';
import type { UniverseEntry } from '@/quant/universe/types';
import {
  backdatedShariaEvidence,
  buildC1ShariaRunSnapshot,
  buildCurrentSleeveResearchSnapshot,
  buildShariaRunSnapshot,
  deriveShariaState,
} from './shariaSnapshot';

// Network-free: keyless never touches a screener; the configured case injects a mock screener, so no
// Zoya HTTP call is ever made. No database is used anywhere in this suite.
function mockScreener(nonCompliant: Set<string> = new Set()): ShariaScreener {
  return {
    screen: vi.fn(async (symbol: string): Promise<ShariaVerdict> => ({
      symbol,
      compliant: !nonCompliant.has(symbol),
      standard: 'AAOIFI',
      source: 'zoya',
      // Relative, not absolute: this fixture feeds MAX_EXECUTION_EVIDENCE_AGE_DAYS (135d).
      // A wall-clock date silently ages past the window and turns this into a time bomb —
      // it already did once, when the window tightened 550d -> 135d.
      asOf: new Date(Date.now() - 30 * 86_400_000),
    })),
  };
}

describe('buildShariaRunSnapshot', () => {
  beforeEach(() => {
    delete process.env.ZOYA_API_KEY;
    delete process.env.MARKET_DATA_MODE;
  });

  it('records UNSCREENED honestly when no real source is configured — and never screens', async () => {
    const screener = mockScreener();
    const snap = await buildShariaRunSnapshot(['MSFT', 'AAPL'], 'NASDAQ', { screener });
    expect(snap.screened).toBe(false);
    expect(snap.source).toBe('none');
    expect(snap.state).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(snap.verdicts).toEqual([
      { symbol: 'AAPL', compliant: null, standard: 'AAOIFI', source: 'none', reason: 'unscreened_no_real_source' },
      { symbol: 'MSFT', compliant: null, standard: 'AAOIFI', source: 'none', reason: 'unscreened_no_real_source' },
    ]);
    // Keyless MUST NOT fabricate a verdict from any screener.
    expect(screener.screen).not.toHaveBeenCalled();
    // Serializes cleanly for the results JSON / BacktestRun.
    expect(JSON.parse(JSON.stringify(snap)).state).toBe('UNSCREENED_EXECUTION_BLOCKED');
  });

  it('derives VERIFIED_COMPLIANT from a real screening source when every symbol passes', async () => {
    const snap = await buildShariaRunSnapshot(['MSFT', 'AAPL'], 'NASDAQ', {
      screened: true, screener: mockScreener(),
    });
    expect(snap.screened).toBe(true);
    expect(snap.source).toBe('zoya');
    expect(snap.state).toBe('VERIFIED_COMPLIANT');
    expect(snap.verdicts.every((v) => v.compliant === true && v.source === 'zoya')).toBe(true);
  });

  it('derives VERIFIED_NON_COMPLIANT (fail-closed) when any symbol fails the real screen', async () => {
    const snap = await buildShariaRunSnapshot(['MSFT', 'TSLA'], 'NASDAQ', {
      screened: true, screener: mockScreener(new Set(['TSLA'])),
    });
    expect(snap.state).toBe('VERIFIED_NON_COMPLIANT');
    expect(snap.verdicts.find((v) => v.symbol === 'TSLA')!.compliant).toBe(false);
  });
});

describe('deriveShariaState', () => {
  it('maps screened flag + verdicts to the honest card state', () => {
    expect(deriveShariaState(false, [])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(deriveShariaState(true, [])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(deriveShariaState(true, [{ compliant: true }, { compliant: true }])).toBe('VERIFIED_COMPLIANT');
    expect(deriveShariaState(true, [{ compliant: false }])).toBe('VERIFIED_NON_COMPLIANT');
  });

  it('any null (UNKNOWN/not-covered) verdict blocks the run as incomplete coverage — never asserts a fabricated non-compliance', () => {
    // A real source ran (screened=true) but had no evidence for one symbol: this is a coverage
    // gap, not a screened-and-failed verdict, so it must NOT be reported as VERIFIED_NON_COMPLIANT.
    expect(deriveShariaState(true, [{ compliant: true }, { compliant: null }])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    // Still fail-closed: a null mixed with an actual false is also blocked as incomplete coverage,
    // never silently promoted or misreported.
    expect(deriveShariaState(true, [{ compliant: false }, { compliant: null }])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(deriveShariaState(true, [{ compliant: null }])).toBe('UNSCREENED_EXECUTION_BLOCKED');
  });
});

describe('buildC1ShariaRunSnapshot', () => {
  it('persists the gate-approved Tier-1 label without fabricating per-name AAOIFI or purification', () => {
    const snapshot = buildC1ShariaRunSnapshot([{
      symbol: 'AAPL', name: 'Apple', market: 'NASDAQ', tier: 'index-provider-screened',
      provenance: 'SPUS holdings fixture', purificationRatioBps: 'n/a — not computed',
      reasonCodes: ['FUND_LEVEL_PURIFICATION_ONLY'], asOf: '2026-07-17',
    }], new Date('2026-07-17T23:59:59.999Z'));
    expect(snapshot.state).toBe('VERIFIED_COMPLIANT');
    expect(snapshot.verdicts[0]).toMatchObject({
      standard: 'S&P Shariah methodology',
      source: 'index-provider-screened',
      reason: 'FUND_LEVEL_PURIFICATION_ONLY',
      sourceAsOf: '2026-07-17',
    });
  });

  it('blocks historical promotion when only current-sleeve membership is known', () => {
    const snapshot = buildCurrentSleeveResearchSnapshot([{
      symbol: 'AAPL', name: 'Apple', market: 'NASDAQ', tier: 'index-provider-screened',
      provenance: 'SPUS holdings fixture', purificationRatioBps: 'n/a — not computed',
      reasonCodes: ['FUND_LEVEL_PURIFICATION_ONLY'], asOf: '2026-07-17',
    }, {
      symbol: 'MSFT', name: 'Microsoft', market: 'NASDAQ', tier: 'rushd-xbrl-screened',
      provenance: 'SEC filing', purificationRatioBps: 12,
      reasonCodes: [], asOf: '2026-06-30',
    }]);
    expect(snapshot).toMatchObject({
      screened: false,
      source: 'current-c1-sleeve-research-only',
      state: 'UNSCREENED_EXECUTION_BLOCKED',
      asOf: '2026-07-17T00:00:00.000Z',
    });
    expect(snapshot.verdicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'AAPL', compliant: null, sourceAsOf: '2026-07-17' }),
      expect.objectContaining({ symbol: 'MSFT', compliant: null, sourceAsOf: '2026-06-30' }),
    ]));
    expect(snapshot.verdicts.every((verdict) => (
      verdict.reason === 'CURRENT_SLEEVE_ONLY_UNVERIFIED_HISTORICAL'
    ))).toBe(true);
  });
});

// ── THE ORCL REGRESSION GUARD ────────────────────────────────────────────────────────────────────
// ORCL sits in the 2026-07-17 SPUS holdings at 0.56%. Before this guard, that single dated snapshot
// certified every trade back to 2018 — so a name only screened compliant in 2026 was bought in 2022
// on evidence that did not exist yet. The debt/market-cap ratio that decides ORCL moves with market
// cap, so this is not hypothetical. Wrong even when profitable: a Sharia defect, not a stats one.
describe('backdated Sharia evidence (the ORCL guard)', () => {
  const entry = (symbol: string, asOf: string): UniverseEntry => ({
    symbol,
    name: `${symbol} Corp`,
    market: 'NASDAQ',
    tier: 'index-provider-screened',
    provenance: `SPUS holdings fixture (${asOf})`,
    purificationRatioBps: 'n/a — not computed',
    reasonCodes: [],
    asOf,
  });

  const SPUS_SNAPSHOT = '2026-07-17';

  it('flags every name whose evidence post-dates the first decision', () => {
    const entries = [entry('ORCL', SPUS_SNAPSHOT), entry('NVDA', SPUS_SNAPSHOT)];
    const violations = backdatedShariaEvidence(entries, '2018-01-02');

    expect(violations).toHaveLength(2);
    expect(violations[0]).toEqual({
      symbol: 'NVDA', evidenceAsOf: SPUS_SNAPSHOT, periodStart: '2018-01-02',
    });
    expect(violations.map((v) => v.symbol)).toContain('ORCL');
  });

  it('does NOT report VERIFIED_COMPLIANT when 2026 evidence is applied to a 2018 run', () => {
    const entries = [entry('ORCL', SPUS_SNAPSHOT)];
    const snapshot = buildC1ShariaRunSnapshot(entries, new Date('2026-07-17T23:59:59.999Z'), '2018-01-02');

    // The exact failure mode: it used to say VERIFIED_COMPLIANT here.
    expect(snapshot.state).not.toBe('VERIFIED_COMPLIANT');
    expect(snapshot.state).toBe('UNSCREENED_EXECUTION_BLOCKED');
    // null, not false — the name is not proven haram, its compliance is UNKNOWN for that period.
    expect(snapshot.verdicts[0].compliant).toBeNull();
  });

  it('never certifies a historical replay from a single-date current C1 sleeve', () => {
    const entries = [entry('ORCL', SPUS_SNAPSHOT)];
    const snapshot = buildC1ShariaRunSnapshot(entries, new Date('2026-08-01T00:00:00.000Z'), '2026-07-18');

    expect(backdatedShariaEvidence(entries, '2026-07-18')).toHaveLength(0);
    expect(snapshot.state).toBe('UNSCREENED_EXECUTION_BLOCKED');
    // UNKNOWN is not a negative verdict: current membership cannot prove historical eligibility.
    expect(snapshot.verdicts[0]).toMatchObject({ compliant: null, sourceAsOf: SPUS_SNAPSHOT });
  });

  it('treats evidence dated exactly on the first decision as valid, not backdated', () => {
    expect(backdatedShariaEvidence([entry('ORCL', '2022-03-01')], '2022-03-01')).toHaveLength(0);
  });

  it('marks every current-sleeve verdict UNKNOWN in a historical replay — never partial certification', () => {
    const entries = [entry('NVDA', '2017-01-01'), entry('ORCL', SPUS_SNAPSHOT)];
    const snapshot = buildC1ShariaRunSnapshot(entries, new Date('2026-07-17T00:00:00.000Z'), '2018-01-02');

    expect(backdatedShariaEvidence(entries, '2018-01-02').map((v) => v.symbol)).toEqual(['ORCL']);
    expect(snapshot.state).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(snapshot.verdicts.map(({ symbol, compliant, sourceAsOf }) => (
      { symbol, compliant, sourceAsOf }
    ))).toEqual([
      { symbol: 'NVDA', compliant: null, sourceAsOf: '2017-01-01' },
      { symbol: 'ORCL', compliant: null, sourceAsOf: SPUS_SNAPSHOT },
    ]);
  });
});
