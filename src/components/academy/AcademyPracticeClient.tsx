'use client';

import { useCallback, useState } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QuizModal from '@/components/QuizModal';

/** Embeds the existing quiz experience inside Academy chrome for a single topic. */
export default function AcademyPracticeClient({ topic, locale, academyHref, applySetupId }: { topic: string; locale: string; academyHref: string; applySetupId: string | null }) {
  const tQuiz = useTranslations('Quiz');
  const tAcademy = useTranslations('Academy');
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [outcome, setOutcome] = useState<{ passed: boolean; topic: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedData, setSavedData] = useState<{ xp: number; level: number } | null>(null);

  const saveResult = useCallback(async (passed: boolean, completedTopic: string) => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: completedTopic, score: passed ? 100 : 0, passed }),
      });
      if (!res.ok) throw new Error('quiz_result_not_saved');
      const data = await res.json();
      setSavedData({ xp: data.xp, level: data.level });
      setSaveState('saved');
    } catch (error) {
      console.error('Failed to submit quiz complete status:', error);
      setSaveState('error');
    }
  }, []);

  const handleComplete = (passed: boolean, completedTopic: string) => {
    setOutcome({ passed, topic: completedTopic });
    void saveResult(passed, completedTopic);
  };

  const restart = () => {
    setOutcome(null);
    setSaveState('idle');
    setSavedData(null);
    setIsModalOpen(true);
  };

  return <div>
    {outcome ? (
      <section
        className={`flex flex-col gap-4 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${outcome.passed ? 'bg-up/10' : 'bg-down/10'}`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3 text-start">
          {outcome.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-up" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-down" />}
          <div>
            <p className="text-sm font-semibold">{tQuiz(outcome.passed ? 'resultPassed' : 'resultRetry')}</p>
            {saveState === 'saved' && savedData ? (
              <p className="mt-1 text-xs text-foreground/55">{tQuiz('resultRecord', { xp: savedData.xp, level: savedData.level })}</p>
            ) : saveState === 'error' ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <p className="text-xs text-foreground/55">{tQuiz('resultNotSaved')}</p>
                <button
                  type="button"
                  onClick={() => void saveResult(outcome.passed, outcome.topic)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {tAcademy('practice.retrySave')}
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-foreground/55">{tAcademy('saving')}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={restart}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {tAcademy('practice.restart')}
          </button>
          <Link
            href={academyHref}
            className={applySetupId
              ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              : 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'}
          >
            {tAcademy('practice.continueJourney')}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </section>
    ) : null}
    {outcome && applySetupId ? (
      <section className="mt-4 flex flex-col gap-3 rounded-2xl bg-accent/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-foreground">{tAcademy('practice.applyTitle')}</p>
        <Link
          href={`/${locale}/quiz?setupId=${encodeURIComponent(applySetupId)}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {tAcademy('practice.applyCta')}
          <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </section>
    ) : null}
    {!outcome ? (
      <>
        {!isModalOpen ? (
          <div className="rounded-3xl bg-foreground/[0.035] px-6 py-14 text-center shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={restart}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {tAcademy('practice.restart')}
              </button>
              <Link href={academyHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {tAcademy('practice.continueJourney')}
                <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : null}
        <QuizModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          topic={topic}
          locale={locale}
          onComplete={handleComplete}
        />
      </>
    ) : null}
  </div>;
}
