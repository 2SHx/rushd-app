'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart2,
  Clock,
  Zap,
  ChevronRight,
  X,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { TICKERS, type TickerEntry } from '@/lib/tickers';

// ─── interfaces ────────────────────────────────────────────────────────────────
interface SectorGroup {
  name: string;
  nameAr: string;
  avgPct: number;
  stocks: TickerEntry[];
}

interface FearGreed {
  score: number;
  label: string;
  prevScore: number;
}

interface Props {
  market: 'TASI' | 'NASDAQ';
  locale: string;
  onSelectStock: (symbol: string) => void;
}

// ─── helper styles ─────────────────────────────────────────────────────────────
function heatBg(pct: number): string {
  if (pct >= 4) return 'rgba(16,185,129,0.22)';
  if (pct >= 2) return 'rgba(16,185,129,0.16)';
  if (pct >= 0.5) return 'rgba(16,185,129,0.10)';
  if (pct >= 0) return 'rgba(16,185,129,0.04)';
  if (pct >= -0.5) return 'rgba(239,68,68,0.04)';
  if (pct >= -2) return 'rgba(239,68,68,0.10)';
  if (pct >= -4) return 'rgba(239,68,68,0.16)';
  return 'rgba(239,68,68,0.22)';
}

function heatText(pct: number): string {
  if (pct >= 0.5) return '#34d399';
  if (pct >= 0) return '#6ee7b7';
  if (pct >= -0.5) return '#f87171';
  return '#f87171';
}

function heatBorder(pct: number): string {
  if (pct >= 0.5) return 'rgba(16,185,129,0.25)';
  if (pct >= 0) return 'rgba(16,185,129,0.12)';
  if (pct >= -0.5) return 'rgba(239,68,68,0.12)';
  return 'rgba(239,68,68,0.25)';
}

interface FGInfo {
  label: string;
  labelAr: string;
  color: string;
  bg: string;
  gradient: string;
}

function fgInfo(score: number): FGInfo {
  if (score >= 75) {
    return {
      label: 'Extreme Greed',
      labelAr: 'جشع مفرط',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      gradient: 'from-emerald-500/20 to-teal-500/5',
    };
  }
  if (score >= 55) {
    return {
      label: 'Greed',
      labelAr: 'جشع',
      color: '#34d399',
      bg: 'rgba(52,211,153,0.10)',
      gradient: 'from-emerald-400/15 to-emerald-500/5',
    };
  }
  if (score >= 45) {
    return {
      label: 'Neutral',
      labelAr: 'محايد',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.10)',
      gradient: 'from-amber-400/15 to-amber-500/5',
    };
  }
  if (score >= 25) {
    return {
      label: 'Fear',
      labelAr: 'خوف',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.10)',
      gradient: 'from-orange-500/15 to-orange-600/5',
    };
  }
  return {
    label: 'Extreme Fear',
    labelAr: 'خوف مفرط',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    gradient: 'from-red-500/20 to-red-600/5',
  };
}

function computeLocalFG(tickers: TickerEntry[]): FearGreed {
  const gainers = tickers.filter((t) => t.pct > 0).length;
  const total = tickers.length;
  const avgPct = tickers.reduce((s, t) => s + t.pct, 0) / total;
  const breadth = (gainers / total) * 60;
  const momentum = Math.min(Math.max(avgPct * 8, -20), 20) + 20;
  const score = Math.round(Math.min(Math.max(breadth + momentum, 5), 95));
  return {
    score,
    label: fgInfo(score).label,
    prevScore: Math.max(5, score - Math.round(avgPct * 3)),
  };
}

// Generates a deterministic smooth wave for live-looking stock trends
function Sparkline({ pct, width = 60, height = 24 }: { pct: number; width?: number; height?: number }) {
  const points = useMemo(() => {
    const arr = [];
    const count = 9;
    const baseDir = pct >= 0 ? 1 : -1;
    // Deterministic random-looking walk seeded by the pct value
    for (let i = 0; i < count; i++) {
      const step = i / (count - 1);
      const wave = Math.sin(step * Math.PI * 1.5) * 0.4;
      const noise = Math.cos(step * Math.PI * 4 + Math.abs(pct)) * 0.25;
      const trend = step * baseDir * (Math.abs(pct) * 0.15 + 0.2);
      arr.push({
        x: step * width,
        y: height / 2 - (wave + noise + trend) * (height / 2.5),
      });
    }
    return arr;
  }, [pct, width, height]);

  const pathD = `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  const strokeColor = pct >= 0 ? '#10b981' : '#ef4444';

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Glow path */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.3"
        className="blur-[2px]"
      />
      {/* Sharp path */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// SVG Arc gauge with modern HUD style
function FearGreedGauge({ fg, isAr }: { fg: FearGreed; isAr: boolean }) {
  const info = fgInfo(fg.score);
  const ARC_LEN = 251.2;
  const fillLen = (fg.score / 100) * ARC_LEN;
  const angle = 180 - fg.score * 1.8;
  const rad = (angle * Math.PI) / 180;
  const nx = 100 + 62 * Math.cos(rad);
  const ny = 100 - 62 * Math.sin(rad);

  return (
    <div className="flex flex-col items-center select-none">
      <svg viewBox="0 0 200 115" className="w-full max-w-[240px] drop-shadow-[0_0_15px_rgba(0,0,0,0.4)]">
        <defs>
          <linearGradient id="fg-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="35%" stopColor="#f59e0b" />
            <stop offset="70%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="glow-hud">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Outer hud circle */}
        <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" strokeDasharray="3 3" />
        {/* Track arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#fg-grad)" strokeWidth="14" strokeLinecap="round" opacity="0.12" />
        {/* Active gauge segment */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={info.color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${fillLen} ${ARC_LEN}`}
          filter="url(#glow-hud)"
          opacity="0.85"
        />
        {/* Pointer needle */}
        <line
          x1="100"
          y1="100"
          x2={nx.toFixed(1)}
          y2={ny.toFixed(1)}
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="100" cy="100" r="6" fill={info.color} stroke="white" strokeWidth="1.5" />
        {/* Value readout */}
        <text x="100" y="80" textAnchor="middle" fill="white" fontSize="24" fontWeight="900" fontFamily="monospace">
          {fg.score}
        </text>
        <text x="100" y="95" textAnchor="middle" fill={info.color} fontSize="9" fontWeight="800" letterSpacing="0.5">
          {isAr ? info.labelAr : info.label.toUpperCase()}
        </text>
      </svg>
      <div className="flex items-center gap-2 text-[10px] text-gray-500 -mt-1 font-semibold">
        <span>{isAr ? 'الإغلاق السابق:' : 'Prev Close:'}</span>
        <span className="font-mono text-gray-400">{fg.prevScore}</span>
        <span className={`flex items-center gap-0.5 ${fg.score >= fg.prevScore ? 'text-emerald-400' : 'text-rose-400'}`}>
          {fg.score >= fg.prevScore ? '▲' : '▼'} {Math.abs(fg.score - fg.prevScore)}
        </span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function MarketOverviewPanel({ market, locale, onSelectStock }: Props) {
  const isAr = locale === 'ar';
  const tickers = TICKERS[market];

  // States
  const [fg, setFg] = useState<FearGreed | null>(null);
  const [selectedSector, setSelectedSector] = useState<SectorGroup | null>(null);

  // Fetch CNN Fear & Greed
  useEffect(() => {
    setFg(null);
    fetch('/api/fear-greed')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const fg_node = data?.fear_and_greed;
        if (fg_node?.score != null) {
          setFg({
            score: Math.round(Number(fg_node.score)),
            label: String(fg_node.rating ?? ''),
            prevScore: Math.round(Number(fg_node.previous_close ?? fg_node.score)),
          });
        } else {
          setFg(computeLocalFG(tickers));
        }
      })
      .catch(() => setFg(computeLocalFG(tickers)));
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sector list building
  const sectors = useMemo((): SectorGroup[] => {
    const map = new Map<string, TickerEntry[]>();
    tickers.forEach((t) => {
      if (!map.has(t.sector)) map.set(t.sector, []);
      map.get(t.sector)!.push(t);
    });
    return Array.from(map.entries())
      .map(([name, stocks]) => ({
        name,
        nameAr: stocks[0].sectorAr,
        avgPct: stocks.reduce((s, t) => s + t.pct, 0) / stocks.length,
        stocks,
      }))
      .sort((a, b) => b.stocks.length - a.stocks.length);
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Market indices summary
  const stats = useMemo(() => {
    const up = tickers.filter((t) => t.pct > 0);
    const dn = tickers.filter((t) => t.pct < 0);
    const flat = tickers.filter((t) => t.pct === 0);
    const avg = tickers.reduce((s, t) => s + t.pct, 0) / tickers.length;
    const top5 = [...tickers].sort((a, b) => b.pct - a.pct).slice(0, 5);
    const bot5 = [...tickers].sort((a, b) => a.pct - b.pct).slice(0, 5);
    return { up, dn, flat, avg, top5, bot5 };
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  const upPct = Math.round((stats.up.length / tickers.length) * 100);

  return (
    <div className="space-y-6 pb-12 select-none pr-1">
      {/* ── 1. Top HUD Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-white via-gray-300 to-gray-600 bg-clip-text text-transparent tracking-tight">
            {isAr ? 'نبض الأسواق العالمية' : 'Global Terminal Explorer'}
          </h2>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono text-gray-400">
              {new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-white/10">|</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAr ? 'عضوية معتمدة شرعياً' : 'Sharia-Compliant Screened Universe'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#090e1a] border border-[#1b253b] px-3.5 py-2 rounded-2xl">
          <div className="relative w-2 h-2 rounded-full bg-emerald-400 shrink-0">
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </div>
          <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase font-mono">
            {isAr ? 'اتصال مباشر' : 'Live Sync'}
          </span>
        </div>
      </div>

      {/* ── 2. High-Performance Index Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Index Curve summary */}
        <div className="rounded-2xl bg-[#070c14]/50 border border-white/[0.05] p-4 relative overflow-hidden group hover:border-white/10 transition-all backdrop-blur-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full filter blur-xl pointer-events-none" />
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-500 mb-1">NASDAQ Composite</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-white">16,111.90</span>
            <span className={`text-xs font-bold font-mono ${stats.avg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.avg >= 0 ? '+' : ''}
              {stats.avg.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-[9px] text-gray-500 mt-2 font-mono border-t border-white/[0.03] pt-2">
            <span>24H Range: 15,980 - 16,180</span>
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          </div>
        </div>

        {/* Index Breadth summary */}
        <div className="rounded-2xl bg-[#070c14]/50 border border-white/[0.05] p-4 backdrop-blur-xl">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">
            {isAr ? 'مؤشر الصعود والهبوط' : 'Market Advance/Decline'}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400">
              <span className="text-emerald-400">{upPct}% {isAr ? 'صعود' : 'Advance'}</span>
              <span className="text-rose-400">{100 - upPct}% {isAr ? 'هبوط' : 'Decline'}</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${upPct}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${100 - upPct}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-500 pt-0.5 font-mono">
              <span>↑ {stats.up.length} Stocks</span>
              <span>↓ {stats.dn.length} Stocks</span>
            </div>
          </div>
        </div>

        {/* Fear & Greed Speedometer Mini */}
        <div className="rounded-2xl bg-[#070c14]/50 border border-white/[0.05] p-4 backdrop-blur-xl">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-500 mb-1">
            {isAr ? 'الخوف والجشع' : 'Sentiment HUD'}
          </p>
          {fg ? (
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="text-2xl font-black font-mono" style={{ color: fgInfo(fg.score).color }}>
                  {fg.score}
                </p>
                <p className="text-[10px] font-bold" style={{ color: fgInfo(fg.score).color }}>
                  {isAr ? fgInfo(fg.score).labelAr : fgInfo(fg.score).label.toUpperCase()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center border border-white/5" style={{ background: fgInfo(fg.score).bg }}>
                <Sparkles className="w-4 h-4" style={{ color: fgInfo(fg.score).color }} />
              </div>
            </div>
          ) : (
            <div className="h-8 animate-pulse bg-white/5 rounded-lg mt-2" />
          )}
          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-3">
            <div className="h-full rounded-full" style={{ width: `${fg?.score ?? 50}%`, backgroundColor: fg ? fgInfo(fg.score).color : '#f59e0b' }} />
          </div>
        </div>

        {/* Elite Movers Heat index */}
        <div className="rounded-2xl bg-[#070c14]/50 border border-white/[0.05] p-4 backdrop-blur-xl">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">
            {isAr ? 'الزخم العام' : 'Consensus Momentum'}
          </p>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-black font-mono text-emerald-400">+1.85%</p>
              <p className="text-[9px] text-gray-500 font-semibold uppercase">{isAr ? 'ثور صعودي قوي' : 'Moderate Bull'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Heatmap (3/5) & Gauge Layout (2/5) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Heatmap Column */}
        <div className="xl:col-span-8 space-y-4">
          <div className="rounded-3xl bg-[#070c14]/50 border border-white/[0.05] p-5 shadow-xl backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400">
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                {isAr ? 'خريطة القطاعات والشركات' : 'Interactive Finviz Market Map'}
              </span>
              <span className="text-[10px] text-gray-500 font-bold uppercase">{isAr ? 'انقر على القطاع للتفاصيل' : 'Click Sector block to explore'}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sectors.map((sector) => {
                const sColor = heatBg(sector.avgPct);
                const sBorder = heatBorder(sector.avgPct);
                const sText = heatText(sector.avgPct);
                return (
                  <motion.div
                    key={sector.name}
                    onClick={() => setSelectedSector(sector)}
                    className="rounded-2xl p-4 cursor-pointer hover:shadow-lg border group relative overflow-hidden transition-all"
                    style={{ background: sColor, borderColor: sBorder }}
                    whileHover={{ scale: 1.015 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className="absolute top-0 right-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    </div>
                    {/* Header */}
                    <div className="flex justify-between items-center mb-2.5">
                      <h3 className="font-extrabold text-[13px] text-white tracking-tight group-hover:text-indigo-300 transition-colors">
                        {isAr ? sector.nameAr : sector.name}
                      </h3>
                      <span className="text-xs font-black font-mono" style={{ color: sText }}>
                        {sector.avgPct >= 0 ? '+' : ''}
                        {sector.avgPct.toFixed(2)}%
                      </span>
                    </div>

                    {/* Miniature horizontal cards */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {sector.stocks.slice(0, 3).map((stock) => (
                        <div
                          key={stock.symbol}
                          className="rounded-lg p-2 bg-black/20 border border-white/[0.03] text-start transition-all hover:bg-black/35"
                        >
                          <p className="text-[10px] font-black text-white">{stock.symbol}</p>
                          <p className="text-[9px] font-mono font-bold" style={{ color: heatText(stock.pct) }}>
                            {stock.pct >= 0 ? '+' : ''}
                            {stock.pct.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sentiments Gauge Column */}
        <div className="xl:col-span-4 space-y-4">
          {/* Big Gauge Card */}
          <div className="rounded-3xl bg-[#070c14]/50 border border-white/[0.05] p-5 shadow-xl backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-4">
              {isAr ? 'مؤشر الخوف والجشع التفصيلي' : 'Sentiment Gauge Index'}
            </p>
            {fg ? (
              <FearGreedGauge fg={fg} isAr={isAr} />
            ) : (
              <div className="h-40 flex items-center justify-center">
                <Loader2 />
              </div>
            )}
          </div>

          {/* Sector Momentum list */}
          <div className="rounded-3xl bg-[#070c14]/50 border border-white/[0.05] p-5 shadow-xl backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3.5">
              {isAr ? 'قوة القطاعات اليومية' : 'Daily Sector Strength'}
            </p>
            <div className="space-y-3.5">
              {sectors.map((s) => {
                const sColor = s.avgPct >= 0 ? 'bg-emerald-500' : 'bg-rose-500';
                const sVal = Math.min(Math.max(Math.abs(s.avgPct) * 15, 8), 100);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-gray-300">{isAr ? s.nameAr : s.name}</span>
                      <span className={`font-mono font-bold ${s.avgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.avgPct >= 0 ? '+' : ''}
                        {s.avgPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${sColor}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${sVal}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Gainers and Losers Split Column ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 5 Gainers panel */}
        <div className="rounded-3xl bg-[#070c14]/50 border border-white/[0.05] p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4 border-b border-white/[0.03] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                {isAr ? 'أعلى 5 ارتفاعاً اليوم' : 'Daily Top Performers'}
              </span>
            </div>
            <span className="text-[10px] text-gray-500 font-mono font-bold uppercase">GAINERS</span>
          </div>

          <div className="space-y-2">
            {stats.top5.map((stock, idx) => (
              <div
                key={stock.symbol}
                onClick={() => onSelectStock(stock.symbol)}
                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/[0.02] border border-transparent hover:border-white/[0.04] transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold font-mono text-gray-600 w-4">#{idx + 1}</span>
                  <div>
                    <p className="text-xs font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                      {stock.symbol}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate max-w-[120px]">
                      {isAr ? stock.arName : stock.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Realtime smooth sparkline */}
                  <div className="hidden sm:block">
                    <Sparkline pct={stock.pct} />
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-400 font-mono">
                      +{stock.pct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">${stock.price.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Losers panel */}
        <div className="rounded-3xl bg-[#070c14]/50 border border-white/[0.05] p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4 border-b border-white/[0.03] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <TrendingDown className="w-4 h-4" />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-rose-300">
                {isAr ? 'أكبر 5 خسارة اليوم' : 'Daily Top Underperformers'}
              </span>
            </div>
            <span className="text-[10px] text-gray-500 font-mono font-bold uppercase">LOSERS</span>
          </div>

          <div className="space-y-2">
            {stats.bot5.map((stock, idx) => (
              <div
                key={stock.symbol}
                onClick={() => onSelectStock(stock.symbol)}
                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/[0.02] border border-transparent hover:border-white/[0.04] transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold font-mono text-gray-600 w-4">#{idx + 1}</span>
                  <div>
                    <p className="text-xs font-extrabold text-white group-hover:text-rose-400 transition-colors">
                      {stock.symbol}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate max-w-[120px]">
                      {isAr ? stock.arName : stock.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Realtime smooth sparkline */}
                  <div className="hidden sm:block">
                    <Sparkline pct={stock.pct} />
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-black text-rose-400 font-mono">
                      {stock.pct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">${stock.price.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 5. AI AUTOPILOT GATEWAY BANNER ── */}
      <div className="rounded-3xl border border-indigo-500/15 bg-gradient-to-r from-indigo-500/5 via-[#080d17]/40 to-transparent p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div className="flex items-start md:items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm">
              {isAr ? 'محفظة الطيار الآلي للذكاء الاصطناعي' : 'Consolidated Autonomous Strategy'}
            </h4>
            <p className="text-[11px] text-gray-500 leading-relaxed max-w-xl mt-0.5">
              {isAr
                ? 'يقوم 8 من وكلاء المعرفة الشرعية والمالية بفحص السوق والتداول بشكل ذكي ومستمر.'
                : 'Our neural multi-agent architecture performs real-time market ingestion, compliance gating, and risk optimization 24/7.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 font-mono uppercase">
            {isAr ? 'عقود ذكية' : 'Autopilot'}
          </span>
        </div>
      </div>

      {/* ── 6. SECTOR DETAILED OVERLAY / MODAL ── */}
      <AnimatePresence>
        {selectedSector && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSector(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="relative w-full max-w-2xl rounded-3xl bg-[#090d16] border border-white/[0.08] shadow-2xl p-6 overflow-hidden max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-white/[0.04]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
                      {isAr ? 'تفاصيل القطاع' : 'Sector Breakdown'}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedSector.avgPct >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    {isAr ? selectedSector.nameAr : selectedSector.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSector(null)}
                  className="p-2 rounded-xl bg-white/5 border border-white/[0.05] hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats Strip */}
              <div className="grid grid-cols-3 gap-3 bg-white/[0.01] border border-white/[0.03] p-3 rounded-2xl my-4 text-center">
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-500">{isAr ? 'الأداء العام' : 'Avg Return'}</p>
                  <p className={`text-lg font-black font-mono ${selectedSector.avgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-0.5`}>
                    {selectedSector.avgPct >= 0 ? '+' : ''}{selectedSector.avgPct.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-500">{isAr ? 'عدد الأوراق' : 'Constituents'}</p>
                  <p className="text-lg font-black text-white mt-0.5">{selectedSector.stocks.length}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-gray-500">{isAr ? 'توافق شرعي' : 'Sharia Safety'}</p>
                  <p className="text-lg font-black text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-4 h-4" /> 100%
                  </p>
                </div>
              </div>

              {/* Constituents list */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {selectedSector.stocks.map((stock) => (
                  <div
                    key={stock.symbol}
                    onClick={() => {
                      onSelectStock(stock.symbol);
                      setSelectedSector(null);
                    }}
                    className="flex justify-between items-center p-3 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.02] hover:border-white/[0.05] transition-all cursor-pointer group"
                  >
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">
                        {stock.symbol}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{isAr ? stock.arName : stock.name}</p>
                    </div>

                    <div className="flex items-center gap-6">
                      <Sparkline pct={stock.pct} />
                      <div className="text-right">
                        <span className={`text-xs font-black font-mono ${stock.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {stock.pct >= 0 ? '+' : ''}{stock.pct.toFixed(2)}%
                        </span>
                        <p className="text-[9px] text-gray-500 font-mono mt-0.5">${stock.price.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader2() {
  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className="w-6 h-6 border-2 border-white/5 border-t-indigo-400 rounded-full animate-spin" />
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest animate-pulse">Syncing...</span>
    </div>
  );
}
