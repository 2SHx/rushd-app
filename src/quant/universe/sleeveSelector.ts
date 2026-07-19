// src/quant/universe/sleeveSelector.ts — QDR-8 sleeve selector: top-~100-by-dollar-volume names
// drawn from the labeled universe, restricted to whatever REAL bars already exist in MarketBar
// (reuses the existing no-look-ahead accessor, src/quant/data/pointInTime.ts's PointInTimeStore
// — DB-read-only, no new query pattern). A name without bars is fail-closed excluded with a
// reason; it joins automatically once a later data-engineer unit ingests it. Money-adjacent
// dollar-volume math uses Prisma.Decimal, never float (repo-wide debt: Float money fields — this
// module never compounds it further).
import { Prisma } from '@prisma/client';
import { PointInTimeStore } from '@/quant/data/pointInTime';
import type { ExclusionReason, UniverseEntry } from './types';

export interface SleeveEntry {
  symbol: string;
  name: string;
  tier: UniverseEntry['tier'];
  avgDollarVolumeUsd: Prisma.Decimal;
  barsUsed: number;
}

export interface SleeveSelectionResult {
  sleeve: SleeveEntry[];
  excluded: ExclusionReason[];
}

export interface SelectSleeveOptions {
  asOf: Date;
  /** Trailing calendar-day window to average dollar volume over (default 20d). */
  lookbackDays?: number;
  /** Sleeve size cap (default 100, per QDR-8 "~100"). */
  maxNames?: number;
  store?: PointInTimeStore;
}

/**
 * Ranks `entries` by real trailing-average dollar volume (close x volume, DAY bars, no-look-ahead
 * at `asOf`) and returns the top `maxNames`. Entries with zero bars are fail-closed excluded, not
 * silently dropped — they surface in `excluded` with reason `no_market_bars` so a later ingest can
 * be tracked.
 */
export async function selectDollarVolumeSleeve(
  entries: readonly UniverseEntry[],
  options: SelectSleeveOptions,
): Promise<SleeveSelectionResult> {
  const { asOf, lookbackDays = 20, maxNames = 100 } = options;
  const store = options.store ?? new PointInTimeStore('DAY');
  const excluded: ExclusionReason[] = [];

  const ranked = await Promise.all(
    entries.map(async (entry): Promise<SleeveEntry | null> => {
      const bars = await store.bars(entry.symbol, entry.market, asOf, lookbackDays);
      if (bars.length === 0) {
        excluded.push({ symbol: entry.symbol, reasonCode: 'no_market_bars' });
        return null;
      }
      const total = bars.reduce((sum, b) => sum.plus(new Prisma.Decimal(b.close).times(b.volume)), new Prisma.Decimal(0));
      return {
        symbol: entry.symbol,
        name: entry.name,
        tier: entry.tier,
        avgDollarVolumeUsd: total.dividedBy(bars.length),
        barsUsed: bars.length,
      };
    }),
  );

  const sleeve = ranked
    .filter((r): r is SleeveEntry => r !== null)
    .sort((a, b) => b.avgDollarVolumeUsd.comparedTo(a.avgDollarVolumeUsd))
    .slice(0, maxNames);

  return { sleeve, excluded };
}
