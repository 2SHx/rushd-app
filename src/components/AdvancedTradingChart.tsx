'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { Candle } from '@/services/marketData';
import { MousePointer, PenTool, Paintbrush, Type, Ruler, Eraser } from 'lucide-react';

export default function AdvancedTradingChart({ data }: { data: Candle[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (chartContainerRef.current) {
      const handleResize = () => {
        chartRef.current?.applyOptions({ width: chartContainerRef.current?.clientWidth });
      };

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#7C8BA1',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
        },
        width: chartContainerRef.current.clientWidth,
        height: 380,
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderVisible: false,
        },
      });
      chartRef.current = chart;

      // Candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });
      candlestickSeries.setData(data as any);

      // Volume histogram series
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', // Overlay over price chart
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8, // volume takes bottom 20%
          bottom: 0,
        },
      });

      const volumeData = data.map((d) => ({
        time: d.time,
        value: d.value || d.close * 250000,
        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      }));
      volumeSeries.setData(volumeData);

      // Add "E" and "D" event markers matching Slide 1
      if (data.length > 5) {
        const markers = [];
        
        // Dividend Marker (Blue)
        if (data[2]) {
          markers.push({
            time: data[2].time,
            position: 'belowBar' as const,
            color: '#3b82f6',
            shape: 'circle' as const,
            text: 'D',
            size: 1,
          });
        }

        // Earnings Marker (Purple)
        const midIdx = Math.floor(data.length / 2);
        if (data[midIdx]) {
          markers.push({
            time: data[midIdx].time,
            position: 'belowBar' as const,
            color: '#a855f7',
            shape: 'circle' as const,
            text: 'E',
            size: 1,
          });
        }
        
        candlestickSeries.setMarkers(markers);
      }

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }
  }, [data]);

  return (
    <div className="flex bg-[#0A0E17] rounded-2xl overflow-hidden border border-white/5 relative">
      {/* TradingView drawing tool bar sidebar on left */}
      <div className="flex flex-col items-center justify-between py-4 px-1.5 border-r border-white/5 bg-black/10 text-gray-500 w-9 shrink-0">
        <div className="space-y-4">
          <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
            <PenTool className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
            <Paintbrush className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
            <Type className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
            <Ruler className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="hover:text-white transition-colors active:scale-90 duration-150 block p-1 rounded hover:bg-white/5">
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="flex-1 h-[380px] relative" />
    </div>
  );
}
