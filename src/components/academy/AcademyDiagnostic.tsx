'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowLeft, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DiagnosticQuestion } from '@/academy/diagnostic';

type Phase = 'closed' | 'stepping' | 'cooldown' | 'error';

/**
 * DR-19 diagnostic surface. Framed strictly as an adjustable "starting
 * path," never a psychometric label — copy avoids naming the learner, and
 * Skip / Retake are always available, equal-weight actions. Skip never
 * shows a question — it has its own inline busy state.
 */
export default function AcademyDiagnostic({
  locale,
  questions,
  hasProfile,
  personaLabel,
}: {
  locale: 'en' | 'ar';
  questions: DiagnosticQuestion[];
  hasProfile: boolean;
  personaLabel: string | null;
}) {
  const t = useTranslations('Academy');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('closed');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepSubmitting, setStepSubmitting] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  // Last submitted payload, so "Try again" actually resubmits rather than
  // only dismissing the error notice.
  const lastAttemptRef = useRef<Record<string, string> | undefined>(undefined);
  const awaitingRefreshRef = useRef(false);

  const text = (value: { en: string; ar: string }) => value[locale];

  function reset() {
    setPhase('closed');
    setStep(0);
    setAnswers({});
    setStepSubmitting(false);
    setSkipLoading(false);
  }

  async function submit(finalAnswers?: Record<string, string>) {
    lastAttemptRef.current = finalAnswers;
    if (finalAnswers) setStepSubmitting(true);
    else setSkipLoading(true);
    try {
      const response = await fetch('/api/academy/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalAnswers ? { answers: finalAnswers } : {}),
      });
      if (response.status === 429) {
        setStepSubmitting(false);
        setSkipLoading(false);
        setPhase('cooldown');
        return;
      }
      if (!response.ok) throw new Error('profile_not_saved');
      // Hold the current busy state through the refresh so the learner
      // never sees a flash back to the invite card before the new
      // profile-derived props (chip/queue) land.
      awaitingRefreshRef.current = true;
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setStepSubmitting(false);
      setSkipLoading(false);
      setPhase('error');
    }
  }

  useEffect(() => {
    if (awaitingRefreshRef.current && !isRefreshing) {
      awaitingRefreshRef.current = false;
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing]);

  function selectOption(questionId: string, optionId: string) {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    if (step === questions.length - 1) {
      void submit(next);
    } else {
      setStep(step + 1);
    }
  }

  function retry() {
    setPhase(lastAttemptRef.current ? 'stepping' : 'closed');
    void submit(lastAttemptRef.current);
  }

  if (phase === 'stepping' || stepSubmitting) {
    const question = questions[Math.min(step, questions.length - 1)];
    return (
      <section
        aria-labelledby="diagnostic-question"
        className="mt-10 rounded-3xl bg-foreground/[0.035] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] transition-opacity duration-200 ease-out sm:p-7"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
            {t('diagnostic.eyebrow')}
          </p>
          <p aria-live="polite" className="text-xs tabular-nums text-foreground/60">
            {t('diagnostic.stepOf', { step: Math.min(step, questions.length - 1) + 1, total: questions.length })}
          </p>
        </div>
        <h2 id="diagnostic-question" className="mt-4 text-xl font-semibold leading-8">
          {text(question.question)}
        </h2>
        <fieldset className="mt-6 space-y-3" disabled={stepSubmitting}>
          <legend className="sr-only">{text(question.question)}</legend>
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => selectOption(question.id, option.id)}
              className="flex w-full items-start gap-3 rounded-2xl bg-background/60 px-4 py-3 text-start text-sm leading-7 ring-1 ring-foreground/[0.07] transition-colors duration-150 ease-out hover:bg-accent/[0.08] hover:ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text(option.label)}
            </button>
          ))}
        </fieldset>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (step === 0 ? reset() : setStep(step - 1))}
            disabled={stepSubmitting}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground/65 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            {step === 0 ? t('diagnostic.skip') : t('diagnostic.back')}
          </button>
          {stepSubmitting && (
            <span className="flex items-center gap-2 text-foreground/60" role="status">
              <LoaderCircle className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
              <span className="sr-only">{t('saving')}</span>
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      {!hasProfile ? (
        <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-surface-card via-surface-card to-accent/5 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.06)] sm:p-8">
          <div className="absolute -end-12 -top-12 size-36 rounded-full bg-accent/10 blur-2xl pointer-events-none" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
            {t('diagnostic.inviteEyebrow')}
          </p>
          <h2 className="mt-2 text-xl font-bold leading-8 text-foreground sm:text-2xl">{t('diagnostic.inviteTitle')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/65">{t('diagnostic.inviteBody')}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPhase('stepping')}
              disabled={skipLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-accent px-6 py-3 text-sm font-bold text-white shadow-md shadow-accent/20 transition-all hover:scale-[1.02] hover:shadow-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {t('diagnostic.start')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={skipLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/15 px-5 py-3 text-sm font-semibold text-foreground/75 transition-all hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            >
              {skipLoading && (
                <span role="status" className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
                  <span className="sr-only">{t('saving')}</span>
                </span>
              )}
              <span>{t('diagnostic.skip')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-surface-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/50 rtl:tracking-normal">
                    {t('diagnostic.chipEyebrow')}
                  </span>
                  <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                    {locale === 'ar' ? 'مسار محدد' : 'Assessed Level'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full bg-accent px-3.5 py-1 text-xs font-extrabold text-white shadow-sm">
                    {personaLabel}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPhase('stepping')}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/15 bg-background/50 px-4 py-2.5 text-xs font-bold text-foreground/80 shadow-sm transition-all hover:border-accent hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {t('diagnostic.retake')}
            </button>
          </div>
        </div>
      )}
      {phase === 'cooldown' && (
        <p className="mt-3 text-sm leading-6 text-foreground/60" role="status">
          {t('diagnostic.cooldownNotice')}
        </p>
      )}
      {phase === 'error' && (
        <div className="mt-3 flex items-center gap-3" role="alert">
          <p className="text-sm text-down">{t('diagnostic.errorNotice')}</p>
          <button
            type="button"
            onClick={retry}
            className="text-sm font-semibold text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t('diagnostic.retryAction')}
          </button>
        </div>
      )}
    </section>
  );
}
