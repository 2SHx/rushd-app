import type { EquityPoint } from './metrics';

export interface ComparisonPoint {
  ts: string;
  value: number;
}

export interface HistoricalComparisonEvidence {
  basis: 'NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS';
  strategyKind: 'POOLED_TRADE_SEQUENCED_SIMULATED_EQUITY';
  benchmarkKind: 'ETF_CLOSE_PRICE_PROXY';
  start: string;
  end: string;
  oosStart: string;
  sources: {
    spy: Array<'YAHOO' | 'ALPACA'>;
    spus: Array<'YAHOO' | 'ALPACA'>;
  };
  series: {
    model: ComparisonPoint[];
    spy: ComparisonPoint[];
    spus: ComparisonPoint[];
  };
}

export interface ComparisonBenchmarkBar {
  symbol: 'SPY' | 'SPUS';
  ts: Date;
  close: number;
  source: 'YAHOO' | 'ALPACA';
}

export interface HistoricalComparisonInput {
  strategyCurve: readonly EquityPoint[];
  oosStart: Date;
  benchmarkBars: readonly ComparisonBenchmarkBar[];
}

interface ValuePoint {
  ts: number;
  value: number;
}

function validDate(date: Date): boolean {
  return date instanceof Date && Number.isFinite(date.getTime());
}

function sortedUnique(points: readonly ValuePoint[], allowZero = false): ValuePoint[] | null {
  if (points.some(point => !Number.isFinite(point.ts) || !Number.isFinite(point.value)
    || (allowZero ? point.value < 0 : point.value <= 0))) {
    return null;
  }
  const sorted = points.map((point, index) => ({ ...point, index }))
    .sort((a, b) => a.ts - b.ts || a.index - b.index);
  const unique: ValuePoint[] = [];
  for (const point of sorted) {
    if (unique.at(-1)?.ts === point.ts) unique[unique.length - 1] = point;
    else unique.push(point);
  }
  return unique;
}

function weekKey(ts: number): string {
  const date = new Date(ts);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset))
    .toISOString().slice(0, 10);
}

function normalizedWeekly(points: readonly ValuePoint[], start: number, end: number): ComparisonPoint[] | null {
  const inRange = points.filter(point => point.ts >= start && point.ts <= end);
  if (inRange.length < 2) return null;
  const baseline = [...points].reverse().find(point => point.ts <= start);
  const ending = [...points].reverse().find(point => point.ts <= end);
  if (!baseline || !ending || baseline.value <= 0) return null;

  const normalized = (value: number): number => 100 * value / baseline.value;
  const weeklyLast = new Map<string, ValuePoint>();
  const startWeek = weekKey(start);
  const endWeek = weekKey(end);
  for (const point of inRange) {
    const week = weekKey(point.ts);
    if (point.ts > start && point.ts < end && week !== startWeek && week !== endWeek) {
      weeklyLast.set(week, point);
    }
  }
  const sampled: ValuePoint[] = [
    { ts: start, value: 100 },
    ...Array.from(weeklyLast.values()),
    { ts: end, value: ending.value },
  ];
  const byTimestamp = new Map<number, ValuePoint>();
  for (const point of sampled) byTimestamp.set(point.ts, point);

  const result = Array.from(byTimestamp.values())
    .sort((a, b) => a.ts - b.ts)
    .map(point => ({ ts: new Date(point.ts).toISOString(), value: point.ts === start ? 100 : normalized(point.value) }));
  return result.length >= 2 && result.every(point => Number.isFinite(point.value) && point.value >= 0)
    ? result
    : null;
}

/** Build honest, price-only normalized comparison evidence over the three-way common interval. */
export function buildHistoricalComparisonEvidence(
  input: HistoricalComparisonInput,
): HistoricalComparisonEvidence | null {
  const { strategyCurve, oosStart, benchmarkBars } = input;
  if (!validDate(oosStart)) return null;
  if (strategyCurve.some(point => !validDate(point.ts))) return null;
  if (benchmarkBars.some(bar => !validDate(bar.ts)
    || !['SPY', 'SPUS'].includes(bar.symbol)
    || !['YAHOO', 'ALPACA'].includes(bar.source))) return null;

  const model = sortedUnique(strategyCurve.map(point => ({ ts: point.ts.getTime(), value: point.equity })), true);
  const spyBars = benchmarkBars.filter(bar => bar.symbol === 'SPY');
  const spusBars = benchmarkBars.filter(bar => bar.symbol === 'SPUS');
  const spy = sortedUnique(spyBars.map(bar => ({ ts: bar.ts.getTime(), value: bar.close })));
  const spus = sortedUnique(spusBars.map(bar => ({ ts: bar.ts.getTime(), value: bar.close })));
  if (!model || !spy || !spus || model.length < 2 || spy.length < 2 || spus.length < 2) return null;

  const start = Math.max(model[0].ts, spy[0].ts, spus[0].ts);
  const end = Math.min(model.at(-1)!.ts, spy.at(-1)!.ts, spus.at(-1)!.ts);
  if (start >= end) return null;

  const modelSeries = normalizedWeekly(model, start, end);
  const spySeries = normalizedWeekly(spy, start, end);
  const spusSeries = normalizedWeekly(spus, start, end);
  if (!modelSeries || !spySeries || !spusSeries) return null;

  const sources = (bars: readonly ComparisonBenchmarkBar[]): Array<'YAHOO' | 'ALPACA'> =>
    (['YAHOO', 'ALPACA'] as const).filter(source => bars.some(bar => bar.source === source));

  return {
    basis: 'NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS',
    strategyKind: 'POOLED_TRADE_SEQUENCED_SIMULATED_EQUITY',
    benchmarkKind: 'ETF_CLOSE_PRICE_PROXY',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    oosStart: oosStart.toISOString(),
    sources: { spy: sources(spyBars), spus: sources(spusBars) },
    series: { model: modelSeries, spy: spySeries, spus: spusSeries },
  };
}
