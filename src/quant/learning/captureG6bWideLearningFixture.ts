import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { prisma } from '@/lib/prisma';

const SOURCE_RUN_ID = '26f5f132-6bdf-48be-9ad9-2d370642ef53';
const EXPECTED_SETUP_ID = 'g6b-linear-factor-wide';
const EXPECTED_UNIVERSE_SIZE = 2_473;
const DAY_MS = 86_400_000;
const WARMUP_START = new Date('2023-08-01T00:00:00.000Z');
const START = new Date('2024-11-01T00:00:00.000Z');
const END = new Date('2024-12-31T23:59:59.999Z');

function flag(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

async function main(): Promise<void> {
  if (END.getTime() - START.getTime() > 184 * DAY_MS) throw new Error('learning fixture exceeds six months');
  const fixtureVersion = flag('fixture-version');
  const output = path.resolve(flag('output'));
  const fixtureDir = path.resolve(process.cwd(), 'src/quant/learning/fixtures');
  if (path.dirname(output) !== fixtureDir || !output.endsWith('.json.gz')) {
    throw new Error('wide learning fixture output must be a .json.gz in the fixture directory');
  }
  const run = await prisma.backtestRun.findUniqueOrThrow({
    where: { id: SOURCE_RUN_ID },
    select: { metrics: true },
  });
  const metrics = run.metrics as {
    setup?: unknown;
    sharia?: { verdicts?: Array<{ symbol?: unknown }> };
  };
  if (metrics.setup !== EXPECTED_SETUP_ID) throw new Error('wide learning source run setup mismatch');
  const strategyUniverse = (metrics.sharia?.verdicts ?? [])
    .map(verdict => verdict.symbol)
    .filter((symbol): symbol is string => typeof symbol === 'string')
    .sort();
  if (strategyUniverse.length !== EXPECTED_UNIVERSE_SIZE
    || new Set(strategyUniverse).size !== EXPECTED_UNIVERSE_SIZE) {
    throw new Error('wide learning source run universe mismatch');
  }
  const series = [];
  for (const symbol of strategyUniverse) {
    const rows = await prisma.marketBar.findMany({
      where: {
        symbol,
        market: 'NASDAQ',
        interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] },
        ts: { gte: WARMUP_START, lte: END },
      },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
      orderBy: { ts: 'asc' },
    });
    if (rows.length < 2) throw new Error(`wide learning history missing for ${symbol}`);
    const sources = new Set(rows.map(row => row.source));
    if (sources.size !== 1) throw new Error(`wide learning source changes within ${symbol}`);
    series.push({
      symbol,
      source: rows[0].source,
      bars: rows.map(row => [
        row.ts.toISOString(),
        Number(row.open),
        Number(row.high),
        Number(row.low),
        Number(row.close),
        Number(row.volume),
      ]),
    });
  }
  for (const symbol of ['SPUS', 'SPY'] as const) {
    if (strategyUniverse.includes(symbol)) continue;
    const rows = await prisma.marketBar.findMany({
      where: {
        symbol,
        market: 'NASDAQ',
        interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] },
        ts: { gte: WARMUP_START, lte: END },
      },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
      orderBy: { ts: 'asc' },
    });
    if (rows.length < 2) throw new Error(`wide learning benchmark missing for ${symbol}`);
    series.push({
      symbol,
      source: rows[0].source,
      bars: rows.map(row => [
        row.ts.toISOString(),
        Number(row.open),
        Number(row.high),
        Number(row.low),
        Number(row.close),
        Number(row.volume),
      ]),
    });
  }
  const fixture = {
    fixtureVersion,
    capturedAt: new Date().toISOString(),
    market: 'NASDAQ',
    warmupStart: WARMUP_START.toISOString(),
    interval: { start: START.toISOString(), end: END.toISOString(), oosStart: START.toISOString() },
    strategyUniverse,
    benchmarkSymbols: ['SPUS', 'SPY'],
    sharia: { screened: false, source: 'none' },
    series,
  };
  const encoded = JSON.stringify(fixture);
  fs.writeFileSync(output, gzipSync(encoded, { level: 9 }));
  console.log(JSON.stringify({
    sourceRunId: SOURCE_RUN_ID,
    universeSize: strategyUniverse.length,
    universeHash: createHash('sha256').update(strategyUniverse.join('\n')).digest('hex'),
    bars: series.reduce((sum, item) => sum + item.bars.length, 0),
    compressedBytes: fs.statSync(output).size,
  }));
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
