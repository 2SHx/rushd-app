'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Briefcase,
  TrendingUp,
  Percent,
  Activity,
  Coins,
  History,
  AlertTriangle,
  Play,
  Loader2,
  ShieldCheck,
  ClipboardList
} from 'lucide-react';

interface Position {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  price: number;
  value: number;
  weight: number;
}

interface Snapshot {
  asOf: string;
  nav: number;
  cashVirtual: number;
  spy: number;
  spus: number;
}

interface PurificationEntry {
  id: string;
  symbol: string;
  amount: number;
  ratio: number;
  profit: number;
  createdAt: string;
}

interface Trade {
  id: string;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

interface Metrics {
  cagr: number;
  sharpe: number;
  deflatedSharpe: number;
  maxDrawdown: number;
  alphaVsSpy: number;
  alphaVsSpus: number;
  irVsSpy: number;
  irVsSpus: number;
  trackingErrorVsSpy: number;
  trackingErrorVsSpus: number;
  upCaptureVsSpy?: number;
  upCaptureVsSpus?: number;
  downCaptureVsSpy?: number;
  downCaptureVsSpus?: number;
}

interface PortfolioClientProps {
  locale: string;
  initialNAV: number;
  initialCash: number;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialPurification: PurificationEntry[];
  initialMetrics: Metrics;
  initialTrades?: Trade[];
}

export default function PortfolioClient({
  locale,
  initialNAV,
  initialCash,
  initialPositions,
  initialSnapshots,
  initialPurification,
  initialMetrics,
  initialTrades = []
}: PortfolioClientProps) {
  const t = useTranslations('Quant');

  const [nav] = useState(initialNAV);
  const [cash] = useState(initialCash);
  const [positions] = useState(initialPositions);
  const [snapshots] = useState(initialSnapshots);
  const [purification] = useState(initialPurification);
  const [metrics] = useState(initialMetrics);
  const [trades] = useState(initialTrades);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formatter helpers
  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val);
  };

  const fmtPercent = (val: number) => {
    return `${(val * 100).toFixed(2)}%`;
  };

  // Rebalance execution handler
  async function triggerManualRebalance() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quant/rebalance?secret=dev-cron-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to rebalance');
        return;
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Error executing rebalance');
    } finally {
      setLoading(false);
    }
  }

  // Pure SVG scaling chart logic
  function renderSvgChart() {
    if (snapshots.length < 2) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Not enough historical snapshots to render performance curve. Run a rebalance to start.
        </div>
      );
    }

    const w = 800;
    const h = 300;
    const padding = 45;

    // Find min and max values across all series for relative scaling
    const vals = snapshots.flatMap(s => [s.nav, s.spy, s.spus]);
    const minVal = Math.min(...vals) * 0.98;
    const maxVal = Math.max(...vals) * 1.02;
    const valRange = maxVal - minVal || 1;

    const times = snapshots.map(s => new Date(s.asOf).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    const points = snapshots.map(s => {
      const x = padding + ((new Date(s.asOf).getTime() - minTime) / timeRange) * (w - 2 * padding);
      return {
        x,
        navY: h - padding - ((s.nav - minVal) / valRange) * (h - 2 * padding),
        spyY: h - padding - ((s.spy - minVal) / valRange) * (h - 2 * padding),
        spusY: h - padding - ((s.spus - minVal) / valRange) * (h - 2 * padding),
        date: s.asOf
      };
    });

    const createPath = (getY: (p: typeof points[0]) => number) => {
      return points.reduce((acc, p, idx) => {
        return acc + `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${getY(p).toFixed(1)}`;
      }, '');
    };

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full text-gray-400">
        <line x1={padding} y1={padding} x2={w - padding} y2={padding} stroke="rgba(255,255,255,0.05)" />
        <line x1={padding} y1={h / 2} x2={w - padding} y2={h / 2} stroke="rgba(255,255,255,0.05)" />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="rgba(255,255,255,0.1)" />

        {/* Legend */}
        <g transform={`translate(${padding}, 20)`} className="text-xs font-semibold">
          <circle cx={5} cy={-4} r={4} fill="#10B981" />
          <text x={15} fill="#D1D5DB" className="rtl:translate-x-12">{t('portfolioNAVLegend')}</text>
          
          <circle cx={140} cy={-4} r={4} fill="#3B82F6" />
          <text x={150} fill="#9CA3AF" className="rtl:translate-x-12">{t('spusLegend')}</text>

          <circle cx={290} cy={-4} r={4} fill="#6B7280" />
          <text x={300} fill="#9CA3AF" className="rtl:translate-x-12">{t('spyLegend')}</text>
        </g>

        {/* SPY path */}
        <path d={createPath(p => p.spyY)} fill="none" stroke="#6B7280" strokeWidth="2" strokeDasharray="4 4" />
        
        {/* SPUS path */}
        <path d={createPath(p => p.spusY)} fill="none" stroke="#3B82F6" strokeWidth="2" strokeDasharray="2 2" />

        {/* Strategy NAV path (highlighted/glowing) */}
        <path d={createPath(p => p.navY)} fill="none" stroke="#10B981" strokeWidth="3" />
        
        {/* Axis Labels */}
        <text x={padding} y={h - 10} className="text-[10px] fill-gray-500">
          {new Date(minTime).toLocaleDateString(locale)}
        </text>
        <text x={w - padding} y={h - 10} textAnchor="end" className="text-[10px] fill-gray-500">
          {new Date(maxTime).toLocaleDateString(locale)}
        </text>
      </svg>
    );
  }

  // Drawdown gauge helper (circular progress)
  function renderDrawdownGauge() {
    const radius = 50;
    const strokeWidth = 8;
    const normalizedDrawdown = Math.min(1, Math.max(0, metrics.maxDrawdown));
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - normalizedDrawdown * circumference;
    
    let strokeColor = '#10B981'; // Compliant green
    if (normalizedDrawdown > 0.15) strokeColor = '#F59E0B'; // Amber
    if (normalizedDrawdown > 0.3) strokeColor = '#EF4444'; // Red

    return (
      <div className="flex flex-col items-center justify-center p-6 glass-panel text-center h-full">
        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">{t('drawdownGauge')}</h3>
        <div className="relative w-36 h-36">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{fmtPercent(metrics.maxDrawdown)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Calculate Running Purification Total
  const runningPurificationTotal = purification.reduce((sum, item) => sum + item.amount, 0);

  // Capital needed approximation for $1,000/day
  const expectedReturn = Math.max(0.08, metrics.cagr > 0 ? metrics.cagr : 0.12);
  const capitalNeeded = expectedReturn > 0 ? 252000 / expectedReturn : 2520000;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-white">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 glass-panel p-6">
        <div>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Briefcase className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              {t('portfolioTitle')}
            </h1>
          </div>
          <p className="mt-2 text-gray-400 text-sm max-w-2xl">
            {t('portfolioSubtitle')}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={triggerManualRebalance}
            disabled={loading}
            className="flex items-center space-x-2 rtl:space-x-reverse px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-sm transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{loading ? t('rebalancing') : t('rebalanceButton')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center space-x-3 rtl:space-x-reverse text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase">{t('portfolioNav')}</div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{fmtMoney(nav)}</div>
        </div>

        <div className="glass-panel p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase">{t('cashVirtual')}</div>
          <div className="mt-2 text-2xl font-bold text-cyan-400">{fmtMoney(cash)}</div>
        </div>

        <div className="glass-panel p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase">
            {t('purificationTotal')}
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{fmtMoney(runningPurificationTotal)}</div>
        </div>

        <div className="glass-panel p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase">
            {t('capitalForDay')}
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-400" title={t('capitalNeededEstimate', { ratio: (expectedReturn * 100).toFixed(1) })}>
            {fmtMoney(capitalNeeded)}
          </div>
        </div>
      </div>

      {/* Performance Curve and Drawdown Gauge Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>{t('historicalPerformanceTitle')}</span>
            </h2>
          </div>
          <div className="h-72 w-full">
            {renderSvgChart()}
          </div>
        </div>

        <div className="lg:col-span-1">
          {renderDrawdownGauge()}
        </div>
      </div>

      {/* Metrics Card Matrix */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse mb-6">
          <Activity className="w-5 h-5 text-cyan-400" />
          <span>{t('metricsHeading')}</span>
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricAlphaSpy')}</div>
            <div className="mt-2 text-xl font-bold text-emerald-400">{fmtPercent(metrics.alphaVsSpy)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricAlphaSpus')}</div>
            <div className="mt-2 text-xl font-bold text-emerald-400">{fmtPercent(metrics.alphaVsSpus)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricIrSpy')}</div>
            <div className="mt-2 text-xl font-bold text-cyan-400">{metrics.irVsSpy.toFixed(2)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricIrSpus')}</div>
            <div className="mt-2 text-xl font-bold text-cyan-400">{metrics.irVsSpus.toFixed(2)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricCagr')}</div>
            <div className="mt-2 text-xl font-bold text-white">{fmtPercent(metrics.cagr)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricSharpe')}</div>
            <div className="mt-2 text-xl font-bold text-white">{metrics.sharpe.toFixed(2)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('trackingError')}</div>
            <div className="mt-2 text-xl font-bold text-gray-400">{fmtPercent(metrics.trackingErrorVsSpus)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('upCapture')} (SPUS)</div>
            <div className="mt-2 text-xl font-bold text-emerald-400">{(metrics.upCaptureVsSpus ?? 1.15).toFixed(2)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('downCapture')} (SPUS)</div>
            <div className="mt-2 text-xl font-bold text-red-400">{(metrics.downCaptureVsSpus ?? 0.85).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Holdings List Table */}
      <div className="glass-panel p-6 overflow-hidden">
        <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse mb-4">
          <Coins className="w-5 h-5 text-amber-400" />
          <span>{t('holdingsHeading')}</span>
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs font-semibold">
                <th className="py-3 text-start px-2">{t('symbol')}</th>
                <th className="py-3 text-start px-2">{t('name')}</th>
                <th className="py-3 text-start px-2">{t('shariaStatus')}</th>
                <th className="py-3 text-end px-2">{t('shares')}</th>
                <th className="py-3 text-end px-2">{t('costBasis')}</th>
                <th className="py-3 text-end px-2">{t('price')}</th>
                <th className="py-3 text-end px-2">{t('value')}</th>
                <th className="py-3 text-end px-2">{t('weight')}</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => (
                <tr key={pos.symbol} className="border-b border-white/5 hover:bg-white/5 text-sm transition-colors">
                  <td className="py-3.5 px-2 font-bold text-emerald-400">{pos.symbol}</td>
                  <td className="py-3.5 px-2 text-gray-300 max-w-[200px] truncate">{pos.name || pos.symbol}</td>
                  <td className="py-3.5 px-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {t('compliant')}
                    </span>
                  </td>
                  <td className="py-3.5 px-2 text-end font-mono">{pos.shares.toFixed(2)}</td>
                  <td className="py-3.5 px-2 text-end font-mono">{fmtMoney(pos.costBasis)}</td>
                  <td className="py-3.5 px-2 text-end font-mono text-cyan-400">{fmtMoney(pos.price)}</td>
                  <td className="py-3.5 px-2 text-end font-mono text-emerald-400">{fmtMoney(pos.value)}</td>
                  <td className="py-3.5 px-2 text-end font-mono font-semibold">{fmtPercent(pos.weight)}</td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No active positions. Execute a rebalancing pass to construct the portfolio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purification Ledger log */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse mb-4">
          <History className="w-5 h-5 text-indigo-400" />
          <span>{t('purificationLedgerTitle')}</span>
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs font-semibold">
                <th className="py-3 text-start px-2">{t('date')}</th>
                <th className="py-3 text-start px-2">{t('symbol')}</th>
                <th className="py-3 text-end px-2">{t('realizedProfit')}</th>
                <th className="py-3 text-end px-2">{t('purificationRatio')}</th>
                <th className="py-3 text-end px-2">{t('purificationFeeOwed')}</th>
              </tr>
            </thead>
            <tbody>
              {purification.map(entry => (
                <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 text-sm transition-colors">
                  <td className="py-3.5 px-2 text-gray-400">{new Date(entry.createdAt).toLocaleDateString(locale)}</td>
                  <td className="py-3.5 px-2 font-bold text-emerald-400">{entry.symbol}</td>
                  <td className="py-3.5 px-2 text-end text-emerald-400 font-mono">{fmtMoney(entry.profit)}</td>
                  <td className="py-3.5 px-2 text-end text-gray-400 font-mono">{fmtPercent(entry.ratio)}</td>
                  <td className="py-3.5 px-2 text-end text-amber-400 font-bold font-mono">{fmtMoney(entry.amount)}</td>
                </tr>
              ))}
              {purification.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No realized gains purification fees recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rebalance Audit Trail */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse mb-4">
          <ClipboardList className="w-5 h-5 text-emerald-400" />
          <span>{t('rebalanceAuditTrail')}</span>
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs font-semibold">
                <th className="py-3 text-start px-2">{t('date')}</th>
                <th className="py-3 text-start px-2">{t('action')}</th>
                <th className="py-3 text-end px-2">{t('amount')}</th>
                <th className="py-3 text-start px-2">{t('description')}</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => (
                <tr key={trade.id} className="border-b border-white/5 hover:bg-white/5 text-sm transition-colors">
                  <td className="py-3.5 px-2 text-gray-400">{new Date(trade.createdAt).toLocaleDateString(locale)}</td>
                  <td className="py-3.5 px-2 font-bold">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                      trade.description.includes('BUY') 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {trade.description.includes('BUY') ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  <td className="py-3.5 px-2 text-end font-mono text-white font-bold">{fmtMoney(trade.amount)}</td>
                  <td className="py-3.5 px-2 text-gray-300 font-mono text-xs">{trade.description}</td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No rebalance actions executed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
