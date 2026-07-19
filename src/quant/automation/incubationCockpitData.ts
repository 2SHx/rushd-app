/**
 * Read-only view-model for the R4-D1 daily profit cockpit (/quant portfolio surface).
 * QDR-8 binding: the $1,000/day goal is a measured readout ONLY — trailing realized
 * $/day run-rate and the capital-needed figure implied by the measured daily-return
 * distribution. No promised returns, no extrapolated or fabricated curves.
 *
 * Rung 2 (reuse): reads the exact same four charter books / label / model shapes that
 * B1 (incubationBooks.ts) and B2 (BookEvaluation) already own. This file adds no writes
 * and no new schema — pure aggregation over persisted rows.
 */
import { prisma } from '@/lib/prisma';
import { INCUBATION_BOOKS, INCUBATION_LABEL } from './incubationBooks';

const TRAILING_WINDOW_DAYS = 63;
const BENCHMARK_SYMBOLS = ['SPY', 'SPUS'] as const;
type BenchmarkKey = 'spy' | 'spus';

export interface IndexedPoint {
  asOf: string;
  /** Rebased to 100 at the first point in the series — a relative comparison, not a price. */
  index: number;
}

export interface IncubationBookCockpit {
  bookId: string;
  label: typeof INCUBATION_LABEL;
  latestAsOf: string | null;
  nav: number | null;
  dailyPnl: number | null;
  drawdown: number | null;
  trackingError: number | null;
  benched: boolean;
  requiresRevalidation: boolean;
  benchFlags: string[];
  navSeries: IndexedPoint[];
  benchmarks: Partial<Record<BenchmarkKey, IndexedPoint[]>>;
}

export interface IncubationCockpitAggregate {
  /** Number of trading days actually observed (<= 63) — always shown alongside the readout. */
  windowDays: number;
  /** Trailing realized $/day run-rate across all four books, dollar-weighted. */
  runRatePerDay: number | null;
  /** Mean daily aggregate return (dailyPnl / priorNav) over the same window. */
  meanDailyReturn: number | null;
  /** 1000 / meanDailyReturn when meanDailyReturn > 0; otherwise not computable. */
  capitalNeeded: number | null;
}

export interface IncubationCockpitData {
  books: IncubationBookCockpit[];
  aggregate: IncubationCockpitAggregate;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function loadIncubationCockpitData(now: Date = new Date()): Promise<IncubationCockpitData> {
  const bookIds = INCUBATION_BOOKS.map(book => book.bookId);
  const evaluations = await prisma.bookEvaluation.findMany({
    where: { bookId: { in: bookIds }, asOf: { lte: now } },
    orderBy: { asOf: 'asc' },
  });

  const byBook = new Map<string, typeof evaluations>();
  for (const row of evaluations) {
    const list = byBook.get(row.bookId) ?? [];
    list.push(row);
    byBook.set(row.bookId, list);
  }

  // Aggregate across all four books, keyed by calendar day, for the $/day readout.
  const byDay = new Map<string, { pnl: number; priorNav: number }>();
  for (const row of evaluations) {
    const key = dayKey(row.asOf);
    const entry = byDay.get(key) ?? { pnl: 0, priorNav: 0 };
    const nav = Number(row.nav.toString());
    const pnl = Number(row.dailyPnl.toString());
    entry.pnl += pnl;
    entry.priorNav += nav - pnl;
    byDay.set(key, entry);
  }
  const orderedDays = Array.from(byDay.keys()).sort();
  const trailing = orderedDays.slice(-TRAILING_WINDOW_DAYS).map(day => byDay.get(day)!);
  const windowDays = trailing.length;
  const runRatePerDay = windowDays > 0
    ? trailing.reduce((sum, d) => sum + d.pnl, 0) / windowDays
    : null;
  const dailyReturns = trailing.filter(d => d.priorNav > 0).map(d => d.pnl / d.priorNav);
  const meanDailyReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length
    : null;
  const capitalNeeded = meanDailyReturn !== null && meanDailyReturn > 0
    ? 1000 / meanDailyReturn
    : null;

  // Real benchmark bars only, over the exact range of observed evaluation days.
  const evalDates = evaluations.map(row => row.asOf.getTime());
  const minDate = evalDates.length ? new Date(Math.min(...evalDates)) : null;
  const maxDate = evalDates.length ? new Date(Math.max(...evalDates)) : null;
  const benchmarkBars = minDate && maxDate
    ? await prisma.marketBar.findMany({
        where: {
          symbol: { in: [...BENCHMARK_SYMBOLS] },
          market: 'NASDAQ',
          interval: 'DAY',
          source: { in: ['YAHOO', 'ALPACA'] },
          ts: { gte: minDate, lte: maxDate },
        },
        orderBy: { ts: 'asc' },
      })
    : [];
  const benchmarkBySymbolDay = new Map<string, Map<string, number>>();
  for (const bar of benchmarkBars) {
    const map = benchmarkBySymbolDay.get(bar.symbol) ?? new Map<string, number>();
    map.set(dayKey(bar.ts), Number(bar.close.toString()));
    benchmarkBySymbolDay.set(bar.symbol, map);
  }

  const books: IncubationBookCockpit[] = INCUBATION_BOOKS.map(book => {
    const rows = byBook.get(book.bookId) ?? [];
    const latest = rows.at(-1) ?? null;
    const nav0 = rows[0] ? Number(rows[0].nav.toString()) : null;
    const navSeries: IndexedPoint[] = nav0 && nav0 > 0
      ? rows.map(row => ({ asOf: row.asOf.toISOString(), index: (Number(row.nav.toString()) / nav0) * 100 }))
      : [];

    const benchmarks: IncubationBookCockpit['benchmarks'] = {};
    if (rows.length > 0) {
      const dayKeys = rows.map(row => dayKey(row.asOf));
      for (const symbol of BENCHMARK_SYMBOLS) {
        const symMap = benchmarkBySymbolDay.get(symbol);
        // Honest omission (B2 precedent): only draw the benchmark line when every one of this
        // book's evaluated days has a real persisted close — never interpolate or substitute.
        if (!symMap || !dayKeys.every(day => symMap.has(day))) continue;
        const base = symMap.get(dayKeys[0])!;
        if (base <= 0) continue;
        const key: BenchmarkKey = symbol === 'SPY' ? 'spy' : 'spus';
        benchmarks[key] = rows.map(row => ({
          asOf: row.asOf.toISOString(),
          index: (symMap.get(dayKey(row.asOf))! / base) * 100,
        }));
      }
    }

    return {
      bookId: book.bookId,
      label: INCUBATION_LABEL,
      latestAsOf: latest ? latest.asOf.toISOString() : null,
      nav: latest ? Number(latest.nav.toString()) : null,
      dailyPnl: latest ? Number(latest.dailyPnl.toString()) : null,
      drawdown: latest ? Number(latest.drawdown.toString()) : null,
      trackingError: latest ? Number(latest.trackingError.toString()) : null,
      benched: latest?.benched ?? false,
      requiresRevalidation: latest?.requiresRevalidation ?? false,
      benchFlags: latest?.benchFlags ?? [],
      navSeries,
      benchmarks,
    };
  });

  return {
    books,
    aggregate: { windowDays, runRatePerDay, meanDailyReturn, capitalNeeded },
  };
}
