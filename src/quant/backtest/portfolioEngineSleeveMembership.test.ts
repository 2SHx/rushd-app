// QDR-11 (G9-PIT): the engine-side half of rolling point-in-time sleeve re-formation.
// The schedule itself is tested in src/quant/universe/pitSleeveSchedule.test.ts; this file proves
// the engine HONOURS it — and, just as load-bearing, that a setup which declares no schedule is
// completely unaffected, since every published terminal card depends on that.
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  simulateStrategyBook,
  type StrategyBookBar,
  type StrategyBookPolicy,
  type StrategyBookSeries,
} from './portfolioEngine';
import { sleeveMembershipResolver } from '../universe/pitSleeveSchedule';
import type { RiskLimits } from '../risk/envelope';
import type { StrategyPointInTimeContext, StrategySetup } from '../strategies/types';
import type { AnalystSignal } from '../types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2024-01-02T00:00:00.000Z').getTime();
const SESSIONS = 12;

const LIMITS: RiskLimits = {
  maxNameWeight: 1, maxGrossExposure: 10, maxOpenPositions: 6,
  maxRiskPct: 100, volTargetPct: 100, liquidityAdvFraction: 1, drawdownHaltPct: 1,
};

function bars(): StrategyBookBar[] {
  return Array.from({ length: SESSIONS }, (_, i) => ({
    ts: new Date(BASE + i * DAY),
    open: new D(100 + i), high: new D(101 + i), low: new D(99 + i), close: new D(100 + i),
    volume: new D(1_000_000), source: 'YAHOO' as const,
  }));
}

const series = (symbol: string): StrategyBookSeries => ({ symbol, market: 'NASDAQ', bars: bars() });
const BOOK = ['AAA', 'BBB', 'CCC'].map(series);

function signal(ctx: StrategyPointInTimeContext): AnalystSignal {
  return {
    agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: '', rationaleAr: '',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  };
}

function setup(
  overrides: Partial<Pick<StrategySetup<undefined>, 'entry' | 'exit' | 'targetWeight'>> = {},
): StrategySetup<undefined> {
  return {
    id: 'sleeve-membership-test', version: 'v1', cadence: 'daily', defaultParams: undefined,
    screen: () => ({ matched: true, reasons: [], evidence: [] }),
    entry: () => ({ matched: true, reasons: ['entry'], evidence: [], sizeFraction: 0.2 }),
    exit: () => ({ matched: false, reasons: [], evidence: [] }),
    signal,
    ...overrides,
  };
}

function run(
  testSetup: StrategySetup<undefined> = setup(),
  policy?: StrategyBookPolicy,
  bookSeries: readonly StrategyBookSeries[] = BOOK,
  tradeFrom?: Date,
) {
  return simulateStrategyBook({
    setup: testSetup, series: bookSeries, startingCash: new D(100_000), limits: LIMITS, policy, tradeFrom,
  });
}

/** CCC is dropped from the sleeve at the mid-run re-formation; AAA/BBB persist. */
const MIDPOINT = BASE + 6 * DAY;
const membership = (ts: Date): ReadonlySet<string> =>
  new Set(ts.getTime() < MIDPOINT ? ['AAA', 'BBB', 'CCC'] : ['AAA', 'BBB']);

const BASE_POLICY: StrategyBookPolicy = { maxOpenPositions: 6 };

describe('sleeveMembership is opt-in and inert when absent', () => {
  it('an absent schedule is indistinguishable from an all-inclusive one', () => {
    const withoutHook = run(setup(), BASE_POLICY);
    const withNoOpHook = run(setup(), { ...BASE_POLICY, sleeveMembership: () => new Set(['AAA', 'BBB', 'CCC']) });

    expect(withNoOpHook.fills.map((f) => [f.ts.getTime(), f.symbol, f.action, f.qty.toString()]))
      .toEqual(withoutHook.fills.map((f) => [f.ts.getTime(), f.symbol, f.action, f.qty.toString()]));
    expect(withNoOpHook.daily.at(-1)!.nav.toString()).toBe(withoutHook.daily.at(-1)!.nav.toString());
    expect(withNoOpHook.decisionWindows).toBe(withoutHook.decisionWindows);
  });

  it('a restricted schedule DOES change the book — otherwise the test above proves nothing', () => {
    const unrestricted = run(setup(), BASE_POLICY);
    const restricted = run(setup(), { ...BASE_POLICY, sleeveMembership: membership });

    expect(restricted.daily.at(-1)!.nav.toString()).not.toBe(unrestricted.daily.at(-1)!.nav.toString());
    expect(unrestricted.daily.at(-1)!.positions.map((p) => p.symbol)).toContain('CCC');
    expect(restricted.daily.at(-1)!.positions.map((p) => p.symbol)).not.toContain('CCC');
  });
});

describe('an out-of-sleeve name is never consulted', () => {
  it('the setup is not asked about a name outside the epoch, in either decision path', () => {
    const entry = vi.fn((_ctx: StrategyPointInTimeContext) => (
      { matched: true, reasons: ['entry'], evidence: [], sizeFraction: 0.2 }
    ));
    const exit = vi.fn((_ctx: StrategyPointInTimeContext) => ({ matched: false, reasons: [], evidence: [] }));
    run(setup({ entry, exit }), { ...BASE_POLICY, sleeveMembership: membership });

    const asked = [...entry.mock.calls, ...exit.mock.calls].map(([ctx]) => ctx);
    const consulted = asked.map((ctx) => ctx.symbol);
    const afterDrop = asked.filter((ctx) => ctx.asOf.getTime() >= MIDPOINT).map((ctx) => ctx.symbol);

    expect(consulted).toContain('CCC');     // eligible in the first epoch
    expect(afterDrop).not.toContain('CCC'); // and silent thereafter
    expect(afterDrop).toContain('AAA');
  });

  it('an ineligible name cannot influence the book even by declining to trade', () => {
    // This setup would hold CCC forever if it were still being asked. The single SELL therefore has
    // exactly one possible author — the membership filter — and `exit` is never consulted for CCC
    // after the drop, so a forced exit can never be confused with the setup's own.
    const exit = vi.fn((ctx: StrategyPointInTimeContext) => (
      { matched: ctx.symbol === 'AAA', reasons: ['exit'], evidence: [] }
    ));
    const result = run(setup({ exit }), { ...BASE_POLICY, sleeveMembership: membership });

    const cccExits = result.fills.filter((f) => f.symbol === 'CCC' && f.action === 'SELL');
    expect(cccExits).toHaveLength(1);
    expect(cccExits[0].signalTs.getTime()).toBe(MIDPOINT);
    expect(exit.mock.calls
      .map(([ctx]) => ctx)
      .filter((ctx) => ctx.symbol === 'CCC' && ctx.asOf.getTime() >= MIDPOINT)).toHaveLength(0);
  });
});

describe('leaving the sleeve liquidates, it does not merely stop buying', () => {
  it('exits an inherited position at the next open after the re-formation', () => {
    const result = run(setup(), { ...BASE_POLICY, sleeveMembership: membership });
    const exit = result.fills.find((f) => f.symbol === 'CCC' && f.action === 'SELL');

    expect(exit).toBeDefined();
    expect(exit!.ts.getTime()).toBe(MIDPOINT + DAY); // signalled at the drop close, filled next open
    expect(exit!.signalTs.getTime()).toBe(MIDPOINT);
    expect(result.daily.at(-1)!.positions.find((p) => p.symbol === 'CCC')).toBeUndefined();
  });

  it('a target-weight book exits via weight 0, keeping the sizing path intact', () => {
    const targetWeight = (ctx: StrategyPointInTimeContext) => (ctx.symbol === 'CCC' ? 0.3 : 0.2);
    const result = run(setup({ targetWeight }), { ...BASE_POLICY, sleeveMembership: membership });

    const cccFills = result.fills.filter((f) => f.symbol === 'CCC');
    expect(cccFills.some((f) => f.action === 'BUY')).toBe(true);
    expect(cccFills.at(-1)!.action).toBe('SELL');
    expect(result.daily.at(-1)!.positions.find((p) => p.symbol === 'CCC')).toBeUndefined();
    // and the surviving names are still sized by the setup, not flattened alongside it
    expect(result.daily.at(-1)!.positions.map((p) => p.symbol).sort()).toEqual(['AAA', 'BBB']);
  });

  it('does not churn a name that stays in the sleeve', () => {
    const result = run(setup(), { ...BASE_POLICY, sleeveMembership: membership });
    expect(result.fills.filter((f) => f.symbol === 'AAA' && f.action === 'SELL')).toHaveLength(0);
  });
});

describe('engine-managed ballast is exempt', () => {
  it('idle ballast is swept normally even though it is in no sleeve epoch', () => {
    const withBallast = [...BOOK, series('SPSK')];
    const result = run(setup(), {
      ...BASE_POLICY,
      idleBallastSymbol: 'SPSK',
      sleeveMembership: membership, // deliberately never lists SPSK
    }, withBallast);

    expect(result.ballastFills.length).toBeGreaterThan(0);
    expect(result.fills.some((f) => f.symbol === 'SPSK')).toBe(false); // never a sleeve trade
  });
});

describe('wired through the real schedule resolver', () => {
  const sessionCalendar = Array.from({ length: SESSIONS }, (_, i) => new Date(BASE + i * DAY));

  const buildSchedule = async (tradeFrom: Date) => {
    const { buildPitSleeveSchedule } = await import('../universe/pitSleeveSchedule');
    return buildPitSleeveSchedule({
      rule: 'correlation-balanced',
      sessions: sessionCalendar,
      tradeFrom,
      // Formations land at sessions 0, 3, 6, 9. The one at session 6 drops CCC and governs
      // sessions 7..11, so the drop has real sessions to liquidate into — a re-formation on the
      // final session would govern nothing and could not demonstrate anything.
      formationCadenceSessions: 3,
      form: async (formationAt) => ({
        symbols: formationAt.getTime() < MIDPOINT ? ['AAA', 'BBB', 'CCC'] : ['AAA', 'BBB'],
      }),
    });
  };

  it('a schedule-derived resolver drives the engine end to end', async () => {
    const tradeFrom = sessionCalendar[1];
    const schedule = await buildSchedule(tradeFrom);

    expect(schedule.epochs.length).toBeGreaterThan(1);
    expect(schedule.unionSymbols).toEqual(['AAA', 'BBB', 'CCC']);

    const result = run(
      setup(),
      { ...BASE_POLICY, sleeveMembership: sleeveMembershipResolver(schedule) },
      BOOK,
      tradeFrom, // the book may not trade before its first PIT-formed sleeve exists
    );
    expect(result.daily.at(-1)!.positions.map((p) => p.symbol)).not.toContain('CCC');
  });

  it('a book that trades BEFORE its first formed sleeve aborts the run, never trades unscreened', async () => {
    // Caught on first contact when this suite was written: the engine decided on session 0 while
    // the schedule's coverage began at session 1. A silent empty set there would have traded an
    // unformed sleeve; the resolver fail-closes instead, so the misalignment cannot ship.
    const schedule = await buildSchedule(sessionCalendar[1]);
    expect(() => run(
      setup(),
      { ...BASE_POLICY, sleeveMembership: sleeveMembershipResolver(schedule) },
      BOOK,
      sessionCalendar[0], // one session too early
    )).toThrow(/MEMBERSHIP_COVERAGE_MISSING/);
  });
});
