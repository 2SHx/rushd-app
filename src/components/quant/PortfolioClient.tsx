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
  DollarSign
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

interface Metrics {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  alphaVsSpy: number;
  alphaVsSpus: number;
  irVsSpy: number;
  irVsSpus: number;
  trackingErrorVsSpy: number;
  trackingErrorVsSpus: number;
}

interface PortfolioClientProps {
  locale: string;
  initialNAV: number;
  initialCash: number;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialPurification: PurificationEntry[];
  initialMetrics: Metrics;
}

export default function PortfolioClient({
  locale,
  initialNAV,
  initialCash,
  initialPositions,
  initialSnapshots,
  initialPurification,
  initialMetrics
}: PortfolioClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const [nav, setNav] = useState(initialNAV);
  const [cash, setCash] = useState(initialCash);
  const [positions, setPositions] = useState(initialPositions);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [purification, setPurification] = useState(initialPurification);
  const [metrics, setMetrics] = useState(initialMetrics);

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
      
      // Refresh window state to reload database updates dynamically
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
    const padding = 40;

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
        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={w - padding} y2={padding} stroke="rgba(255,255,255,0.05)" />
        <line x1={padding} y1={h / 2} x2={w - padding} y2={h / 2} stroke="rgba(255,255,255,0.05)" />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="rgba(255,255,255,0.1)" />

        {/* Legend */}
        <g transform={`translate(${padding}, 20)`} className="text-xs font-semibold">
          <circle cx={5} cy={-4} r={4} fill="#10B981" />
          <text x={15} fill="#D1D5DB" className="rtl:translate-x-12">{isAr ? 'عائد المحفظة' : 'Portfolio NAV'}</text>
          
          <circle cx={140} cy={-4} r={4} fill="#3B82F6" />
          <text x={150} fill="#9CA3AF" className="rtl:translate-x-12">{isAr ? 'مؤشر SPUS (شرعي)' : 'SPUS Benchmark'}</text>

          <circle cx={290} cy={-4} r={4} fill="#6B7280" />
          <text x={300} fill="#9CA3AF" className="rtl:translate-x-12">{isAr ? 'مؤشر SPY (التقليدي)' : 'SPY Index'}</text>
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

  // Calculate Running Purification Total
  const runningPurificationTotal = purification.reduce((sum, item) => sum + item.amount, 0);

  // Capital needed approximation for $1,000/day
  // Daily target = $1000. Annual target = $252,000.
  // With 10% expected return, Capital = $2.52M. With 20% return, Capital = $1.26M.
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
            {isAr ? 'مبلغ التطهير الكلي' : 'Purification Total'}
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{fmtMoney(runningPurificationTotal)}</div>
        </div>

        <div className="glass-panel p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase">
            {isAr ? 'رأس المال المطلوب لـ $1000/يوم' : 'Capital for $1,000/day'}
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-400" title={`Based on estimated annualized yield of ${(expectedReturn * 100).toFixed(1)}%`}>
            {fmtMoney(capitalNeeded)}
          </div>
        </div>
      </div>

      {/* SVG Chart Dashboard */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>{isAr ? 'منحنى الأداء التاريخي' : 'Historical Performance NAV'}</span>
          </h2>
        </div>
        <div className="h-72 w-full">
          {renderSvgChart()}
        </div>
      </div>

      {/* Metrics Card Matrix */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-bold flex items-center space-x-2 rtl:space-x-reverse mb-6">
          <Activity className="w-5 h-5 text-cyan-400" />
          <span>{t('metricsHeading')}</span>
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
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
            <div className="text-gray-400 text-xs font-semibold uppercase">{t('metricMaxDrawdown')}</div>
            <div className="mt-2 text-xl font-bold text-red-400">{fmtPercent(metrics.maxDrawdown)}</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-gray-400 text-xs font-semibold uppercase">
              {isAr ? 'معدل التتبع (Volatility)' : 'Tracking Error'}
            </div>
            <div className="mt-2 text-xl font-bold text-gray-400">{fmtPercent(metrics.trackingErrorVsSpus)}</div>
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
                  <td className="py-3.5 px-2 text-gray-300 max-w-[200px] truncate">{isAr ? pos.symbol : pos.name}</td>
                  <td className="py-3.5 px-2 text-end font-mono">{pos.shares.toFixed(2)}</td>
                  <td className="py-3.5 px-2 text-end font-mono">{fmtMoney(pos.costBasis)}</td>
                  <td className="py-3.5 px-2 text-end font-mono text-cyan-400">{fmtMoney(pos.price)}</td>
                  <td className="py-3.5 px-2 text-end font-mono text-emerald-400">{fmtMoney(pos.value)}</td>
                  <td className="py-3.5 px-2 text-end font-mono font-semibold">{fmtPercent(pos.weight)}</td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
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
          <span>{isAr ? 'سجل تطهير الأرباح (مبلغ التطهير)' : 'Purification Fee Ledger'}</span>
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-xs font-semibold">
                <th className="py-3 text-start px-2">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="py-3 text-start px-2">{t('symbol')}</th>
                <th className="py-3 text-end px-2">{isAr ? 'الأرباح المحققة' : 'Realized Profit'}</th>
                <th className="py-3 text-end px-2">{t('purificationRatio')}</th>
                <th className="py-3 text-end px-2">{isAr ? 'مبلغ التطهير الواجب' : 'Purification Fee Owed'}</th>
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
    </div>
  );
}
