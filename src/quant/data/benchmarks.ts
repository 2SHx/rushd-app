import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertNoLookahead } from './pointInTime';

const D = Prisma.Decimal;

export interface NormalizedBenchmarkPoint {
  ts: Date;
  spy: number;
  spus: number;
}

/**
 * Returns a normalized series of benchmark index values (starting at initialValue, defaulting to 100)
 * aligned with the dates in the range, ensuring no look-ahead.
 */
export async function getNormalizedBenchmarks(
  fromDate: Date,
  toDate: Date,
  initialValue = 100
): Promise<NormalizedBenchmarkPoint[]> {
  // Query all MarketBars for SPY and SPUS in the range
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol: { in: ['SPY', 'SPUS'] },
      market: 'NASDAQ',
      interval: 'DAY',
      ts: { gte: fromDate, lte: toDate }
    },
    orderBy: { ts: 'asc' }
  });

  const spyBars = rows.filter(r => r.symbol === 'SPY');
  const spusBars = rows.filter(r => r.symbol === 'SPUS');

  if (spyBars.length === 0 || spusBars.length === 0) {
    // Return empty list if no data
    return [];
  }

  // Get the baseline price on or before fromDate
  const getBaselinePrice = async (symbol: string): Promise<Prisma.Decimal> => {
    const baseBar = await prisma.marketBar.findFirst({
      where: {
        symbol,
        market: 'NASDAQ',
        interval: 'DAY',
        ts: { lte: fromDate }
      },
      orderBy: { ts: 'desc' }
    });
    return baseBar ? baseBar.close : new D(1.0);
  };

  const spyBase = await getBaselinePrice('SPY');
  const spusBase = await getBaselinePrice('SPUS');

  // Collect all unique timestamps from both sets to align them
  const allDatesSet = new Set<number>();
  spyBars.forEach(b => allDatesSet.add(b.ts.getTime()));
  spusBars.forEach(b => allDatesSet.add(b.ts.getTime()));
  const sortedDates = Array.from(allDatesSet).sort().map(d => new Date(d));

  const result: NormalizedBenchmarkPoint[] = [];

  for (const date of sortedDates) {
    // Assert no look-ahead for safety
    assertNoLookahead(spyBars.filter(b => b.ts.getTime() <= date.getTime()), date, 'ts');
    assertNoLookahead(spusBars.filter(b => b.ts.getTime() <= date.getTime()), date, 'ts');

    // Find the closest bar on or before the current date
    const spyVal = spyBars.find(b => b.ts.getTime() === date.getTime())?.close || 
                   spyBars.filter(b => b.ts.getTime() < date.getTime()).pop()?.close || 
                   spyBase;

    const spusVal = spusBars.find(b => b.ts.getTime() === date.getTime())?.close || 
                    spusBars.filter(b => b.ts.getTime() < date.getTime()).pop()?.close || 
                    spusBase;

    const spyNorm = spyBase.gt(0) 
      ? Number(new D(initialValue).mul(spyVal).div(spyBase).toString())
      : initialValue;

    const spusNorm = spusBase.gt(0)
      ? Number(new D(initialValue).mul(spusVal).div(spusBase).toString())
      : initialValue;

    result.push({
      ts: date,
      spy: spyNorm,
      spus: spusNorm
    });
  }

  return result;
}
