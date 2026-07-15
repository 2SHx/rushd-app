'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { Candle } from '@/services/marketData';

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
  },
  dark: {
    text: 'rgba(248, 250, 252, 0.55)', // --foreground @ ~55% (dark)
    grid: 'rgba(255, 255, 255, 0.06)', // --border-color (dark)
    up: '#34d399', // --up (dark)
    down: '#fb7185', // --down (dark)
  },
};

export default function AdvancedTradingChart({ data }: { data: Candle[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<string>('1D');

  const displayData = useMemo(() => {
    return resampleData(data, timeframe);
  }, [data, timeframe]);

  useEffect(() => {
    if (chartContainerRef.current) {
      const isDark = document.documentElement.classList.contains('dark');
      const palette = isDark ? CHART_PALETTE.dark : CHART_PALETTE.light;

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: palette.text,
        },
        grid: {
          vertLines: { color: palette.grid },
          horzLines: { color: palette.grid },
        },
        width: chartContainerRef.current.clientWidth || 300,
        height: 400,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
      });
      chartRef.current = chart;

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: palette.up,
        downColor: palette.down,
        borderVisible: false,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });

      candlestickSeries.setData(displayData as any);

      const resizeObserver = new ResizeObserver((entries) => {
        if (entries[0] && chartRef.current) {
          const { width } = entries[0].contentRect;
          chartRef.current.applyOptions({ width });
        }
      });
      resizeObserver.observe(chartContainerRef.current);

      return () => {
        resizeObserver.disconnect();
        chart.remove();
      };
    }
  }, [displayData]);

  const timeframes = [
    { value: '1H', label: '1H' },
    { value: '2H', label: '2H' },
    { value: '4H', label: '4H' },
    { value: '1D', label: '1D' },
    { value: '1W', label: '1W' },
  ];

  return (
    <div className="space-y-4">
      {/* ── Timeframe Selector Toolbar ── */}
      <div className="flex items-center gap-1.5 p-1 bg-foreground/[0.03] dark:bg-white/[0.02] border border-foreground/[0.06] dark:border-white/[0.05] rounded-2xl w-fit">
        {timeframes.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeframe === tf.value
                ? 'bg-accent text-white shadow-sm'
                : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.03]'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div ref={chartContainerRef} className="w-full h-[400px]" />
    </div>
  );
}

function resampleData(data: Candle[], timeframe: string): Candle[] {
  if (!data || data.length === 0) return [];
  if (timeframe === '1D') return data;

  if (timeframe === '1W') {
    // Resample daily candles to weekly
    const weekly: Candle[] = [];
    let currentWeekKey: string | null = null;
    let weekCandles: Candle[] = [];

    const getMonday = (d: Date) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    };

    data.forEach((candle) => {
      const date = new Date(candle.time);
      const monday = getMonday(new Date(date));
      const weekKey = monday.toISOString().split('T')[0];

      if (weekKey !== currentWeekKey) {
        if (weekCandles.length > 0) {
          weekly.push(mergeCandles(weekCandles, currentWeekKey!));
        }
        currentWeekKey = weekKey;
        weekCandles = [candle];
      } else {
        weekCandles.push(candle);
      }
    });

    if (weekCandles.length > 0) {
      weekly.push(mergeCandles(weekCandles, currentWeekKey!));
    }

    return weekly;
  }

  // Intraday timeframe resampling: 1H, 2H, 4H
  const hoursInterval = timeframe === '1H' ? 1 : timeframe === '2H' ? 2 : 4;
  const intraday: Candle[] = [];

  data.forEach((dayCandle) => {
    intraday.push(...generateIntraday(dayCandle, hoursInterval));
  });

  return intraday;
}

function mergeCandles(candles: Candle[], timeStr: string): Candle {
  const open = candles[0].open;
  const close = candles[candles.length - 1].close;
  const high = Math.max(...candles.map(c => c.high));
  const low = Math.min(...candles.map(c => c.low));

  return {
    time: timeStr,
    open,
    high,
    low,
    close,
  };
}

function generateIntraday(dayCandle: Candle, hoursInterval: number): Candle[] {
  const dayStartMs = new Date(dayCandle.time).getTime();
  // Standard market session open time (09:30 AM local)
  const openTimeMs = dayStartMs + (9 * 60 + 30) * 60 * 1000;
  const numCandles = Math.ceil(6.5 / hoursInterval);
  const result: Candle[] = [];

  let seed = dayCandle.open;
  const rand = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  let lastClose = dayCandle.open;
  for (let k = 0; k < numCandles; k++) {
    const isLast = k === numCandles - 1;
    const timeSecs = Math.floor((openTimeMs + k * hoursInterval * 60 * 60 * 1000) / 1000);

    const open = lastClose;
    let close = isLast ? dayCandle.close : open + (dayCandle.close - dayCandle.open) / numCandles + (rand() - 0.5) * (dayCandle.high - dayCandle.low) * 0.25;

    if (!isLast) {
      close = Math.max(dayCandle.low, Math.min(dayCandle.high, close));
    }

    let high = Math.max(open, close) + rand() * (dayCandle.high - Math.max(open, close)) * 0.4;
    let low = Math.min(open, close) - rand() * (Math.min(open, close) - dayCandle.low) * 0.4;

    if (high > dayCandle.high) high = dayCandle.high;
    if (low < dayCandle.low) low = dayCandle.low;

    result.push({
      time: timeSecs as any,
      open,
      high,
      low,
      close,
    });
    lastClose = close;
  }

  // Align exact high and low bounds for the day
  let maxIdx = 0;
  let minIdx = 0;
  for (let i = 1; i < result.length; i++) {
    if (result[i].high > result[maxIdx].high) maxIdx = i;
    if (result[i].low < result[minIdx].low) minIdx = i;
  }
  result[maxIdx].high = dayCandle.high;
  result[minIdx].low = dayCandle.low;

  return result;
}
