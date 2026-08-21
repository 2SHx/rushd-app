import { prisma } from '../src/lib/prisma';
import { dualMomentumMetrics } from '../src/quant/strategies/dualMomentumRotation';
import { selectTopNByMomentum } from '../src/quant/strategies/halalFastMomentumCore';
import { buildVerifiedUniverse } from '../src/quant/universe/buildVerifiedUniverse';

const FROM = new Date('2018-01-02T00:00:00.000Z');
const TO = new Date('2026-07-17T23:59:59.999Z');
const WARMUP_FROM = new Date('2017-09-01T00:00:00.000Z');
const LIQUIDITY_SESSIONS = 21;
const MOMENTUM_DAYS = 63;
const SKIP_RECENT_DAYS = 2;
const TOP_N = 5;
const HOLD_RANK = 8;
const MS_PER_YEAR = 365.2425 * 86_400_000;

interface Bar {
  ts: number;
  close: number;
  volume: number;
}

interface WeeklySelection {
  ts: number;
  ranked: string[];
  selected: string[];
}

function isoWeekKey(tsMs: number): number {
  const source = new Date(tsMs);
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return date.getUTCFullYear() * 100
    + Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function indexAt(series: readonly Bar[], target: number): number {
  let lo = 0;
  let hi = series.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts === target) return mid;
    if (series[mid].ts < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function weeklySelections(seriesBySymbol: ReadonlyMap<string, readonly Bar[]>): WeeklySelection[] {
  const weekEnds = new Map<number, number>();
  for (const series of Array.from(seriesBySymbol.values())) {
    for (const bar of series) {
      if (bar.ts < FROM.getTime() || bar.ts > TO.getTime()) continue;
      const week = isoWeekKey(bar.ts);
      weekEnds.set(week, Math.max(weekEnds.get(week) ?? Number.NEGATIVE_INFINITY, bar.ts));
    }
  }

  return Array.from(weekEnds.values()).sort((a, b) => a - b).flatMap((asOf): WeeklySelection[] => {
    const liquidPool = Array.from(seriesBySymbol.entries()).flatMap(([symbol, series]) => {
      const end = indexAt(series, asOf);
      const start = end - LIQUIDITY_SESSIONS + 1;
      if (end < 0 || start < 0) return [];
      let total = 0;
      for (let index = start; index <= end; index++) total += series[index].close * series[index].volume;
      const dollarVolume = total / LIQUIDITY_SESSIONS;
      return Number.isFinite(dollarVolume) && dollarVolume > 0 ? [{ symbol, series, end, dollarVolume }] : [];
    }).sort((a, b) => b.dollarVolume - a.dollarVolume || a.symbol.localeCompare(b.symbol)).slice(0, 60);

    const eligible = liquidPool.flatMap(({ symbol, series, end }) => {
      if (end < MOMENTUM_DAYS) return [];
      const closes = series.slice(end - MOMENTUM_DAYS, end + 1).map(({ close }) => close);
      const metrics = dualMomentumMetrics(closes, MOMENTUM_DAYS, SKIP_RECENT_DAYS);
      return metrics && metrics.absolute > 0 ? [{ symbol, relative: metrics.relative }] : [];
    }).sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));

    const selected = selectTopNByMomentum(eligible, TOP_N, 2);
    return selected.length ? [{ ts: asOf, ranked: eligible.map(({ symbol }) => symbol), selected }] : [];
  });
}

function countExits(selections: readonly (readonly string[])[]): number {
  let exits = 0;
  for (let index = 1; index < selections.length; index++) {
    const current = new Set(selections[index]);
    exits += selections[index - 1].filter((symbol) => !current.has(symbol)).length;
  }
  return exits;
}

function mainMetrics(weeks: readonly WeeklySelection[]) {
  const exitEvents: { week: number; symbol: string; rank: number }[] = [];
  for (let week = 1; week < weeks.length; week++) {
    const current = new Set(weeks[week].selected);
    const ranks = new Map(weeks[week].ranked.map((symbol, index) => [symbol, index + 1]));
    for (const symbol of weeks[week - 1].selected) {
      if (!current.has(symbol)) exitEvents.push({ week, symbol, rank: ranks.get(symbol) ?? Number.POSITIVE_INFINITY });
    }
  }

  const reentry = Object.fromEntries([2, 3, 4].map((window) => {
    const eligible = exitEvents.filter(({ week }) => week + window < weeks.length);
    const count = eligible.filter(({ week, symbol }) => {
      for (let offset = 1; offset <= window; offset++) {
        if (weeks[week + offset].selected.includes(symbol)) return true;
      }
      return false;
    }).length;
    return [window, { count, eligibleExits: eligible.length, rate: eligible.length ? count / eligible.length : 0 }];
  }));

  const hysteresis: string[][] = [];
  for (const week of weeks) {
    if (!hysteresis.length) {
      hysteresis.push([...week.selected]);
      continue;
    }
    const ranks = new Map(week.ranked.map((symbol, index) => [symbol, index + 1]));
    const held = hysteresis.at(-1)!.filter((symbol) => (ranks.get(symbol) ?? Number.POSITIVE_INFINITY) <= HOLD_RANK);
    for (const symbol of week.ranked.slice(0, TOP_N)) {
      if (held.length >= TOP_N) break;
      if (!held.includes(symbol)) held.push(symbol);
    }
    hysteresis.push(held);
  }

  const baselineExits = exitEvents.length;
  const hysteresisExits = countExits(hysteresis);
  const years = (weeks.at(-1)!.ts - weeks[0].ts) / MS_PER_YEAR;
  const baselineAnnualTurnover = baselineExits / TOP_N / years;
  const hysteresisAnnualTurnover = hysteresisExits / TOP_N / years;
  const removedAnnualTurnover = baselineAnnualTurnover - hysteresisAnnualTurnover;
  const removedFraction = baselineExits ? (baselineExits - hysteresisExits) / baselineExits : 0;
  const directAnnualCostRecovered = removedAnnualTurnover * 2 * 0.0015;

  return {
    period: {
      firstDecision: new Date(weeks[0].ts).toISOString().slice(0, 10),
      lastDecision: new Date(weeks.at(-1)!.ts).toISOString().slice(0, 10),
      years,
      weeklyRebalances: weeks.length,
    },
    baseline: { exits: baselineExits, exitsPerYear: baselineExits / years, annualTurnover: baselineAnnualTurnover },
    exitRanks: {
      rank6To8: exitEvents.filter(({ rank }) => rank >= 6 && rank <= 8).length,
      belowRank8OrUnranked: exitEvents.filter(({ rank }) => rank > 8).length,
      rank6To8Fraction: baselineExits
        ? exitEvents.filter(({ rank }) => rank >= 6 && rank <= 8).length / baselineExits
        : 0,
    },
    reentry,
    hysteresis: {
      rule: 'buy rank <=5; retain incumbents through rank 8; cap holdings at 5',
      exits: hysteresisExits,
      exitsPerYear: hysteresisExits / years,
      annualTurnover: hysteresisAnnualTurnover,
      removedAnnualTurnover,
      removedFraction,
      directAnnualCostRecoveredAt15BpsPerSide: directAnnualCostRecovered,
      fractionOfStated8Point09PctCostRecovered: directAnnualCostRecovered / 0.0809,
      proportionalUpperEstimateIfWeightChurnFallsLikewise: {
        engineTurnoverRemovedFrom27x: 27 * removedFraction,
        annualCostRecovered: 0.0809 * removedFraction,
      },
    },
  };
}

async function main(): Promise<void> {
  const symbols = buildVerifiedUniverse().entries
    .filter(({ market }) => market === 'NASDAQ')
    .map(({ symbol }) => symbol);
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol: { in: symbols }, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] },
      ts: { gte: WARMUP_FROM, lte: TO },
    },
    orderBy: [{ symbol: 'asc' }, { ts: 'asc' }],
    select: { symbol: true, ts: true, close: true, volume: true },
  });
  const seriesBySymbol = new Map<string, Bar[]>();
  for (const row of rows) {
    const series = seriesBySymbol.get(row.symbol) ?? [];
    series.push({ ts: row.ts.getTime(), close: Number(row.close), volume: Number(row.volume) });
    seriesBySymbol.set(row.symbol, series);
  }

  const weeks = weeklySelections(seriesBySymbol);
  console.log(JSON.stringify({
    methodology: {
      sourceRows: rows.length,
      sourceSymbols: seriesBySymbol.size,
      c1VerifiedNasdaqSymbols: symbols.length,
      liquiditySessions: LIQUIDITY_SESSIONS,
      liquidityPoolSize: 60,
      momentumDays: MOMENTUM_DAYS,
      skipRecentDays: SKIP_RECENT_DAYS,
      absoluteFilter: '> 0',
      selectedNames: TOP_N,
    },
    ...mainMetrics(weeks),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
