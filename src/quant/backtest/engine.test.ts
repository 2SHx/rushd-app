import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
    backtestRun: { create: vi.fn() },
  },
}));
vi.mock('@/services/marketData', () => ({
  registry: {
    getScreener: () => ({
      screen: async (symbol: string) => ({
        symbol,
        compliant: true,
        standard: 'AAOIFI',
        source: 'zoya',
        asOf: new Date(),
      }),
    }),
  },
}));

import { prisma } from '@/lib/prisma';
import { simulate, runBacktest, buildBacktestContext, type BacktestBar } from './engine';
import { LookaheadError } from '../data/pointInTime';
import type { Analyst, AnalystSignal, Stance } from '../types';

const D = Prisma.Decimal;
const BASE = new Date('2026-01-01T00:00:00.000Z');
const day = (i: number) => new Date(BASE.getTime() + i * 86_400_000);

// This unit injects a current, verified Zoya verdict; production mock verdicts fail closed.
const SYMBOL = 'MSFT';

function bars(n: number, priceAt: (i: number) => number): BacktestBar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = priceAt(i);
    const o = i === 0 ? c : priceAt(i - 1);
    return {
      ts: day(i),
      open: new D(o.toFixed(4)),
      high: new D((Math.max(o, c) + 1).toFixed(4)),
      low: new D((Math.min(o, c) - 1).toFixed(4)),
      close: new D(c.toFixed(4)),
      volume: new D(1_000_000),
    };
  });
}

function fakeAnalyst(stance: Stance, conviction: number): Analyst {
  return {
    agent: 'QUANT_CORE',
    async run(ctx): Promise<AnalystSignal> {
      return {
        agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
        stance, conviction, horizonDays: 30, rationaleEn: 'x', rationaleAr: 'ص',
        evidence: [{ kind: 'feature', ref: 'r', value: 'v' }],
        determinism: 'deterministic', failureMode: 'ok', costCents: 0,
      };
    },
  };
}

describe('simulate', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('buys into a sustained uptrend and grows equity', async () => {
    const res = await simulate({
      symbol: SYMBOL, market: 'NASDAQ' as any,
      bars: bars(75, (i) => 100 + i), startingCash: new D(100_000),
      analysts: [fakeAnalyst('BULLISH', 0.8)],
    });
    expect(res.trades).toBeGreaterThan(0);
    const c = res.equityCurve;
    expect(c[c.length - 1].equity).toBeGreaterThan(c[0].equity);
  });

  it('holds (no trades) when the committee is neutral', async () => {
    const res = await simulate({
      symbol: SYMBOL, market: 'NASDAQ' as any,
      bars: bars(75, (i) => 100 + i), startingCash: new D(100_000),
      analysts: [fakeAnalyst('NEUTRAL', 0.5)],
    });
    expect(res.trades).toBe(0);
  });

  it('is deterministic — same bars + analysts ⇒ identical equity curve', async () => {
    const input = {
      symbol: SYMBOL, market: 'NASDAQ' as any,
      bars: bars(75, (i) => 100 + Math.sin(i / 4) * 5 + i * 0.5),
      startingCash: new D(100_000), analysts: [fakeAnalyst('BULLISH', 0.7)],
    };
    const a = await simulate(input);
    const b = await simulate(input);
    expect(a).toEqual(b);
  });
});

describe('no-look-ahead guard', () => {
  it('throws if a bar dated after asOf is in the context slice', () => {
    const asOf = day(10);
    const good = bars(11, (i) => 100 + i); // ts day(0..10), all ≤ asOf
    expect(() => buildBacktestContext(SYMBOL, 'NASDAQ' as any, good, asOf)).not.toThrow();
    const leaked = [...good, { ...good[0], ts: day(20) }]; // a future bar sneaks in
    expect(() => buildBacktestContext(SYMBOL, 'NASDAQ' as any, leaked, asOf)).toThrow(LookaheadError);
  });
});

describe('runBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
    const rows = bars(66, (i) => 100 + i).map((b, i) => ({ id: String(i), symbol: SYMBOL, market: 'NASDAQ', interval: 'DAY', source: 'MOCK', createdAt: BASE, ...b }));
    (prisma.marketBar.findMany as any).mockResolvedValue(rows);
    (prisma.backtestRun.create as any).mockResolvedValue({ id: 'bt-1' });
  });

  it('persists a BacktestRun with the surrogate id, seed, and full+oos metrics', async () => {
    const res = await runBacktest({ symbol: SYMBOL, market: 'NASDAQ' as any, fromDate: day(0), toDate: day(66) });
    expect(res.backtestRunId).toBe('bt-1');
    const data = (prisma.backtestRun.create as any).mock.calls[0][0].data;
    expect(data.pmSurrogateId).toBe('det-conviction-v1');
    expect(typeof data.seed).toBe('number');
    expect(data.metrics).toHaveProperty('full');
    expect(data.metrics).toHaveProperty('oos');
    expect(data.symbol).toBe(SYMBOL);
  });
});
