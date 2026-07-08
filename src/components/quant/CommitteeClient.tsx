'use client';
// 'use client': this is the interactive committee console — form state, fetch calls,
// and per-analyst UI state can't live in a server component.
import { useState } from 'react';
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
  if (stance === 'BULLISH') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: TrendingUp };
  if (stance === 'BEARISH') return { color: 'text-red-400', bg: 'bg-red-500/10', Icon: TrendingDown };
  return { color: 'text-gray-400', bg: 'bg-gray-500/10', Icon: Minus };
}

function actionStyle(action: string) {
  if (action === 'BUY') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (action === 'SELL') return 'text-red-400 bg-red-500/10 border-red-500/30';
  return 'text-neonBlue bg-neonBlue/10 border-neonBlue/30';
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function CommitteeClient({ locale }: { locale: string }) {
  const t = useTranslations('Quant');
  void locale; // reserved: both AR + EN rationale are always shown side by side regardless of UI locale

  const [market, setMarket] = useState<MarketKind>('TASI');
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL.TASI);

  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passData, setPassData] = useState<PassResult | null>(null);

  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btData, setBtData] = useState<BacktestResult | null>(null);

  const busy = passLoading || btLoading;

  function handleMarketChange(m: MarketKind) {
    setMarket(m);
    setSymbol(DEFAULT_SYMBOL[m]);
    setPassData(null);
    setBtData(null);
    setPassError(null);
    setBtError(null);
  }

  async function errorFromResponse(res: Response): Promise<string> {
    if (res.status === 401) return t('errorUnauthorized');
    if (res.status === 429) return t('errorRateLimit');
    return t('errorGeneric');
  }

  async function runPass() {
    setPassLoading(true);
    setPassError(null);
    setPassData(null);
    setBtData(null);
    setBtError(null);
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
      setPassData(await res.json());
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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            {(['TASI', 'NASDAQ'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMarketChange(m)}
                disabled={busy}
                className={`px-5 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
                  market === m ? 'bg-emerald-500 text-white' : 'glass-panel text-gray-400 hover:text-white'
                }`}
              >
                {m === 'TASI' ? t('marketTasi') : t('marketNasdaq')}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
            <label htmlFor="quant-symbol" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              {t('symbolLabel')}
            </label>
            <input
              id="quant-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={t('symbolPlaceholder')}
              disabled={busy}
              className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={runPass}
            disabled={busy || symbol.trim().length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {passLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {passLoading ? t('running') : t('runButton')}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={runBacktest}
            disabled={busy || symbol.trim().length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-neonBlue/40 text-neonBlue font-bold text-xs uppercase tracking-wider hover:bg-neonBlue/10 transition-colors disabled:opacity-50"
          >
            {btLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {btLoading ? t('runningBacktest') : t('backtestButton')}
          </motion.button>
        </div>

        {passError && (
          <p className="text-xs text-red-400 font-semibold text-start">{passError}</p>
        )}
      </div>

      {/* Committee pass results */}
      <AnimatePresence>
        {passData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {passData.signals.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-2">{t('noDataYet')}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PM decision */}
              <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-3">
                <h3 className="font-bold text-sm text-gray-300 flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-neonBlue" />
                  <span>{t('pmDecisionHeading')}</span>
                </h3>
                <div className={`inline-flex px-4 py-2 rounded-xl border font-extrabold text-lg tracking-wider ${actionStyle(passData.finalAction)}`}>
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
                    <div className="space-y-2 pt-2 border-t border-white/5 text-start">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('pmRationaleAr')}</p>
                      <p className="text-sm text-emerald-300 font-semibold leading-relaxed" dir="rtl">{pmSignal.rationaleAr}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('pmRationaleEn')}</p>
                      <p className="text-xs text-gray-400 leading-relaxed" dir="ltr">{pmSignal.rationaleEn}</p>
                    </div>
                  ) : null;
                })()}
                <p className="text-[10px] text-gray-600 font-mono break-all pt-1">
                  {t('decisionIdLabel')}: {passData.decisionId}
                </p>
              </div>

              {/* Sharia gate */}
              <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-3">
                <h3 className="font-bold text-sm text-gray-300 flex items-center gap-2">
                  {passData.shariaGate.compliant ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                  )}
                  <span>{t('shariaGateHeading')}</span>
                </h3>
                <span
                  className={`inline-flex px-3 py-1 rounded-full font-bold uppercase text-[10px] ${
                    passData.shariaGate.compliant ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {passData.shariaGate.compliant ? t('shariaCompliant') : t('shariaNonCompliant')}
                </span>
                {!passData.shariaGate.compliant && (
                  <p className="text-xs text-red-400 font-semibold border border-red-500/20 bg-red-500/10 p-2.5 rounded-lg">
                    {t('shariaEducationalNote')}
                  </p>
                )}
              </div>
            </div>

            {/* Analyst signals */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-gray-300 flex items-center gap-2">
                <Bot className="w-4 h-4 text-neonBlue" />
                <span>{t('analystsHeading')}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {passData.signals.map((signal, idx) => {
                  const { color, bg, Icon } = stanceStyle(signal.stance);
                  const conviction = Math.max(0, Math.min(1, Number(signal.conviction) || 0));
                  const evidenceChips = toEvidenceChips(signal.evidence);
                  const agentLabel = AGENT_KEYS.includes(signal.agent)
                    ? t(`agents.${signal.agent}` as 'agents.QUANT_CORE')
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
                      className="glass-panel p-5 bg-black/30 border border-white/5 rounded-2xl space-y-3 text-start"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{agentLabel}</span>
                        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${bg} ${color}`}>
                          <Icon className="w-3 h-3" />
                          {stanceLabel}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                          <span>{t('convictionLabel')}</span>
                          <span>{pct(conviction)}</span>
                        </div>
                        <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                          <div className={`h-full ${color.replace('text-', 'bg-')}`} style={{ width: pct(conviction) }} />
                        </div>
                      </div>

                      <p className="text-sm text-gray-100 leading-relaxed" dir="rtl" lang="ar">
                        {signal.rationaleAr}
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed" dir="ltr" lang="en">
                        {signal.rationaleEn}
                      </p>

                      {evidenceChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {evidenceChips.map((chip, chipIdx) => (
                            <span
                              key={chipIdx}
                              className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-gray-400"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}

                      {signal.failureMode !== 'ok' && (
                        <p className="flex items-center gap-1.5 text-[10px] text-yellow-400 font-semibold">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {signal.failureMode === 'abstain' ? t('abstainNote') : t('degradedNote')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {passData.debateTranscript && passData.debateTranscript.length > 0 && (
              <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4">
                <h3 className="font-bold text-sm text-gray-300 flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-neonBlue" />
                  <span>{t('debateHeading')}</span>
                </h3>
                <div className="flex flex-col gap-4">
                  {passData.debateTranscript.map((turn, idx) => {
                    const isBull = turn.side === 'BULL';
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-1.5 p-4 rounded-2xl max-w-2xl border text-start ${
                          isBull
                            ? 'bg-emerald-500/5 border-emerald-500/10 self-start align-start md:mr-12'
                            : 'bg-red-500/5 border-red-500/10 self-end align-end md:ml-12'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isBull ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span className={`text-[10px] font-extrabold uppercase ${isBull ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isBull ? t('debateTurnBull') : t('debateTurnBear')} (Round {turn.round})
                          </span>
                        </div>
                        <p className="text-sm text-white leading-relaxed font-semibold font-sans" dir="rtl">
                          {turn.argumentAr}
                        </p>
                        <p className="text-xs text-gray-400 leading-relaxed font-sans" dir="ltr">
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

      {/* Backtest results */}
      {btError && <p className="text-xs text-red-400 font-semibold text-start">{btError}</p>}

      <AnimatePresence>
        {btData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4"
          >
            <h3 className="font-bold text-sm text-gray-300">{t('backtestHeading')}</h3>

            {btData.metrics.trades === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">{t('backtestNoDataYet')}</p>
            ) : (
              <MetricsRow metrics={btData.metrics} t={t} />
            )}

            {btData.metrics.implausible && (
              <p className="flex items-center gap-1.5 text-xs text-yellow-400 font-semibold border border-yellow-500/20 bg-yellow-500/10 p-2.5 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {t('implausibleWarning')}
              </p>
            )}

            {btData.oosMetrics.trades > 0 && (
              <div className="pt-3 border-t border-white/5 space-y-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('oosHeading')}</span>
                <MetricsRow metrics={btData.oosMetrics} t={t} compact />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimers & Not Financial Advice Banner */}
      <div className="text-center text-[10px] text-gray-500 max-w-lg mx-auto pt-6 border-t border-white/5 space-y-1">
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
  const tiles: Array<{ label: string; value: string }> = [
    { label: t('metricCagr'), value: pct(metrics.cagr) },
    { label: t('metricSharpe'), value: metrics.sharpe.toFixed(2) },
    { label: t('metricDeflatedSharpe'), value: metrics.deflatedSharpe.toFixed(2) },
    { label: t('metricMaxDrawdown'), value: pct(metrics.maxDrawdown) },
    { label: t('metricHitRate'), value: pct(metrics.hitRate) },
    { label: t('metricTrades'), value: String(metrics.trades) },
  ];
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
      {tiles.map((tile) => (
        <div key={tile.label} className="bg-black/30 border border-white/5 rounded-xl p-3 text-center">
          <div className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">{tile.label}</div>
          <div className="font-mono font-bold text-white">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}
