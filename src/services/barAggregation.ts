// src/services/barAggregation.ts — pure OHLCV resampling (no Next imports).
// Aggregates REAL stored bars into chart timeframes; never synthesizes data.
//
// Intraday buckets are anchored to the 09:30 America/New_York session open
// (TradingView convention for US equities), so a 1H bar spans 09:30–10:30,
// not 09:00–10:00. Input minute bars carry their CLOSE time (IntradayBar.ts);
// a bar closing 09:31 belongs to the bucket that starts at 09:30.
//
// Weekly bars anchor to Monday; monthly bars to the first traded day of the
// month. Gaps (holidays, halts, missing coverage) simply produce no bucket —
// no forward-filling, no interpolation.

export interface TimeframeBar {
  /** UNIX seconds for intraday bars; 'YYYY-MM-DD' for daily-derived bars. */
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const INTRADAY_TIMEFRAMES = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1H': 60,
  '2H': 120,
  '4H': 240,
} as const;

export type IntradayTimeframe = keyof typeof INTRADAY_TIMEFRAMES;
export type DailyTimeframe = '1D' | '1W' | '1M';
export type Timeframe = IntradayTimeframe | DailyTimeframe;

export const ALL_TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];

export function isIntradayTimeframe(tf: Timeframe): tf is IntradayTimeframe {
  return tf in INTRADAY_TIMEFRAMES;
}

/** Minute-of-day of the US regular-session open (09:30 ET). */
const SESSION_OPEN_MINUTE = 9 * 60 + 30;

// ET offset varies with DST; resolve it via Intl once per UTC hour and cache —
// offsets are constant within an hour (DST flips happen at minute 0).
const etHourOffsetCache = new Map<number, number>();
const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Milliseconds to ADD to a UTC timestamp to get New York wall-clock time. */
function etOffsetMs(tsMs: number): number {
  const hourKey = Math.floor(tsMs / 3_600_000);
  const cached = etHourOffsetCache.get(hourKey);
  if (cached !== undefined) return cached;

  const parts = etFormatter.formatToParts(new Date(tsMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // `hour: '2-digit'` with hour12:false can yield "24" at midnight; normalize.
  const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const offset = wallMs - Math.floor(tsMs / 60_000) * 60_000;
  etHourOffsetCache.set(hourKey, offset);
  return offset;
}

export interface RawBar {
  /** Bar CLOSE time (UTC). */
  ts: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Aggregate REGULAR-session minute bars into session-anchored intraday buckets.
 * Input must be sorted ascending by ts. Bars before the session open (defensive:
 * the caller should already filter to REGULAR) are dropped, never mis-bucketed.
 */
export function aggregateIntraday(bars: RawBar[], timeframe: IntradayTimeframe): TimeframeBar[] {
  const bucketMinutes = INTRADAY_TIMEFRAMES[timeframe];
  const out: TimeframeBar[] = [];
  let currentKey: string | null = null;
  let current: TimeframeBar | null = null;

  for (const bar of bars) {
    const tsMs = bar.ts.getTime();
    const etMs = tsMs + etOffsetMs(tsMs);
    // Convert the close time to the bar's START minute before bucketing.
    const startEtMs = etMs - 60_000;
    const et = new Date(startEtMs); // read with UTC getters: this IS wall-clock ET
    const minuteOfDay = et.getUTCHours() * 60 + et.getUTCMinutes();
    if (minuteOfDay < SESSION_OPEN_MINUTE) continue;

    const dayKey = et.toISOString().slice(0, 10);
    const bucketIndex = Math.floor((minuteOfDay - SESSION_OPEN_MINUTE) / bucketMinutes);
    const key = `${dayKey}#${bucketIndex}`;

    if (key !== currentKey) {
      if (current) out.push(current);
      currentKey = key;
      current = {
        // Anchored bucket start, converted back to UTC seconds.
        time: Math.floor((startEtMs - ((minuteOfDay - SESSION_OPEN_MINUTE) % bucketMinutes) * 60_000 - etOffsetMs(tsMs)) / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
    } else if (current) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    }
  }
  if (current) out.push(current);
  return out;
}

export interface RawDailyBar {
  /** Trading day as 'YYYY-MM-DD' (or a Date whose UTC date is the trading day). */
  day: string | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function dayString(day: string | Date): string {
  return typeof day === 'string' ? day.slice(0, 10) : day.toISOString().slice(0, 10);
}

/** ISO Monday of the week containing `day` — the weekly bucket anchor. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow + (dow === 0 ? -6 : 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate daily bars into weekly (Monday-anchored) or monthly buckets.
 * Input must be sorted ascending. Bucket time = first traded day in the bucket.
 */
export function aggregateDaily(bars: RawDailyBar[], unit: 'week' | 'month'): TimeframeBar[] {
  const out: TimeframeBar[] = [];
  let currentKey: string | null = null;
  let current: TimeframeBar | null = null;

  for (const bar of bars) {
    const day = dayString(bar.day);
    const key = unit === 'week' ? mondayOf(day) : day.slice(0, 7);

    if (key !== currentKey) {
      if (current) out.push(current);
      currentKey = key;
      current = { time: day, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    } else if (current) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    }
  }
  if (current) out.push(current);
  return out;
}
