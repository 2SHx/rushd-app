import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

const DAY_MS = 86_400_000;
const WARMUP_START = new Date('2025-01-15T00:00:00.000Z');
const START = new Date('2025-11-11T00:00:00.000Z');
const END = new Date('2026-02-11T00:00:00.000Z');

function flag(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

async function main(): Promise<void> {
  if (END.getTime() - START.getTime() > 184 * DAY_MS) throw new Error('learning fixture exceeds six months');
  const fixtureVersion = flag('fixture-version');
  const strategyUniverse = flag('symbols').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  const output = path.resolve(flag('output'));
  const fixtureDir = path.resolve(process.cwd(), 'src/quant/learning/fixtures');
  if (path.dirname(output) !== fixtureDir) throw new Error('learning fixture output must stay in the fixture directory');
  const symbols = Array.from(new Set([...strategyUniverse, 'SPUS', 'SPY']));
  const series = [];
  for (const symbol of symbols) {
    const rows = await prisma.marketBar.findMany({
      where: {
        symbol, market: 'NASDAQ', interval: 'DAY',
        ts: { gte: WARMUP_START, lte: END }, source: { in: ['YAHOO', 'ALPACA'] },
      },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
      orderBy: { ts: 'asc' },
    });
    if (rows.length < 2) throw new Error(`missing captured-real daily history for ${symbol}`);
    const sources = new Set(rows.map(row => row.source));
    if (sources.size !== 1) throw new Error(`mixed sources for ${symbol}`);
    series.push({
      symbol,
      source: rows[0].source,
      bars: rows.map(row => [
        row.ts.toISOString(), Number(row.open), Number(row.high), Number(row.low),
        Number(row.close), Number(row.volume),
      ]),
    });
  }
  fs.writeFileSync(output, `${JSON.stringify({
    fixtureVersion,
    capturedAt: new Date().toISOString(),
    market: 'NASDAQ',
    warmupStart: WARMUP_START.toISOString(),
    interval: { start: START.toISOString(), end: END.toISOString(), oosStart: START.toISOString() },
    strategyUniverse,
    benchmarkSymbols: ['SPUS', 'SPY'],
    sharia: { screened: false, source: 'none' },
    series,
  })}\n`);
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
