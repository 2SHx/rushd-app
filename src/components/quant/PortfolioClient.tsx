'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  Percent,
  Activity,
  Coins,
  History,
  AlertTriangle,
  Play,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney as formatMoneyShared, formatSARNumber } from '@/lib/currency';

interface Position {
  symbol: string;
  name: string;
  market: 'TASI' | 'NASDAQ';
  currency: 'SAR' | 'USD';
  shares: number;
  costBasis: number | null;
  price: number;
  value: number;
  weight: number | null;
  complianceStatus: 'VERIFIED_COMPLIANT' | 'VERIFIED_NON_COMPLIANT' | 'UNVERIFIED';
}

interface Snapshot {
  asOf: string;
  nav: number;
  cashVirtual: number;
  currency: 'SAR' | 'USD';
  spy: number;
  spus: number;
}

type PerformanceStatus = 'available' | 'no_snapshots' | 'multiple_strategies' | 'mixed_currencies';

interface CurrencyTotal {
  currency: 'SAR' | 'USD';
  positionsValue: number;
  cashValue: number | null;
  totalValue: number | null;
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
  initialNAV: number | null;
  initialCash: number;
  cashCurrency: 'SAR' | 'USD' | null;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialPurification: PurificationEntry[];
  initialMetrics: Metrics;
  initialTrades?: Trade[];
  performanceStatus: PerformanceStatus;
  currencyTotals: CurrencyTotal[];
}

export default function PortfolioClient({
  locale,
  initialNAV,
  initialCash,
  cashCurrency,
  initialPositions,
  initialSnapshots,
  initialPurification,
  initialMetrics,
  performanceStatus,
  currencyTotals,
}: PortfolioClientProps) {
  const t = useTranslations('Quant');

  const [nav] = useState(initialNAV);
  const [cash] = useState(initialCash);
  const [positions] = useState(initialPositions);
  const [snapshots] = useState(initialSnapshots);
  const [purification] = useState(initialPurification);
  const [metrics] = useState(initialMetrics);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '1Y' | 'ALL'>('ALL');
  
  const filteredSnapshots = snapshots.filter(s => {
    if (timeframe === 'ALL' || snapshots.length === 0) return true;
    const lastDate = new Date(snapshots[snapshots.length - 1].asOf).getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    let days = 30;
    if (timeframe === '1M') days = 30;
    if (timeframe === '3M') days = 90;
    if (timeframe === '1Y') days = 365;
    const cutoff = lastDate - days * msPerDay;
    return new Date(s.asOf).getTime() >= cutoff;
  });

  // Formatter helpers
  const fmtMoney = (val: number, currency: 'SAR' | 'USD') => formatMoneyShared(val, currency, locale);

  const performanceMessage = {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: '',
  }[performanceStatus];
  const hasPerformanceMetrics = performanceStatus === 'available' && snapshots.length >= 2;

  const fmtPercent = (val: number) => {
    return `${(val * 100).toFixed(2)}%`;
  };

  const fmtNumber = (val: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(val);

  // Rebalance execution handler
  async function triggerManualRebalance() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quant/rebalance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        const errorKey = {
          forbidden: 'rebalanceErrorForbidden',
          unsupported_media_type: 'rebalanceErrorUnsupported',
          halted: 'rebalanceErrorHalted',
          already_run_today: 'rebalanceErrorAlreadyRun',
          internal_error: 'rebalanceErrorGeneric',
        }[data.error as string] ?? 'rebalanceErrorGeneric';
        setError(t(errorKey));
        return;
      }
      window.location.reload();
    } catch {
      setError(t('rebalanceErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  // Pure SVG scaling chart logic
  function renderSvgChart() {
    if (performanceStatus !== 'available' || filteredSnapshots.length < 2) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          {performanceMessage || t('portfolioPerformanceInsufficient')}
        </div>
      );
    }

    const w = 800;
    const h = 300;
    const padding = 45;

    // Find min and max values across all series for relative scaling
    const vals = filteredSnapshots.flatMap(s => [s.nav, s.spy, s.spus]);
    const minVal = Math.min(...vals) * 0.98;
    const maxVal = Math.max(...vals) * 1.02;
    const valRange = maxVal - minVal || 1;

    const times = filteredSnapshots.map(s => new Date(s.asOf).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    const points = filteredSnapshots.map(s => {
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
        <defs>
          <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1={padding} y1={padding} x2={w - padding} y2={padding} stroke="currentColor" className="text-slate-200 dark:text-slate-900 dark:text-white/5" />
        <line x1={padding} y1={h / 2} x2={w - padding} y2={h / 2} stroke="currentColor" className="text-slate-200 dark:text-slate-900 dark:text-white/5" />
        <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="rgba(255,255,255,0.1)" />

        {/* Legend */}
        <g transform={`translate(${padding}, 20)`} className="text-xs font-semibold">
          <circle cx={5} cy={-4} r={4} fill="#6366F1" />
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
        <path 
          d={`${createPath(p => p.navY)} L ${points[points.length-1].x} ${h-padding} L ${points[0].x} ${h-padding} Z`} 
          fill="url(#navGradient)" 
        />
        <path d={createPath(p => p.navY)} fill="none" stroke="#6366F1" strokeWidth="3" />
        
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


  // Asset Allocation Donut Chart
  function renderAllocationDonut() {
    if (nav === null) {
      return (
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-300">
          <p>{t('portfolioCombinedUnavailable')}</p>
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs" dir="ltr">
            {currencyTotals.map(total => (
              <span key={total.currency}>{fmtMoney(total.positionsValue, total.currency)}</span>
            ))}
          </div>
        </div>
      );
    }

    const radius = 50;
    const strokeWidth = 12;
    const circumference = 2 * Math.PI * radius;
    
    const usEquities = positions.filter(p => p.market === 'NASDAQ').reduce((sum, p) => sum + p.value, 0);
    const saudiEquities = positions.filter(p => p.market === 'TASI').reduce((sum, p) => sum + p.value, 0);
    const cashValue = cash;
    const totalValue = nav || 1;
    
    const usPct = usEquities / totalValue;
    const saudiPct = saudiEquities / totalValue;
    const cashPct = cashValue / totalValue;

    const usOffset = 0;
    const saudiOffset = usPct * circumference;
    const cashOffset = (usPct + saudiPct) * circumference;

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl text-center h-full">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Asset Allocation</h3>
          <span className="text-indigo-400 text-xs font-semibold cursor-pointer hover:text-indigo-300">View All</span>
        </div>
        <div className="relative w-40 h-40">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="80" cy="80" r={radius} fill="transparent" stroke="currentColor" className="text-slate-200 dark:text-slate-900 dark:text-white/5" strokeWidth={strokeWidth} />
            {usPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#6366F1" strokeWidth={strokeWidth} strokeDasharray={`${usPct * circumference} ${circumference}`} strokeDashoffset={0} />
            )}
            {saudiPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#10B981" strokeWidth={strokeWidth} strokeDasharray={`${saudiPct * circumference} ${circumference}`} strokeDashoffset={-saudiOffset} />
            )}
            {cashPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#F59E0B" strokeWidth={strokeWidth} strokeDasharray={`${cashPct * circumference} ${circumference}`} strokeDashoffset={-cashOffset} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Positions</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{positions.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-6 text-[10px] font-bold">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div>US Equities</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Saudi Equities</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div>Cash</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 text-slate-900 dark:text-white min-h-screen">
      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* LEFT COLUMN - MAIN CONTENT */}
        <div className="flex-1 space-y-8">
          
          {/* Header - TradeSphere style */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="text-gray-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors">
                Current Balance
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold normal-case tracking-wide text-amber-500 dark:text-amber-400">
                  {t('paperEvidenceTag')}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  <div className="w-full h-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-extrabold text-lg">U</div>
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                  {nav !== null && cashCurrency ? fmtMoney(nav, cashCurrency) : t('valueUnavailable')}
                </h1>
              </div>
            </div>

            {/* Top Right Action Tabs */}
            <div className="flex glass-panel p-1 rounded-2xl border border-slate-200 dark:border-white/10 h-12 shadow-sm self-start">
              <button onClick={triggerManualRebalance} disabled={loading} className="px-5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-gray-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-50 flex items-center gap-1.5">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                {loading ? t('rebalancing') : t('rebalanceButton')}
              </button>
              <button className="px-5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all text-gray-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white flex items-center">Wallet</button>
              <button className="px-5 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 flex items-center font-black">Analytics</button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-400">
              {error}
            </div>
          )}

          {/* Main Navigation Tabs */}
          <div className="flex overflow-x-auto no-scrollbar gap-8 border-b border-slate-200 dark:border-white/5 mt-4">
            <button className="text-emerald-500 dark:text-emerald-400 font-extrabold text-sm pb-3 border-b-2 border-emerald-500 whitespace-nowrap">Overview</button>
            <button className="text-slate-500 dark:text-gray-400 font-bold text-sm pb-3 border-b-2 border-transparent hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition-colors">US Equities</button>
            <button className="text-slate-500 dark:text-gray-400 font-bold text-sm pb-3 border-b-2 border-transparent hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition-colors">Saudi Equities</button>
            <button className="text-slate-500 dark:text-gray-400 font-bold text-sm pb-3 border-b-2 border-transparent hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition-colors">Cash & Equivalents</button>
          </div>

          {/* Performance Curve */}
          <div className="glass-panel rounded-3xl p-6 border border-slate-200 dark:border-white/10 relative shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-slate-800 dark:text-gray-200 uppercase tracking-wider">Performance Curve</h2>
              <div className="flex space-x-1 bg-black/20 p-1 rounded-xl border border-slate-200 dark:border-white/5">
                {['1M', '3M', '1Y', 'ALL'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf as any)}
                    className={`px-4 py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
                      timeframe === tf ? 'bg-emerald-500 text-black shadow-md' : 'text-gray-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-72 w-full">
              {renderSvgChart()}
            </div>
          </div>

          {/* Asset Class Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4">
              <div>
                <div className="text-gray-400 font-bold text-[10px] uppercase tracking-wider mb-2">US Equities</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {fmtMoney(positions.filter(p => p.market === 'NASDAQ').reduce((s, p) => s + p.value, 0), 'USD')}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-gray-400">Portfolio Share</span>
                  <span className="text-slate-950 dark:text-white font-mono font-bold">
                    {nav === null ? t('valueUnavailable') : fmtPercent(positions.filter(p => p.market === 'NASDAQ').reduce((s, p) => s + (p.weight ?? 0), 0))}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, positions.filter(p => p.market === 'NASDAQ').reduce((s, p) => s + (p.weight ?? 0), 0) * 100)}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-white/5">
                  <div className="flex -space-x-1.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center border border-[#1A1F2E]"><span className="text-[8px] text-emerald-400 font-extrabold">AAPL</span></div>
                    <div className="w-7 h-7 rounded-full bg-teal-500/10 flex items-center justify-center border border-[#1A1F2E]"><span className="text-[8px] text-teal-400 font-extrabold">MSFT</span></div>
                  </div>
                  <button className="hover:text-slate-900 dark:hover:text-white transition-colors">→</button>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4">
              <div>
                <div className="text-gray-400 font-bold text-[10px] uppercase tracking-wider mb-2">Saudi Equities</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {fmtMoney(positions.filter(p => p.market === 'TASI').reduce((s, p) => s + p.value, 0), 'SAR')}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-gray-400">Portfolio Share</span>
                  <span className="text-slate-950 dark:text-white font-mono font-bold">
                    {nav === null ? t('valueUnavailable') : fmtPercent(positions.filter(p => p.market === 'TASI').reduce((s, p) => s + (p.weight ?? 0), 0))}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, positions.filter(p => p.market === 'TASI').reduce((s, p) => s + (p.weight ?? 0), 0) * 100)}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-white/5">
                  <div className="flex -space-x-1.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center border border-[#1A1F2E]"><span className="text-[8px] text-emerald-400 font-extrabold">2222</span></div>
                    <div className="w-7 h-7 rounded-full bg-teal-500/10 flex items-center justify-center border border-[#1A1F2E]"><span className="text-[8px] text-teal-400 font-extrabold">1120</span></div>
                  </div>
                  <button className="hover:text-slate-900 dark:hover:text-white transition-colors">→</button>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4">
              <div>
                <div className="text-gray-400 font-bold text-[10px] uppercase tracking-wider mb-2">Cash & Purify</div>
                <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  {cashCurrency ? fmtMoney(cash, cashCurrency) : `${fmtNumber(cash)} — ${t('cashCurrencyUnavailable')}`}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-gray-400">Portfolio Share</span>
                  <span className="text-slate-950 dark:text-white font-mono font-bold">
                    {nav !== null && nav > 0 ? fmtPercent(cash / nav) : t('valueUnavailable')}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, nav !== null && nav > 0 ? (cash / nav) * 100 : 0)}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-white/5">
                  <div className="flex -space-x-1.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center border border-[#1A1F2E]"><span className="text-[8px] text-emerald-400 font-extrabold">USD</span></div>
                  </div>
                  <button className="hover:text-slate-900 dark:hover:text-white transition-colors">→</button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-4 mb-8">
            <button className="px-8 py-3 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-white/5 transition-all">View All</button>
            <button onClick={triggerManualRebalance} disabled={loading} className="px-8 py-3 rounded-2xl bg-emerald-500 text-black font-extrabold text-xs uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-black" />}
              {loading ? t('rebalancing') : t('rebalanceButton')}
            </button>
          </div>
          <p className="mb-8 text-xs text-foreground/60">{t('paperDisclaimer')}</p>

          {/* Tables Section */}
          <div className="space-y-8">
            <div className="glass-panel rounded-3xl p-6 border border-slate-200 dark:border-white/10 overflow-hidden shadow-xl">
              <h2 className="text-base font-extrabold uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse mb-4 text-slate-800 dark:text-gray-200">
                <Coins className="w-5 h-5 text-emerald-400" />
                <span>{t('holdingsHeading')}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 text-start px-2">{t('symbol')}</th>
                      <th className="py-3 text-start px-2">{t('name')}</th>
                      <th className="py-3 text-start px-2">{t('marketLabel')}</th>
                      <th className="py-3 text-start px-2">{t('currencyLabel')}</th>
                      <th className="py-3 text-start px-2">{t('shariaStatus')}</th>
                      <th className="py-3 text-end px-2">{t('shares')}</th>
                      <th className="py-3 text-end px-2">{t('costBasis')}</th>
                      <th className="py-3 text-end px-2">{t('value')}</th>
                      <th className="py-3 text-end px-2">{t('weight')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const compliance = pos.complianceStatus === 'VERIFIED_COMPLIANT'
                        ? { label: t('compliant'), title: t('shariaVerifiedCompliantNote'), Icon: ShieldCheck, className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
                        : pos.complianceStatus === 'VERIFIED_NON_COMPLIANT'
                          ? { label: t('nonCompliant'), title: t('shariaVerifiedNonCompliantNote'), Icon: AlertTriangle, className: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
                          : { label: t('shariaUnverified'), title: t('shariaUnverifiedNote'), Icon: AlertTriangle, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
                      const ComplianceIcon = compliance.Icon;
                      return (
                      <tr key={`${pos.market}:${pos.symbol}`} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-3.5 px-2 font-black font-mono text-emerald-400" dir="ltr">{pos.symbol}</td>
                        <td className="py-3.5 px-2 text-slate-700 dark:text-gray-300 max-w-[200px] truncate">{pos.name || pos.symbol}</td>
                        <td className="py-3.5 px-2 text-slate-700 dark:text-gray-300">{pos.market}</td>
                        <td className="py-3.5 px-2 font-mono text-slate-700 dark:text-gray-300" dir="ltr">{pos.currency}</td>
                        <td className="py-3.5 px-2">
                          <span title={compliance.title} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold border uppercase tracking-wider shadow-sm ${compliance.className}`}>
                            <ComplianceIcon className="w-3.5 h-3.5" />
                            {compliance.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-end font-mono text-slate-700 dark:text-gray-300">{pos.shares.toFixed(2)}</td>
                        <td className="py-3.5 px-2 text-end font-mono text-slate-700 dark:text-gray-300">{pos.costBasis === null ? t('costBasisUnknown') : fmtMoney(pos.costBasis, pos.currency)}</td>
                        <td className="py-3.5 px-2 text-end font-mono text-slate-900 dark:text-white font-bold">{fmtMoney(pos.value, pos.currency)}</td>
                        <td className="py-3.5 px-2 text-end">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1 bg-black/40 rounded-full overflow-hidden hidden sm:block">
                              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(pos.weight ?? 0) * 100}%` }} />
                            </div>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{pos.weight === null ? t('valueUnavailable') : fmtPercent(pos.weight)}</span>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {positions.length === 0 && (
                      <tr><td colSpan={9} className="py-8 text-center text-gray-500">{t('noActivePositions')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Purification Ledger */}
            <div className="glass-panel rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-extrabold uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse text-slate-800 dark:text-gray-200">
                  <History className="w-5 h-5 text-emerald-400" />
                  <span>{t('purificationLedgerTitle')}</span>
                </h2>
                <div className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shadow-sm">
                  Total Purified: {fmtNumber(runningPurificationTotal)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 text-start px-2">{t('date')}</th>
                      <th className="py-3 text-start px-2">{t('symbol')}</th>
                      <th className="py-3 text-end px-2">{t('purificationFeeOwed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purification.map(entry => (
                      <tr key={entry.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-3.5 px-2 text-gray-400 font-mono text-xs">{new Date(entry.createdAt).toLocaleDateString(locale)}</td>
                        <td className="py-3.5 px-2 font-black text-emerald-400">{entry.symbol}</td>
                        <td className="py-3.5 px-2 text-end text-amber-400 font-bold font-mono">{fmtNumber(entry.amount)}</td>
                      </tr>
                    ))}
                    {purification.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-gray-500">No purification fees recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - SIDEBAR */}
        <div className="w-full xl:w-[380px] space-y-6 flex-shrink-0">
          {/* Search Box */}
          <div className="relative mb-6">
            <input type="text" placeholder="Search holdings..." className="w-full glass-panel bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-11 pr-4 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-sm" />
            <svg className="w-4 h-4 text-gray-500 absolute left-4 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          {/* Asset Allocation Donut Chart */}
          <div>
            {renderAllocationDonut()}
          </div>

          {/* Key Metrics / Popular Strategies List */}
          <div className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl shadow-lg">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 dark:text-gray-200 mb-4">{t('metricsHeading')}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3.5 bg-black/20 hover:bg-black/35 rounded-2xl border border-slate-200/50 dark:border-white/5 transition-colors cursor-pointer group shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                  <Activity className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">{t('metricSharpe')}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{t('metricSharpeDescription')}</div>
                </div>
                <div className="text-base font-black text-emerald-400 font-mono">{hasPerformanceMetrics ? metrics.sharpe.toFixed(2) : t('valueUnavailable')}</div>
              </div>

              <div className="flex items-center gap-4 p-3.5 bg-black/20 hover:bg-black/35 rounded-2xl border border-slate-200/50 dark:border-white/5 transition-colors cursor-pointer group shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">{t('metricCagr')}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{t('metricCagrDescription')}</div>
                </div>
                <div className="text-base font-black text-emerald-400 font-mono">{hasPerformanceMetrics ? fmtPercent(metrics.cagr) : t('valueUnavailable')}</div>
              </div>

              <div className="flex items-center gap-4 p-3.5 bg-black/20 hover:bg-black/35 rounded-2xl border border-slate-200/50 dark:border-white/5 transition-colors cursor-pointer group shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                  <Percent className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">{t('metricAlphaSpus')}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{t('metricAlphaSpusDescription')}</div>
                </div>
                <div className="text-base font-black text-emerald-400 font-mono">{hasPerformanceMetrics ? fmtPercent(metrics.alphaVsSpus) : t('valueUnavailable')}</div>
              </div>
              
              <div className="flex items-center gap-4 p-3.5 bg-black/20 hover:bg-black/35 rounded-2xl border border-slate-200/50 dark:border-white/5 transition-colors cursor-pointer group shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-all">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">{t('metricMaxDrawdown')}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{t('metricMaxDrawdownDescription')}</div>
                </div>
                <div className="text-base font-black text-amber-400 font-mono">{hasPerformanceMetrics ? fmtPercent(metrics.maxDrawdown) : t('valueUnavailable')}</div>
              </div>
            </div>
            
            <button className="w-full py-3 mt-4 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl transition-all border border-slate-200 dark:border-white/5">
              View Extended Metrics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
