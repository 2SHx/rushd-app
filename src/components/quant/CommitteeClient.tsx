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
}

const DEFAULT_SYMBOL: Record<MarketKind, string> = {
  TASI: '2222.SR',
  NASDAQ: 'AAPL',
};

function generateMockSnapshots(baseNAV: number, length = 30): Snapshot[] {
  const navVal = baseNAV || 100000;
  const list: Snapshot[] = [];
  const now = new Date();
  for (let i = length - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayFactor = length - 1 - i;
    // simulated compound growth: strategy Nav outperforms benchmarks
    const sNav = navVal * (1 + 0.0012 * dayFactor + Math.sin(dayFactor / 2) * 0.005 + Math.cos(dayFactor * 1.7) * 0.004);
    const spy = navVal * (1 + 0.0006 * dayFactor + Math.sin(dayFactor / 3) * 0.006 + Math.cos(dayFactor * 1.3) * 0.005);
    const spus = navVal * (1 + 0.0008 * dayFactor + Math.sin(dayFactor / 2.5) * 0.0055 + Math.cos(dayFactor * 1.5) * 0.0045);
    list.push({
      asOf: d.toISOString(),
      nav: sNav,
      cashVirtual: navVal * 0.1,
      spy,
      spus,
    });
  }
  return list;
}

function generateMockDecisions(isAr: boolean): DecisionRecord[] {
  return [
    {
      id: 'mock-dec-1',
      symbol: '1120.SR',
      market: 'TASI',
      asOf: new Date(Date.now() - 3600000 * 2).toISOString(),
      proposedAction: 'BUY',
      proposedQty: 500,
      finalAction: 'BUY',
      finalQty: 500,
      status: 'EXECUTED',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      shariaGate: { compliant: true },
      riskAdjustments: { capped: false },
      debateTranscript: [
        {
          side: 'BULL',
          round: 1,
          argumentEn: 'Al Rajhi shows exceptional ROE, solid dividend support, and is trading near key technical moving averages.',
          argumentAr: 'مصرف الراجحي يظهر عائداً ممتازاً على حقوق الملكية، ودعماً قوياً للأرباح، ويتداول بالقرب من المتوسطات المتحركة الرئيسية.',
        },
        {
          side: 'BEAR',
          round: 1,
          argumentEn: 'Banking sector interest margins are experiencing slight contraction due to competitive liquidity positioning.',
          argumentAr: 'هوامش صافي الفائدة للقطاع المصرفي تشهد انكماشاً طفيفاً نتيجة للمنافسة على السيولة.',
        },
      ],
      signals: [
        {
          agent: 'QUANT_CORE',
          stance: 'BULLISH',
          conviction: 0.85,
          rationaleEn: 'Momentum scoring remains positive on high relative volume.',
          rationaleAr: 'مؤشرات الزخم إيجابية مع حجم تداول نسبي مرتفع.',
          evidence: { 'Momentum 12-1': '+14.5%', 'MA Trend': 'Above MA(50)' },
          failureMode: 'ok',
        },
        {
          agent: 'TECHNICAL',
          stance: 'BULLISH',
          conviction: 0.75,
          rationaleEn: 'Indicators signaling accumulation phase bottom out.',
          rationaleAr: 'المؤشرات الفنية تشير إلى انتهاء مرحلة التجميع ودعم ارتدادي.',
          evidence: { RSI: '45.2', MACD: 'Bullish Cross' },
          failureMode: 'ok',
        },
        {
          agent: 'SHARIA',
          stance: 'NEUTRAL',
          conviction: 1.0,
          rationaleEn: 'Financial activities and ratio screens are fully compliant with AAOIFI limits.',
          rationaleAr: 'أنشطة البنك ونسبه المالية متوافقة تماماً مع معايير هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية.',
          evidence: { 'Compliant Income': '100%', 'Debt/Mcap': '12.4%' },
          failureMode: 'ok',
        },
      ],
    },
    {
      id: 'mock-dec-2',
      symbol: '2222.SR',
      market: 'TASI',
      asOf: new Date(Date.now() - 3600000 * 24).toISOString(),
      proposedAction: 'BUY',
      proposedQty: 1000,
      finalAction: 'HOLD',
      finalQty: 0,
      status: 'VETOED',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      shariaGate: { compliant: false, reason: 'Non-compliant interest-bearing leverage crossing the 30% threshold limit.' },
      riskAdjustments: { capped: true },
      debateTranscript: [
        {
          side: 'BULL',
          round: 1,
          argumentEn: 'Aramco exhibits cash generation that is highly robust, presenting an attractive dividend play.',
          argumentAr: 'تظهر أرامكو قدرة قوية على توليد التدفقات النقدية، مما يمثل خياراً جاذباً للأرباح الموزعة.',
        },
        {
          side: 'BEAR',
          round: 1,
          argumentEn: 'Temporary spikes in interest-bearing debt relative to market cap have triggered a Sharia filter warning.',
          argumentAr: 'الارتفاع المؤقت في الديون ذات الفائدة مقارنة بالقيمة السوقية أدى إلى إطلاق تنبيه من الفلتر الشرعي.',
        },
      ],
      signals: [
        {
          agent: 'SHARIA',
          stance: 'BEARISH',
          conviction: 1.0,
          rationaleEn: 'AAOIFI Debt limit crossed (32.4% > 30.0% standard cap).',
          rationaleAr: 'تجاوز حد الدين الإسلامي (32.4٪ > 30.0٪ الحد الأقصى للمعيار).',
          evidence: { 'Interest-Debt / Mcap': '32.4%' },
          failureMode: 'ok',
        },
      ],
    },
  ];
}

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
  initialAutonomyTier = 'HUMAN_APPROVE'
}: CommitteeClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const [activeTab, setActiveTab] = useState<'board' | 'portfolio'>('board');
  const [autonomyTier, setAutonomyTier] = useState<'HUMAN_APPROVE' | 'AUTO_PAPER' | 'AUTO_REAL'>(initialAutonomyTier);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(() => {
    if (!initialDecisions || initialDecisions.length === 0) {
      return generateMockDecisions(isAr);
    }
    return initialDecisions;
  });

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

  const [snapshots] = useState<Snapshot[]>(() => {
    if (!initialSnapshots || initialSnapshots.length < 2) {
      return generateMockSnapshots(initialNAV);
    }
    return initialSnapshots;
  });

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
      <div className="flex space-x-1 p-1 bg-[#080c14] border border-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('board')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'board'
              ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/10'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{isAr ? 'لجنة مستشاري الذكاء الاصطناعي' : 'AI Committee Board'}</span>
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'portfolio'
              ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/10'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>{isAr ? 'تحليلات المحفظة' : 'Portfolio Analytics'}</span>
        </button>
      </div>

      {activeTab === 'board' && (
        <>
          {/* ── AI Autopilot Control Card ── */}
          <div className="relative overflow-hidden rounded-3xl border border-indigo-500/15 bg-gradient-to-r from-indigo-500/5 via-[#080c14] to-emerald-500/5 p-5 shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/3 to-transparent pointer-events-none" />
            <div className="flex flex-wrap items-center justify-between gap-4 relative">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all ${
                    autonomyTier === 'AUTO_PAPER' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  }`}>
                    <Bot className="w-6 h-6 animate-pulse" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-extrabold text-sm text-white">
                      {isAr ? 'منظومة التداول الآلي للذكاء الاصطناعي' : 'Automated AI Autopilot Trading'}
                    </h3>
                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full tracking-wider border ${
                      autonomyTier === 'AUTO_PAPER'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {autonomyTier === 'AUTO_PAPER'
                        ? (isAr ? 'الطيار الآلي نشط (٢٤/٧)' : 'AUTOPILOT ACTIVE (24/7)')
                        : (isAr ? 'موافقة يدوية مطلوبة' : 'MANUAL APPROVAL REQUIRED')
                      }
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {autonomyTier === 'AUTO_PAPER'
                      ? (isAr ? 'يقوم المساعد الذكي باتخاذ وتنفيذ صفقات المحفظة بالكامل تلقائياً على مدار الساعة بناءً على الفرص المتاحة.' : 'The AI agent automatically identifies, proposes, and executes virtual portfolio trades 24/7 in real-time.')
                      : (isAr ? 'اللجنة تعمل كمرشد وتصدر توصيات مقترحة تتطلب تفعيلك اليدوي للتنفيذ.' : 'The committee runs and proposes investment decisions, waiting for user trigger/execution.')
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleAutopilot()}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all flex items-center gap-2 active:scale-95 ${
                  autonomyTier === 'AUTO_PAPER'
                    ? 'bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-600'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                }`}
              >
                {autonomyTier === 'AUTO_PAPER' ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{autonomyTier === 'AUTO_PAPER' ? (isAr ? 'إيقاف التداول الآلي' : 'Disable Autopilot') : (isAr ? 'تشغيل التداول الآلي' : 'Enable Autopilot')}</span>
              </button>
            </div>
          </div>

          {/* ── Interactive Sandbox Controls ── */}
          <div className="p-5 rounded-3xl border border-white/5 bg-[#05080f] shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  {isAr ? 'السوق' : 'Market'}
                </span>
                <div className="flex space-x-1 p-0.5 bg-black/40 border border-white/5 rounded-xl">
                  {(['NASDAQ', 'TASI'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => handleMarketChange(m)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        market === m ? 'bg-emerald-500 text-black shadow' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  {isAr ? 'رمز الأداة المقترحة' : 'Suggested Symbols'}
                </span>
                <div className="flex space-x-1">
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
                      key={item.sym}
                      onClick={() => setSymbol(item.sym)}
                      className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold transition-all ${
                        symbol === item.sym
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-white/5 bg-white/[0.02] text-gray-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      {item.label} ({item.sym})
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  {isAr ? 'رمز مخصص' : 'Custom Symbol'}
                </span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder={isAr ? 'مثال: AAPL' : 'e.g. AAPL'}
                  className="px-3 py-1.5 bg-black/40 border border-white/5 rounded-xl text-xs font-mono font-bold text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 w-28 uppercase"
                />
              </div>
            </div>

            <button
              onClick={() => runPass()}
              disabled={passLoading || !symbol}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 text-black font-extrabold text-xs uppercase tracking-wider hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-black" />}
              <span>{passLoading ? (isAr ? 'جارٍ التحليل...' : 'Deliberating...') : (isAr ? 'تشغيل اللجنة التفاعلية' : 'Run Sandbox Pass')}</span>
            </button>
          </div>

          {passError && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs font-bold text-rose-400">
              {passError}
            </div>
          )}

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
              </div>
            </div>

            {/* ── Right: 24/7 Committee Decisions History Log ── */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-3xl overflow-hidden border border-white/[0.06] bg-[#05080f] shadow-xl flex flex-col" style={{ height: '685px' }}>
                <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between bg-gradient-to-r from-indigo-500/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-extrabold text-white">
                      {isAr ? 'سجل قرارات اللجنة (٢٤/٧)' : '24/7 Decisions History'}
                    </h3>
                  </div>
                  <span className="text-[9px] font-black text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 font-mono uppercase">
                    {isAr ? 'الطيار الآلي' : 'AI HISTORY'}
                  </span>
                </div>

                <div className="p-3 text-[10px] text-gray-500 border-b border-white/5 bg-black/20">
                  {isAr 
                    ? 'اضغط على أي قرار سابق لاستعراض تفاصيل إشارات التحليل وسيناريو النقاش والمصادقة الشرعية.' 
                    : 'Click any historical run below to load and replay its signals, debate argument and Sharia screening logic.'
                  }
                </div>

                {/* Log Entries */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
                  <AnimatePresence>
                    {decisions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center">
                          <History className="w-5 h-5 text-gray-700" />
                        </div>
                        <p className="text-xs text-gray-600 font-mono">
                          {isAr ? 'لا توجد قرارات مسجلة.' : 'No recorded decisions.'}
                        </p>
                      </div>
                    ) : (
                      decisions.map((dec) => {
                        const isSelected = selectedDecisionId === dec.id;
                        return (
                          <motion.div
                            key={dec.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => loadPastDecision(dec)}
                            className={`p-3 bg-white/[0.01] rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/[0.04] shadow-md shadow-emerald-500/5'
                                : 'border-white/[0.04] hover:bg-white/[0.03] hover:border-white/10'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black font-mono text-emerald-400">{dec.symbol}</span>
                                <span className="text-[8px] font-mono text-gray-600 tracking-wider">{dec.market}</span>
                              </div>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md border ${
                                dec.status === 'EXECUTED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : dec.status === 'VETOED'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                              }`}>
                                {dec.status === 'EXECUTED' ? (isAr ? 'تم التنفيذ' : 'EXECUTED') : dec.status === 'VETOED' ? (isAr ? 'فيتو شرعي' : 'VETOED') : (isAr ? 'مقترح' : 'PROPOSED')}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                              <span>
                                {isAr ? 'الإجراء النهائي:' : 'Action:'} <strong className="text-white">{dec.finalAction}</strong>
                              </span>
                              <span>{new Date(dec.createdAt).toLocaleDateString(locale)}</span>
                            </div>

                            {dec.status === 'PROPOSED' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  executeProposed(dec.id);
                                }}
                                disabled={executeLoading === dec.id}
                                className="mt-1 w-full py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all disabled:opacity-50"
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
              </div>
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
