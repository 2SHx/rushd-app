'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
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

import { formatMoney as formatMoneyShared, formatSARNumber } from '@/lib/currency';
import type { StrategyLeagueTeam } from '@/quant/backtest/leagueViewModel';
import StrategyLeagueClient from './StrategyLeagueClient';
import RunLabPanel from './RunLabPanel';
import type { RunnableSetup } from './RunLabPanel';

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
  // Present on live gate output (src/quant/gates/sharia.ts); optional here only because
  // some test fixtures stub a bare `{ compliant }`. Presentation MUST treat a missing
  // `source`/`reason` as unverified, never as an implicit "verified compliant".
  standard?: string;
  source?: string;
}

// src/quant/gates/sharia.ts reason codes -> messages/*.json `Quant.shariaReasons.*` keys.
// Every reason the gate can emit MUST have an entry here; the fallback bucket below routes
// anything missing/unrecognized to `shariaReasons.unknown` rather than leaking the raw code.
const SHARIA_REASON_KEYS: Record<string, string> = {
  aaoifi_screen_pass: 'aaoifiScreenPass',
  aaoifi_screen_fail: 'aaoifiScreenFail',
  screener_unavailable_fail_closed: 'screenerUnavailableFailClosed',
  not_covered_by_free_sources: 'notCoveredByFreeSources',
  unverified_source_fail_closed: 'unverifiedSourceFailClosed',
  stale_evidence_fail_closed: 'staleEvidenceFailClosed',
  unverified_source_permissive: 'unverifiedSourcePermissive',
  stale_evidence_permissive: 'staleEvidencePermissive',
};

// Four honest presentation tiers — deliberately NOT a 2-way compliant/non-compliant split.
// A `compliant:true` verdict is "verified" ONLY when it came from a real, fresh, verified
// source (`aaoifi_screen_pass`); every other compliant verdict (mock/unverified/stale,
// permissive mode) is "unverifiedCompliant" and must never render as an unqualified halal
// claim. Symmetrically, `compliant:false` is split into an actual failed screen
// (`confirmedNonCompliant`) vs. a fail-closed block where the true verdict is simply
// unknown (`blockedUnverifiable`) — both block BUY, but only one is an honest claim of
// non-compliance (src/quant/gates/sharia.ts's own comment makes this distinction).
type ShariaTier = 'verifiedCompliant' | 'unverifiedCompliant' | 'confirmedNonCompliant' | 'blockedUnverifiable';

function shariaTier(gate: ShariaGate): ShariaTier {
  if (gate.compliant) {
    return gate.reason === 'aaoifi_screen_pass' ? 'verifiedCompliant' : 'unverifiedCompliant';
  }
  return gate.reason === 'aaoifi_screen_fail' ? 'confirmedNonCompliant' : 'blockedUnverifiable';
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

type PerformanceStatus = 'available' | 'no_snapshots' | 'multiple_strategies' | 'mixed_currencies';
type QuantSection = 'advisor' | 'teams' | 'portfolio';

interface CommitteeClientProps {
  locale: string;
  initialNAV?: number | null;
  initialCash?: number;
  initialCashCurrency?: 'SAR' | 'USD' | null;
  initialPositions?: Position[];
  initialSnapshots?: Snapshot[];
  initialPurification?: PurificationEntry[];
  initialMetrics?: Metrics;
  initialPerformanceStatus?: PerformanceStatus;
  initialTrades?: Trade[];
  initialDecisions?: DecisionRecord[];
  initialAutonomyTier?: 'HUMAN_APPROVE' | 'AUTO_PAPER' | 'AUTO_REAL';
  initialInternalPortfolioAvailable?: boolean;
  initialStrategyTeams?: StrategyLeagueTeam[];
  initialRunnableSetups?: RunnableSetup[];
  initialSection?: QuantSection;
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

const COMMITTEE_LABELS = {
  committeeTab: { en: 'Quant Advisor', ar: 'المستشار الكمي' },
  strategyTeamsTab: { en: 'Strategy Teams', ar: 'فرق الاستراتيجيات' },
  sectionTabsLabel: { en: 'Quant Advisor sections', ar: 'أقسام المستشار الكمي' },
  portfolioAnalyticsTab: { en: 'Portfolio & Performance Analytics', ar: 'تحليلات الأداء والمحفظة' },
  holdingsHeading: { en: 'Active Holdings & Positions', ar: 'الأصول والأسهم المملوكة' },
  symbol: { en: 'Symbol', ar: 'الرمز' },
  marketLabel: { en: 'Market', ar: 'السوق' },
  shares: { en: 'Shares', ar: 'الأسهم' },
  costBasis: { en: 'Cost Basis', ar: 'سعر التكلفة' },
  value: { en: 'Value', ar: 'القيمة الحالية' },
  weight: { en: 'Weight', ar: 'الوزن' },
  noActivePositions: { en: 'No active holdings in portfolio', ar: 'لا تتوفر أسهم نشطة في المحفظة حالياً' },
  rebalanceButton: { en: 'Trigger Portfolio Rebalance', ar: 'إعادة موازنة المحفظة' },
  rebalancing: { en: 'Rebalancing Portfolio...', ar: 'جاري إعادة الموازنة...' },
  rebalanceErrorGeneric: { en: 'Rebalance operation failed. Please try again.', ar: 'فشلت عملية إعادة الموازنة. يرجى المحاولة لاحقاً.' },
};

export default function CommitteeClient({
  locale,
  initialNAV,
  initialCash,
  initialCashCurrency = null,
  initialPositions = [],
  initialSnapshots = [],
  initialPurification = [],
  initialMetrics,
  initialPerformanceStatus = 'no_snapshots',
  initialTrades = [],
  initialDecisions = [],
  initialAutonomyTier = 'HUMAN_APPROVE',
  initialInternalPortfolioAvailable = true,
  initialStrategyTeams,
  initialRunnableSetups = [],
  initialSection = 'advisor',
}: CommitteeClientProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';
  const pathname = usePathname();
  const router = useRouter();

  const getLabel = (key: keyof typeof COMMITTEE_LABELS) => {
    try {
      const translated = t(key);
      if (translated && !translated.startsWith('Quant.')) return translated;
    } catch {}
    return isAr ? COMMITTEE_LABELS[key].ar : COMMITTEE_LABELS[key].en;
  };

  const [activeTab, setActiveTab] = useState<QuantSection>(
    initialSection === 'teams' && initialStrategyTeams === undefined ? 'advisor' : initialSection,
  );

  useEffect(() => {
    if (initialSection !== 'teams' || initialStrategyTeams !== undefined) {
      setActiveTab(initialSection);
    }
  }, [initialSection, initialStrategyTeams]);

  const selectTab = (tab: QuantSection) => {
    setActiveTab(tab);
    router.push(`${pathname}?section=${tab}#quant-workspace`, { scroll: false });
  };
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
  const nav = initialNAV ?? null;
  const cash = initialCash ?? 0;
  const positions = initialPositions;
  const snapshots = initialSnapshots;

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
      const gate = passData.shariaGate;
      const tier = shariaTier(gate);
      const reasonKey = gate.reason ? SHARIA_REASON_KEYS[gate.reason] : undefined;
      const reasonText = t(`shariaReasons.${reasonKey ?? 'unknown'}`);
      const prefixKey =
        tier === 'verifiedCompliant' ? 'shariaNarrativeVerified'
        : tier === 'unverifiedCompliant' ? 'shariaNarrativeUnverified'
        : tier === 'confirmedNonCompliant' ? 'shariaNarrativeBlocked'
        : 'shariaNarrativeBlockedUnverifiable';
      targetText = `${t(prefixKey)} ${reasonText}`;
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
  }, [simStep, activeAgentId, debateTurnIdx, passData, isAr, t]);

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

  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const fmtMoney = (val: number, currency: 'SAR' | 'USD') => formatMoneyShared(val, currency, locale);
  const fmtPercent = (val: number) => new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(val);
  const fmtNumber = (val: number) => new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 2,
  }).format(val);
  const performanceMessage = {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: '',
  }[initialPerformanceStatus];
  const hasPerformanceMetrics = initialPerformanceStatus === 'available'
    && filteredSnapshots.length >= 2
    && initialMetrics !== undefined;
  const usPositions = positions.filter(position => position.market === 'NASDAQ');
  const tasiPositions = positions.filter(position => position.market === 'TASI');
  const usValue = usPositions.reduce((sum, position) => sum + position.value, 0);
  const tasiValue = tasiPositions.reduce((sum, position) => sum + position.value, 0);
  const sumKnownWeights = (items: Position[]) => items.reduce(
    (sum, position) => sum + (position.weight ?? 0),
    0,
  );
  const usWeight = sumKnownWeights(usPositions);
  const tasiWeight = sumKnownWeights(tasiPositions);

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
    if (initialPerformanceStatus !== 'available' || filteredSnapshots.length < 2) {
      return (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl bg-foreground/[0.025] px-6 text-center" role="status">
          <Activity className="size-6 text-foreground/25" aria-hidden="true" />
          <p className="mt-3 max-w-md text-sm font-semibold text-foreground/65">
            {performanceMessage || t('portfolioPerformanceInsufficient')}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-foreground/45">
            {t('portfolioCurveEmptyHint')}
          </p>
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
                {formatSARNumber(gridVal, locale, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        {/* Date labels */}
        {points.length > 1 && [0, points.length - 1].map((pIdx) => {
          const p = points[pIdx];
          return (
            <text key={pIdx} x={p.x} y={h - 15} textAnchor={pIdx === 0 ? 'start' : 'end'} className="text-[8px] font-mono fill-gray-500" suppressHydrationWarning>
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
    if (nav === null) {
      return (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-foreground/[0.025] px-6 text-center" role="status">
          <Coins className="size-6 text-foreground/25" aria-hidden="true" />
          <p className="mt-3 max-w-sm text-sm font-semibold text-foreground/65">{t('portfolioCombinedUnavailable')}</p>
        </div>
      );
    }

    const radius = 50;
    const strokeWidth = 12;
    const circumference = 2 * Math.PI * radius;
    const usPct = usWeight;
    const saudiPct = tasiWeight;
    const cashPct = nav > 0 && initialCashCurrency !== null ? cash / nav : 0;

    const usOffset = 0;
    const saudiOffset = usPct * circumference;
    const cashOffset = (usPct + saudiPct) * circumference;

    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl bg-foreground/[0.025] p-6 text-center">
        <div className="mb-6 w-full text-start">
          <h3 className="text-xs font-extrabold text-foreground/75">
            {t('assetAllocationTitle')}
          </h3>
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
            <span className="text-[10px] font-semibold text-foreground/50">
              {t('holdingsCount')}
            </span>
            <span className="font-mono text-2xl font-bold text-foreground tabular-nums">{fmtNumber(positions.length)}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-6 text-[10px] font-bold">
          <div className="flex items-center gap-1.5"><div className="size-2.5 rounded-full bg-accent"></div>{t('usEquities')}</div>
          <div className="flex items-center gap-1.5"><div className="size-2.5 rounded-full bg-up"></div>{t('saudiEquities')}</div>
          <div className="flex items-center gap-1.5"><div className="size-2.5 rounded-full bg-amber-500"></div>{t('cashVirtual')}</div>
        </div>
      </div>
    );
  }

  function shariaMeta(status: Position['complianceStatus']) {
    if (status === 'VERIFIED_COMPLIANT') {
      return { label: t('compliant'), className: 'bg-up/10 text-up', Icon: ShieldCheck };
    }
    if (status === 'VERIFIED_NON_COMPLIANT') {
      return { label: t('nonCompliant'), className: 'bg-down/10 text-down', Icon: ShieldAlert };
    }
    return { label: t('shariaUnverified'), className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', Icon: AlertTriangle };
  }

  // Presentation for a single committee pass's live ShariaGate verdict (compliant + reason +
  // source), as opposed to shariaMeta() above which reads a persisted Position.complianceStatus.
  // A `compliant:true` verdict from an unverified/mock source is NEVER rendered as a bare
  // "compliant" badge — the label itself always carries the "unverified/demo" qualifier so it
  // cannot be visually truncated apart from the caveat.
  function shariaGateMeta(gate: ShariaGate) {
    const tier = shariaTier(gate);
    const reasonKey = gate.reason ? SHARIA_REASON_KEYS[gate.reason] : undefined;
    const reasonText = t(`shariaReasons.${reasonKey ?? 'unknown'}`);
    if (tier === 'verifiedCompliant') {
      return {
        label: t('shariaCompliant'),
        reasonText,
        Icon: ShieldCheck,
        className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    }
    if (tier === 'unverifiedCompliant') {
      return {
        label: t('shariaUnverifiedCompliantLabel'),
        reasonText,
        Icon: AlertTriangle,
        className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      };
    }
    if (tier === 'confirmedNonCompliant') {
      return {
        label: t('shariaNonCompliant'),
        reasonText,
        Icon: ShieldAlert,
        className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    }
    return {
      label: t('shariaBlockedUnverifiableLabel'),
      reasonText,
      Icon: ShieldAlert,
      className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
  }

  return (
    <div className="space-y-6">
      {/* ── Tab Switcher ── */}
      {initialInternalPortfolioAvailable ? (
        <div className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-foreground/[0.04] p-1 sm:w-fit" role="tablist" aria-label={getLabel('sectionTabsLabel')}>
          <>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'advisor'}
              aria-controls="quant-advisor-panel"
              onClick={() => selectTab('advisor')}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === 'advisor'
                  ? 'bg-surface-card text-foreground shadow-sm'
                  : 'text-foreground/55 hover:text-foreground'
              }`}
            >
              <Cpu className="size-3.5 text-accent" aria-hidden="true" />
              <span>{getLabel('committeeTab')}</span>
            </button>
            {initialStrategyTeams !== undefined ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'teams'}
                aria-controls="quant-teams-panel"
                onClick={() => selectTab('teams')}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeTab === 'teams'
                    ? 'bg-surface-card text-foreground shadow-sm'
                    : 'text-foreground/55 hover:text-foreground'
                }`}
              >
                <Trophy className="size-3.5 text-accent" aria-hidden="true" />
                <span>{getLabel('strategyTeamsTab')}</span>
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'portfolio'}
              aria-controls="quant-portfolio-panel"
              onClick={() => selectTab('portfolio')}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activeTab === 'portfolio'
                  ? 'bg-surface-card text-foreground shadow-sm'
                  : 'text-foreground/55 hover:text-foreground'
              }`}
            >
              <Coins className="size-3.5 text-accent" aria-hidden="true" />
              <span>{getLabel('portfolioAnalyticsTab')}</span>
            </button>
          </>
        </div>
      ) : null}

      {activeTab === 'teams' && initialStrategyTeams !== undefined ? (
        <div id="quant-teams-panel" role="tabpanel" className="space-y-6">
          <RunLabPanel setups={initialRunnableSetups} />
          <StrategyLeagueClient teams={initialStrategyTeams} />
        </div>
      ) : null}

      {activeTab === 'advisor' && (
        <div id="quant-advisor-panel" role="tabpanel">
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
                        {(() => {
                          const gateMeta = shariaGateMeta(passData.shariaGate);
                          const GateIcon = gateMeta.Icon;
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-600">{t('shariaGateHeading')}:</span>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-black uppercase rounded-lg border ${gateMeta.className}`}
                              >
                                <GateIcon className="w-3 h-3" aria-hidden="true" />
                                {gateMeta.label}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      {(() => {
                        const gateMeta = shariaGateMeta(passData.shariaGate);
                        return (
                          <p
                            className="w-full basis-full text-[10px] leading-relaxed text-gray-500"
                            dir={isAr ? 'rtl' : 'ltr'}
                          >
                            {gateMeta.reasonText}
                          </p>
                        );
                      })()}

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
                              <span suppressHydrationWarning>{new Date(dec.createdAt).toLocaleDateString(locale)}</span>
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
        </div>
      )}

      {activeTab === 'portfolio' && (
        <section id="quant-portfolio-panel" role="tabpanel" className="space-y-6" aria-labelledby="portfolio-analytics-title">
          <header className="flex flex-col gap-4 rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_20px_55px_rgba(0,0,0,0.07)] sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold text-accent">{t('portfolioPaperBadge')}</p>
              <h2 id="portfolio-analytics-title" className="mt-1 text-2xl font-bold text-foreground">{t('portfolioAnalyticsTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/60">{t('portfolioAnalyticsDescription')}</p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${hasPerformanceMetrics ? 'bg-up/10 text-up' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              {hasPerformanceMetrics ? <Check className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}
              {t(hasPerformanceMetrics ? 'portfolioEvidenceAvailable' : 'portfolioEvidenceIncomplete')}
            </span>
          </header>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-3xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="portfolio-curve-title">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-start">
                    <h3 id="portfolio-curve-title" className="flex items-center gap-2 text-base font-bold text-foreground">
                      <TrendingUp className="size-4 text-accent" aria-hidden="true" />
                      {t('portfolioCurveTitle')}
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/55">{t('portfolioCurveDescription')}</p>
                  </div>
                  <div className="flex self-start rounded-xl bg-foreground/[0.04] p-1" role="group" aria-label={t('pnlTimeframe')} dir="ltr">
                    {(['1M', '3M', '1Y', 'ALL'] as const).map(tf => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setTimeframe(tf)}
                        aria-pressed={timeframe === tf}
                        className={`min-h-8 rounded-lg px-3 text-[10px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          timeframe === tf ? 'bg-accent text-white shadow-sm' : 'text-foreground/55 hover:text-foreground'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 min-h-64 w-full">{renderSvgChart()}</div>

                {initialPerformanceStatus === 'available' && filteredSnapshots.length >= 2 ? (
                  <ul className="mt-4 flex flex-wrap justify-end gap-4 font-mono text-[10px] text-foreground/60" aria-label={t('portfolioCurveTitle')}>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-up" aria-hidden="true" />{t('portfolioNAVLegend')}</li>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-accent" aria-hidden="true" />{t('spusLegend')}</li>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-foreground/40" aria-hidden="true" />{t('spyLegend')}</li>
                  </ul>
                ) : null}
              </section>

              {hasPerformanceMetrics ? (
                <section className="rounded-3xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="portfolio-metrics-title">
                  <h3 id="portfolio-metrics-title" className="text-base font-bold text-foreground">{t('metricsHeading')}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: t('metricCagr'), value: fmtPercent(initialMetrics.cagr), hint: t('metricCagrDescription'), target: t('metricTargetCagr'), tone: initialMetrics.cagr >= 0 ? 'text-up' : 'text-down' },
                      { label: t('metricSharpe'), value: fmtNumber(initialMetrics.sharpe), hint: t('metricSharpeDescription'), target: t('metricTargetSharpe'), tone: 'text-foreground' },
                      { label: t('metricMaxDrawdown'), value: fmtPercent(initialMetrics.maxDrawdown), hint: t('metricMaxDrawdownDescription'), target: t('metricTargetDrawdown'), tone: 'text-down' },
                      { label: t('metricAlphaSpus'), value: fmtPercent(initialMetrics.alphaVsSpus), hint: t('metricAlphaSpusDescription'), target: t('metricTargetAlphaSpus'), tone: initialMetrics.alphaVsSpus >= 0 ? 'text-up' : 'text-down' },
                    ].map(metric => (
                      <article key={metric.label} className="rounded-2xl bg-foreground/[0.03] p-4 text-start">
                        <p className="text-[10px] font-semibold text-foreground/55">{metric.label}</p>
                        <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${metric.tone}`} dir="ltr">{metric.value}</p>
                        <p className="mt-2 text-[10px] font-semibold text-accent">{metric.target}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-foreground/50">{metric.hint}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="grid gap-3 sm:grid-cols-3" aria-label={t('assetAllocationTitle')}>
                {[
                  { key: 'us', label: t('usEquities'), value: fmtMoney(usValue, 'USD'), weight: usWeight, bar: 'bg-accent' },
                  { key: 'tasi', label: t('saudiEquities'), value: fmtMoney(tasiValue, 'SAR'), weight: tasiWeight, bar: 'bg-up' },
                  { key: 'cash', label: t('cashVirtual'), value: initialCashCurrency ? fmtMoney(cash, initialCashCurrency) : t('valueUnavailable'), weight: nav !== null && nav > 0 && initialCashCurrency ? cash / nav : null, bar: 'bg-amber-500' },
                ].map(asset => (
                  <article key={asset.key} className="rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)]">
                    <p className="text-[10px] font-semibold text-foreground/55">{asset.label}</p>
                    <p className="mt-2 min-h-8 font-mono text-xl font-bold text-foreground tabular-nums" dir="ltr">{asset.value}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-foreground/50">{t('portfolioShare')}</span>
                      <span className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">{asset.weight === null ? t('valueUnavailable') : fmtPercent(asset.weight)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                      <div className={`h-full rounded-full ${asset.bar}`} style={{ width: `${Math.min(100, Math.max(0, (asset.weight ?? 0) * 100))}%` }} />
                    </div>
                  </article>
                ))}
              </section>

              <section className="overflow-hidden rounded-3xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="portfolio-holdings-title">
                <h3 id="portfolio-holdings-title" className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Coins className="size-4 text-accent" aria-hidden="true" />
                  {getLabel('holdingsHeading')}
                </h3>

                {positions.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-foreground/[0.025] p-6 text-center text-sm text-foreground/55" role="status">{t('noActivePositions')}</div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:hidden">
                      {positions.map(position => {
                        const meta = shariaMeta(position.complianceStatus);
                        return (
                          <article key={position.symbol} className="rounded-2xl bg-foreground/[0.03] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-sm font-bold text-accent" dir="ltr">{position.symbol}</p>
                                <p className="mt-1 text-[10px] text-foreground/50">{position.name} · {position.market}</p>
                              </div>
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${meta.className}`}>
                                <meta.Icon className="size-3" aria-hidden="true" />{meta.label}
                              </span>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-foreground/10 pt-3 text-[10px]">
                              <div><dt className="text-foreground/45">{getLabel('shares')}</dt><dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{fmtNumber(position.shares)}</dd></div>
                              <div><dt className="text-foreground/45">{getLabel('costBasis')}</dt><dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{position.costBasis === null ? t('costBasisUnknown') : fmtMoney(position.costBasis, position.currency)}</dd></div>
                              <div><dt className="text-foreground/45">{getLabel('value')}</dt><dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{fmtMoney(position.value, position.currency)}</dd></div>
                              <div><dt className="text-foreground/45">{getLabel('weight')}</dt><dd className="mt-1 font-mono text-sm font-semibold tabular-nums" dir="ltr">{position.weight === null ? t('valueUnavailable') : fmtPercent(position.weight)}</dd></div>
                            </dl>
                          </article>
                        );
                      })}
                    </div>

                    <div className="mt-4 hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[44rem] border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-foreground/10 text-[10px] font-semibold text-foreground/50">
                            <th className="px-2 py-3 text-start">{getLabel('symbol')}</th>
                            <th className="px-2 py-3 text-start">{getLabel('marketLabel')}</th>
                            <th className="px-2 py-3 text-start">{t('shariaStatus')}</th>
                            <th className="px-2 py-3 text-end">{getLabel('shares')}</th>
                            <th className="px-2 py-3 text-end">{getLabel('costBasis')}</th>
                            <th className="px-2 py-3 text-end">{getLabel('value')}</th>
                            <th className="px-2 py-3 text-end">{getLabel('weight')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/[0.07]">
                          {positions.map(position => {
                            const meta = shariaMeta(position.complianceStatus);
                            return (
                              <tr key={position.symbol} className="transition-colors duration-150 hover:bg-foreground/[0.025]">
                                <th scope="row" className="px-2 py-3.5 text-start font-mono font-bold text-accent" dir="ltr">{position.symbol}</th>
                                <td className="px-2 py-3.5 text-start font-semibold text-foreground/70">{position.market}</td>
                                <td className="px-2 py-3.5 text-start"><span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${meta.className}`}><meta.Icon className="size-3" aria-hidden="true" />{meta.label}</span></td>
                                <td className="px-2 py-3.5 text-end font-mono tabular-nums">{fmtNumber(position.shares)}</td>
                                <td className="px-2 py-3.5 text-end font-mono tabular-nums">{position.costBasis === null ? t('costBasisUnknown') : fmtMoney(position.costBasis, position.currency)}</td>
                                <td className="px-2 py-3.5 text-end font-mono font-semibold tabular-nums">{fmtMoney(position.value, position.currency)}</td>
                                <td className="px-2 py-3.5 text-end font-mono font-semibold tabular-nums" dir="ltr">{position.weight === null ? t('valueUnavailable') : fmtPercent(position.weight)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-3xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="asset-allocation-heading">
                <h3 id="asset-allocation-heading" className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Activity className="size-4 text-accent" aria-hidden="true" />
                  {t('assetAllocationTitle')}
                </h3>
                <div className="mt-4">{renderAllocationDonut()}</div>
              </section>

              <section className="rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_45px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="rebalance-title">
                <h3 id="rebalance-title" className="text-sm font-bold text-foreground">{t('rebalanceTitle')}</h3>
                <p className="mt-2 text-xs leading-relaxed text-foreground/55">{t('rebalanceDescription')}</p>
                {positions.length === 0 ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{t('rebalanceUnavailable')}</p> : null}
                {rebalanceError ? <div className="mt-4 rounded-xl bg-down/10 p-3 text-xs font-semibold text-down" role="alert">{rebalanceError}</div> : null}
                <button
                  type="button"
                  onClick={triggerManualRebalance}
                  disabled={rebalanceLoading || positions.length === 0}
                  className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-xs font-bold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {rebalanceLoading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                  {rebalanceLoading ? t('rebalancing') : t('rebalanceButton')}
                </button>
              </section>
            </aside>
          </div>
        </section>
      )}

    </div>
  );
}
