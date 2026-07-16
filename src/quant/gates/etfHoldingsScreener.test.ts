import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CompositeShariaScreener,
  isCompositeSourceUsable,
  isEtfHoldingsSnapshotUsable,
  isSaudiListSnapshotUsable,
  type EtfHoldingsSnapshot,
  type SaudiShariaListSnapshot,
} from './etfHoldingsScreener';
import { evaluateShariaGate, isRealShariaSourceConfigured } from './sharia';
import { deriveShariaState } from '../backtest/shariaSnapshot';
import { ProviderRegistry } from '@/services/marketData';

const FIXTURE_ETF: EtfHoldingsSnapshot = {
  asOf: '2026-07-16',
  funds: {
    SPUS: ['AAPL', 'NVDA', 'MSFT'],
    HLAL: ['GOOGL'],
  },
};

const FIXTURE_SAUDI: SaudiShariaListSnapshot = {
  asOf: '2026-06-30',
  publisher: 'Fixture Publisher',
  symbols: ['2222', '1120'],
};

const EMPTY_ETF: EtfHoldingsSnapshot = { asOf: null, funds: { SPUS: [], HLAL: [] } };
const EMPTY_SAUDI: SaudiShariaListSnapshot = { asOf: null, publisher: null, symbols: [] };

describe('CompositeShariaScreener — US ETF-holdings membership', () => {
  it('SPUS membership ⇒ compliant true, source etf-holdings, dated asOf', async () => {
    const screener = new CompositeShariaScreener(FIXTURE_ETF, EMPTY_SAUDI);
    const verdict = await screener.screen('AAPL', 'NASDAQ');
    expect(verdict).toMatchObject({ compliant: true, source: 'etf-holdings', standard: 'AAOIFI' });
    expect(verdict.asOf.toISOString().slice(0, 10)).toBe('2026-07-16');
  });

  it('HLAL-only membership also ⇒ compliant true, source etf-holdings (union of funds)', async () => {
    const screener = new CompositeShariaScreener(FIXTURE_ETF, EMPTY_SAUDI);
    const verdict = await screener.screen('GOOGL', 'NASDAQ');
    expect(verdict).toMatchObject({ compliant: true, source: 'etf-holdings' });
  });

  it('absence from both funds ⇒ compliant NULL (unknown), never a fabricated false', async () => {
    const screener = new CompositeShariaScreener(FIXTURE_ETF, EMPTY_SAUDI);
    const verdict = await screener.screen('TSLA', 'NASDAQ');
    expect(verdict.compliant).toBeNull();
    expect(verdict.source).toBe('none');
  });
});

describe('CompositeShariaScreener — TASI routing via the Saudi Sharia-list snapshot', () => {
  it('routes .SR symbols to the Saudi list and normalizes the suffix', async () => {
    const screener = new CompositeShariaScreener(EMPTY_ETF, FIXTURE_SAUDI);
    const verdict = await screener.screen('2222.SR', 'TASI');
    expect(verdict).toMatchObject({ compliant: true, source: 'saudi-sharia-list' });
    expect(verdict.asOf.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('routes bare numeric TASI symbols too', async () => {
    const screener = new CompositeShariaScreener(EMPTY_ETF, FIXTURE_SAUDI);
    const verdict = await screener.screen('1120', 'TASI');
    expect(verdict.compliant).toBe(true);
  });

  it('TASI symbol absent from the list ⇒ compliant NULL, never false', async () => {
    const screener = new CompositeShariaScreener(EMPTY_ETF, FIXTURE_SAUDI);
    const verdict = await screener.screen('9999.SR', 'TASI');
    expect(verdict.compliant).toBeNull();
    expect(verdict.source).toBe('none');
  });

  it('never falls through to the US ETF snapshot for a TASI symbol', async () => {
    const screener = new CompositeShariaScreener(
      { asOf: '2026-07-16', funds: { SPUS: ['2222'], HLAL: [] } },
      EMPTY_SAUDI,
    );
    const verdict = await screener.screen('2222.SR', 'TASI');
    expect(verdict.compliant).toBeNull();
    expect(verdict.source).toBe('none');
  });
});

describe('empty/unseeded snapshots — honest not_covered, never screened', () => {
  it('every symbol resolves to not_covered when both snapshots are empty', async () => {
    const screener = new CompositeShariaScreener(EMPTY_ETF, EMPTY_SAUDI);
    const us = await screener.screen('AAPL', 'NASDAQ');
    const tasi = await screener.screen('2222.SR', 'TASI');
    expect(us).toMatchObject({ compliant: null, source: 'none' });
    expect(tasi).toMatchObject({ compliant: null, source: 'none' });
  });

  it('isEtfHoldingsSnapshotUsable / isSaudiListSnapshotUsable / isCompositeSourceUsable are false for empty snapshots', () => {
    expect(isEtfHoldingsSnapshotUsable(EMPTY_ETF)).toBe(false);
    expect(isSaudiListSnapshotUsable(EMPTY_SAUDI)).toBe(false);
    expect(isCompositeSourceUsable(EMPTY_ETF, EMPTY_SAUDI)).toBe(false);
  });

  it('are true once a snapshot carries real, dated data', () => {
    expect(isEtfHoldingsSnapshotUsable(FIXTURE_ETF)).toBe(true);
    expect(isSaudiListSnapshotUsable(FIXTURE_SAUDI)).toBe(true);
    expect(isCompositeSourceUsable(EMPTY_ETF, FIXTURE_SAUDI)).toBe(true);
  });
});

describe('isRealShariaSourceConfigured — composite opt-in', () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ZOYA_API_KEY;
    delete process.env.SHARIA_SOURCE;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('stays false by default (byte-identical keyless behavior)', () => {
    expect(isRealShariaSourceConfigured()).toBe(false);
  });

  it('stays false for SHARIA_SOURCE=composite when the bundled snapshots are actually empty', () => {
    // Regression guard for the real bundled files: if both are unseeded, composite must not
    // be presented as "real" just because the env flag is set.
    process.env.SHARIA_SOURCE = 'composite';
    // We can't safely assert this without knowing the bundled files' state, so just assert
    // the flag alone is insufficient — i.e. it must agree with isCompositeSourceUsable().
    expect(isRealShariaSourceConfigured()).toBe(isCompositeSourceUsable());
  });

  it('Zoya (live + key) still counts as real regardless of SHARIA_SOURCE', () => {
    process.env.MARKET_DATA_MODE = 'live';
    process.env.ZOYA_API_KEY = 'key';
    expect(isRealShariaSourceConfigured()).toBe(true);
  });
});

describe('ProviderRegistry.getScreener — composite opt-in wiring', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns MockScreener by default (no SHARIA_SOURCE set)', () => {
    delete process.env.SHARIA_SOURCE;
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ZOYA_API_KEY;
    expect(new ProviderRegistry().getScreener().constructor.name).toBe('MockScreener');
  });

  it('returns CompositeShariaScreener when SHARIA_SOURCE=composite', () => {
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ZOYA_API_KEY;
    process.env.SHARIA_SOURCE = 'composite';
    expect(new ProviderRegistry().getScreener()).toBeInstanceOf(CompositeShariaScreener);
  });

  it('Zoya still wins over composite when both are configured', () => {
    process.env.MARKET_DATA_MODE = 'live';
    process.env.ZOYA_API_KEY = 'key';
    process.env.SHARIA_SOURCE = 'composite';
    expect(new ProviderRegistry().getScreener().constructor.name).toBe('ZoyaAdapter');
  });
});

describe('deriveShariaState integration — mixed composite verdicts stay fail-closed', () => {
  it('a mix of etf-holdings compliant + not_covered UNKNOWN yields UNSCREENED_EXECUTION_BLOCKED (incomplete coverage, never a fabricated non-compliance)', async () => {
    const screener = new CompositeShariaScreener(FIXTURE_ETF, EMPTY_SAUDI);
    const verdicts = await Promise.all(
      ['AAPL', 'TSLA'].map(async (symbol) => {
        const v = await screener.screen(symbol, 'NASDAQ');
        return { compliant: v.compliant };
      }),
    );
    // AAPL is compliant (etf-holdings); TSLA is UNKNOWN (not covered) — the run's coverage is
    // incomplete, so it stays blocked exactly like unscreened, rather than asserting TSLA failed.
    expect(deriveShariaState(true, verdicts)).toBe('UNSCREENED_EXECUTION_BLOCKED');
  });

  it('all-covered-and-compliant symbols yield VERIFIED_COMPLIANT', async () => {
    const screener = new CompositeShariaScreener(FIXTURE_ETF, FIXTURE_SAUDI);
    const verdicts = await Promise.all(
      ['AAPL', '2222.SR'].map(async (symbol, i) => {
        const v = await screener.screen(symbol, i === 0 ? 'NASDAQ' : 'TASI');
        return { compliant: v.compliant };
      }),
    );
    expect(deriveShariaState(true, verdicts)).toBe('VERIFIED_COMPLIANT');
  });

  it('evaluateShariaGate folds an UNKNOWN verdict into a fail-closed veto with an honest reason', async () => {
    const screener = new CompositeShariaScreener(EMPTY_ETF, EMPTY_SAUDI);
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ' as any, screener);
    expect(gate.compliant).toBe(false);
    expect(gate.reason).toBe('not_covered_by_free_sources');
    expect(gate.source).toBe('none');
  });
});
