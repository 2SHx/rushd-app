// R3-3.5 — first-class universe + period selection. Pure resolution/guard logic is tested here
// (no DB): preset date anchoring, universe resolution incl. the wide threshold + fixed-book
// rejection, and report-card tagging.
import { describe, expect, it } from 'vitest';
import {
  FULL_PERIOD_START,
  WIDE_MIN_DAILY_BARS,
  subtractYears,
  resolvePeriodDates,
  resolveUniverseSelection,
  universeUnscreened,
  universeLabel,
  universeCompatibilityForSetup,
  assertUniverseAllowed,
  assertWideRunBounded,
  backtestResultFilename,
  type UniverseSelection,
} from '../../../scripts/backtest';
import { STRATEGY_SETUP_CATALOG } from '../strategies/catalog';
import { assembleReportCard, renderReportCard, type AssembleArgs } from './reportCard';
import type { StrategySetup } from '../strategies/types';

const LATEST = '2026-07-10';

describe('resolvePeriodDates — presets anchored at the latest complete trading date', () => {
  it('explicit --from/--to always wins and tags CUSTOM (latest ignored)', () => {
    expect(resolvePeriodDates('1Y', LATEST, { from: '2020-01-02', to: '2021-01-02' }))
      .toEqual({ from: '2020-01-02', to: '2021-01-02', periodPreset: 'CUSTOM' });
  });

  it('FULL anchors from 2018-01-02 to the latest bar', () => {
    expect(resolvePeriodDates('FULL', LATEST, {}))
      .toEqual({ from: FULL_PERIOD_START, to: LATEST, periodPreset: 'FULL' });
  });

  it('1Y/2Y/3Y subtract whole years from the latest bar', () => {
    expect(resolvePeriodDates('1Y', LATEST, {})).toEqual({ from: '2025-07-10', to: LATEST, periodPreset: '1Y' });
    expect(resolvePeriodDates('2Y', LATEST, {})).toEqual({ from: '2024-07-10', to: LATEST, periodPreset: '2Y' });
    expect(resolvePeriodDates('3Y', LATEST, {})).toEqual({ from: '2023-07-10', to: LATEST, periodPreset: '3Y' });
  });

  it('rejects a partial explicit range, an unknown preset, and no selection at all', () => {
    expect(() => resolvePeriodDates(undefined, LATEST, { from: '2020-01-02' })).toThrow(/BOTH/);
    expect(() => resolvePeriodDates('5Y', LATEST, {})).toThrow(/FULL, 3Y, 2Y, or 1Y/);
    expect(() => resolvePeriodDates(undefined, LATEST, {})).toThrow(/--period/);
  });

  it('a preset without any MarketBar anchor is an explicit, honest failure', () => {
    expect(() => resolvePeriodDates('FULL', null, {})).toThrow(/latest trading date/);
  });

  it('subtractYears is UTC-stable across a leap boundary', () => {
    expect(subtractYears('2024-02-29', 1)).toBe('2023-03-01'); // no Feb-29 in 2023 → normalized
    expect(subtractYears('2026-07-10', 3)).toBe('2023-07-10');
  });
});

describe('resolveUniverseSelection', () => {
  it('defaults to custom with --symbols, halal without, and passes through explicit values', () => {
    expect(resolveUniverseSelection(undefined, ['AAPL'])).toBe('custom');
    expect(resolveUniverseSelection(undefined, null)).toBe('halal');
    expect(resolveUniverseSelection('wide', null)).toBe('wide');
    expect(resolveUniverseSelection('halal', null)).toBe('halal');
  });
  it('rejects an unknown universe token', () => {
    expect(() => resolveUniverseSelection('sp500', null)).toThrow(/halal, wide, or custom/);
  });
});

describe('universe Sharia + labelling', () => {
  it('wide and unscreened custom baskets are unscreened; halal core and all-halal custom are not', () => {
    expect(universeUnscreened('wide', [])).toBe(true);
    expect(universeUnscreened('custom', ['AAPL', 'GME'])).toBe(true); // GME outside halal core
    expect(universeUnscreened('custom', ['AAPL', 'MSFT'])).toBe(false);
    expect(universeUnscreened('halal', [])).toBe(false);
  });
  it('labels a custom basket with its size, else the selection name', () => {
    expect(universeLabel('custom', ['AAPL', 'MSFT', 'NVDA'])).toBe('custom:3-symbols');
    expect(universeLabel('wide', [])).toBe('wide');
    expect(universeLabel('halal', [])).toBe('halal');
  });
});

describe('universeCompatibilityForSetup — declaration wins, else conservative fallback', () => {
  it('reads the declared policy', () => {
    expect(universeCompatibilityForSetup(STRATEGY_SETUP_CATALOG['bollinger-mr-long-v2'])).toBe('any-equities');
    expect(universeCompatibilityForSetup(STRATEGY_SETUP_CATALOG['tom-overlay'])).toBe('fixed');
    expect(universeCompatibilityForSetup(STRATEGY_SETUP_CATALOG['dual-momentum-rotation'])).toBe('fixed');
  });
  it('falls back to halal-only for an undeclared daily setup', () => {
    expect(universeCompatibilityForSetup(STRATEGY_SETUP_CATALOG['bollinger-mr-long'])).toBe('halal-only');
  });
});

const setupStub = (id: string): StrategySetup<unknown> =>
  ({ id } as unknown as StrategySetup<unknown>);

describe('assertUniverseAllowed — declared policy enforcement', () => {
  it('a fixed-book setup rejects ANY override with a clear error but runs its own book untouched', () => {
    expect(() => assertUniverseAllowed(setupStub('tom-overlay'), 'fixed', 'wide', [], true))
      .toThrow(/fixed research book/);
    expect(() => assertUniverseAllowed(setupStub('tom-overlay'), 'fixed', 'halal', [], false)).not.toThrow();
  });
  it('a halal-only setup rejects wide and unscreened custom baskets, accepts all-halal custom', () => {
    expect(() => assertUniverseAllowed(setupStub('x'), 'halal-only', 'wide', [], true)).toThrow(/halal-only/);
    expect(() => assertUniverseAllowed(setupStub('x'), 'halal-only', 'custom', ['AAPL', 'GME'], true)).toThrow(/GME/);
    expect(() => assertUniverseAllowed(setupStub('x'), 'halal-only', 'custom', ['AAPL', 'MSFT'], true)).not.toThrow();
  });
  it('an any-equities setup accepts wide and unscreened custom', () => {
    expect(() => assertUniverseAllowed(setupStub('x'), 'any-equities', 'wide', [], true)).not.toThrow();
    expect(() => assertUniverseAllowed(setupStub('x'), 'any-equities', 'custom', ['GME'], true)).not.toThrow();
  });
});

describe('assertWideRunBounded — guard against accidental multi-hour wide runs', () => {
  const cases: [UniverseSelection, Parameters<typeof assertWideRunBounded>[1], boolean, boolean, boolean][] = [
    ['wide', 'FULL', false, false, true], // FULL + no confirm ⇒ blocked
    ['wide', '3Y', false, false, true], // 3Y + no confirm ⇒ blocked
    ['wide', '1Y', false, false, false], // 1Y ⇒ allowed
    ['wide', 'CUSTOM', true, false, false], // explicit dates ⇒ allowed
    ['wide', 'FULL', false, true, false], // --confirm-full ⇒ allowed
    ['halal', 'FULL', false, false, false], // non-wide ⇒ never blocked
  ];
  it.each(cases)('%s / %s explicit=%s confirm=%s blocked=%s', (sel, preset, explicit, confirm, blocked) => {
    const run = () => assertWideRunBounded(sel, preset, explicit, confirm);
    if (blocked) expect(run).toThrow(/requires --period 1Y/);
    else expect(run).not.toThrow();
  });
});

describe('backtestResultFilename — universe token prevents artifact collisions', () => {
  it('halal/fixed keep the historical name; wide + custom get a universe suffix', () => {
    expect(backtestResultFilename('s', '2025-07-10', '2026-07-10', undefined, 'halal'))
      .toBe('s-2025-07-10-2026-07-10.json');
    expect(backtestResultFilename('s', '2025-07-10', '2026-07-10', undefined, 'wide'))
      .toBe('s-2025-07-10-2026-07-10-wide.json');
    expect(backtestResultFilename('s', '2025-07-10', '2026-07-10', undefined, 'custom:3-symbols'))
      .toBe('s-2025-07-10-2026-07-10-custom_3_symbols.json');
  });
});

describe('report card carries the universe + periodPreset tags', () => {
  const base = (override: Partial<AssembleArgs>): AssembleArgs => ({
    setup: 'team', symbols: ['AAPL'], from: '2025-07-10', to: '2026-07-10', dataFeed: 'yahoo-daily',
    seed: 42, gitSha: 'abc1234',
    full: { cagr: 0.1, sharpe: 1, deflatedSharpe: 0.9, maxDrawdown: 0.1, hitRate: 0.5, trades: 30, turnover: 3, implausible: false },
    oos: { cagr: 0.1, sharpe: 1, deflatedSharpe: 0.9, maxDrawdown: 0.1, hitRate: 0.5, trades: 10, turnover: 1, implausible: false },
    distribution: { count: 10, mean: 0, std: 0.01, min: -0.01, max: 0.01, probDayGe5pct: 0, probDayLe5pct: 0 },
    bootstrap: { resamples: 1000, tradesPerPath: 30, finalEquity: { p5: 90, p50: 110, p95: 130 }, maxDrawdown: { p5: 0.05, p50: 0.1, p95: 0.2 }, riskOfRuin: 0 },
    permutation: { permutations: 1000, observedMean: 0.01, pValue: 0.01 },
    kellyFraction: 0.1, kellyClampedQty: 1, oosFraction: 0.3, drawdownBreakerPct: 0.3,
    ...override,
  });

  it('defaults are honest (custom/CUSTOM) and explicit tags flow to the card + render', () => {
    const dflt = assembleReportCard(base({}));
    expect(dflt.universe).toBe('custom');
    expect(dflt.periodPreset).toBe('CUSTOM');

    const tagged = assembleReportCard(base({ universe: 'wide', periodPreset: '1Y' }));
    expect(tagged.universe).toBe('wide');
    expect(tagged.periodPreset).toBe('1Y');
    const rendered = renderReportCard(tagged, false);
    expect(rendered).toContain('universe=wide  periodPreset=1Y');
    expect(rendered).toContain('EVIDENCE VIEW only'); // non-FULL preset caveat
  });

  it('the wide threshold is pinned so the CLI + tests agree', () => {
    expect(WIDE_MIN_DAILY_BARS).toBe(20);
  });
});
