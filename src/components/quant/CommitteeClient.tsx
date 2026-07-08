'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  Gavel,
  Play,
  Pause,
  RefreshCw,
  Cpu,
  Database,
  ArrowRight,
  HelpCircle,
  Award,
} from 'lucide-react';

type MarketKind = 'TASI' | 'NASDAQ';
type Stance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface Signal {
  id?: string;
  agent: string;
  stance: Stance;
  conviction: string | number;
  rationaleEn: string;
  rationaleAr: string;
  evidence: unknown;
  failureMode: string;
}

interface ShariaGate {
  compliant: boolean;
  reason?: string;
}

interface DebateTurn {
  side: 'BULL' | 'BEAR';
  round: number;
  argumentEn: string;
  argumentAr: string;
}

interface PassResult {
  decisionId: string;
  finalAction: string;
  proposedAction?: string;
  shariaGate: ShariaGate;
  signals: Signal[];
  debateTranscript?: DebateTurn[];
}

interface Metrics {
  cagr: number;
  sharpe: number;
  deflatedSharpe: number;
  maxDrawdown: number;
  hitRate: number;
  trades: number;
  implausible: boolean;
}

interface BacktestResult {
  backtestRunId: string;
  metrics: Metrics;
  oosMetrics: Metrics;
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

function stanceStyle(stance: Stance) {
  if (stance === 'BULLISH') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', Icon: TrendingUp };
  if (stance === 'BEARISH') return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', Icon: TrendingDown };
  return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', Icon: Minus };
}

function actionStyle(action: string) {
  if (action === 'BUY') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (action === 'SELL') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  return 'text-neonBlue bg-neonBlue/10 border-neonBlue/30';
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Visual simulation steps definition
type SimStep = 'idle' | 'ingestion' | 'analysts' | 'sharia' | 'debate' | 'pm' | 'risk' | 'done';

export default function CommitteeClient({ locale }: { locale: string }) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const [market, setMarket] = useState<MarketKind>('TASI');
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL.TASI);

  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passData, setPassData] = useState<PassResult | null>(null);

  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btData, setBtData] = useState<BacktestResult | null>(null);

  // Simulation play state
  const [simStep, setSimStep] = useState<SimStep>('idle');
  const [simPlay, setSimPlay] = useState(true);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [typedText, setTypedText] = useState('');
  const [debateTurnIdx, setDebateTurnIdx] = useState(0);

  const simTimerRef = useRef<NodeJS.Timeout | null>(null);
  const busy = passLoading || btLoading;

  // Visual simulation settings loaded dynamically from DesignControlCenter
  const [settings, setSettings] = useState({ simSpeed: 1, volatility: 1 });

  useEffect(() => {
    // Read starting values
    const speed = localStorage.getItem('rushd_simSpeed');
    const vol = localStorage.getItem('rushd_volatility');
    setSettings({
      simSpeed: speed ? Number(speed) : 1,
      volatility: vol ? Number(vol) : 1,
    });

    // Listen to settings modifications
    const handleSettingsChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setSettings({
          simSpeed: detail.simSpeed ?? 1,
          volatility: detail.volatility ?? 1,
        });
      }
    };
    window.addEventListener('rushd_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('rushd_settings_changed', handleSettingsChange);
  }, []);

  function handleMarketChange(m: MarketKind) {
    setMarket(m);
    setSymbol(DEFAULT_SYMBOL[m]);
    setPassData(null);
    setBtData(null);
    setPassError(null);
    setBtError(null);
    setSimStep('idle');
    setDebateTurnIdx(0);
  }

  async function errorFromResponse(res: Response): Promise<string> {
    if (res.status === 401) return t('errorUnauthorized');
    if (res.status === 429) return t('errorRateLimit');
    return t('errorGeneric');
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
    } else if (simStep === 'analysts' && activeAgentId) {
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
        ? `مدير المخاطر يراجع ويطهر الأرصدة. تم تأكيد الإجراء النهائي: ${passData.finalAction}.` 
        : `Risk Manager is executing final envelope constraints. Action validated: ${passData.finalAction}.`;
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
    }, 15);

    return () => clearInterval(interval);
  }, [simStep, activeAgentId, debateTurnIdx, passData, isAr]);

  // Simulation Sequence Engine
  useEffect(() => {
    if (!simPlay || !passData || simStep === 'idle' || simStep === 'done') {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
      return;
    }

    const delay = settings.simSpeed * 1000;
    
    // Quick skip if simSpeed is 0
    if (settings.simSpeed === 0) {
      setSimStep('done');
      return;
    }

    const runNextStep = () => {
      if (simStep === 'ingestion') {
        setSimStep('analysts');
        setActiveAgentId('QUANT_CORE');
      } else if (simStep === 'analysts') {
        // Step through the analysts
        const currentIdx = AGENT_KEYS.indexOf(activeAgentId || '');
        if (currentIdx !== -1 && currentIdx < 4) { // step through first 5 analysts
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

    simTimerRef.current = setTimeout(runNextStep, simStep === 'debate' ? delay * 1.5 : delay);
    return () => {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
    };
  }, [simStep, simPlay, activeAgentId, debateTurnIdx, passData, settings.simSpeed]);

  async function runPass() {
    setPassLoading(true);
    setPassError(null);
    setPassData(null);
    setBtData(null);
    setBtError(null);
    setSimStep('idle');
    try {
      const res = await fetch('/api/quant/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, market }),
      });
      if (!res.ok) {
        setPassError(await errorFromResponse(res));
        return;
      }
      const data = await res.json();
      setPassData(data);
      
      // Start simulation
      setSimStep('ingestion');
      setSimPlay(true);
    } catch {
      setPassError(t('errorGeneric'));
    } finally {
      setPassLoading(false);
    }
  }

  async function runBacktest() {
    setBtLoading(true);
    setBtError(null);
    setBtData(null);
    setSimStep('idle');
    try {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setFullYear(fromDate.getFullYear() - 2);
      const res = await fetch('/api/quant/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          market,
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
        }),
      });
      if (!res.ok) {
        setBtError(await errorFromResponse(res));
        return;
      }
      setBtData(await res.json());
    } catch {
      setBtError(t('errorGeneric'));
    } finally {
      setBtLoading(false);
    }
  }

  // Visual layout config for nodes on the graph
  const nodes = [
    { id: 'ingest', name: 'Data Feed', nameAr: 'تغذية البيانات', x: '10%', y: '50%', type: 'data', icon: Database },
    { id: 'QUANT_CORE', name: 'Quant Core', nameAr: 'المؤشر الكمي', x: '32%', y: '16%', type: 'analyst' },
    { id: 'TECHNICAL', name: 'Technical', nameAr: 'التحليل الفني', x: '32%', y: '39%', type: 'analyst' },
    { id: 'PATTERN_ANALOG', name: 'Pattern Analog', nameAr: 'تحليل الأنماط', x: '32%', y: '61%', type: 'analyst' },
    { id: 'NEWS_CATALYST', name: 'News Catalyst', nameAr: 'الأخبار والمحفزات', x: '32%', y: '84%', type: 'analyst' },
    { id: 'FUNDAMENTAL', name: 'Fundamental', nameAr: 'التحليل المالي', x: '55%', y: '20%', type: 'analyst' },
    { id: 'RESEARCH', name: 'Research', nameAr: 'البحوث والمنشورات', x: '55%', y: '45%', type: 'analyst' },
    { id: 'SHARIA', name: 'Sharia Filter', nameAr: 'التوافق الشرعي', x: '55%', y: '75%', type: 'gate' },
    { id: 'debate', name: 'Debate Circle', nameAr: 'حلقة النقاش', x: '78%', y: '30%', type: 'debate', icon: Gavel },
    { id: 'PORTFOLIO_MANAGER', name: 'Portfolio Manager', nameAr: 'مدير المحفظة', x: '78%', y: '75%', type: 'pm', icon: Bot },
    { id: 'risk', name: 'Risk Envelope', nameAr: 'ضوابط المخاطر', x: '92%', y: '50%', type: 'risk', icon: Gavel }
  ];

  return (
    <div className="space-y-6">
      {/* Controls Console */}
      <div className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl space-y-4 shadow-lg">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            {(['TASI', 'NASDAQ'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMarketChange(m)}
                disabled={busy}
                className={`px-5 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
                  market === m 
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' 
                    : 'glass-panel text-gray-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {m === 'TASI' ? t('marketTasi') : t('marketNasdaq')}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
            <label htmlFor="quant-symbol" className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
              {t('symbolLabel')}
            </label>
            <input
              id="quant-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={t('symbolPlaceholder')}
              disabled={busy}
              className="bg-black/20 border border-slate-200 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={runPass}
            disabled={busy || symbol.trim().length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 font-extrabold text-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 disabled:opacity-50 neon-glow-btn"
          >
            {passLoading && <Loader2 className="w-4 h-4 animate-spin text-black" />}
            {passLoading ? t('running') : t('runButton')}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={runBacktest}
            disabled={busy || symbol.trim().length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-500 font-bold text-xs uppercase tracking-wider hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
          >
            {btLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {btLoading ? t('runningBacktest') : t('backtestButton')}
          </motion.button>
        </div>

        {passError && (
          <p className="text-xs text-rose-400 font-semibold text-start">{passError}</p>
        )}
      </div>

      {/* Synchronizing loading screen */}
      {passLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel p-12 border border-slate-200 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center space-y-6 shadow-xl"
        >
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          <p className="text-emerald-400 font-mono font-bold animate-pulse text-xs uppercase tracking-widest">
            Gathering market variables & sentiment vectors...
          </p>
        </motion.div>
      )}

      {/* Visual Game-like Simulation Canvas */}
      {passData && simStep !== 'idle' && (
        <div className="space-y-6">
          <div className="glass-panel border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden bg-black/40">
            {/* Simulation controls header */}
            <div className="flex justify-between items-center mb-6 border-b border-slate-200/50 dark:border-white/5 pb-4">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-800 dark:text-gray-200">
                  Visual Committee Board ({symbol})
                </h3>
                <p className="text-[10px] text-gray-500 font-semibold">
                  Step: {simStep.toUpperCase()} • Delay: {settings.simSpeed}s
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSimPlay(!simPlay)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-white transition-all active:scale-95 border border-slate-200 dark:border-white/10"
                >
                  {simPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-400" />}
                </button>
                <button
                  onClick={() => {
                    setSimStep('ingestion');
                    setSimPlay(true);
                    setDebateTurnIdx(0);
                  }}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-white transition-all active:scale-95 border border-slate-200 dark:border-white/10"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSimStep('done')}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 hover:text-white"
                >
                  Skip
                </button>
              </div>
            </div>

            {/* Interactive Graph Node View */}
            <div className="relative h-[500px] w-full border border-slate-200/50 dark:border-white/5 rounded-[2.5rem] bg-slate-50/50 dark:bg-black/35 overflow-hidden shadow-inner perspective-3d flex items-center justify-center pointer-events-auto">
              <div className="absolute inset-0 tabletop-3d w-full h-full pointer-events-none">
                {/* Connection Lines (SVG) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-60">
                  <defs>
                    <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0" />
                      <stop offset="50%" stopColor="#00F0FF" stopOpacity="1" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Left side -> analysts */}
                  {nodes.filter(n => n.type === 'analyst').map(node => (
                    <line
                      key={`line-ingest-${node.id}`}
                      x1="10%"
                      y1="50%"
                      x2={node.x}
                      y2={node.y}
                      stroke={simStep === 'ingestion' ? '#10B981' : '#475569'}
                      strokeWidth={simStep === 'ingestion' ? 2 : 1}
                      strokeOpacity={simStep === 'ingestion' ? 0.9 : 0.4}
                      className={simStep === 'ingestion' ? 'laser-path' : ''}
                    />
                  ))}

                  {/* Analysts -> Debate */}
                  {nodes.filter(n => n.type === 'analyst' || n.type === 'gate').map(node => (
                    <line
                      key={`line-debate-${node.id}`}
                      x1={node.x}
                      y1={node.y}
                      x2={node.id === 'SHARIA' ? '78%' : '78%'}
                      y2={node.id === 'SHARIA' ? '75%' : '30%'}
                      stroke={
                        node.id === 'SHARIA'
                          ? simStep === 'sharia'
                            ? passData.shariaGate.compliant
                              ? '#10B981'
                              : '#EF4444'
                            : '#475569'
                          : simStep === 'analysts' || simStep === 'debate'
                            ? '#00F0FF'
                            : '#475569'
                      }
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                      className={
                        node.id === 'SHARIA'
                          ? simStep === 'sharia'
                            ? 'laser-path'
                            : ''
                          : simStep === 'analysts' || simStep === 'debate'
                            ? 'laser-path'
                            : ''
                      }
                    />
                  ))}

                  {/* Debate -> PM */}
                  <line
                    x1="78%"
                    y1="30%"
                    x2="78%"
                    y2="75%"
                    stroke={simStep === 'debate' ? '#00F0FF' : '#475569'}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    className={simStep === 'debate' ? 'laser-path' : ''}
                  />

                  {/* PM -> Risk */}
                  <line
                    x1="78%"
                    y1="75%"
                    x2="92%"
                    y2="50%"
                    stroke={simStep === 'pm' ? '#10B981' : '#475569'}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    className={simStep === 'pm' ? 'laser-path' : ''}
                  />
                </svg>

                {/* Render Nodes */}
                {nodes.map(node => {
                  const isIngesting = simStep === 'ingestion';
                  const isAnalystActive = simStep === 'analysts' && activeAgentId === node.id;
                  const isShariaActive = simStep === 'sharia' && node.id === 'SHARIA';
                  const isDebating = simStep === 'debate' && node.id === 'debate';
                  const isPM = simStep === 'pm' && node.id === 'PORTFOLIO_MANAGER';
                  const isRisk = simStep === 'risk' && node.id === 'risk';

                  // Stance styles for analyst cards
                  const agentSignal = passData.signals.find(s => s.agent === node.id);
                  const sStyle = agentSignal ? stanceStyle(agentSignal.stance) : null;

                  const isActive = isAnalystActive || isShariaActive || isDebating || isPM || isRisk;

                  return (
                    <motion.div
                      key={node.id}
                      style={{ left: node.x, top: node.y }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-auto cursor-pointer"
                      initial={{ scale: 0.9 }}
                      animate={{ 
                        scale: isActive ? 1.05 : 1,
                        zIndex: isActive ? 30 : 10
                      }}
                      onClick={() => {
                        if (agentSignal) setActiveAgentId(node.id);
                      }}
                    >
                      {/* Avatar Card Reverse Tilt */}
                      <div className={`w-32 p-3 rounded-2xl glass-panel reverse-tabletop-3d agent-3d-card border text-start flex flex-col justify-between transition-all duration-300 ${
                        isActive 
                          ? 'bg-slate-100/10 dark:bg-[#1E293B]/90 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]' 
                          : sStyle 
                            ? 'bg-[#0D1527]/80 border-slate-700/50' 
                            : 'bg-white/90 dark:bg-[#0E131F]/90 border-slate-200 dark:border-white/10 shadow-sm'
                      }`}>
                        {/* Avatar / Icon Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center border ${
                            isActive 
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400' 
                              : sStyle 
                                ? `${sStyle.bg} ${sStyle.border} ${sStyle.color}`
                                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-gray-500'
                          }`}>
                            {node.icon ? (
                              <node.icon className="w-3.5 h-3.5" />
                            ) : node.id === 'SHARIA' ? (
                              passData.shariaGate.compliant ? (
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                              )
                            ) : (
                              <Bot className="w-3.5 h-3.5" />
                            )}
                          </div>

                          {/* Pulsing Status dot */}
                          {isActive && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}

                          {/* Stance Label */}
                          {!isActive && agentSignal && simStep !== 'ingestion' && (
                            <span className={`text-[7px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md border ${sStyle?.bg} ${sStyle?.color} ${sStyle?.border}`}>
                              {agentSignal.stance}
                            </span>
                          )}
                        </div>

                        {/* Name and Conviction */}
                        <div className="flex flex-col">
                          <span className="text-[9.5px] font-bold text-slate-800 dark:text-gray-200 truncate leading-tight">
                            {isAr ? node.nameAr : node.name}
                          </span>

                          {/* Show tiny conviction status */}
                          {agentSignal && simStep !== 'ingestion' && (
                            <span className="text-[7.5px] text-gray-400 font-mono mt-0.5">
                              Conv: {pct(Number(agentSignal.conviction))}
                            </span>
                          )}

                          {/* Custom Sharia output */}
                          {node.id === 'SHARIA' && simStep !== 'ingestion' && simStep !== 'analysts' && (
                            <span className={`text-[7.5px] font-bold uppercase mt-0.5 ${
                              passData.shariaGate.compliant ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {passData.shariaGate.compliant ? 'HALAL' : 'VETO HARAM'}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Debate Speech Bubbles Overlay */}
                <AnimatePresence>
                  {simStep === 'debate' && passData.debateTranscript?.[debateTurnIdx] && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      style={{ left: '78%', top: '8%' }}
                      className="absolute -translate-x-1/2 z-40 w-72 glass-panel bg-black/95 border border-white/10 p-4 rounded-2xl text-start shadow-2xl reverse-tabletop-3d pointer-events-auto"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          passData.debateTranscript[debateTurnIdx].side === 'BULL' ? 'bg-emerald-400' : 'bg-rose-400'
                        }`} />
                        <span className="text-[9px] font-extrabold uppercase text-gray-300">
                          {passData.debateTranscript[debateTurnIdx].side} Arguments (Round {passData.debateTranscript[debateTurnIdx].round})
                        </span>
                      </div>
                      <p className="text-xs text-white leading-relaxed font-semibold" dir="rtl">
                        {passData.debateTranscript[debateTurnIdx].argumentAr}
                      </p>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-semibold mt-1" dir="ltr">
                        {passData.debateTranscript[debateTurnIdx].argumentEn}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Ingestion Stream pulse elements */}
                {simStep === 'ingestion' && (
                  <div className="absolute left-[15%] top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-400 rounded-full blur-sm pulse-glow-ring pointer-events-none" />
                )}
              </div>
            </div>

            {/* Typewriter Agent Thinking Display Panel */}
            <div className="mt-4 p-5 rounded-2xl bg-black/45 border border-slate-200/50 dark:border-white/5 text-start min-h-[100px] flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                  <Cpu className="w-3.5 h-3.5" />
                  {simStep === 'ingestion' && (isAr ? 'تجميع مدخلات السوق...' : 'Consolidation of Market Streams...')}
                  {simStep === 'analysts' && activeAgentId && (
                    isAr ? `تفكير الوكيل: ${nodes.find(n => n.id === activeAgentId)?.nameAr}` : `Agent Thinking: ${nodes.find(n => n.id === activeAgentId)?.name}`
                  )}
                  {simStep === 'sharia' && (isAr ? 'فرز التوافق الشرعي لمعايير AAOIFI...' : 'AAOIFI Sharia Compliance Screening...')}
                  {simStep === 'debate' && (isAr ? 'حلقة نقاش الوكلاء الذكية...' : 'Analyst Committee Debate Round...')}
                  {simStep === 'pm' && (isAr ? 'اتخاذ قرار مدير المحفظة...' : 'Portfolio Manager Decision Consolidation...')}
                  {simStep === 'risk' && (isAr ? 'محاكاة مدير المخاطر و إنفاذ الحدود...' : 'Risk Management Verification...')}
                  {simStep === 'done' && (isAr ? 'اكتملت المحاكاة' : 'Simulation Completed')}
                </span>

                <p className="text-sm font-semibold text-slate-800 dark:text-gray-200 leading-relaxed font-sans" dir={isAr ? 'rtl' : 'ltr'}>
                  {typedText || (simStep === 'ingestion' ? 'Streaming bars, cash balances, and sentiment catalog...' : '')}
                </p>
              </div>

              {simStep === 'done' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Final Decision:</span>
                    <span className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${actionStyle(passData.finalAction)}`}>
                      {passData.finalAction}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Compliance Verdict:</span>
                    <span className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border ${
                      passData.shariaGate.compliant ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {passData.shariaGate.compliant ? 'HALAL' : 'HARAM VETO'}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Traditional detailed cards collapse container */}
      <AnimatePresence>
        {passData && simStep === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* PM decision & Sharia */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl space-y-3 shadow-lg">
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-gray-300 flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-emerald-400" />
                  <span>{t('pmDecisionHeading')}</span>
                </h3>
                <div className={`inline-flex px-4 py-2 rounded-xl border font-extrabold text-lg tracking-wider shadow-sm ${actionStyle(passData.finalAction)}`}>
                  {passData.finalAction}
                </div>
                {passData.proposedAction && passData.proposedAction !== passData.finalAction && (
                  <p className="text-xs text-gray-500">
                    {t('proposedActionLabel')}: <span className="font-mono text-gray-300">{passData.proposedAction}</span>
                  </p>
                )}
                {(() => {
                  const pmSignal = passData.signals.find(s => s.agent === 'PORTFOLIO_MANAGER');
                  return pmSignal ? (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/5 text-start">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t('pmRationaleAr')}</p>
                      <p className="text-sm text-emerald-400 font-semibold leading-relaxed" dir="rtl">{pmSignal.rationaleAr}</p>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t('pmRationaleEn')}</p>
                      <p className="text-xs text-gray-400 leading-relaxed" dir="ltr">{pmSignal.rationaleEn}</p>
                    </div>
                  ) : null;
                })()}
                <p className="text-[9px] text-gray-600 font-mono break-all pt-1">
                  {t('decisionIdLabel')}: {passData.decisionId}
                </p>
              </div>

              <div className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl space-y-3 shadow-lg">
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-gray-300 flex items-center gap-2">
                  {passData.shariaGate.compliant ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{t('shariaGateHeading')}</span>
                </h3>
                <span
                  className={`inline-flex px-3 py-1 rounded-full font-bold uppercase text-[10px] border ${
                    passData.shariaGate.compliant ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {passData.shariaGate.compliant ? t('shariaCompliant') : t('shariaNonCompliant')}
                </span>
                {!passData.shariaGate.compliant && (
                  <p className="text-xs text-rose-400 font-semibold border border-rose-500/20 bg-rose-500/10 p-2.5 rounded-lg text-start">
                    {t('shariaEducationalNote')}
                  </p>
                )}
              </div>
            </div>

            {/* Analyst signals */}
            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-gray-300 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <span>{t('analystsHeading')}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {passData.signals.map((signal, idx) => {
                  const { color, bg, border, Icon } = stanceStyle(signal.stance);
                  const conviction = Math.max(0, Math.min(1, Number(signal.conviction) || 0));
                  const evidenceChips = toEvidenceChips(signal.evidence);
                  const agentLabel = AGENT_KEYS.includes(signal.agent)
                    ? t(`agents.${signal.agent}` as any)
                    : signal.agent;
                  const stanceLabel =
                    signal.stance === 'BULLISH'
                      ? t('stanceBullish')
                      : signal.stance === 'BEARISH'
                        ? t('stanceBearish')
                        : t('stanceNeutral');

                  return (
                    <div
                      key={signal.id ?? idx}
                      className="glass-panel p-5 border border-slate-200 dark:border-white/10 rounded-3xl space-y-3 text-start shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{agentLabel}</span>
                        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border ${bg} ${color} ${border}`}>
                          <Icon className="w-3 h-3" />
                          {stanceLabel}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                          <span>{t('convictionLabel')}</span>
                          <span>{pct(conviction)}</span>
                        </div>
                        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                          <div className={`h-full ${color.replace('text-', 'bg-')}`} style={{ width: pct(conviction) }} />
                        </div>
                      </div>

                      <p className="text-xs text-slate-800 dark:text-gray-200 leading-relaxed font-semibold font-sans" dir="rtl" lang="ar">
                        {signal.rationaleAr}
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed font-sans" dir="ltr" lang="en">
                        {signal.rationaleEn}
                      </p>

                      {evidenceChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200 dark:border-white/5">
                          {evidenceChips.map((chip, chipIdx) => (
                            <span
                              key={chipIdx}
                              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[9px] font-mono text-gray-500 dark:text-gray-400"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}

                      {signal.failureMode !== 'ok' && (
                        <p className="flex items-center gap-1.5 text-[9px] text-amber-500 font-bold uppercase">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {signal.failureMode === 'abstain' ? t('abstainNote') : t('degradedNote')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bull/bear debate transcript */}
            {passData.debateTranscript && passData.debateTranscript.length > 0 && (
              <div className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl space-y-4 shadow-lg">
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-gray-300 flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-emerald-400" />
                  <span>{t('debateHeading')}</span>
                </h3>
                <div className="flex flex-col gap-4">
                  {passData.debateTranscript.map((turn, idx) => {
                    const isBull = turn.side === 'BULL';
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-1.5 p-4 rounded-2xl max-w-2xl border text-start shadow-sm ${
                          isBull
                            ? 'bg-emerald-500/5 border-emerald-500/10 self-start align-start md:mr-12'
                            : 'bg-rose-500/5 border-rose-500/10 self-end align-end md:ml-12'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isBull ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className={`text-[9px] font-extrabold uppercase ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isBull ? t('debateTurnBull') : t('debateTurnBear')} (Round {turn.round})
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 dark:text-white leading-relaxed font-semibold" dir="rtl">
                          {turn.argumentAr}
                        </p>
                        <p className="text-[11px] text-gray-500 leading-relaxed" dir="ltr">
                          {turn.argumentEn}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backtest metrics display */}
      {btError && <p className="text-xs text-rose-400 font-semibold text-start">{btError}</p>}

      <AnimatePresence>
        {btData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl space-y-4 shadow-lg text-start"
          >
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-800 dark:text-gray-300 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              {t('backtestHeading')}
            </h3>

            {btData.metrics.trades === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">{t('backtestNoDataYet')}</p>
            ) : (
              <MetricsRow metrics={btData.metrics} t={t} />
            )}

            {btData.metrics.implausible && (
              <p className="flex items-center gap-1.5 text-xs text-amber-500 font-bold border border-amber-500/20 bg-amber-500/5 p-3 rounded-xl uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                {t('implausibleWarning')}
              </p>
            )}

            {btData.oosMetrics.trades > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">{t('oosHeading')}</span>
                <MetricsRow metrics={btData.oosMetrics} t={t} compact />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimers Bar */}
      <div className="text-center text-[10px] text-gray-500 max-w-lg mx-auto pt-6 border-t border-slate-200 dark:border-white/5 space-y-1 font-bold">
        <p>⚠️ {t('disclaimer')}</p>
        <p>
          All simulated trades are executed under virtual, paper-trading conditions. Past performance does not guarantee future results.
        </p>
      </div>
    </div>
  );
}

function MetricsRow({
  metrics,
  t,
  compact,
}: {
  metrics: Metrics;
  t: ReturnType<typeof useTranslations>;
  compact?: boolean;
}) {
  const tiles: Array<{ label: string; value: string; color?: string }> = [
    { label: t('metricCagr'), value: pct(metrics.cagr), color: 'text-emerald-400' },
    { label: t('metricSharpe'), value: metrics.sharpe.toFixed(2), color: 'text-emerald-400' },
    { label: t('metricDeflatedSharpe'), value: metrics.deflatedSharpe.toFixed(2), color: 'text-emerald-400' },
    { label: t('metricMaxDrawdown'), value: pct(metrics.maxDrawdown), color: 'text-rose-400' },
    { label: t('metricHitRate'), value: pct(metrics.hitRate), color: 'text-emerald-400' },
    { label: t('metricTrades'), value: String(metrics.trades) },
  ];
  return (
    <div className={`grid grid-cols-2 md:grid-cols-6 gap-4 ${compact ? 'text-xs' : 'text-sm'}`}>
      {tiles.map((tile) => (
        <div key={tile.label} className="glass-panel bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-2xl p-4 text-center">
          <div className="text-gray-500 text-[9px] font-extrabold uppercase tracking-wider mb-1 leading-tight">{tile.label}</div>
          <div className={`font-mono font-bold text-base ${tile.color || 'text-slate-900 dark:text-white'}`}>{tile.value}</div>
        </div>
      ))}
    </div>
  );
}
