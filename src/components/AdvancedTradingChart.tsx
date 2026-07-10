'use client';
import { useEffect, useRef } from 'react';
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

      candlestickSeries.setData(data as any);

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
  }, [data]);

  return <div ref={chartContainerRef} className="w-full h-[400px]" />;
}
