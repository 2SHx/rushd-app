/**
 * One-purpose capture for L2's bounded Bollinger learning replay.
 *
 * It copies already-ingested REAL Yahoo daily rows into a committed, DB-free fixture. The measured
 * OOS interval is three months; earlier rows are indicator warm-up only. Dates are fixed deliberately
 * so reruns cannot drift into the terminal 2018-01-02..2026-07-10 evidence period.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';
import { NASDAQ_HALAL_UNIVERSE } from '../src/quant/strategies/bollingerMrLongV2';

const WARMUP_START = new Date('2025-01-15T00:00:00.000Z');
const INTERVAL_START = new Date('2025-11-11T00:00:00.000Z');
const INTERVAL_END = new Date('2026-02-11T00:00:00.000Z');
const SYMBOLS = [...NASDAQ_HALAL_UNIVERSE, 'SPUS', 'SPY'];
const OUTPUT = path.join(
  process.cwd(),
  'src',
  'quant',
  'learning',
  'fixtures',
  'bollinger-mr-long-v2.learning-replay-v1.json',
);

async function main(): Promise<void> {
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol: { in: SYMBOLS },
      market: 'NASDAQ',
      interval: 'DAY',
      source: 'YAHOO',
      ts: { gte: WARMUP_START, lte: INTERVAL_END },
    },
    select: { symbol: true, ts: true, open: true, high: true, low: true, close: true, volume: true },
    orderBy: [{ symbol: 'asc' }, { ts: 'asc' }],
  });
  const series = SYMBOLS.map(symbol => ({
    symbol,
    source: 'YAHOO' as const,
    bars: rows.filter(row => row.symbol === symbol).map(row => ([
      row.ts.toISOString(),
      Number(row.open),
      Number(row.high),
      Number(row.low),
      Number(row.close),
      Number(row.volume),
    ])),
  }));
  for (const item of series) {
    const prehistory = item.bars.filter(bar => new Date(String(bar[0])) < INTERVAL_START).length;
    if (prehistory < 200 || item.bars.at(-1)?.[0] !== INTERVAL_END.toISOString()) {
      throw new Error(`insufficient_real_fixture_coverage:${item.symbol}:${prehistory}`);
    }
  }

  const metadata = {
    fixtureVersion: 'bollinger-mr-long-v2.learning-replay.v1',
    capturedAt: new Date().toISOString(),
    market: 'NASDAQ',
    warmupStart: WARMUP_START.toISOString(),
    interval: {
      start: INTERVAL_START.toISOString(),
      end: INTERVAL_END.toISOString(),
      oosStart: INTERVAL_START.toISOString(),
    },
    strategyUniverse: [...NASDAQ_HALAL_UNIVERSE],
    benchmarkSymbols: ['SPUS', 'SPY'],
    sharia: { screened: false, source: 'none' },
  };
  const body = [
    '{',
    ...Object.entries(metadata).map(([key, value]) => (
      `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`
    )),
    '  "series": [',
    ...series.map((item, index) => `    ${JSON.stringify(item)}${index === series.length - 1 ? '' : ','}`),
    '  ]',
    '}',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, body, 'utf8');
  console.log(`captured ${rows.length} REAL Yahoo rows across ${series.length} series → ${OUTPUT}`);
}

void main().finally(() => prisma.$disconnect());
