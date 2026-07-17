import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { STOCKS_IN_PLAY_ORB_V1, STOCKS_IN_PLAY_UNIVERSE_V1 } from '../strategies/stocksInPlayOrb';

const DAY_MS = 86_400_000;
const WARMUP_START = new Date('2024-07-01T00:00:00.000Z');
const MINUTE_WARMUP_START = new Date('2024-08-05T00:00:00.000Z');
const START = new Date('2024-08-29T00:00:00.000Z');
const END = new Date('2024-08-30T23:59:59.999Z');

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
  if (path.dirname(output) !== fixtureDir) throw new Error('learning fixture output must stay in the fixture directory');
  const strategyUniverse = [...STOCKS_IN_PLAY_UNIVERSE_V1];
  const minuteSeries = [];
  const dailySeries = [];
  for (const symbol of strategyUniverse) {
    const minutes = await prisma.intradayBar.findMany({
      where: { symbol, market: 'NASDAQ', ts: { gte: MINUTE_WARMUP_START, lte: END }, source: 'ALPACA' },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, session: true, source: true },
      orderBy: { ts: 'asc' },
    });
    if (minutes.length < 2) throw new Error(`missing ALPACA minute history for ${symbol}`);
    const necessaryMinutes = minutes.filter(row => row.ts >= START || (
      row.session === 'REGULAR'
      && nasdaqMinuteOfDay(row.ts) > STOCKS_IN_PLAY_ORB_V1.regularOpenMinute
      && nasdaqMinuteOfDay(row.ts) <= STOCKS_IN_PLAY_ORB_V1.regularOpenMinute
        + STOCKS_IN_PLAY_ORB_V1.openingRangeMinutes
    ));
    minuteSeries.push({
      symbol, source: 'ALPACA',
      bars: necessaryMinutes.map(row => [row.ts.toISOString(), Number(row.open), Number(row.high), Number(row.low), Number(row.close), Number(row.volume), row.session]),
    });
    const daily = await prisma.marketBar.findMany({
      where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { gte: WARMUP_START, lte: END }, source: { in: ['YAHOO', 'ALPACA'] } },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
      orderBy: { ts: 'asc' },
    });
    if (daily.length < 2) throw new Error(`missing real daily history for ${symbol}`);
    dailySeries.push({
      symbol, source: daily[0].source,
      bars: daily.map(row => [row.ts.toISOString(), Number(row.open), Number(row.high), Number(row.low), Number(row.close), Number(row.volume)]),
    });
  }
  const benchmarkSeries = [];
  for (const symbol of ['SPUS', 'SPY'] as const) {
    const rows = await prisma.marketBar.findMany({
      where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { gte: WARMUP_START, lte: END }, source: { in: ['YAHOO', 'ALPACA'] } },
      select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true }, orderBy: { ts: 'asc' },
    });
    if (rows.length < 2) throw new Error(`missing benchmark history for ${symbol}`);
    benchmarkSeries.push({
      symbol, source: rows[0].source,
      bars: rows.map(row => [row.ts.toISOString(), Number(row.open), Number(row.high), Number(row.low), Number(row.close), Number(row.volume)]),
    });
  }
  fs.writeFileSync(output, `${JSON.stringify({
    fixtureVersion, capturedAt: new Date().toISOString(), market: 'NASDAQ', warmupStart: WARMUP_START.toISOString(),
    interval: { start: START.toISOString(), end: END.toISOString(), oosStart: START.toISOString() },
    strategyUniverse, benchmarkSymbols: ['SPUS', 'SPY'], sharia: { screened: false, source: 'none' },
    series: minuteSeries, dailySeries, benchmarkSeries,
  })}\n`);
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error(error); await prisma.$disconnect(); process.exitCode = 1;
});
