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
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Coins,
  Check,
  X,
  GraduationCap,
  Trophy,
} from 'lucide-react';

import MavericksSquadPanel from './MavericksSquadPanel';

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

export interface DecisionRecord {
  id: string;
  symbol: string;
  market: MarketKind;
  asOf: string;
  proposedAction: string;
  proposedQty: number;
  finalAction: string;
  finalQty: number;
  shariaGate: ShariaGate;
  riskAdjustments?: { capped: boolean; reason?: string };
  debateTranscript?: DebateTurn[];
  status: string;
  costCents?: number;
  createdAt: string;
  signals: Signal[];
}

interface Position {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  price: number;
  value: number;
  weight: number;
  complianceStatus?: 'VERIFIED_COMPLIANT' | 'VERIFIED_NON_COMPLIANT' | 'UNVERIFIED';
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
  initialDecisions?: DecisionRecord[];
  initialAutonomyTier?: 'HUMAN_APPROVE' | 'AUTO_PAPER' | 'AUTO_REAL';
  initialInternalPortfolioAvailable?: boolean;
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
  initialMetrics,
  initialTrades = [],
  initialDecisions = [],
  initialAutonomyTier = 'HUMAN_APPROVE',
  initialInternalPortfolioAvailable = true,
}: CommitteeClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const [activeTab, setActiveTab] = useState<'board' | 'mavericks' | 'portfolio'>('board');
  const [autonomyTier, setAutonomyTier] = useState<'HUMAN_APPROVE' | 'AUTO_PAPER' | 'AUTO_REAL'>(initialAutonomyTier);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(initialDecisions ?? []);

  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);

  const [market, setMarket] = useState<MarketKind>('NASDAQ');
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL.NASDAQ);

  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passData, setPassData] = useState<PassResult | null>(null);

  const [rebalanceLoading, setRebalanceLoading] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);

  const [executeLoading, setExecuteLoading] = useState<string | null>(null); // maps to decisionId loading

  // Portfolio data is a read-only snapshot loaded by the authenticated server page.
  const nav = initialNAV;
  const cash = initialCash;
  const positions = initialPositions;
  const purification = initialPurification;
  const trades = initialTrades;

  // Timeframe selector for charts
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '1Y' | 'ALL'>('ALL');

  const [snapshots] = useState<Snapshot[]>(initialSnapshots ?? []);

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
    setSelectedDecisionId(null);
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
      setSimPlay(true);
      setDebateTurnIdx(0);
      setSelectedDecisionId(data.decisionId);

      // Prepend to decisions log
      const newRec: DecisionRecord = {
        id: data.decisionId,
        symbol,
        market,
        asOf: new Date().toISOString(),
        proposedAction: data.proposedAction || 'HOLD',
        proposedQty: data.proposedQty || 0,
        finalAction: data.finalAction,
        finalQty: data.finalQty || 0,
        shariaGate: data.shariaGate,
        riskAdjustments: data.riskAdjustments,
        debateTranscript: data.debateTranscript,
        status: data.finalAction === 'HOLD' ? 'EXECUTED' : autonomyTier === 'AUTO_PAPER' ? 'EXECUTED' : 'PROPOSED',
        createdAt: new Date().toISOString(),
        signals: data.signals,
      };
      setDecisions((prev) => [newRec, ...prev]);
    } catch {
      setPassError(t('errorGeneric'));
    } finally {
      setPassLoading(false);
    }
  }

  async function toggleAutopilot() {
    const nextTier = autonomyTier === 'AUTO_PAPER' ? 'HUMAN_APPROVE' : 'AUTO_PAPER';
    try {
      const res = await fetch('/api/quant/autonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomyTier: nextTier }),
      });
      if (res.ok) {
        setAutonomyTier(nextTier as any);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function executeProposed(decisionId: string) {
    setExecuteLoading(decisionId);
    setPassError(null);
    try {
      const res = await fetch('/api/quant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId }),
      });
      if (res.ok) {
        setDecisions((prev) =>
          prev.map((d) => (d.id === decisionId ? { ...d, status: 'EXECUTED' } : d))
        );
        window.location.reload();
      } else {
        const data = await res.json();
        setPassError(data.error || 'Execution failed');
      }
    } catch (err) {
      setPassError('Execution failed');
    } finally {
      setExecuteLoading(null);
    }
  }

  function loadPastDecision(dec: DecisionRecord) {
    setSelectedDecisionId(dec.id);
    setMarket(dec.market);
    setSymbol(dec.symbol);
    setPassData({
      decisionId: dec.id,
      finalAction: dec.finalAction,
      proposedAction: dec.proposedAction,
      shariaGate: dec.shariaGate,
      signals: dec.signals,
      debateTranscript: dec.debateTranscript,
    });
    setSimStep('done');
    setSimPlay(false);
    setDebateTurnIdx(0);
  }

  async function triggerManualRebalance() {
    setRebalanceLoading(true);
    setRebalanceError(null);
    try {
      const res = await fetch('/api/quant/rebalance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        const errorKey = (({
          forbidden: 'rebalanceErrorForbidden',
          unsupported_media_type: 'rebalanceErrorUnsupported',
          halted: 'rebalanceErrorHalted',
          already_run_today: 'rebalanceErrorAlreadyRun',
          internal_error: 'rebalanceErrorGeneric',
        }) as Record<string, string>)[data.error as string] ?? 'rebalanceErrorGeneric';
        setRebalanceError(t(errorKey));
        return;
      }
      window.location.reload();
    } catch {
      setRebalanceError(t('rebalanceErrorGeneric'));
    } finally {
      setRebalanceLoading(false);
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
      {/* ── Tab Switcher ── */}
      {initialInternalPortfolioAvailable ? (
        <div className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-foreground/[0.04] p-1 sm:w-fit" role="tablist" aria-label={t('committeeTab')}>
          <>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'board'}
              onClick={() => setActiveTab('board')}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === 'board'
                  ? 'bg-surface-card text-foreground shadow-sm'
                  : 'text-foreground/55 hover:text-foreground'
              }`}
            >
              <Cpu className="size-3.5 text-accent" aria-hidden="true" />
              <span>{t('committeeTab')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mavericks'}
              onClick={() => setActiveTab('mavericks')}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === 'mavericks'
                  ? 'bg-surface-card text-foreground shadow-sm'
                  : 'text-foreground/55 hover:text-foreground'
              }`}
            >
              <Trophy className="size-3.5 text-amber-400" aria-hidden="true" />
              <span>{t('mavericksTitle')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'portfolio'}
              onClick={() => setActiveTab('portfolio')}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === 'portfolio'
                  ? 'bg-surface-card text-foreground shadow-sm'
                  : 'text-foreground/55 hover:text-foreground'
              }`}
            >
              <Coins className="size-3.5 text-accent" aria-hidden="true" />
              <span>{t('portfolioAnalyticsTab')}</span>
            </button>
          </>
        </div>
      ) : null}

      {activeTab === 'mavericks' && (
        <MavericksSquadPanel locale={locale} />
      )}

      {activeTab === 'board' && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* ── AI Autopilot Control Card ── */}
          <section className="relative isolate overflow-hidden rounded-3xl bg-surface-card p-5 shadow-[0_18px_55px_-38px_rgba(79,70,229,0.55)] ring-1 ring-border-color sm:p-6" aria-labelledby="paper-automation-title">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-accent/[0.10] via-transparent to-up/[0.08]" />
            <div className="flex h-full flex-col justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className={`flex size-12 items-center justify-center rounded-2xl ring-1 ring-inset ${
                    autonomyTier === 'AUTO_PAPER' ? 'bg-up/10 text-up ring-up/20' : 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400'
                  }`}>
                    <Bot className="size-6" aria-hidden="true" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 id="paper-automation-title" className="text-sm font-bold text-foreground">
                      {t('paperAutomationTitle')}
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${
                      autonomyTier === 'AUTO_PAPER'
                        ? 'bg-up/10 text-up ring-up/20'
                        : 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300'
                    }`}>
                      {autonomyTier === 'AUTO_PAPER'
                        ? t('paperAutomationEnabled')
                        : t('manualApprovalRequired')
                      }
                    </span>
                  </div>
                  <p className="max-w-xl text-xs leading-5 text-foreground/60">
                    {autonomyTier === 'AUTO_PAPER'
                      ? t('paperAutomationEnabledBody')
                      : t('paperAutomationManualBody')
                    }
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAutopilot()}
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  autonomyTier === 'AUTO_PAPER'
                    ? 'bg-up text-white hover:opacity-90'
                    : 'bg-foreground text-background hover:opacity-90'
                }`}
              >
                {autonomyTier === 'AUTO_PAPER' ? <Check className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                <span>{autonomyTier === 'AUTO_PAPER' ? t('disablePaperAutomation') : t('enablePaperAutomation')}</span>
              </button>
            </div>
          </section>

          {/* ── Interactive Sandbox Controls ── */}
          <section className="rounded-3xl bg-surface-card p-5 shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)] ring-1 ring-border-color sm:p-6" aria-labelledby="review-setup-title">
            <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <h3 id="review-setup-title" className="mb-4 text-sm font-bold text-foreground">{t('reviewSetupTitle')}</h3>
              <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/45">
                  {t('marketLabel')}
                </span>
                <div className="flex gap-1 rounded-xl bg-foreground/[0.05] p-1">
                  {(['NASDAQ', 'TASI'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => handleMarketChange(m)}
                      className={`min-h-9 rounded-lg px-3 py-1 text-[10px] font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        market === m ? 'bg-surface-card text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/45">
                  {t('suggestedSymbols')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(market === 'TASI'
                    ? [
                        { sym: '2222.SR', label: isAr ? 'أرامكو' : 'Aramco' },
                        { sym: '1120.SR', label: isAr ? 'الراجحي' : 'Al Rajhi' },
                        { sym: '7010.SR', label: isAr ? 'اس تي سي' : 'STC' },
                      ]
                    : [
                        { sym: 'AAPL', label: 'Apple' },
                        { sym: 'TSLA', label: 'Tesla' },
                        { sym: 'NVDA', label: 'Nvidia' },
                      ]
                  ).map((item) => (
                    <button
                      type="button"
                      key={item.sym}
                      onClick={() => setSymbol(item.sym)}
                      className={`min-h-9 rounded-xl px-3 py-1.5 text-[10px] font-bold ring-1 ring-inset transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        symbol === item.sym
                          ? 'bg-accent/10 text-accent ring-accent/25'
                          : 'bg-foreground/[0.025] text-foreground/60 ring-border-color hover:text-foreground'
                      }`}
                    >
                      {item.label} ({item.sym})
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="quant-custom-symbol" className="text-[10px] font-bold uppercase tracking-wider text-foreground/45">
                  {t('customSymbol')}
                </label>
                <input
                  id="quant-custom-symbol"
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder={t('symbolPlaceholder')}
                  className="min-h-9 w-32 rounded-xl bg-foreground/[0.035] px-3 py-1.5 font-mono text-xs font-bold uppercase text-foreground ring-1 ring-inset ring-border-color placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => runPass()}
              disabled={passLoading || !symbol}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-[0_12px_30px_-18px_rgba(79,70,229,0.8)] transition duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {passLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
              <span>{passLoading ? t('deliberating') : t('runReview')}</span>
            </button>
            </div>
          </section>
          </div>

          {passError && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs font-bold text-rose-400">
              {passError}
            </div>
          )}

          {/* Grid: Committee Board + Execution Log */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            {/* ── Left: Visual Committee Board ── */}
            <div className="space-y-4 lg:col-span-8">
              <section className="overflow-hidden rounded-[2rem] bg-surface-card p-2 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.7)] ring-1 ring-border-color" aria-labelledby="committee-board-title">
                {/* Board Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-gradient-to-r from-accent/[0.08] to-transparent px-4 py-3 sm:px-5">
                  <div>
                    <h3 id="committee-board-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                      {t('committeeBoardTitle', { symbol })}
                    </h3>
                    <p className="mt-1 text-[10px] text-foreground/45">
                      {simPlay ? t('visualizationPlaying') : t('visualizationPaused')} · {t('executionServerOnly')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSimPlay(!simPlay)}
                      disabled={!passData}
                      aria-label={simPlay ? (isAr ? 'إيقاف العرض المرئي' : 'Pause visualization') : (isAr ? 'تشغيل العرض المرئي' : 'Play visualization')}
                      className="flex size-9 items-center justify-center rounded-xl bg-surface-card text-foreground shadow-sm ring-1 ring-border-color transition duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {simPlay ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSimStep('ingestion'); setSimPlay(true); setDebateTurnIdx(0); }}
                      disabled={!passData}
                      aria-label={isAr ? 'إعادة العرض المرئي' : 'Replay visualization'}
                      className="flex size-9 items-center justify-center rounded-xl bg-surface-card text-foreground shadow-sm ring-1 ring-border-color transition duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <RefreshCw className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimStep('done')}
                      disabled={!passData}
                      className="min-h-9 rounded-xl bg-surface-card px-3 py-1.5 text-[10px] font-bold text-foreground/55 shadow-sm ring-1 ring-border-color transition duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {t('skipVisualization')}
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
                      className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="flex flex-wrap items-center gap-4">
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
                      </div>

                      {(() => {
                        const currentDec = decisions.find(d => d.id === passData.decisionId);
                        if (currentDec && currentDec.status === 'PROPOSED') {
                          return (
                            <button
                              onClick={() => executeProposed(currentDec.id)}
                              disabled={executeLoading === currentDec.id}
                              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black text-[10px] font-black uppercase tracking-wider transition-all shadow shadow-emerald-500/20 active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {executeLoading === currentDec.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-black" />
                              )}
                              <span>{isAr ? 'اعتماد وتنفيذ التداول' : 'Approve & Execute Order'}</span>
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </motion.div>
                  )}
                </div>
              </section>
            </div>

            {/* ── Right: 24/7 Committee Decisions History Log ── */}
            <div className="space-y-4 lg:col-span-4">
              <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-[2rem] bg-surface-card shadow-[0_24px_70px_-46px_rgba(15,23,42,0.65)] ring-1 ring-border-color lg:h-[685px]" aria-labelledby="decision-history-title">
                <div className="flex items-center justify-between bg-gradient-to-r from-accent/[0.08] to-transparent px-5 py-4">
                  <div className="flex items-center gap-2">
                    <History className="size-4 text-accent" aria-hidden="true" />
                    <h3 id="decision-history-title" className="text-sm font-bold text-foreground">
                      {t('decisionHistoryTitle')}
                    </h3>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[9px] font-bold text-accent ring-1 ring-inset ring-accent/20">
                    {t('decisionHistoryBadge')}
                  </span>
                </div>

                <div className="bg-foreground/[0.025] px-5 py-3 text-[11px] leading-5 text-foreground/50">
                  {t('decisionHistoryDescription')}
                </div>

                {/* Log Entries */}
                <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto p-4">
                  <AnimatePresence>
                    {decisions.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center space-y-3 py-12 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/[0.07] text-accent ring-1 ring-inset ring-accent/15">
                          <History className="size-5" aria-hidden="true" />
                        </div>
                        <div className="max-w-52">
                          <p className="text-xs font-bold text-foreground">{t('decisionHistoryEmptyTitle')}</p>
                          <p className="mt-1 text-[11px] leading-5 text-foreground/45">{t('decisionHistoryEmptyBody')}</p>
                        </div>
                      </div>
                    ) : (
                      decisions.map((dec) => {
                        const isSelected = selectedDecisionId === dec.id;
                        return (
                          <motion.div
                            key={dec.id}
                            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className={`flex flex-col gap-2 rounded-2xl p-3 ring-1 ring-inset transition duration-150 ${
                              isSelected
                                ? 'bg-accent/[0.07] ring-accent/30'
                                : 'bg-foreground/[0.02] ring-border-color hover:bg-foreground/[0.04]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => loadPastDecision(dec)}
                              className="rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-black text-accent">{dec.symbol}</span>
                                <span className="font-mono text-[8px] tracking-wider text-foreground/35">{dec.market}</span>
                              </div>
                              <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase ring-1 ring-inset ${
                                dec.status === 'EXECUTED'
                                  ? 'bg-up/10 text-up ring-up/20'
                                  : dec.status === 'VETOED'
                                  ? 'bg-down/10 text-down ring-down/20'
                                  : 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300'
                              }`}>
                                {dec.status === 'EXECUTED' ? (isAr ? 'تم التنفيذ' : 'EXECUTED') : dec.status === 'VETOED' ? (isAr ? 'فيتو شرعي' : 'VETOED') : (isAr ? 'مقترح' : 'PROPOSED')}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-foreground/45">
                              <span>
                                {isAr ? 'الإجراء النهائي:' : 'Action:'} <strong className="text-foreground">{dec.finalAction}</strong>
                              </span>
                              <span>{new Date(dec.createdAt).toLocaleDateString(locale)}</span>
                            </div>
                            </button>

                            {dec.status === 'PROPOSED' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  executeProposed(dec.id);
                                }}
                                disabled={executeLoading === dec.id}
                                className="mt-1 flex min-h-9 w-full items-center justify-center gap-1 rounded-xl bg-up py-1.5 text-[9px] font-black uppercase tracking-wider text-white transition duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-up disabled:opacity-50"
                              >
                                {executeLoading === dec.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <Check className="w-2.5 h-2.5 text-black" />
                                )}
                                <span>{isAr ? 'اعتماد وتنفيذ الصفقة' : 'Approve & Execute'}</span>
                              </button>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {activeTab === 'portfolio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Performance Graph + Holdings Table */}
          <div className="lg:col-span-8 space-y-6">
            {/* Performance curve SVG chart */}
            <div className="glass-panel rounded-3xl p-6 border border-white/5 shadow-xl space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    {isAr ? 'منحنى أداء استراتيجية الذكاء الاصطناعي' : 'AI Autopilot Strategy Equity Curve'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {isAr ? 'استعراض أداء الاستراتيجية مقارنة بالمؤشرات القياسية' : 'Recorded net asset value vs SPY and SPUS benchmarks'}
                  </p>
                </div>

                <div className="flex space-x-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  {['1M', '3M', '1Y', 'ALL'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf as any)}
                      className={`px-3 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                        timeframe === tf ? 'bg-emerald-500 text-black shadow-md' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="h-64 w-full">
                {renderSvgChart()}
              </div>

              {/* Chart Legend */}
              <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-wider font-mono justify-end">
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#10B981]" />AI Strategy</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#00f0ff]" />SPUS (Halal Index)</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-gray-600 stroke-dasharray" />SPY (S&P 500)</div>
              </div>
            </div>

            {/* Asset Class Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4 border border-white/5">
                <div>
                  <div className="text-gray-500 font-bold text-[9px] uppercase tracking-wider mb-2">US Equities</div>
                  <div className="text-2xl font-black text-white font-mono">
                    {fmtMoney(positions.filter(p => !p.symbol.endsWith('.SR')).reduce((s, p) => s + p.value, 0), 'USD')}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold mb-1.5">
                    <span className="text-gray-500">Portfolio Share</span>
                    <span className="text-white font-mono font-bold">
                      {fmtPercent(positions.filter(p => !p.symbol.endsWith('.SR')).reduce((s, p) => s + p.weight, 0))}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${positions.filter(p => !p.symbol.endsWith('.SR')).reduce((s, p) => s + p.weight, 0) * 100}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4 border border-white/5">
                <div>
                  <div className="text-gray-500 font-bold text-[9px] uppercase tracking-wider mb-2">Saudi Equities</div>
                  <div className="text-2xl font-black text-white font-mono">
                    {fmtMoney(positions.filter(p => p.symbol.endsWith('.SR')).reduce((s, p) => s + p.value, 0), 'SAR')}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold mb-1.5">
                    <span className="text-gray-500">Portfolio Share</span>
                    <span className="text-white font-mono font-bold">
                      {fmtPercent(positions.filter(p => p.symbol.endsWith('.SR')).reduce((s, p) => s + p.weight, 0))}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${positions.filter(p => p.symbol.endsWith('.SR')).reduce((s, p) => s + p.weight, 0) * 100}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-3xl p-5 shadow-md flex flex-col justify-between space-y-4 border border-white/5">
                <div>
                  <div className="text-gray-500 font-bold text-[9px] uppercase tracking-wider mb-2">Virtual Cash</div>
                  <div className="text-2xl font-black text-white font-mono">
                    {fmtMoney(cash, market === 'TASI' ? 'SAR' : 'USD')}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold mb-1.5">
                    <span className="text-gray-500">Portfolio Share</span>
                    <span className="text-white font-mono font-bold">
                      {nav > 0 ? fmtPercent(cash / nav) : '0.0%'}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${nav > 0 ? (cash / nav) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="glass-panel rounded-3xl p-6 border border-white/5 overflow-hidden shadow-xl">
              <h2 className="text-sm font-extrabold uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse mb-4 text-white">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span>{t('holdingsHeading')}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 font-black uppercase tracking-wider text-[9px]">
                      <th className="py-3 text-start px-2">{t('symbol')}</th>
                      <th className="py-3 text-start px-2">{t('marketLabel')}</th>
                      <th className="py-3 text-start px-2">{isAr ? 'الحكم الشرعي' : 'Sharia Screen'}</th>
                      <th className="py-3 text-end px-2">{t('shares')}</th>
                      <th className="py-3 text-end px-2">{t('costBasis')}</th>
                      <th className="py-3 text-end px-2">{t('value')}</th>
                      <th className="py-3 text-end px-2">{t('weight')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const isHalal = !pos.complianceStatus || pos.complianceStatus === 'VERIFIED_COMPLIANT';
                      const shariaLabel = isHalal ? (isAr ? 'متوافق' : 'COMPLIANT') : (isAr ? 'غير متوافق' : 'NON-COMPLIANT');
                      return (
                        <tr key={`${pos.symbol}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-2 font-black font-mono text-emerald-400" dir="ltr">{pos.symbol}</td>
                          <td className="py-3.5 px-2 text-gray-300 font-semibold">{pos.symbol.endsWith('.SR') ? 'TASI' : 'NASDAQ'}</td>
                          <td className="py-3.5 px-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black border uppercase tracking-wider shadow-sm ${
                              isHalal
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              {isHalal ? <ShieldCheck className="w-3 h-3 text-emerald-400" /> : <ShieldAlert className="w-3 h-3 text-rose-400" />}
                              {shariaLabel}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-end font-mono text-gray-300">{pos.shares.toFixed(2)}</td>
                          <td className="py-3.5 px-2 text-end font-mono text-gray-300">{fmtMoney(pos.costBasis)}</td>
                          <td className="py-3.5 px-2 text-end font-mono text-white font-bold">{fmtMoney(pos.value)}</td>
                          <td className="py-3.5 px-2 text-end">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1 bg-black/40 rounded-full overflow-hidden hidden sm:block">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pos.weight * 100}%` }} />
                              </div>
                              <span className="font-mono font-bold text-white">{fmtPercent(pos.weight)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {positions.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-500">{t('noActivePositions')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Allocation Donut + Rebalance Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-3xl border border-white/5 bg-[#05080f] shadow-xl overflow-hidden">
              <div className="p-5 border-b border-white/5 bg-gradient-to-r from-indigo-500/5 to-transparent">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  {isAr ? 'مكونات المحفظة الحالية' : 'Current Asset Allocation'}
                </h3>
              </div>
              <div className="p-6">
                {renderAllocationDonut()}
              </div>
            </div>

            {/* Rebalance trigger panel */}
            <div className="glass-panel rounded-3xl p-5 border border-white/5 shadow-xl space-y-4">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider">
                  {isAr ? 'إعادة التوازن اليدوية للمحفظة' : 'Rebalance portfolio'}
                </h3>
                <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                  {isAr 
                    ? 'يقوم هذا الخيار بإعادة موازنة أوزان المحفظة الفعالة وتصفيتها شرعياً بما يوافق معايير AAOIFI ونظام إدارة المخاطر.'
                    : 'Manually trigger rebalancing, aligning positions, executing compliance purifications and enforcing exposure constraints.'
                  }
                </p>
              </div>

              {rebalanceError && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[10px] font-bold text-rose-400">
                  {rebalanceError}
                </div>
              )}

              <button
                onClick={triggerManualRebalance}
                disabled={rebalanceLoading}
                className="w-full py-3 rounded-2xl bg-emerald-500 text-black font-black text-xs uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {rebalanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-black" />}
                <span>{rebalanceLoading ? t('rebalancing') : t('rebalanceButton')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
