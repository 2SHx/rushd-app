'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useTranslations } from 'next-intl';
import { Candle } from '@/services/marketData';
import {
  aggregateDaily,
  isIntradayTimeframe,
  type Timeframe,
  type TimeframeBar,
} from '@/services/barAggregation';

// lightweight-charts (v3.8) renders to <canvas> and requires literal color
// strings — it cannot consume CSS custom properties. This is the ONE
// sanctioned hex site (ui-craft exception): each value is a 1:1 mirror of the
// matching token in globals.css (--foreground, --border-color, --up, --down),
// duplicated here only because the chart lib demands a literal.
const CHART_PALETTE = {
  light: {
    text: 'rgba(11, 11, 15, 0.55)', // --foreground @ ~55%
    grid: 'rgba(0, 0, 0, 0.06)', // --border-color (light)
    up: '#047857', // --up (light)
    down: '#BE123C', // --down (light)
    volumeUp: 'rgba(4, 120, 87, 0.35)',
    volumeDown: 'rgba(190, 18, 60, 0.35)',
  },
  dark: {
    text: 'rgba(248, 250, 252, 0.55)', // --foreground @ ~55% (dark)
    grid: 'rgba(255, 255, 255, 0.06)', // --border-color (dark)
    up: '#34d399', // --up (dark)
    down: '#fb7185', // --down (dark)
    volumeUp: 'rgba(52, 211, 153, 0.30)',
    volumeDown: 'rgba(251, 113, 133, 0.30)',
  },
};

// TradingView-style groups: minutes · hours · daily-and-up.
const TIMEFRAME_GROUPS: { tf: Timeframe; label: string }[][] = [
  [
    { tf: '5m', label: '5m' },
    { tf: '15m', label: '15m' },
    { tf: '30m', label: '30m' },
  ],
  [
    { tf: '1H', label: '1H' },
    { tf: '2H', label: '2H' },
    { tf: '4H', label: '4H' },
  ],
  [
    { tf: '1D', label: 'D' },
    { tf: '1W', label: 'W' },
    { tf: '1M', label: 'M' },
  ],
];

interface BarsResponse {
  bars: TimeframeBar[];
  realData: boolean;
  availableTfs: { intraday: boolean };
}

interface AdvancedTradingChartProps {
  /** Provider-supplied daily history — instant first paint + offline fallback. */
  data: Candle[];
  /** When set, real stored bars are fetched per timeframe from /api/market-data/bars. */
  symbol?: string;
  market?: 'TASI' | 'NASDAQ';
  /** The provider source of `data` (e.g. 'MOCK') — drives the sample-data label. */
  dataSource?: string;
}

function candlesToBars(candles: Candle[]): TimeframeBar[] {
  return candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.value ?? 0,
  }));
}

export default function AdvancedTradingChart({ data, symbol, market, dataSource }: AdvancedTradingChartProps) {
  const t = useTranslations('Chart');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const paletteRef = useRef(CHART_PALETTE.light);
  const barsCacheRef = useRef(new Map<Timeframe, { bars: TimeframeBar[]; real: boolean }>());

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [status, setStatus] = useState<'ready' | 'loading' | 'error' | 'empty'>('ready');
  const [intradayAvailable, setIntradayAvailable] = useState<boolean | null>(symbol ? null : false);
  const [display, setDisplay] = useState<{ bars: TimeframeBar[]; real: boolean }>(() => ({
    bars: candlesToBars(data),
    real: dataSource !== 'MOCK',
  }));

  const fallbackDaily = useMemo(() => candlesToBars(data), [data]);

  /** Offline/keyless fallback: the provider daily history, resampled locally. Never invents bars. */
  const localFallback = useCallback(
    (tf: Timeframe): TimeframeBar[] | null => {
      if (isIntradayTimeframe(tf)) return null;
      if (tf === '1D') return fallbackDaily;
      const daily = fallbackDaily.map((b) => ({
        day: String(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
      return aggregateDaily(daily, tf === '1W' ? 'week' : 'month');
    },
    [fallbackDaily]
  );

  const loadTimeframe = useCallback(
    async (tf: Timeframe) => {
      const cached = barsCacheRef.current.get(tf);
      if (cached) {
        setDisplay(cached);
        setStatus(cached.bars.length ? 'ready' : 'empty');
        return;
      }
      if (!symbol || !market) {
        const local = localFallback(tf);
        const entry = { bars: local ?? [], real: dataSource !== 'MOCK' && (local?.length ?? 0) > 0 };
        setDisplay(entry);
        setStatus(entry.bars.length ? 'ready' : 'empty');
        return;
      }
      setStatus('loading');
      try {
        const res = await fetch(
          `/api/market-data/bars?symbol=${encodeURIComponent(symbol)}&market=${market}&tf=${encodeURIComponent(tf)}`
        );
        if (!res.ok) throw new Error(`bars ${res.status}`);
        const payload: BarsResponse = await res.json();
        setIntradayAvailable(payload.availableTfs.intraday);

        let entry: { bars: TimeframeBar[]; real: boolean };
        if (payload.bars.length > 0) {
          entry = { bars: payload.bars, real: true };
        } else {
          const local = localFallback(tf);
          entry = { bars: local ?? [], real: local && local.length > 0 ? dataSource !== 'MOCK' : true };
        }
        barsCacheRef.current.set(tf, entry);
        setDisplay(entry);
        setStatus(entry.bars.length ? 'ready' : 'empty');
      } catch {
        const local = localFallback(tf);
        if (local && local.length > 0) {
          setDisplay({ bars: local, real: dataSource !== 'MOCK' });
          setStatus('ready');
        } else {
          setStatus('error');
        }
      }
    },
    [symbol, market, dataSource, localFallback]
  );

  // The provider history changed (new symbol selected) — reset the cache.
  useEffect(() => {
    barsCacheRef.current.clear();
    setTimeframe('1D');
    setIntradayAvailable(symbol ? null : false);
    setDisplay({ bars: candlesToBars(data), real: dataSource !== 'MOCK' });
    setStatus('ready');
    if (symbol && market) void loadTimeframe('1D');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, market, data]);

  // Create the chart ONCE; timeframe switches only call setData (no teardown flash).
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const isDark = document.documentElement.classList.contains('dark');
    const palette = isDark ? CHART_PALETTE.dark : CHART_PALETTE.light;
    paletteRef.current = palette;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      width: container.clientWidth || 300,
      height: 400,
      timeScale: { timeVisible: false, secondsVisible: false },
      rightPriceScale: { borderColor: palette.grid },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeriesRef.current = volume;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Push the active bars into the chart.
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!chart || !candles || !volume) return;
    const palette = paletteRef.current;

    candles.setData(display.bars as never[]);
    volume.setData(
      display.bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? palette.volumeUp : palette.volumeDown,
      })) as never[]
    );
    chart.applyOptions({ timeScale: { timeVisible: isIntradayTimeframe(timeframe), secondsVisible: false } });
    chart.timeScale().fitContent();
  }, [display, timeframe]);

  const selectTimeframe = (tf: Timeframe) => {
    if (tf === timeframe) return;
    setTimeframe(tf);
    void loadTimeframe(tf);
  };

  const intradayDisabled = !symbol || intradayAvailable === false;
  const showSampleBadge = status === 'ready' && !display.real && display.bars.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Timeframe toolbar (numeric sequence stays LTR in both directions) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          dir="ltr"
          role="toolbar"
          aria-label={t('timeframeToolbar')}
          className="flex items-center gap-1.5 p-1 bg-foreground/[0.03] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] rounded-2xl w-fit"
        >
          {TIMEFRAME_GROUPS.map((group, gi) => (
            <div key={gi} className="flex items-center gap-1.5">
              {gi > 0 && <div aria-hidden className="w-px h-4 bg-foreground/10 dark:bg-white/10" />}
              {group.map(({ tf, label }) => {
                const disabled = isIntradayTimeframe(tf) && intradayDisabled;
                const active = timeframe === tf;
                return (
                  <button
                    key={tf}
                    onClick={() => selectTimeframe(tf)}
                    disabled={disabled}
                    aria-pressed={active}
                    title={disabled ? t('noIntradayData') : undefined}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ease-out ${
                      active
                        ? 'bg-accent text-white shadow-sm'
                        : disabled
                          ? 'text-foreground/25 cursor-not-allowed'
                          : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.03]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {status === 'loading' && (
          <span className="text-xs text-foreground/50" role="status">
            {t('loading')}
          </span>
        )}
        {showSampleBadge && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {t('sampleData')}
          </span>
        )}
      </div>

      <div className="relative">
        <div
          ref={chartContainerRef}
          className={`w-full h-[400px] transition-opacity ease-out ${status === 'loading' ? 'opacity-60' : 'opacity-100'}`}
        />
        {status === 'empty' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-foreground/50">{t('noData')}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-foreground/60">{t('loadError')}</p>
            <button
              onClick={() => void loadTimeframe(timeframe)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-accent text-white hover:opacity-90 transition-opacity ease-out"
            >
              {t('retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
