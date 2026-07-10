'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useSceneAvailability } from '@/hooks/useSceneAvailability';
import CommitteePipeline2D from './CommitteePipeline2D';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Gavel,
  Play,
  Pause,
  RefreshCw,
  Cpu,
  Database,
  History,
  Activity,
} from 'lucide-react';

type MarketKind = 'TASI' | 'NASDAQ';
export type Stance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Signal {
  id?: string;
  agent: string;
  stance: Stance;
  conviction: string | number;
  rationaleEn: string;
  rationaleAr: string;
  evidence: unknown;
  failureMode: string;
}

export interface ShariaGate {
  compliant: boolean;
  reason?: string;
}

export interface DebateTurn {
  side: 'BULL' | 'BEAR';
  round: number;
  argumentEn: string;
  argumentAr: string;
}

export interface PassResult {
  decisionId: string;
  finalAction: string;
  proposedAction?: string;
  shariaGate: ShariaGate;
  signals: Signal[];
  debateTranscript?: DebateTurn[];
}

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

interface CommitteeClientProps {
  locale: string;
  initialNAV: number;
  initialCash: number;
  initialPositions: Position[];
  initialSnapshots: Snapshot[];
  initialPurification: PurificationEntry[];
  initialMetrics: Metrics;
  initialTrades?: Trade[];
}

const DEFAULT_SYMBOL: Record<MarketKind, string> = {
  TASI: '2222.SR',
  NASDAQ: 'AAPL',
};

const AGENT_KEYS = [
  'QUANT_CORE',
  'NEWS_CATALYST',
  'TECHNICAL',
  'PATTERN_ANALOG',
  'SHARIA',
  'FUNDAMENTAL',
  'RESEARCH',
  'PORTFOLIO_MANAGER',
];

function toEvidenceChips(evidence: unknown): string[] {
  if (Array.isArray(evidence)) {
    return evidence.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
  }
  if (evidence && typeof evidence === 'object') {
    return Object.entries(evidence as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`);
  }
  if (typeof evidence === 'string' && evidence.length > 0) return [evidence];
  return [];
}

export function stanceStyle(stance: Stance) {
  if (stance === 'BULLISH') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', Icon: TrendingUp };
  if (stance === 'BEARISH') return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', Icon: TrendingDown };
  return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', Icon: Minus };
}

function actionStyle(action: string) {
  if (action === 'BUY') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (action === 'SELL') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  return 'text-neonBlue bg-neonBlue/10 border-neonBlue/30';
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export type SimStep = 'idle' | 'ingestion' | 'analysts' | 'sharia' | 'debate' | 'pm' | 'risk' | 'done';

export default function CommitteeClient({
  locale,
  initialNAV,
  initialCash,
  initialPositions,
  initialSnapshots,
  initialPurification,
  initialTrades = []
}: CommitteeClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const [market, setMarket] = useState<MarketKind>('NASDAQ');
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL.NASDAQ);

  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passData, setPassData] = useState<PassResult | null>(null);

  // Portfolio data is a read-only snapshot loaded by the authenticated server page.
  const nav = initialNAV;
  const cash = initialCash;
  const positions = initialPositions;
  const snapshots = initialSnapshots;
  const purification = initialPurification;
  const trades = initialTrades;

  // Timeframe selector for charts
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '1Y' | 'ALL'>('ALL');

  const [simStep, setSimStep] = useState<SimStep>('idle');
  const [simPlay, setSimPlay] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [debateTurnIdx, setDebateTurnIdx] = useState(0);

  // Compute overall AI conviction based on individual agent signals
  const aiOverall = useMemo(() => {
    if (!passData || !passData.signals || passData.signals.length === 0) return null;
    let bullWeight = 0;
    let bearWeight = 0;
    let totalWeight = 0;
    passData.signals.forEach(s => {
      const conv = Math.max(0, Math.min(1, Number(s.conviction) || 0.5));
      if (s.stance === 'BULLISH') {
        bullWeight += conv;
      } else if (s.stance === 'BEARISH') {
        bearWeight += conv;
      }
      totalWeight += conv;
    });
    if (totalWeight === 0) return { pct: 0, stance: 'NEUTRAL' as const };
    const net = bullWeight - bearWeight;
    const absNet = Math.abs(net);
    const pct = Math.round((absNet / totalWeight) * 100);
    const stance = net > 0 ? 'BULLISH' as const : net < 0 ? 'BEARISH' as const : 'NEUTRAL' as const;
    return { pct, stance };
  }, [passData]);


  // Forced to 2D network communication view per user request to clearly display each node, thinking, and decisions.
  const { reducedMotion } = useSceneAvailability();
  const use3D = false;
  const CommitteeScene3D = useMemo(
    () =>
      dynamic(() => import('./CommitteeScene3D'), {
        ssr: false,
        loading: () => (
          <CommitteePipeline2D
            simStep="idle"
            activeAgentId={null}
            passData={null}
            debateTurnIdx={0}
            isAr={isAr}
          />
        ),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const simTimerRef = useRef<NodeJS.Timeout | null>(null);

  function handleMarketChange(m: MarketKind) {
    setMarket(m);
    setSymbol(DEFAULT_SYMBOL[m]);
    setPassData(null);
    setPassError(null);
    setSimStep('idle');
    setDebateTurnIdx(0);
  }

  // Typewriter effect logic
  useEffect(() => {
    if (simStep === 'idle' || !passData) {
      setTypedText('');
      return;
    }

    let targetText = '';
    if (simStep === 'sharia') {
      targetText = passData.shariaGate.compliant
        ? (isAr ? 'توافق شرعي كامل. معايير أنشطة و نسب مالية مقبولة.' : 'Sharia compliant. Sector filters and leverage ratios are fully within limits.')
        : (isAr ? `تنبيه غير متوافق: ${passData.shariaGate.reason || 'محظور التداول'}` : `Non-compliant Veto: ${passData.shariaGate.reason || 'Trading blocked'}`);
    } else if (simStep === 'analysts') {
      const signal = passData.signals.find(s => s.agent === activeAgentId);
      if (signal) {
        targetText = isAr ? signal.rationaleAr : signal.rationaleEn;
      }
    } else if (simStep === 'debate' && passData.debateTranscript?.[debateTurnIdx]) {
      const turn = passData.debateTranscript[debateTurnIdx];
      targetText = isAr ? turn.argumentAr : turn.argumentEn;
    } else if (simStep === 'pm') {
      const pmSignal = passData.signals.find(s => s.agent === 'PORTFOLIO_MANAGER');
      if (pmSignal) {
        targetText = isAr ? pmSignal.rationaleAr : pmSignal.rationaleEn;
      }
    } else if (simStep === 'risk') {
      targetText = isAr
        ? `مدير المخاطر يراجع حدود التوصية غير الملزمة: ${passData.finalAction}. التنفيذ، إذا طلبه المستخدم، يتم فقط عبر المسار الموثق في الخادم.`
        : `The Risk Manager is reviewing the non-binding ${passData.finalAction} recommendation. Any user-requested execution is handled only by the authenticated server path.`;
    }

    setTypedText('');
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < targetText.length) {
        setTypedText(prev => prev + targetText.charAt(idx));
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 12);

    return () => clearInterval(interval);
  }, [simStep, activeAgentId, debateTurnIdx, passData, isAr]);

  // Simulation Sequence Engine
  useEffect(() => {
    if (!isVisible) {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
      return;
    }
    if (!simPlay || !passData || simStep === 'idle' || simStep === 'done') {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
      return;
    }

    const delay = 1000;

    const runNextStep = () => {
      if (simStep === 'ingestion') {
        setSimStep('analysts');
        setActiveAgentId('QUANT_CORE');
      } else if (simStep === 'analysts') {
        const currentIdx = AGENT_KEYS.indexOf(activeAgentId || '');
        if (currentIdx !== -1 && currentIdx < 4) {
          setActiveAgentId(AGENT_KEYS[currentIdx + 1]);
        } else {
          setSimStep('sharia');
          setActiveAgentId('SHARIA');
        }
      } else if (simStep === 'sharia') {
        if (passData.debateTranscript && passData.debateTranscript.length > 0) {
          setSimStep('debate');
          setDebateTurnIdx(0);
        } else {
          setSimStep('pm');
        }
      } else if (simStep === 'debate') {
        if (passData.debateTranscript && debateTurnIdx < passData.debateTranscript.length - 1) {
          setDebateTurnIdx(prev => prev + 1);
        } else {
          setSimStep('pm');
        }
      } else if (simStep === 'pm') {
        setSimStep('risk');
      } else if (simStep === 'risk') {
        setSimStep('done');
      }
    };

    simTimerRef.current = setTimeout(runNextStep, simStep === 'debate' ? delay * 1.3 : delay);
    return () => {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
    };
  }, [simStep, simPlay, activeAgentId, debateTurnIdx, passData, isVisible]);

  async function runPass() {
    setPassLoading(true);
    setPassError(null);
    setPassData(null);
    setSimStep('idle');
    setSimPlay(false);
    try {
      const res = await fetch('/api/quant/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market }),
      });
      if (!res.ok) {
        setPassError(t('errorGeneric'));
        return;
      }
      const data = await res.json();
      setPassData(data);
      setSimStep('ingestion');
      setDebateTurnIdx(0);
    } catch {
      setPassError(t('errorGeneric'));
    } finally {
      setPassLoading(false);
    }
  }

  const runningPurificationTotal = purification.reduce((sum, item) => sum + item.amount, 0);

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

  const fmtMoney = (val: number, currency = market === 'TASI' ? 'SAR' : 'USD') => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency
    }).format(val);
  };

  const fmtPercent = (val: number) => {
    return `${(val * 100).toFixed(2)}%`;
  };

  const nodes = [
    { id: 'ingest', name: 'Data Feed', nameAr: 'تغذية البيانات', x: '12%', y: '50%', type: 'data', icon: Database },
    { id: 'QUANT_CORE', name: 'Quant Core', nameAr: 'المؤشر الكمي', x: '31%', y: '16%', type: 'analyst' },
    { id: 'TECHNICAL', name: 'Technical', nameAr: 'التحليل الفني', x: '31%', y: '39%', type: 'analyst' },
    { id: 'PATTERN_ANALOG', name: 'Pattern Analog', nameAr: 'تحليل الأنماط', x: '31%', y: '61%', type: 'analyst' },
    { id: 'NEWS_CATALYST', name: 'News Catalyst', nameAr: 'الأخبار والمحفزات', x: '31%', y: '84%', type: 'analyst' },
    { id: 'FUNDAMENTAL', name: 'Fundamental', nameAr: 'التحليل المالي', x: '50%', y: '20%', type: 'analyst' },
    { id: 'RESEARCH', name: 'Research', nameAr: 'البحوث والمنشورات', x: '50%', y: '45%', type: 'analyst' },
    { id: 'SHARIA', name: 'Sharia Filter', nameAr: 'التوافق الشرعي', x: '50%', y: '75%', type: 'gate' },
    { id: 'debate', name: 'Debate Circle', nameAr: 'حلقة النقاش', x: '69%', y: '30%', type: 'debate', icon: Gavel },
    { id: 'PORTFOLIO_MANAGER', name: 'Portfolio Manager', nameAr: 'مدير المحفظة', x: '69%', y: '75%', type: 'pm', icon: Bot },
    { id: 'risk', name: 'Risk Envelope', nameAr: 'ضوابط المخاطر', x: '88%', y: '50%', type: 'risk', icon: Gavel }
  ];

  function renderSvgChart() {
    if (filteredSnapshots.length < 2) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Not enough historical snapshots to render performance curve.
        </div>
      );
    }

    const w = 800;
    const h = 260;
    const padding = 40;

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
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
          const y = padding + r * (h - 2 * padding);
          const gridVal = maxVal - r * valRange;
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={w - padding} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={padding - 5} y={y + 4} textAnchor="end" className="text-[8px] font-mono fill-gray-500">
                {fmtMoney(gridVal).replace('.00', '')}
              </text>
            </g>
          );
        })}

        {/* Date labels */}
        {points.length > 1 && [0, points.length - 1].map((pIdx) => {
          const p = points[pIdx];
          return (
            <text key={pIdx} x={p.x} y={h - 15} textAnchor={pIdx === 0 ? 'start' : 'end'} className="text-[8px] font-mono fill-gray-500">
              {new Date(p.date).toLocaleDateString(locale)}
            </text>
          );
        })}

        {/* Curves */}
        <path d={createPath(p => p.spyY)} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="3,3" />
        <path d={createPath(p => p.spusY)} fill="none" stroke="#00f0ff" strokeWidth={1.5} strokeOpacity={0.7} />
        <path d={createPath(p => p.navY) + ` L ${points[points.length - 1].x} ${h - padding} L ${points[0].x} ${h - padding} Z`} fill="url(#navGradient)" />
        <path d={createPath(p => p.navY)} fill="none" stroke="#10B981" strokeWidth={2.5} />
      </svg>
    );
  }

  function renderAllocationDonut() {
    const radius = 50;
    const strokeWidth = 12;
    const circumference = 2 * Math.PI * radius;
    
    const usEquities = positions.filter(p => !p.symbol.endsWith('.SR')).reduce((sum, p) => sum + p.value, 0);
    const saudiEquities = positions.filter(p => p.symbol.endsWith('.SR')).reduce((sum, p) => sum + p.value, 0);
    const cashValue = cash;
    const totalValue = nav || 1;
    
    const usPct = usEquities / totalValue;
    const saudiPct = saudiEquities / totalValue;
    const cashPct = cashValue / totalValue;

    const usOffset = 0;
    const saudiOffset = usPct * circumference;
    const cashOffset = (usPct + saudiPct) * circumference;

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-3xl text-center h-full shadow-md">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-gray-200">Asset Allocation</h3>
          <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider font-mono">Balanced</span>
        </div>
        <div className="relative w-40 h-40">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="80" cy="80" r={radius} fill="transparent" stroke="currentColor" className="text-slate-200 dark:text-white/5" strokeWidth={strokeWidth} />
            {usPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#00f0ff" strokeWidth={strokeWidth} strokeDasharray={`${usPct * circumference} ${circumference}`} strokeDashoffset={0} />
            )}
            {saudiPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#10B981" strokeWidth={strokeWidth} strokeDasharray={`${saudiPct * circumference} ${circumference}`} strokeDashoffset={-saudiOffset} />
            )}
            {cashPct > 0 && (
              <circle cx="80" cy="80" r={radius} fill="transparent" stroke="#F59E0B" strokeWidth={strokeWidth} strokeDasharray={`${cashPct * circumference} ${circumference}`} strokeDashoffset={-cashOffset} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Holdings</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{positions.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-6 text-[10px] font-bold">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#00f0ff]"></div>US Equities</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>Saudi Equities</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>Cash</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Educational Committee Control Banner ── */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/15 bg-gradient-to-r from-emerald-500/5 via-[#080c14] to-indigo-500/5 p-5 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/3 to-transparent pointer-events-none" />
        <div className="flex flex-wrap items-center justify-between gap-4 relative">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-extrabold text-sm text-white">
                  {isAr ? 'مراجعة لجنة تعليمية' : 'Educational Committee Review'}
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-full tracking-wider bg-white/10 text-gray-400">
                  {isAr ? 'تعليمي' : 'EDUCATIONAL'}
                </span>
                {aiOverall && (
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full tracking-wider ${
                    aiOverall.stance === 'BULLISH'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : aiOverall.stance === 'BEARISH'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-white/5 text-gray-400 border border-white/10'
                  }`}>
                    AI: {aiOverall.pct}% {aiOverall.stance === 'BULLISH' ? (isAr ? 'صعودي' : 'BULLISH') : aiOverall.stance === 'BEARISH' ? (isAr ? 'نزولي' : 'BEARISH') : (isAr ? 'محايد' : 'NEUTRAL')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {isAr
                  ? 'تقدم اللجنة توصية تعليمية غير ملزمة ولا تنفّذ هذه الواجهة أي تداول. أي تنفيذ يطلبه المستخدم يمر حصراً عبر المسار الموثق في الخادم.'
                  : 'The committee provides a non-binding educational recommendation. This view never places trades; any user-requested execution uses the authenticated server path.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => runPass()}
            disabled={passLoading}
            className="px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all flex items-center gap-2 active:scale-95 bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {passLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{passLoading ? (isAr ? 'جارٍ التحليل' : 'Reviewing') : (isAr ? 'تشغيل مراجعة اللجنة' : 'Run committee review')}</span>
          </button>
        </div>
      </div>

      {/* Grid: Committee Board + Execution Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── Left: Visual Committee Board ── */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-3xl overflow-hidden border border-white/[0.07] shadow-2xl bg-[#05080f]">
            {/* Board Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] bg-gradient-to-r from-indigo-500/5 to-transparent">
              <div>
                <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  {isAr ? `لوحة لجنة الذكاء الاصطناعي — ${symbol}` : `AI Committee Board — ${symbol}`}
                </h3>
                <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                  {isAr
                    ? `العرض المرئي: ${simPlay ? 'قيد التشغيل' : 'متوقف'} • التنفيذ: عبر الخادم فقط`
                    : `Visualization: ${simPlay ? 'Playing' : 'Paused'} • Execution: server only`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSimPlay(!simPlay)}
                  disabled={!passData}
                  aria-label={simPlay ? (isAr ? 'إيقاف العرض المرئي' : 'Pause visualization') : (isAr ? 'تشغيل العرض المرئي' : 'Play visualization')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all border border-white/[0.06] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {simPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-400" />}
                </button>
                <button
                  onClick={() => { setSimStep('ingestion'); setSimPlay(true); setDebateTurnIdx(0); }}
                  disabled={!passData}
                  aria-label={isAr ? 'إعادة العرض المرئي' : 'Replay visualization'}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all border border-white/[0.06] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSimStep('done')}
                  disabled={!passData}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/[0.06] text-[10px] font-bold text-gray-400 hover:text-white transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isAr ? 'تخطي' : 'Skip'}
                </button>
              </div>
            </div>

            {/* ── Committee Visualization: state-driven 3D scene, 2D pipeline fallback ── */}
            {use3D ? (
              <CommitteeScene3D
                simStep={simStep}
                activeAgentId={activeAgentId}
                passData={passData}
                debateTurnIdx={debateTurnIdx}
                reducedMotion={reducedMotion}
              />
            ) : (
              <CommitteePipeline2D
                simStep={simStep}
                activeAgentId={activeAgentId}
                passData={passData}
                debateTurnIdx={debateTurnIdx}
                isAr={isAr}
                onSelectAgent={setActiveAgentId}
              />
            )}


            {/* ── Educational Review Detail Panel ── */}
            <div className="mx-0 border-t border-white/[0.05] bg-[#030508] px-6 py-4 font-mono min-h-[110px]">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-400">
                  {simStep === 'idle' && (isAr ? 'انتظار مراجعة يطلبها المستخدم' : 'IDLE — Run a committee review')}
                  {simStep === 'ingestion' && (isAr ? 'استيراد البيانات...' : 'INGESTION — Streaming market data feeds')}
                  {simStep === 'analysts' && activeAgentId && (isAr ? `تحليل: ${nodes.find(n => n.id === activeAgentId)?.nameAr}` : `ANALYST — ${nodes.find(n => n.id === activeAgentId)?.name} thinking`)}
                  {simStep === 'sharia' && (isAr ? 'فرز AAOIFI الشرعي...' : 'SHARIA GATE — AAOIFI compliance screening')}
                  {simStep === 'debate' && (isAr ? 'حلقة نقاش اللجنة...' : 'DEBATE — Bull vs Bear committee arguments')}
                  {simStep === 'pm' && (isAr ? 'صياغة توصية مدير المحفظة...' : 'PORTFOLIO MANAGER — Recommendation synthesis')}
                  {simStep === 'risk' && (isAr ? 'مراجعة حدود التوصية...' : 'RISK ENVELOPE — Non-binding review')}
                  {simStep === 'done' && (isAr ? 'اكتملت المراجعة' : 'REVIEW COMPLETE')}
                </span>
              </div>
              <p className="text-xs text-emerald-300/80 leading-relaxed" dir={isAr ? 'rtl' : 'ltr'}>
                <span className="text-emerald-600 mr-2 select-none">›</span>
                {typedText || (simStep === 'ingestion' ? (isAr ? 'تحميل بيانات السوق والمحفظة للعرض التعليمي...' : 'Loading market and portfolio context for the educational review...') : simStep === 'idle' ? '_ ' : '')}
                {typedText && <span className="inline-block w-1 h-3.5 bg-emerald-400 ml-0.5 animate-pulse align-middle" />}
              </p>
              {simStep === 'done' && passData && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap items-center gap-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">{isAr ? 'التوصية:' : 'RECOMMENDATION:'}</span>
                    <span className={`px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-lg border ${actionStyle(passData.finalAction)}`}>
                      {passData.finalAction}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">SHARIA:</span>
                    <span className={`px-2.5 py-0.5 text-xs font-black uppercase rounded-lg border ${
                      passData.shariaGate.compliant
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {passData.shariaGate.compliant ? 'HALAL ✓' : 'HARAM VETO ✗'}
                    </span>
                  </div>
                  <p className="basis-full text-[10px] text-gray-500">
                    {isAr ? 'لم تضع هذه الواجهة أي أمر تداول.' : 'This view did not place a trade.'}
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Server-recorded Portfolio Activity ── */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-3xl overflow-hidden border border-white/[0.06] bg-[#05080f] shadow-xl flex flex-col" style={{ height: '660px' }}>
            {/* Log header */}
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between bg-gradient-to-r from-indigo-500/5 to-transparent">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-extrabold text-white">
                  {isAr ? 'نشاط المحفظة المسجل في الخادم' : 'Server-recorded Portfolio Activity'}
                </h3>
              </div>
              <span className="text-[9px] font-black text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 font-mono uppercase">
                {isAr ? 'بيانات الخادم' : 'SERVER DATA'}
              </span>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
              <AnimatePresence>
                {trades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center">
                      <History className="w-5 h-5 text-gray-700" />
                    </div>
                    <p className="text-xs text-gray-600 font-mono">
                      {isAr ? 'لا يوجد نشاط مسجل في الخادم.' : 'No server-recorded activity.'}
                    </p>
                  </div>
                ) : (
                  trades.map((trade) => (
                    <motion.div
                      key={trade.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3.5 bg-white/[0.02] rounded-2xl border border-white/[0.04] space-y-2 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-gray-600 font-mono">
                          {new Date(trade.createdAt).toLocaleTimeString(locale)}
                        </span>
                        <span className="text-[9px] font-black text-gray-400 bg-white/5 px-1.5 py-0.5 rounded-md border border-white/10">
                          {isAr ? 'مسجل' : 'RECORDED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 font-mono leading-snug">
                        <span className="text-emerald-600 mr-1">›</span>
                        {trade.description}
                      </p>
                      <div className="flex justify-between items-center pt-0.5 border-t border-white/[0.03]">
                        <span className="text-[9px] text-gray-600">{trade.currency}</span>
                        <span className="text-[10px] text-amber-400 font-bold font-mono">{fmtMoney(trade.amount, trade.currency)}</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.04] flex justify-between items-center text-[10px] bg-[#03050a]">
              <span className="text-gray-600 font-mono">{isAr ? 'التطهير المسجل في الخادم' : 'SERVER-RECORDED PURIFICATION'}</span>
              <span className="text-emerald-400 font-bold font-mono">{fmtMoney(runningPurificationTotal)}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
