'use client';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Briefcase, History, CheckCircle2, Coins,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Landmark, Trophy, Sparkles,
  Gift, Zap, Check, Lock, X, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { formatMoney as formatMoneyShared, formatSARNumber, RiyalSymbol } from '@/lib/currency';

export interface Position {
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
  side?: 'long' | 'short';
}

export interface Snapshot {
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

interface PaperAccountView {
  status: string;
  retrievedAt: string;
  buyingPower: number;
  tradingBlocked: boolean;
  dayPnl: { value: number; pct: number };
  openOrders: Array<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    status: string;
    qty: string;
    filledQty: string;
  }>;
}

interface DashboardClientProps {
  locale: string;
  initialNAV: number | null;
  initialCash: number;
  cashCurrency: 'SAR' | 'USD' | null;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialMetrics: any;
  initialTransactions: any[];
  performanceStatus: PerformanceStatus;
  /** @deprecated unused — the combined-NAV-unavailable banner that read this was removed as
   * unreachable dead code. Kept optional so existing callers don't need updating. */
  currencyTotals?: CurrencyTotal[];
  accountKind?: 'rushd' | 'alpaca';
  paperAccount?: PaperAccountView;
}

export default function DashboardClient({
  locale,
  initialNAV,
  initialCash,
  cashCurrency,
  initialPositions,
  initialSnapshots,
  initialMetrics,
  initialTransactions,
  performanceStatus,
  accountKind = 'rushd',
  paperAccount,
}: DashboardClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';
  const isAlpaca = accountKind === 'alpaca';

  const isDemoActive = !isAlpaca && (initialPositions.length === 0 || initialNAV === null || performanceStatus !== 'available' || (initialSnapshots?.length ?? 0) < 2);

  const demoPositions = useMemo<Position[]>(() => [
    {
      symbol: '2222.SR',
      name: isAr ? 'أرامكو السعودية' : 'Saudi Aramco',
      market: 'TASI',
      currency: 'SAR',
      shares: 500,
      costBasis: 29.50,
      price: 32.10,
      value: 16050,
      weight: 0.063,
      complianceStatus: 'VERIFIED_COMPLIANT',
    },
    {
      symbol: '1120.SR',
      name: isAr ? 'مصرف الراجحي' : 'Al Rajhi Bank',
      market: 'TASI',
      currency: 'SAR',
      shares: 400,
      costBasis: 82.00,
      price: 88.50,
      value: 35400,
      weight: 0.139,
      complianceStatus: 'VERIFIED_COMPLIANT',
    },
    {
      symbol: '2010.SR',
      name: isAr ? 'سابك' : 'SABIC',
      market: 'TASI',
      currency: 'SAR',
      shares: 300,
      costBasis: 71.00,
      price: 74.20,
      value: 22260,
      weight: 0.087,
      complianceStatus: 'VERIFIED_COMPLIANT',
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      market: 'NASDAQ',
      currency: 'USD',
      shares: 150,
      costBasis: 110.00,
      price: 125.50,
      value: 70593.75,
      weight: 0.277,
      complianceStatus: 'VERIFIED_COMPLIANT',
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      market: 'NASDAQ',
      currency: 'USD',
      shares: 80,
      costBasis: 195.00,
      price: 220.00,
      value: 66000.00,
      weight: 0.259,
      complianceStatus: 'VERIFIED_COMPLIANT',
    },
  ], [isAr]);

  const demoSnapshots = useMemo<Snapshot[]>(() => {
    const nowTs = Date.now();
    return Array.from({ length: 30 }, (_, i) => {
      const day = 29 - i;
      const date = new Date(nowTs - day * 86400000);
      const progress = i / 29;
      const noise = (Math.sin(i * 0.8) * 0.015 + Math.cos(i * 0.5) * 0.01);
      const nav = 220000 + (254853.75 - 220000) * Math.pow(progress, 0.85) * (1 + noise);
      const spus = 220000 + (242000 - 220000) * Math.pow(progress, 0.9) * (1 + noise * 0.7);
      const spy = 220000 + (238000 - 220000) * Math.pow(progress, 0.95) * (1 + noise * 0.5);

      return {
        asOf: date.toISOString(),
        nav: Math.round(nav * 100) / 100,
        cashVirtual: 45000,
        currency: 'SAR',
        spy: Math.round(spy * 100) / 100,
        spus: Math.round(spus * 100) / 100,
      };
    });
  }, []);

  const demoMetrics = useMemo(() => ({
    sharpe: 1.85,
    cagr: 0.158,
    alphaVsSpus: 0.052,
    alphaVsSpy: 0.071,
    maxDrawdown: -0.042,
  }), []);

  const demoTransactions = useMemo(() => {
    const nowTs = Date.now();
    return [
      {
        id: 'demo-tx-1',
        amount: 10000,
        currency: 'SAR',
        type: 'DEPOSIT',
        description: isAr ? 'إيداع أولي في الحصالة المحاكية' : 'Initial Jar Deposit',
        createdAt: new Date(nowTs - 25 * 86400000).toISOString(),
      },
      {
        id: 'demo-tx-2',
        amount: -14750,
        currency: 'SAR',
        type: 'TRADE',
        description: isAr ? 'شراء 500 سهم في أرامكو السعودية (2222.SR)' : 'Buy 500 shares Saudi Aramco (2222.SR)',
        createdAt: new Date(nowTs - 20 * 86400000).toISOString(),
      },
      {
        id: 'demo-tx-3',
        amount: -32800,
        currency: 'SAR',
        type: 'TRADE',
        description: isAr ? 'شراء 400 سهم في مصرف الراجحي (1120.SR)' : 'Buy 400 shares Al Rajhi Bank (1120.SR)',
        createdAt: new Date(nowTs - 15 * 86400000).toISOString(),
      },
      {
        id: 'demo-tx-4',
        amount: 3420.5,
        currency: 'SAR',
        type: 'PROFIT_SHARE',
        description: isAr ? 'أرباح مضاربة حصالة الادخار الذكية' : 'Savings Jar Profit Share',
        createdAt: new Date(nowTs - 7 * 86400000).toISOString(),
      },
      {
        id: 'demo-tx-5',
        amount: -1250,
        currency: 'SAR',
        type: 'WITHDRAWAL',
        description: isAr ? 'دفع الزكاة المحسوبة (2.5%)' : 'Calculated Zakat Payment (2.5%)',
        createdAt: new Date(nowTs - 2 * 86400000).toISOString(),
      },
    ];
  }, [isAr]);

  const positions = isDemoActive ? demoPositions : initialPositions;
  const snapshots = isDemoActive ? demoSnapshots : initialSnapshots;
  const navValue = isDemoActive ? 254853.75 : initialNAV;
  const cashVal = isDemoActive ? 45000 : initialCash;
  const effectiveCashCurrency = isDemoActive ? 'SAR' : cashCurrency;
  const metrics = isDemoActive ? demoMetrics : initialMetrics;
  const effectivePerformanceStatus: PerformanceStatus = isDemoActive ? 'available' : performanceStatus;

  const formatMoney = (value: number, currency: 'SAR' | 'USD') => formatMoneyShared(value, currency, locale);
  // Alpaca's paper account snapshot never carries a persisted NAV series, so it always
  // reports as 'no_snapshots' — the same honest empty state a fresh Rushd strategy shows.
  const performanceMessage = {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: '',
  }[effectivePerformanceStatus];
  const hasPerformanceMetrics = effectivePerformanceStatus === 'available' && snapshots.length >= 2;

  const [jarBal, setJarBal] = useState(cashVal);
  // Demo transactions are only ever a stand-in for the demo portfolio; a real account with
  // a genuinely empty ledger must reach the honest noTransactions empty state, not fabricated rows.
  const [txs, setTxs] = useState<any[]>(isDemoActive ? demoTransactions : (initialTransactions ?? []));
  
  const [zakatPaidSuccess, setZakatPaidSuccess] = useState(false);
  const [zakatPaidAmount, setZakatPaidAmount] = useState('0.00');
  const [isZakatSubmitting, setIsZakatSubmitting] = useState(false);

  // Interactive Gamification Level & XP states
  const [xp, setXp] = useState(350);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [xpNotification, setXpNotification] = useState<string | null>(null);

  const handleClaimDailyXp = () => {
    if (dailyClaimed) return;
    setXp(prev => prev + 50);
    setDailyClaimed(true);
    setXpNotification(isAr ? '🎉 مبروك! حصلت على +50 XP مكافأة الحضور اليومي!' : '🎉 Congrats! Earned +50 XP Daily Reward!');
    setTimeout(() => setXpNotification(null), 4000);
  };

  // P&L timeframe selector
  const [plTimeframe, setPlTimeframe] = useState<'24H'|'7D'|'30D'|'90D'>('24H');
  const [chartTimeframe, setChartTimeframe] = useState<'24H'|'7D'|'30D'|'90D'|'1Y'|'ALL'>('30D');

  // Derived metrics
  const lastSnap = useMemo(
    () => snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    [snapshots]
  );

  const chartSnapshots = useMemo(() => {
    if (snapshots.length <= 2) return snapshots;
    const daysMap: Record<string, number> = { '24H': 1, '7D': 7, '30D': 30, '90D': 90, '1Y': 365, 'ALL': 9999 };
    const days = daysMap[chartTimeframe];
    if (days === 9999) return snapshots;
    const cutoff = new Date(Date.now() - days * 86400000);
    const filtered = snapshots.filter(s => new Date(s.asOf) >= cutoff);
    return filtered.length >= 2 ? filtered : snapshots.slice(-Math.min(snapshots.length, Math.max(2, days)));
  }, [snapshots, chartTimeframe]);

  // P&L for selected timeframe (computed from snapshots)
  const plData = useMemo(() => {
    if (isAlpaca) return plTimeframe === '24H' && paperAccount ? paperAccount.dayPnl : null;
    if (effectivePerformanceStatus !== 'available' || snapshots.length < 2 || !lastSnap) return null;
    const daysMap: Record<string, number> = { '24H': 1, '7D': 7, '30D': 30, '90D': 90 };
    const days = daysMap[plTimeframe];
    const cutoff = new Date(Date.now() - days * 86400000);
    const baseSnap = [...snapshots].reverse().find(s => new Date(s.asOf) <= cutoff) ?? snapshots[0];
    const pl = lastSnap.nav - baseSnap.nav;
    const plPct = baseSnap.nav > 0 ? (pl / baseSnap.nav) * 100 : 0;
    return { value: pl, pct: plPct };
  }, [isAlpaca, paperAccount, plTimeframe, snapshots, lastSnap, effectivePerformanceStatus]);

  // Win rate: profitable positions / total positions
  const winRate = useMemo(() => {
    const withBasis = positions.filter(p => p.costBasis !== null && p.costBasis > 0);
    if (withBasis.length === 0) return null;
    const winners = withBasis.filter(p => p.price >= p.costBasis!);
    return (winners.length / withBasis.length) * 100;
  }, [positions]);

  const activeTrades = positions.length;
  const cumulativeReturn = useMemo(() => {
    if (effectivePerformanceStatus !== 'available' || snapshots.length < 2 || !lastSnap) return null;
    const firstSnap = snapshots[0];
    return firstSnap.nav > 0 ? (lastSnap.nav - firstSnap.nav) / firstSnap.nav : 0;
  }, [snapshots, lastSnap, effectivePerformanceStatus]);

  const compliantStocksVal = positions
    .filter(item => item.complianceStatus === 'VERIFIED_COMPLIANT' && item.currency === 'SAR')
    .reduce((acc, item) => acc + item.value, 0);
  const zakatableWealth = effectiveCashCurrency === 'SAR' ? jarBal + compliantStocksVal : null;
  const zakatDue = zakatableWealth === null ? null : zakatableWealth * 0.025;

  const renderSvgChart = () => {
    if (effectivePerformanceStatus !== 'available' || chartSnapshots.length < 2) {
      return <p className="flex h-full items-center justify-center text-center text-xs text-foreground/45">{performanceMessage || t('portfolioPerformanceInsufficient')}</p>;
    }
    
    const maxNav = Math.max(...chartSnapshots.map(s => s.nav));
    const minNav = Math.min(...chartSnapshots.map(s => s.nav));
    const maxSpy = Math.max(...chartSnapshots.map(s => s.spy));
    const minSpy = Math.min(...chartSnapshots.map(s => s.spy));
    const maxSpus = Math.max(...chartSnapshots.map(s => s.spus));
    const minSpus = Math.min(...chartSnapshots.map(s => s.spus));

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

    const navPoints = chartSnapshots.map((s, i) => mapPoint(s.nav, i, chartSnapshots.length)).join(' ');
    const spyPoints = chartSnapshots.map((s, i) => mapPoint(s.spy, i, chartSnapshots.length)).join(' ');
    const spusPoints = chartSnapshots.map((s, i) => mapPoint(s.spus, i, chartSnapshots.length)).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline points={spyPoints} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-foreground/30" />
        <polyline points={spusPoints} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-accent/60" />
        <polyline points={navPoints} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up" />
      </svg>
    );
  };

  const renderAllocationDonut = () => {
    if (positions.length === 0) return null;
    if (navValue === null) return null;
    let currentAngle = 0;
    const size = 200;
    const center = size / 2;
    const radius = 80;

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto overflow-visible">
        {positions.map((pos, i) => {
          const angle = (pos.weight ?? 0) * 360;
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
              fill={`rgba(var(--accent-color-rgb), ${Math.max(0.3, 0.9 - i * 0.1)})`}
              style={{ stroke: 'var(--surface-card)' }}
              strokeWidth={2}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            >
              <title>{`${pos.symbol}: ${((pos.weight ?? 0) * 100).toFixed(1)}%`}</title>
            </path>
          );
        })}
        <circle cx={center} cy={center} r={radius * 0.6} style={{ fill: 'var(--surface-card)' }} />
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
          description: 'Zakat payment / دفع الزكاة (2.5%)',
          createdAt: new Date().toISOString()
        };
        setTxs(prev => [newTx, ...prev]);
      } else {
        alert(data.message || t('zakatPaymentFailed'));
      }
    } catch (err) {
      console.error('Failed to pay Zakat:', err);
    } finally {
      setIsZakatSubmitting(false);
    }
  };

  const plUp = plData !== null && plData.value >= 0;
  const accountStatusDot = isAlpaca
    ? paperAccount?.tradingBlocked || initialCash < 0
      ? 'bg-down'
      : paperAccount?.status === 'ACTIVE'
        ? 'bg-up'
        : 'bg-noncompliant'
    : 'bg-accent';

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-24 md:p-6">
      {/* Title Header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground ltr:tracking-tight sm:text-4xl">
            {isAlpaca ? t('alpacaTitle') : t('portfolioTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/55">
            {isAlpaca ? t('alpacaSubtitle') : t('portfolioSubtitle')}
          </p>
        </div>
        <div className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full bg-surface-card px-3.5 text-xs font-semibold text-foreground/65 shadow-sm ring-1 ring-foreground/[0.06]">
          <span className={`h-1.5 w-1.5 rounded-full ${accountStatusDot}`} aria-hidden="true" />
          {isAlpaca
            ? `${t('alpacaPaperBadge')} · ${paperAccount?.status ?? ''}${paperAccount?.tradingBlocked ? ` · ${t('alpacaTradingBlocked')}` : ''}`
            : isDemoActive
              ? (isAr ? '⚡ محفظة استثمارية تفاعلية تجريبية' : '⚡ Interactive Investor Demo Portfolio')
              : t('portfolioPaperBadge')}
        </div>
      </div>

      {/* Gamification Level & Progress Card */}
      {!isAlpaca && (
        <div className="relative overflow-hidden rounded-[1.75rem] border border-accent/20 bg-surface-card p-5 sm:p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent/40">
          {/* XP Toast Notification */}
          <AnimatePresence>
            {xpNotification && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 flex items-center justify-between rounded-2xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-lg"
              >
                <span>{xpNotification}</span>
                <button onClick={() => setXpNotification(null)} className="rounded-full p-1 hover:bg-white/20">
                  <X className="size-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowLevelModal(true)}
                className="group relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent border border-accent/20 transition-all duration-300 hover:scale-105 hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title={isAr ? 'عرض خريطة المستويات والمكافآت' : 'View Level Perks & Roadmap'}
              >
                <Trophy className="size-7 transition-transform duration-300 group-hover:rotate-12" aria-hidden="true" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent">
                    {isAr ? 'مستوى التعلّم والخبرة' : 'Level & Progress'}
                  </span>
                  <button
                    onClick={() => setShowLevelModal(true)}
                    className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-extrabold text-white transition-all hover:bg-accent/80 hover:scale-105 active:scale-95"
                  >
                    {isAr ? 'المستوى 3' : 'Level 3'}
                  </button>
                </div>
                <h2 className="mt-1 text-base font-extrabold text-foreground sm:text-lg">
                  {isAr ? 'مستثمر واعد · Promising Investor' : 'Promising Investor'}
                </h2>
                <p className="mt-0.5 text-xs text-foreground/60">
                  {isAr ? `حققت ${xp} XP من أصل 500 XP للوصول إلى المستوى 4` : `${xp} XP earned out of 500 XP to Level 4`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-2 ms-auto">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-accent">{xp} / 500 XP ({Math.round((xp / 500) * 100)}%)</span>
                <button
                  onClick={handleClaimDailyXp}
                  disabled={dailyClaimed}
                  className={`group relative overflow-hidden rounded-full px-3 py-1 text-xs font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    dailyClaimed
                      ? 'bg-foreground/10 text-foreground/50 cursor-default'
                      : 'bg-accent text-white hover:bg-accent/90 hover:shadow-md active:scale-95'
                  }`}
                >
                  <span className="relative z-10 flex items-center gap-1">
                    <Zap className="size-3.5 fill-current" />
                    {dailyClaimed ? (isAr ? 'تم الاستلام ✓' : 'Claimed ✓') : (isAr ? '+50 XP يومية' : '+50 Daily XP')}
                  </span>
                </button>
              </div>

              <div
                onClick={() => setShowLevelModal(true)}
                className="w-44 sm:w-64 h-3 overflow-hidden rounded-full bg-foreground/10 cursor-pointer p-0.5 ring-1 ring-accent/20 transition-all hover:ring-accent"
                title={isAr ? 'اضغط لعرض التفاصيل' : 'Click to inspect details'}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, (xp / 500) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between border-t border-foreground/[0.06] pt-3 text-xs gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground/50">{isAr ? 'الشارات المفتوحة:' : 'Badges:'}</span>
              <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/75">🛡️ {isAr ? 'فاحص أيوفي' : 'AAOIFI Auditor'}</span>
              <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/75">⚡ {isAr ? 'رواد الادخار' : 'Savings Pioneer'}</span>
              <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/75">📊 {isAr ? 'محلل القيمة' : 'Value Analyst'}</span>
            </div>
            
            <div className="flex items-center gap-3 ms-auto">
              <button
                onClick={() => setShowLevelModal(true)}
                className="text-xs font-bold text-foreground/70 hover:text-accent transition-colors flex items-center gap-1"
              >
                {isAr ? 'خريطة المستويات' : 'Level Roadmap'}
              </button>
              <Link
                href={`/${locale}/academy`}
                className="group relative overflow-hidden rounded-xl bg-accent/10 px-3.5 py-1.5 text-xs font-extrabold text-accent transition-all duration-300 hover:bg-accent hover:text-white hover:shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                <span>{isAr ? 'طوّر مستواك ←' : 'Advance Level →'}</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Level Roadmap Modal */}
      {showLevelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-foreground/10 bg-surface-card p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-white font-extrabold text-sm">
                  L{Math.floor(xp / 150) + 1}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{isAr ? 'مستويات الخبراء والمكافآت' : 'Investor Level Roadmap'}</h3>
                  <p className="text-xs text-foreground/60">{isAr ? 'تقدمك في الأكاديمية والمميزات المفتوحة' : 'Your progress and unlocked platform perks'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLevelModal(false)}
                className="rounded-full p-2 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Level Milestones list */}
            <div className="space-y-3 max-h-80 overflow-y-auto pe-1">
              {[
                { lvl: 1, title: isAr ? 'طالب علوم مالية' : 'Financial Apprentice', xpReq: 0, perks: isAr ? 'التداول الافتراضي وبناء الحصالات' : 'Virtual Trading & Savings Jars', done: true },
                { lvl: 2, title: isAr ? 'فاحص الشريعة' : 'Sharia Auditor', xpReq: 150, perks: isAr ? 'فحص أسهم أيوفي (AAOIFI) وحاسبة الزكاة' : 'AAOIFI Screening & Zakat Calc', done: true },
                { lvl: 3, title: isAr ? 'مستثمر واعد' : 'Promising Investor', xpReq: 350, perks: isAr ? 'المحفظة التفاعلية وتخصيص الأصول' : 'Interactive Demo & Asset Allocation', current: true },
                { lvl: 4, title: isAr ? 'محلل المخاطر' : 'Risk Analyst', xpReq: 500, perks: isAr ? 'أدوات المحافظ الكمية وتقييم Sharpe' : 'Quant Risk Suite & Sharpe Analytics', locked: true },
                { lvl: 5, title: isAr ? 'خبير المحافظ' : 'Portfolio Master', xpReq: 1000, perks: isAr ? 'إعادة التوازن التلقائي ودوري الاستراتيجيات' : 'Auto Rebalancing & Strategy League', locked: true },
              ].map((m) => (
                <div
                  key={m.lvl}
                  className={`flex items-start justify-between rounded-2xl p-3.5 border text-xs transition-all ${
                    m.current
                      ? 'border-accent bg-accent/10 text-foreground ring-1 ring-accent/30'
                      : m.done
                      ? 'border-foreground/10 bg-foreground/[0.02] text-foreground/80'
                      : 'border-foreground/5 bg-foreground/[0.01] opacity-60 text-foreground/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${
                      m.current ? 'bg-accent text-white' : m.done ? 'bg-up/20 text-up' : 'bg-foreground/10 text-foreground/40'
                    }`}>
                      {m.done ? <Check className="size-4" /> : m.locked ? <Lock className="size-3.5" /> : `L${m.lvl}`}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{m.title}</span>
                        {m.current && <span className="rounded-full bg-accent px-2 py-0.2 text-[9px] font-extrabold text-white">{isAr ? 'مستواك الحالي' : 'Current'}</span>}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed opacity-80">{m.perks}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-semibold shrink-0 ms-2">{m.xpReq} XP</span>
                </div>
              ))}
            </div>

            <div className="border-t border-foreground/10 pt-4 flex items-center justify-between">
              <button
                onClick={handleClaimDailyXp}
                disabled={dailyClaimed}
                className="min-h-11 rounded-2xl bg-accent px-5 text-xs font-bold text-white transition-all hover:bg-accent/90 disabled:opacity-50"
              >
                {dailyClaimed ? (isAr ? 'تم استلام مكافأة اليوم' : 'Daily Reward Claimed') : (isAr ? 'مطالبة بـ +50 XP الآن' : 'Claim +50 XP Now')}
              </button>
              <button
                onClick={() => setShowLevelModal(false)}
                className="min-h-11 rounded-2xl border border-foreground/15 px-4 text-xs font-semibold text-foreground/75 hover:bg-foreground/5"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAlpaca && paperAccount ? (
        <div className="space-y-3" role="note">
          {initialCash < 0 ? (
            <div className="flex items-start gap-3 rounded-2xl bg-down/10 p-4 text-sm text-down">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="leading-relaxed">{t('alpacaNegativeCashWarning')}</p>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-4 rounded-2xl bg-noncompliant/10 p-4 text-xs text-noncompliant">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="leading-relaxed">{t('alpacaShariaDisclosure')}</p>
            </div>
            <time className="shrink-0 font-mono tabular-nums text-foreground/45" dateTime={paperAccount.retrievedAt} dir="ltr">
              {new Intl.DateTimeFormat(isAr ? 'ar-SA-u-nu-latn' : 'en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
                calendar: 'gregory',
                timeZone: 'Asia/Riyadh',
              }).format(new Date(paperAccount.retrievedAt))}
            </time>
          </div>
        </div>
      ) : null}

      {/* ── KPI strip: one dominant number per card. Auto-fit grid (not fixed 12-col spans) so
           omitted cards reflow instead of leaving dead columns. ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] text-start">
        {/* Portfolio Value — NAV Card */}
        {navValue !== null && effectiveCashCurrency && (
          <div className="rounded-2xl border border-accent/30 bg-surface-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground/60">{isAlpaca ? t('alpacaEquity') : t('portfolioNav')}</p>
              <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                {t('paperEvidenceTag')}
              </span>
            </div>
            <div className="mt-3" dir="ltr">
              <p className="font-mono text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                {formatMoney(navValue, effectiveCashCurrency)}
              </p>
            </div>
            <p className="mt-2 text-xs font-medium text-foreground/60 flex items-center gap-1">
              <span>{isAlpaca ? t('alpacaCash') : t('cashVirtual')}:</span>
              <span dir="ltr" className="font-mono font-bold tabular-nums text-foreground/80">
                {formatMoney(jarBal, effectiveCashCurrency)}
              </span>
            </p>
          </div>
        )}

        {/* P&L Card with Timeframe Selector */}
        {plData !== null && effectiveCashCurrency && (
          <div className={`rounded-2xl border p-5 shadow-sm ${
            plUp ? 'border-up/30 bg-up/[0.04]' : 'border-down/30 bg-down/[0.04]'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground/60">{isAlpaca ? t('alpacaDayPnl') : t('pnlLabel')}</p>
              <div className="flex gap-0.5 rounded-xl bg-foreground/[0.06] p-1" role="group" aria-label={t('pnlTimeframe')}>
                {(isAlpaca ? ['24H'] as const : ['24H','7D','30D','90D'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setPlTimeframe(tf)}
                    aria-pressed={plTimeframe === tf}
                    className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      plTimeframe === tf ? 'bg-surface-raised text-foreground shadow-sm ring-1 ring-foreground/10' : 'text-foreground/50 hover:text-foreground'
                    }`}
                  >{tf}</button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5" dir="ltr">
              <p className={`font-mono text-3xl font-extrabold tracking-tight tabular-nums flex items-center gap-1 ${plUp ? 'text-up' : 'text-down'}`}>
                {plUp ? <ArrowUpRight className="size-6 shrink-0" /> : <ArrowDownRight className="size-6 shrink-0" />}
                <span>{plUp ? '+' : ''}{formatMoney(plData.value, effectiveCashCurrency)}</span>
              </p>
            </div>
            <p className={`mt-2 text-xs font-extrabold ${plUp ? 'text-up' : 'text-down'}`}>
              <span dir="ltr" className="inline-block">{`${plUp ? '+' : ''}${plData.pct.toFixed(2)}%`}</span>
              <span className="ms-1 font-normal text-foreground/60">{t('overTimeframe', { period: plTimeframe })}</span>
            </p>
          </div>
        )}

        {/* Active Trades */}
        <div className="rounded-2xl border border-foreground/10 bg-surface-card p-5 shadow-sm">
          <p className="text-xs font-bold text-foreground/60">{isAlpaca ? t('alpacaPositions') : t('holdingsHeading')}</p>
          <div className="mt-3" dir="ltr">
            <p className="font-mono text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{activeTrades}</p>
          </div>
          <p className="mt-2 text-xs text-foreground/60">{activeTrades === 0 ? t('noActivePositions') : t('openPositionsCount')}</p>
        </div>

        {/* Win Rate */}
        {winRate !== null && (
          <div className="rounded-2xl border border-foreground/10 bg-surface-card p-5 shadow-sm">
            <p className="text-xs font-bold text-foreground/60">{t('profitablePositions')}</p>
            <div className="mt-3" dir="ltr">
              <p className="font-mono text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{winRate.toFixed(1)}%</p>
            </div>
            <p className="mt-2 text-xs text-foreground/60">{t('winRateRecordedBasis')}</p>
          </div>
        )}

        {isAlpaca ? (
          paperAccount && effectiveCashCurrency && (
            <div className="rounded-2xl border border-foreground/10 bg-surface-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground/60">{t('alpacaBuyingPower')}</span>
                <Landmark className="size-4 text-accent" aria-hidden="true" />
              </div>
              <div className="mt-3" dir="ltr">
                <p className="font-mono text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                  {formatMoney(paperAccount.buyingPower, effectiveCashCurrency)}
                </p>
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-foreground/50">{t('alpacaBuyingPowerNote')}</p>
            </div>
          )
        ) : (
          zakatDue !== null && (
            <div className="rounded-2xl border border-accent/25 bg-surface-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground/60">{t('zakatDue')}</span>
                <Coins className="size-4 text-accent" aria-hidden="true" />
              </div>
              <div className="mt-3" dir="ltr">
                <p className="font-mono text-2xl font-extrabold tracking-tight tabular-nums text-accent">
                  {formatMoney(zakatDue, 'SAR')}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-foreground/[0.08] pt-2">
                <span className="line-clamp-2 text-[10px] leading-tight text-foreground/50">
                  {isDemoActive ? (isAr ? 'تقدير من المحفظة التجريبية — غير قابل للدفع' : 'Demo portfolio estimate — not payable') : t('zakatVerifiedAssetsOnly')}
                </span>
                {!isDemoActive && (
                  <button
                    onClick={handlePayZakat}
                    disabled={isZakatSubmitting || zakatDue <= 0.01}
                    className="min-h-8 shrink-0 rounded-xl bg-accent px-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isZakatSubmitting ? '...' : t('payZakat')}
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Performance and holdings lead; supporting context stays secondary. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-[1.75rem] border border-foreground/10 bg-surface-card p-5 shadow-sm sm:p-7 text-start">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-foreground/[0.08] pb-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-extrabold text-foreground">{isAlpaca ? t('alpacaPerformanceTitle') : t('historicalPerformanceTitle')}</h2>
                  
                  {/* Time Period Selector matching P&L card */}
                  <div className="flex gap-0.5 rounded-xl bg-foreground/[0.06] p-1" role="group" aria-label="فترة الأداء التاريخي">
                    {(['24H', '7D', '30D', '90D', '1Y', 'ALL'] as const).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setChartTimeframe(tf)}
                        aria-pressed={chartTimeframe === tf}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          chartTimeframe === tf ? 'bg-surface-raised text-foreground shadow-sm ring-1 ring-foreground/10' : 'text-foreground/50 hover:text-foreground'
                        }`}
                      >{tf}</button>
                    ))}
                  </div>
                </div>

                {!isAlpaca ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs font-bold text-foreground/60">
                    <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-up" aria-hidden="true" />{t('portfolioNAVLegend')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-accent" aria-hidden="true" />{t('spusLegend')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-foreground/35" aria-hidden="true" />{t('spyLegend')}</span>
                  </div>
                ) : null}
              </div>

              {cumulativeReturn !== null && (
                <div className="text-start sm:text-end" dir="ltr">
                  <p className={`font-mono text-3xl font-extrabold tracking-tight tabular-nums ${cumulativeReturn >= 0 ? 'text-up' : 'text-down'}`}>
                    {`${cumulativeReturn >= 0 ? '+' : ''}${(cumulativeReturn * 100).toFixed(2)}%`}
                  </p>
                  <p className="mt-1 text-xs font-bold text-foreground/50">{isAlpaca ? t('alpacaCurrentSnapshotOnly') : t('cumulativeReturn')}</p>
                </div>
              )}
            </div>
            <div className="relative h-64 w-full" dir="ltr">
              {renderSvgChart()}
            </div>
          </section>

          {/* Active Holdings Table */}
          <section className="rounded-[1.75rem] bg-surface-card p-5 shadow-sm ring-1 ring-foreground/[0.06] sm:p-7">
            <h3 className="mb-6 flex items-center gap-2 font-semibold text-foreground">
              <Briefcase className="h-4 w-4 text-foreground/45" aria-hidden="true" />
              {isAlpaca ? t('alpacaPositions') : t('holdingsHeading')}
            </h3>
            
            {positions.length === 0 ? (
              <p className="py-10 text-center text-sm leading-relaxed text-foreground/50">
                {isAlpaca ? t('alpacaNoPositionsBody') : t('noActivePositions')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-start">
                  <thead>
                    <tr className="border-b border-foreground/[0.06] text-[10px] font-semibold uppercase text-foreground/45 ltr:tracking-wider">
                      <th className="pb-3 text-start">{t('symbol')}</th>
                      <th className="pb-3 text-end">{t('shares')}</th>
                      <th className="pb-3 text-end">{t('price')}</th>
                      <th className="pb-3 text-end">{t('weight')}</th>
                      <th className="pb-3 text-end">{t('value')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-mono">
                    {positions.map((pos) => (
                      <tr key={pos.symbol} className="border-b border-foreground/[0.05] transition-colors duration-150 last:border-0 hover:bg-foreground/[0.025]">
                        <td className="py-3.5 font-semibold text-foreground">
                          <span dir="ltr">{pos.symbol}</span>
                          <span className="ms-2 text-[9px] text-foreground/40">{pos.market}</span>
                          {isAlpaca && pos.side ? (
                            <span className="ms-2 text-[9px] text-foreground/55">{t(pos.side === 'short' ? 'alpacaShort' : 'alpacaLong')}</span>
                          ) : null}
                          <span
                            className={`ms-2 inline-flex rounded-full px-1.5 py-0.5 text-[9px] ${
                              pos.complianceStatus === 'VERIFIED_COMPLIANT'
                                ? 'bg-up/10 text-up'
                                : pos.complianceStatus === 'VERIFIED_NON_COMPLIANT'
                                  ? 'bg-noncompliant/10 text-noncompliant'
                                  : 'bg-foreground/[0.05] text-foreground/55'
                            }`}
                            title={pos.complianceStatus === 'UNVERIFIED' ? t('shariaUnverifiedNote') : undefined}
                          >
                            {pos.complianceStatus === 'VERIFIED_COMPLIANT'
                              ? t('compliant')
                              : pos.complianceStatus === 'VERIFIED_NON_COMPLIANT'
                                ? t('nonCompliant')
                                : t('shariaUnverified')}
                          </span>
                        </td>
                        <td className="py-3.5 text-end tabular-nums text-foreground/60">{pos.shares.toFixed(2)}</td>
                        <td className="py-3.5 text-end tabular-nums text-foreground/60">{formatMoney(pos.price, pos.currency)}</td>
                        <td className="py-3.5 text-end tabular-nums text-foreground/60">{pos.weight === null ? '-' : `${(pos.weight * 100).toFixed(1)}%`}</td>
                        <td className="py-3.5 text-end font-semibold tabular-nums text-foreground">{formatMoney(pos.value, pos.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Allocation Donut & Metrics */}
        <div className="space-y-6">
          {/* Allocation Donut */}
          <section className="relative overflow-hidden rounded-[1.75rem] bg-surface-card p-6 text-center shadow-sm ring-1 ring-foreground/[0.06]">
            <h3 className="mb-6 text-start font-semibold text-foreground">{isAlpaca ? t('alpacaExposureDistribution') : t('sectorDistribution')}</h3>
            {positions.length === 0 ? (
              <p className="py-12 text-sm leading-relaxed text-foreground/50">
                {isAlpaca ? t('alpacaNoPositionsBody') : t('noActivePositions')}
              </p>
            ) : (
              <div className="space-y-6">
                {navValue !== null && (
                  <div className="relative">
                    {renderAllocationDonut()}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{positions.length}</span>
                    </div>
                  </div>
                )}

                <div className="border-t border-foreground/[0.06] pt-5 text-start">
                  <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-foreground/40">
                    {isAlpaca ? t('alpacaPositions') : t('holdingsHeading')}
                  </h4>
                  <div className="max-h-56 space-y-2 overflow-y-auto pe-1">
                    {positions.map((pos, i) => {
                      const pctStr = pos.weight === null ? '-' : `${(pos.weight * 100).toFixed(1)}%`;
                      return (
                        <div key={pos.symbol} className="flex items-center justify-between rounded-2xl border border-foreground/[0.04] bg-foreground/[0.02] p-2.5 text-xs">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span 
                              className="h-2.5 w-2.5 shrink-0 rounded-full" 
                              style={{ backgroundColor: `rgba(var(--accent-color-rgb), ${Math.max(0.3, 0.9 - i * 0.1)})` }}
                            />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-bold text-foreground" dir="ltr">{pos.symbol}</span>
                              {pos.name && pos.name !== pos.symbol && (
                                <span className="truncate text-[10px] text-foreground/45">{pos.name}</span>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono font-semibold text-foreground/80">{pctStr}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Key Metrics — the whole section is dropped when there is no persisted performance history to compute it from */}
          {hasPerformanceMetrics && (
            <section className="rounded-[1.75rem] bg-surface-card p-6 shadow-sm ring-1 ring-foreground/[0.06]">
              <h3 className="mb-4 font-semibold text-foreground">{isAlpaca ? t('alpacaMetricsTitle') : t('metricsHeading')}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] pb-3 text-sm">
                  <span className="text-foreground/55">{t('metricSharpe')}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{metrics.sharpe.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-foreground/[0.06] pb-3 text-sm">
                  <span className="text-foreground/55">{t('metricCagr')}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{`${(metrics.cagr * 100).toFixed(1)}%`}</span>
                </div>
                <div className="flex items-center justify-between border-b border-foreground/[0.06] pb-3 text-sm">
                  <span className="text-foreground/55">{t('metricAlphaSpus')}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{`${(metrics.alphaVsSpus * 100).toFixed(2)}%`}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground/55">{t('metricMaxDrawdown')}</span>
                  <span className="font-mono font-semibold tabular-nums text-down">{`${(metrics.maxDrawdown * 100).toFixed(1)}%`}</span>
                </div>
              </div>
            </section>
          )}
          {/* Transaction Ledger */}
          <section className="space-y-4 rounded-[1.75rem] bg-surface-card p-6 shadow-sm ring-1 ring-foreground/[0.06]">
             <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
               <History className="h-4 w-4 text-foreground/45" aria-hidden="true" />
               <span>{isAlpaca ? t('alpacaOpenOrders') : t('transactionLedgerTitle')}</span>
             </h3>

             <div className="max-h-64 space-y-2 overflow-y-auto pe-2 text-xs">
               {isAlpaca ? (
                 paperAccount && paperAccount.openOrders.length > 0 ? paperAccount.openOrders.map((order) => (
                   <div key={order.id} className="flex items-center justify-between rounded-xl bg-foreground/[0.035] p-3.5">
                     <div className="space-y-1 text-start">
                       <span className={`font-semibold ${order.side === 'buy' ? 'text-up' : 'text-down'}`}>
                         {t(order.side === 'buy' ? 'alpacaBuy' : 'alpacaSell')} · <span dir="ltr">{order.symbol}</span>
                       </span>
                       <p className="text-[10px] text-foreground/45" dir="ltr">{order.type.toUpperCase()} · {order.filledQty}/{order.qty}</p>
                     </div>
                     <span className="font-mono text-[10px] font-semibold uppercase text-foreground/55">{order.status}</span>
                   </div>
                 )) : <p className="py-6 text-center leading-relaxed text-foreground/50">{t('alpacaNoOpenOrders')}</p>
               ) : txs.length === 0 ? (
                 <p className="py-6 text-center leading-relaxed text-foreground/50">{t('noTransactions')}</p>
               ) : (
                 txs.map((tx: any, idx: number) => {
                   const isNegative = tx.amount < 0;
                   return (
                     <div key={idx} className="flex items-center justify-between rounded-xl bg-foreground/[0.035] p-3.5">
                       <div className="space-y-0.5 text-start">
                         <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                           tx.type === 'TRADE' ? 'bg-accent/10 text-accent' :
                           tx.type === 'PROFIT_SHARE' ? 'bg-up/10 text-up' :
                           'bg-noncompliant/10 text-noncompliant'
                         }`}>
                           {tx.type}
                         </span>
                         <p className="w-32 truncate pt-1 text-[10px] leading-tight text-foreground/50">{tx.description || tx.type}</p>
                       </div>
                       <span className={`font-mono font-semibold tabular-nums ${isNegative ? 'text-down' : 'text-up'}`}>
                         {isNegative ? '' : '+'}{formatMoney(tx.amount, tx.currency === 'USD' ? 'USD' : 'SAR')}
                       </span>
                     </div>
                   );
                 })
               )}
             </div>
          </section>
        </div>
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {zakatPaidSuccess && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zakat-success-title"
            aria-describedby="zakat-success-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setZakatPaidSuccess(false);
              if (event.key === 'Tab') event.preventDefault();
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xs space-y-4 rounded-3xl bg-surface-card p-6 text-center text-foreground shadow-2xl ring-1 ring-foreground/[0.08]"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-up/10 text-up">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 id="zakat-success-title" className="text-lg font-semibold">{t('zakatSuccessTitle')}</h3>
              <p id="zakat-success-description" className="text-xs leading-relaxed text-foreground/55">
                {t.rich('zakatSuccessBody', {
                  amount: formatSARNumber(parseFloat(zakatPaidAmount), locale),
                  riyal: () => <RiyalSymbol locale={locale} className="mx-0.5" />,
                })}
              </p>
              <button
                onClick={() => setZakatPaidSuccess(false)}
                autoFocus
                className="min-h-11 w-full rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {t('done')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
