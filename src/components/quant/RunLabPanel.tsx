'use client';
// Strategy Lab run panel — launches a bounded validation run through
// POST /api/quant/lab/run and polls GET ?id= until a terminal state.
//
// Honesty contract mirrored from the API (QDR-5/QDR-6):
// - Non-FULL periods are EVIDENCE VIEWS: the route can never report ACCEPTED
//   for one, and the panel labels the result accordingly.
// - universe=wide is 1Y-only; custom baskets are capped at 20 symbols;
//   'fixed'-book setups trade their own codified universe (picker locked).
// - Every number shown is a simulated backtest statistic, never a promise.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical, Play, X, LoaderCircle, ShieldQuestion, ShieldCheck, ShieldAlert } from 'lucide-react';

export interface RunnableSetup {
  id: string;
  version: string;
  cadence: string;
  universeCompatibility: 'halal-only' | 'any-equities' | 'fixed';
}

type UniverseMode = 'halal' | 'wide' | 'custom';
type Period = 'FULL' | '3Y' | '2Y' | '1Y';

interface RunCard {
  status: string;
  from: string;
  to: string;
  universe: string;
  periodPreset: string;
  symbols: string[];
  full: { cagr: number; sharpe: number; deflatedSharpe: number; maxDrawdown: number; hitRate: number; trades: number };
  oos: { cagr: number; deflatedSharpe: number; trades: number };
  distribution: { count: number; probDayGe5pct: number; probDayLe5pct: number };
  rejectionReasonCodes: string[];
  shariaState: string;
  implausible: boolean;
  gitSha: string;
}

interface PollPayload {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'FAILED_STALE' | string;
  evidenceView: boolean | null;
  responseStatus?: string;
  card?: RunCard;
  error?: string | null;
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; runId: string; startedAt: number }
  | { phase: 'done'; payload: PollPayload }
  | { phase: 'error'; messageKey: string; detail?: string };

const PERIODS: Period[] = ['FULL', '3Y', '2Y', '1Y'];
const MAX_CUSTOM_SYMBOLS = 20;
const POLL_MS = 4000;

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const num = (v: number) => v.toFixed(2);

export default function RunLabPanel({ setups }: { setups: RunnableSetup[] }) {
  const t = useTranslations('QuantLab');
  const [setupId, setSetupId] = useState(setups[0]?.id ?? '');
  const [universe, setUniverse] = useState<UniverseMode>('halal');
  const [period, setPeriod] = useState<Period>('1Y');
  const [symbolInput, setSymbolInput] = useState('');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setup = setups.find((s) => s.id === setupId) ?? setups[0];
  const fixedBook = setup?.universeCompatibility === 'fixed';
  const running = run.phase === 'running';

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  // Keep selections legal as constraints change.
  useEffect(() => {
    if (fixedBook && universe !== 'halal') setUniverse('halal');
  }, [fixedBook, universe]);
  useEffect(() => {
    if (universe === 'wide' && period !== '1Y') setPeriod('1Y');
  }, [universe, period]);

  const addSymbols = (raw: string) => {
    const parts = raw
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9.\-^]{1,12}$/.test(s));
    if (!parts.length) return;
    setSymbols((prev) => Array.from(new Set([...prev, ...parts])).slice(0, MAX_CUSTOM_SYMBOLS));
    setSymbolInput('');
  };

  const poll = useCallback(async (runId: string, startedAt: number) => {
    try {
      const res = await fetch(`/api/quant/lab/run?id=${runId}`);
      if (!res.ok) throw new Error(String(res.status));
      const payload: PollPayload = await res.json();
      if (payload.status === 'DONE') {
        setRun({ phase: 'done', payload });
        return;
      }
      if (payload.status === 'FAILED' || payload.status === 'FAILED_STALE') {
        setRun({ phase: 'error', messageKey: 'runFailed', detail: payload.error ?? payload.status });
        return;
      }
      pollTimer.current = setTimeout(() => void poll(runId, startedAt), POLL_MS);
    } catch {
      pollTimer.current = setTimeout(() => void poll(runId, startedAt), POLL_MS * 2);
    }
  }, []);

  const start = async () => {
    if (!setup || running) return;
    const body: Record<string, unknown> = { setup: setup.id, period };
    if (!fixedBook) {
      body.universe = universe;
      if (universe === 'custom') body.symbols = symbols;
    }
    setRun({ phase: 'running', runId: '', startedAt: Date.now() });
    try {
      const res = await fetch('/api/quant/lab/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setRun({ phase: 'error', messageKey: 'runInProgress' });
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setRun({ phase: 'error', messageKey: 'notAllowed' });
        return;
      }
      if (!res.ok) {
        setRun({ phase: 'error', messageKey: 'invalidRequest' });
        return;
      }
      const { id } = (await res.json()) as { id: string };
      setRun({ phase: 'running', runId: id, startedAt: Date.now() });
      pollTimer.current = setTimeout(() => void poll(id, Date.now()), POLL_MS);
    } catch {
      setRun({ phase: 'error', messageKey: 'networkError' });
    }
  };

  const customInvalid = universe === 'custom' && symbols.length === 0 && !fixedBook;
  const evidenceView = period !== 'FULL';

  return (
    <section
      className="mb-8 min-w-0 rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6"
      aria-labelledby="run-lab-title"
    >
      <div className="flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-accent" aria-hidden="true" />
        <h2 id="run-lab-title" className="text-base font-semibold">{t('title')}</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground/60">{t('subtitle')}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Setup */}
        <label className="block text-xs font-medium text-foreground/70">
          {t('setupLabel')}
          <select
            value={setupId}
            onChange={(e) => setSetupId(e.target.value)}
            disabled={running}
            className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {setups.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.version} · {s.cadence}
              </option>
            ))}
          </select>
        </label>

        {/* Universe */}
        <fieldset disabled={running || fixedBook} className="min-w-0">
          <legend className="text-xs font-medium text-foreground/70">{t('universeLabel')}</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('universeLabel')}>
            {(['halal', 'wide', 'custom'] as UniverseMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={universe === mode}
                onClick={() => setUniverse(mode)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ease-out disabled:opacity-40 ${
                  universe === mode ? 'bg-accent text-white shadow-sm' : 'bg-foreground/[0.04] text-foreground/60 hover:text-foreground'
                }`}
              >
                {t(`universe_${mode}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
            {fixedBook ? t('universeFixed') : universe === 'wide' ? t('universeWideNote') : universe === 'custom' ? t('universeCustomNote') : t('universeHalalNote')}
          </p>
        </fieldset>

        {/* Period */}
        <fieldset disabled={running}>
          <legend className="text-xs font-medium text-foreground/70">{t('periodLabel')}</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('periodLabel')} dir="ltr">
            {PERIODS.map((p) => {
              const disabled = universe === 'wide' && p !== '1Y';
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={period === p}
                  disabled={disabled}
                  onClick={() => setPeriod(p)}
                  title={disabled ? t('wideOneYearOnly') : undefined}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ease-out disabled:opacity-30 disabled:cursor-not-allowed ${
                    period === p ? 'bg-accent text-white shadow-sm' : 'bg-foreground/[0.04] text-foreground/60 hover:text-foreground'
                  }`}
                >
                  {p === 'FULL' ? t('periodFull') : p}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
            {evidenceView ? t('evidenceViewNote') : t('fullPeriodNote')}
          </p>
        </fieldset>
      </div>

      {/* Custom symbols */}
      {universe === 'custom' && !fixedBook && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-foreground/70">
            {t('symbolsLabel', { max: MAX_CUSTOM_SYMBOLS })}
            <input
              value={symbolInput}
              disabled={running}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addSymbols(symbolInput);
                }
              }}
              onBlur={() => addSymbols(symbolInput)}
              placeholder={t('symbolsPlaceholder')}
              dir="ltr"
              className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-transparent px-3 py-2 font-mono text-sm uppercase text-foreground placeholder:normal-case placeholder:font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
          </label>
          {symbols.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
              {symbols.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 font-mono text-[11px] font-semibold">
                  {s}
                  <button
                    type="button"
                    aria-label={t('removeSymbol', { symbol: s })}
                    disabled={running}
                    onClick={() => setSymbols((prev) => prev.filter((x) => x !== s))}
                    className="text-foreground/40 transition-colors ease-out hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Launch */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={running || customInvalid || !setup}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity ease-out hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {running ? t('runningButton') : t('runButton')}
        </button>
        {running && <p className="text-xs text-foreground/55" role="status">{t('runningHint')}</p>}
        {customInvalid && <p className="text-xs text-foreground/55">{t('needSymbols')}</p>}
      </div>

      {/* Outcome */}
      {run.phase === 'error' && (
        <div className="mt-5 rounded-xl bg-foreground/[0.04] p-4 text-start" role="alert">
          <p className="text-sm font-medium">{t(run.messageKey)}</p>
          {run.detail && <p className="mt-1 font-mono text-[11px] text-foreground/55" dir="ltr">{run.detail}</p>}
        </div>
      )}

      {run.phase === 'done' && run.payload.card && (
        <ResultCard payload={run.payload} t={t} />
      )}
    </section>
  );
}

function ResultCard({ payload, t }: { payload: PollPayload; t: ReturnType<typeof useTranslations> }) {
  const card = payload.card!;
  const verdict = payload.responseStatus ?? card.status;
  const accepted = verdict === 'ACCEPTED';
  const sharia =
    card.shariaState?.startsWith('VERIFIED') ? { icon: ShieldCheck, cls: 'text-emerald-600 dark:text-emerald-400' }
    : card.shariaState === 'UNSCREENED' ? { icon: ShieldQuestion, cls: 'text-amber-600 dark:text-amber-400' }
    : { icon: ShieldAlert, cls: 'text-foreground/50' };
  const ShariaIcon = sharia.icon;

  const metrics: { label: string; value: string }[] = [
    { label: t('mCagr'), value: pct(card.full.cagr) },
    { label: t('mSharpe'), value: num(card.full.sharpe) },
    { label: t('mDsr'), value: num(card.full.deflatedSharpe) },
    { label: t('mMaxDd'), value: pct(card.full.maxDrawdown) },
    { label: t('mTrades'), value: String(card.full.trades) },
    { label: t('mHitRate'), value: pct(card.full.hitRate) },
    { label: t('mOosCagr'), value: pct(card.oos.cagr) },
    { label: t('mPDayUp5'), value: pct(card.distribution.probDayGe5pct) },
    { label: t('mPDayDown5'), value: pct(card.distribution.probDayLe5pct) },
  ];

  return (
    <div className="mt-6 rounded-xl bg-foreground/[0.025] p-4 text-start sm:p-5" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ltr:tracking-wide ${
            accepted ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {accepted ? t('verdictAccepted') : t('verdictRejected')}
        </span>
        {payload.evidenceView && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {t('evidenceViewBadge')}
          </span>
        )}
        {card.implausible && (
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            {t('implausibleBadge')}
          </span>
        )}
        <span className="rounded-full bg-foreground/[0.05] px-3 py-1 text-[11px] font-semibold text-foreground/60">
          {t('simulatedBadge')}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${sharia.cls}`}>
          <ShariaIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {card.shariaState}
        </span>
      </div>

      <p className="mt-3 font-mono text-[11px] text-foreground/55" dir="ltr">
        {card.universe} · {card.periodPreset} · {card.from} → {card.to} · seed 42 · {card.gitSha.slice(0, 7)}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-9 sm:gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <dt className="text-[10px] leading-tight text-foreground/50">{m.label}</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold" dir="ltr">{m.value}</dd>
          </div>
        ))}
      </dl>

      {card.rejectionReasonCodes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5" dir="ltr">
          {card.rejectionReasonCodes.map((code) => (
            <span key={code} className="rounded-lg bg-foreground/[0.05] px-2 py-1 font-mono text-[10px] text-foreground/65">
              {code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
