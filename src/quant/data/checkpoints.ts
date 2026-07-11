// src/quant/data/checkpoints.ts — QDR-6 (G1 backfill): intraday-day checkpoint schedule +
// Eastern-wall-clock -> UTC resolution, DST-safe. Used by scripts/backfill-snapshots.ts to build
// point-in-time-correct `SymbolSnapshot` rows at fixed times-of-day across historical trading
// days. No data is invented here — only timestamps, derived via the same Intl-based (no manual
// UTC-offset math) approach as nasdaqDateKey/nasdaqMinuteOfDay.
import { nasdaqDateKey } from './snapshot';
import { nasdaqMinuteOfDay } from './intraday';

/** ET minute-of-day checkpoints: open, +5m, +15m, +30m, +60m, then on-the-hour to the 16:00 close. */
export const DEFAULT_CHECKPOINT_MINUTES: readonly number[] = Object.freeze([
  9 * 60 + 30, // 09:30 open
  9 * 60 + 35, // 09:35
  9 * 60 + 45, // 09:45
  10 * 60, // 10:00
  10 * 60 + 30, // 10:30
  11 * 60, // 11:00
  12 * 60, // 12:00
  13 * 60, // 13:00
  14 * 60, // 14:00
  15 * 60, // 15:00
  16 * 60, // 16:00 close
]);

/**
 * Resolves an Eastern wall-clock checkpoint (`dateKey` YYYY-MM-DD, `minuteOfDay` 0-1439) to the
 * exact UTC instant, correct across the EST/EDT boundary. Tries both possible UTC offsets and
 * keeps the one whose round-trip through nasdaqDateKey/nasdaqMinuteOfDay matches exactly — never
 * a hand-computed offset that could silently drift on a DST transition day.
 */
export function checkpointToUtc(dateKey: string, minuteOfDay: number): Date {
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(`${dateKey}T00:00:00.000Z`);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + minuteOfDay + offsetHours * 60);
    if (nasdaqDateKey(candidate) === dateKey && nasdaqMinuteOfDay(candidate) === minuteOfDay) {
      return candidate;
    }
  }
  throw new Error(`Could not resolve ET checkpoint ${dateKey} @ minute ${minuteOfDay} to a UTC instant`);
}

/** All configured checkpoints for one trading day, chronological. */
export function tradingDayCheckpoints(
  dateKey: string,
  minutes: readonly number[] = DEFAULT_CHECKPOINT_MINUTES,
): Date[] {
  return minutes.map((minute) => checkpointToUtc(dateKey, minute));
}
