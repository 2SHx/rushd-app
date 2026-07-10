'use client';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { 
  Wallet, Briefcase, History, TrendingUp, CheckCircle2, Coins,
  BarChart2, Target, Activity, ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';

export interface Position {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  price: number;
  value: number;
  weight: number;
}

export interface Snapshot {
  asOf: string;
  nav: number;
  cashVirtual: number;
  spy: number;
  spus: number;
}

interface DashboardClientProps {
  locale: string;
  initialNAV: number;
  initialCash: number;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialMetrics: any;
  initialTransactions: any[];
}

export default function DashboardClient({ 
  locale,
  initialNAV,
  initialCash,
  initialPositions,
  initialSnapshots,
  initialMetrics,
  initialTransactions
}: DashboardClientProps) {
  const t = useTranslations('dashboard');
  const isAr = locale === 'ar';

  const [jarBal, setJarBal] = useState(initialCash);
  const [txs, setTxs] = useState<any[]>(initialTransactions ?? []);
  
  const [zakatPaidSuccess, setZakatPaidSuccess] = useState(false);
  const [zakatPaidAmount, setZakatPaidAmount] = useState('0.00');
  const [isZakatSubmitting, setIsZakatSubmitting] = useState(false);

  // P&L timeframe selector
  const [plTimeframe, setPlTimeframe] = useState<'24H'|'7D'|'30D'|'90D'>('24H');

  // Derived metrics
  const lastSnap = useMemo(
    () => initialSnapshots && initialSnapshots.length > 0
      ? initialSnapshots[initialSnapshots.length - 1]
      : { nav: initialNAV, cashVirtual: initialCash, asOf: '', spy: 100, spus: 100 },
    [initialSnapshots, initialNAV, initialCash]
  );
  const prevSnap = initialSnapshots && initialSnapshots.length > 1 ? initialSnapshots[initialSnapshots.length - 2] : lastSnap;
  const dailyReturn = lastSnap.nav - prevSnap.nav;
  const dailyReturnPct = prevSnap.nav > 0 ? (dailyReturn / prevSnap.nav) * 100 : 0;

  // P&L for selected timeframe (computed from snapshots)
  const plData = useMemo(() => {
    if (!initialSnapshots || initialSnapshots.length < 2) return { value: dailyReturn, pct: dailyReturnPct };
    const daysMap: Record<string, number> = { '24H': 1, '7D': 7, '30D': 30, '90D': 90 };
    const days = daysMap[plTimeframe];
    const cutoff = new Date(Date.now() - days * 86400000);
    const baseSnap = [...initialSnapshots].reverse().find(s => new Date(s.asOf) <= cutoff) ?? initialSnapshots[0];
    const pl = lastSnap.nav - baseSnap.nav;
    const plPct = baseSnap.nav > 0 ? (pl / baseSnap.nav) * 100 : 0;
    return { value: pl, pct: plPct };
  }, [plTimeframe, initialSnapshots, lastSnap, dailyReturn, dailyReturnPct]);

  // Win rate: profitable positions / total positions
  const winRate = useMemo(() => {
    if (!initialPositions || initialPositions.length === 0) return 0;
    const winners = initialPositions.filter(p => p.price > p.costBasis).length;
    return (winners / initialPositions.length) * 100;
  }, [initialPositions]);

  const activeTrades = initialPositions.length;

  const compliantStocksVal = initialPositions.reduce((acc, item) => acc + item.value, 0);
  const zakatableWealth = jarBal + compliantStocksVal;
  const zakatDue = zakatableWealth * 0.025;

  const renderSvgChart = () => {
    if (!initialSnapshots || initialSnapshots.length === 0) return null;
    
    const maxNav = Math.max(...initialSnapshots.map(s => s.nav));
    const minNav = Math.min(...initialSnapshots.map(s => s.nav));
    const maxSpy = Math.max(...initialSnapshots.map(s => s.spy));
    const minSpy = Math.min(...initialSnapshots.map(s => s.spy));
    const maxSpus = Math.max(...initialSnapshots.map(s => s.spus));
    const minSpus = Math.min(...initialSnapshots.map(s => s.spus));

    const overallMax = Math.max(maxNav, maxSpy, maxSpus);
    const overallMin = Math.min(minNav, minSpy, minSpus);
    
    const range = overallMax - overallMin || 1;
    const height = 240;
    const width = 800;

    const mapPoint = (val: number, i: number, length: number) => {
      const x = (i / (length - 1)) * width;
      const y = height - ((val - overallMin) / range) * height;
      return `${x},${y}`;
    };

    const navPoints = initialSnapshots.map((s, i) => mapPoint(s.nav, i, initialSnapshots.length)).join(' ');
    const spyPoints = initialSnapshots.map((s, i) => mapPoint(s.spy, i, initialSnapshots.length)).join(' ');
    const spusPoints = initialSnapshots.map((s, i) => mapPoint(s.spus, i, initialSnapshots.length)).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline points={spyPoints} fill="none" stroke="#4B5563" strokeWidth="2" strokeDasharray="4 4" opacity="0.4" />
        <polyline points={spusPoints} fill="none" stroke="#6366F1" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
        <polyline points={navPoints} fill="none" stroke="#34D399" strokeWidth="3" className="drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
      </svg>
    );
  };

  const renderAllocationDonut = () => {
    if (initialPositions.length === 0) return null;
    let currentAngle = 0;
    const size = 200;
    const center = size / 2;
    const radius = 80;

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto overflow-visible">
        {initialPositions.map((pos, i) => {
          const angle = pos.weight * 360;
          if (angle === 0) return null;
          const largeArcFlag = angle > 180 ? 1 : 0;
          const startX = center + radius * Math.cos((currentAngle - 90) * Math.PI / 180);
          const startY = center + radius * Math.sin((currentAngle - 90) * Math.PI / 180);
          const endX = center + radius * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
          const endY = center + radius * Math.sin((currentAngle + angle - 90) * Math.PI / 180);
          
          const pathData = [
            `M ${center} ${center}`,
            `L ${startX} ${startY}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
            'Z'
          ].join(' ');

          currentAngle += angle;
          return (
            <path 
              key={pos.symbol} 
              d={pathData} 
              fill={`hsl(150, 80%, ${30 + (i * 15)}%)`} 
              className="stroke-black stroke-2 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <title>{pos.symbol}: {(pos.weight * 100).toFixed(1)}%</title>
            </path>
          );
        })}
        <circle cx={center} cy={center} r={radius * 0.6} fill="#000" className="opacity-90" />
      </svg>
    );
  };



  const handlePayZakat = async () => {
    setIsZakatSubmitting(true);
    try {
      const res = await fetch('/api/purify/zakat', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setJarBal(parseFloat(data.balance));
        setZakatPaidAmount(data.amountPaid);
        setZakatPaidSuccess(true);
        
        const newTx = {
          id: Math.random().toString(),
          amount: -parseFloat(data.amountPaid),
          currency: 'SAR',
          type: 'WITHDRAWAL',
          description: `Zakat Purification / دفع الزكاة (2.5% of ${zakatableWealth.toFixed(2)} SAR)`,
          createdAt: new Date().toISOString()
        };
        setTxs(prev => [newTx, ...prev]);
      } else {
        alert(data.message || 'Zakat payment failed.');
      }
    } catch (err) {
      console.error('Failed to pay Zakat:', err);
    } finally {
      setIsZakatSubmitting(false);
    }
  };

  const plUp = plData.value >= 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 pb-24">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            {isAr ? 'مركز المحفظة بالذكاء الاصطناعي' : 'AI Portfolio Hub'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {isAr ? 'إدارة الثروات المؤتمتة والتدقيق الشرعي' : 'Automated wealth management & Sharia-compliant auditing'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {isAr ? 'الذكاء الاصطناعي يعمل 24/7' : 'AI AUTOPILOT ACTIVE'}
        </div>
      </div>

      {/* ── Premium KPI Strip (inspired by pro trading dashboard) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Portfolio Value */}
        <div className="rounded-2xl bg-[#080c14] border border-white/[0.06] p-4 space-y-1 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-cyan-500/8 blur-2xl pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{isAr ? 'قيمة المحفظة' : 'Portfolio Value'}</p>
          <p className="text-2xl font-black font-mono text-white">
            {initialNAV.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs text-gray-500">SAR</span>
          </p>
          <p className="text-[11px] text-gray-500">{isAr ? 'سيولة:' : 'Cash:'} <span className="text-gray-300 font-mono">{jarBal.toFixed(0)} SAR</span></p>
        </div>

        {/* P&L with Timeframe Selector */}
        <div className="rounded-2xl bg-[#080c14] border border-white/[0.06] p-4 space-y-1.5 relative overflow-hidden">
          <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl pointer-events-none ${plUp ? 'bg-emerald-500/8' : 'bg-rose-500/8'}`} />
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">P&L</p>
            <div className="flex gap-0.5">
              {(['24H','7D','30D','90D'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setPlTimeframe(tf)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    plTimeframe === tf ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-600 hover:text-gray-400'
                  }`}
                >{tf}</button>
              ))}
            </div>
          </div>
          <p className={`text-2xl font-black font-mono flex items-center gap-1 ${plUp ? 'text-emerald-400' : 'text-rose-400'}`}>
            {plUp ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
            {plUp ? '+' : ''}{plData.value.toFixed(0)}
          </p>
          <p className={`text-[11px] font-bold font-mono ${plUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {plUp ? '+' : ''}{plData.pct.toFixed(2)}% {isAr ? 'خلال' : 'over'} {plTimeframe}
          </p>
        </div>

        {/* Win Rate */}
        <div className="rounded-2xl bg-[#080c14] border border-white/[0.06] p-4 space-y-1 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-indigo-500/8 blur-2xl pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{isAr ? 'نسبة الربح' : 'Win Rate'}</p>
          <p className="text-2xl font-black font-mono text-indigo-300">{winRate.toFixed(1)}%</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${winRate}%` }} />
            </div>
            <span className="text-[10px] text-gray-500">{isAr ? 'آخر 90 صفقة' : 'Last 90 trades'}</span>
          </div>
        </div>

        {/* Active Trades */}
        <div className="rounded-2xl bg-[#080c14] border border-white/[0.06] p-4 space-y-1 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-500/8 blur-2xl pointer-events-none" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{isAr ? 'الصفقات النشطة' : 'Active Trades'}</p>
          <p className="text-2xl font-black font-mono text-amber-300">{activeTrades}</p>
          <p className="text-[11px] text-gray-500">
            {isAr ? 'أصل مُدار بالذكاء الاصطناعي' : `${activeTrades} AI-managed position${activeTrades !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* ── Secondary KPI Row: Zakat + NAV details ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* NAV card */}
        <div className="glass-panel p-5 rounded-3xl border border-white/5 bg-gradient-to-b from-[#0d1420] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'صافي قيمة الأصول (NAV)' : 'Net Asset Value (NAV)'}</span>
            <Wallet className="w-4 h-4 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-mono font-bold text-white">{initialNAV.toFixed(2)} <span className="text-xs text-gray-400">SAR</span></h2>
          <div className="pt-2 flex justify-between items-center text-xs border-t border-white/5">
            <span className="text-gray-500">{isAr ? 'السيولة' : 'Cash'}</span>
            <span className="font-mono text-gray-300 font-bold">{jarBal.toFixed(2)} SAR</span>
          </div>
        </div>

        {/* Daily Return */}
        <div className="glass-panel p-5 rounded-3xl border border-white/5 bg-gradient-to-b from-[#0d1420] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'العائد اليومي' : 'Daily Return'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <h2 className={`text-2xl font-mono font-bold ${dailyReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {dailyReturn >= 0 ? '+' : ''}{dailyReturn.toFixed(2)} <span className="text-xs text-gray-400">SAR</span>
          </h2>
          <div className="pt-2 flex justify-between items-center text-xs border-t border-white/5">
            <span className="text-gray-500">{isAr ? 'يومي' : 'Daily %'}</span>
            <span className={`font-bold ${dailyReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dailyReturn >= 0 ? '+' : ''}{dailyReturnPct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Zakat */}
        <div className="glass-panel p-5 rounded-3xl border border-white/5 bg-gradient-to-b from-[#0d1420] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'الزكاة المستحقة (2.5%)' : 'Due Zakat (2.5%)'}</span>
            <Coins className="w-4 h-4 text-yellow-400" />
          </div>
          <h2 className="text-2xl font-mono font-bold text-white">
            {zakatDue.toFixed(2)} <span className="text-xs text-gray-400">SAR</span>
          </h2>
          <div className="pt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 leading-tight">
              {isAr ? 'سيولة + أسهم حلال' : 'Cash + halal stocks'}
            </span>
            <button
              onClick={handlePayZakat}
              disabled={isZakatSubmitting || zakatDue <= 0.01}
              className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {isZakatSubmitting ? '...' : (isAr ? 'تطهير' : 'Purify')}
            </button>
          </div>
        </div>
      </div>

      {/* Row 1: AI Portfolio Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AI Portfolio Performance & Active Holdings Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-3xl p-6 border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">{isAr ? 'أداء المحفظة المدارة بالذكاء الاصطناعي' : 'AI-Managed Portfolio Performance'}</h2>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-400"><div className="w-2 h-2 rounded-full bg-emerald-400"/> AI Portfolio</span>
                  <span className="flex items-center gap-1.5 text-indigo-400"><div className="w-2 h-2 rounded-full bg-indigo-400"/> SPUS (Halal)</span>
                  <span className="flex items-center gap-1.5 text-gray-400"><div className="w-2 h-2 rounded-full bg-gray-400"/> SPY</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-mono font-bold text-emerald-400">+{((initialSnapshots.length > 0 ? (lastSnap.nav / initialSnapshots[0].nav) - 1 : 0) * 100).toFixed(2)}%</p>
                <p className="text-xs text-emerald-500/60 font-bold tracking-wider">{isAr ? 'العائد التراكمي' : 'CUMULATIVE RETURN'}</p>
              </div>
            </div>
            <div className="h-64 w-full relative">
              {renderSvgChart()}
            </div>
          </div>

          {/* Active Holdings Table */}
          <div className="glass-panel rounded-3xl p-6 border border-white/5 bg-black/20">
            <h3 className="font-bold text-white mb-6 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-400" />
              {isAr ? 'تخصيص أصول الذكاء الاصطناعي النشطة' : 'Active AI Asset Allocation'}
            </h3>
            
            {initialPositions.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">
                {isAr ? 'لا توجد مراكز استثمارية مفتوحة في المحفظة حالياً.' : 'No active stock positions. The AI committee is currently holding cash.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left rtl:text-right border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                      <th className="pb-3">{isAr ? 'الرمز' : 'Asset'}</th>
                      <th className="pb-3 text-right rtl:text-left">{isAr ? 'الأسهم' : 'Shares'}</th>
                      <th className="pb-3 text-right rtl:text-left">{isAr ? 'السعر' : 'Price'}</th>
                      <th className="pb-3 text-right rtl:text-left">{isAr ? 'الوزن' : 'Weight'}</th>
                      <th className="pb-3 text-right rtl:text-left">{isAr ? 'القيمة' : 'Value'}</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-mono">
                    {initialPositions.map((pos) => (
                      <tr key={pos.symbol} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="py-3 text-white font-bold">{pos.symbol.replace('.SR', '')}</td>
                        <td className="py-3 text-gray-400 text-right rtl:text-left">{pos.shares.toFixed(2)}</td>
                        <td className="py-3 text-gray-400 text-right rtl:text-left">${pos.price.toFixed(2)}</td>
                        <td className="py-3 text-emerald-400 text-right rtl:text-left">{(pos.weight * 100).toFixed(1)}%</td>
                        <td className="py-3 text-white text-right rtl:text-left">${pos.value.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Allocation Donut & Metrics */}
        <div className="space-y-6">
          {/* Allocation Donut */}
          <div className="glass-panel rounded-3xl p-6 border border-white/5 bg-black/20 text-center relative overflow-hidden">
            <h3 className="font-bold text-white mb-6 text-left rtl:text-right">{isAr ? 'التوزيع القطاعي' : 'Sector Distribution'}</h3>
            <div className="relative">
              {renderAllocationDonut()}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-white">{initialPositions.length}</span>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="glass-panel rounded-3xl p-6 border border-white/5 bg-black/20">
            <h3 className="font-bold text-white mb-4">{isAr ? 'المقاييس الرئيسية (AI)' : 'Key Metrics (AI)'}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-gray-400">Sharpe Ratio</span>
                <span className="font-mono text-white font-bold">{initialMetrics.sharpe?.toFixed(2) ?? '0.00'}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-gray-400">CAGR</span>
                <span className="font-mono text-emerald-400 font-bold">{((initialMetrics.cagr ?? 0) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                <span className="text-gray-400">Alpha vs SPUS</span>
                <span className="font-mono text-emerald-400 font-bold">{((initialMetrics.alphaVsSpus ?? 0) * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Max Drawdown</span>
                <span className="font-mono text-red-400 font-bold">{((initialMetrics.maxDrawdown ?? 0) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          {/* Transaction Ledger */}
          <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4">
             <h3 className="font-bold text-sm text-gray-300 flex items-center space-x-2 rtl:space-x-reverse">
               <History className="w-4 h-4 text-neonBlue" />
               <span>{isAr ? 'سجل المعاملات والتدقيق المالي' : 'Transaction Audit Ledger'}</span>
             </h3>

             <div className="space-y-3 max-h-64 overflow-y-auto text-xs pr-2">
               {txs.length === 0 ? (
                 <p className="text-gray-500 text-center py-4">{isAr ? 'لا توجد معاملات مسجلة بعد.' : 'No transactions recorded yet.'}</p>
               ) : (
                 txs.map((tx: any, idx: number) => {
                   const isNegative = tx.amount < 0;
                   return (
                     <div key={idx} className="flex justify-between items-center p-3.5 bg-black/20 border border-white/5 rounded-2xl">
                       <div className="text-left rtl:text-right space-y-0.5">
                         <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                           tx.type === 'TRADE' ? 'bg-indigo-500/10 text-indigo-400' :
                           tx.type === 'PROFIT_SHARE' ? 'bg-emerald-500/10 text-emerald-400' :
                           'bg-yellow-500/10 text-yellow-400'
                         }`}>
                           {tx.type}
                         </span>
                         <p className="text-gray-400 text-[10px] leading-tight pt-1 w-32 truncate">{tx.description || tx.type}</p>
                       </div>
                       <span className={`font-mono font-bold ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
                         {isNegative ? '' : '+'}{tx.amount.toFixed(2)} SAR
                       </span>
                     </div>
                   );
                 })
               )}
             </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {zakatPaidSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121824] border border-white/10 p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto animate-bounce">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? 'تم دفع الزكاة وتطهير المحفظة!' : 'Zakat Paid successfully!'}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? `تم سحب مبلغ الزكاة البالغ ${parseFloat(zakatPaidAmount).toFixed(2)} ريال سعودي بنجاح وتوجيهه للمصارف الشرعية لتطهير المحفظة.`
                  : `Simulated Zakat purification of ${parseFloat(zakatPaidAmount).toFixed(2)} SAR successfully paid from your cash balance.`
                }
              </p>
              <button
                onClick={() => setZakatPaidSuccess(false)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAr ? 'حسناً' : 'Done'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
