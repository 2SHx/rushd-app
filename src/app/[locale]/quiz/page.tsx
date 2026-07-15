'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Compass, Crown, Target, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QuizModal from '@/components/QuizModal';
import StrategyLearningLab from '@/components/learning/StrategyLearningLab';

const QUIZ_TOPICS = [
  { id: 'stockBasics', topic: 'Stock Market Basics', level: 1 },
  { id: 'savingsJars', topic: 'Savings & Jars', level: 1 },
  { id: 'compoundInterest', topic: 'Compound Interest', level: 1 },
  { id: 'shariaCompliance', topic: 'Sharia Compliance', level: 2 },
  { id: 'riskManagement', topic: 'Risk Management', level: 2 },
  { id: 'valueInvesting', topic: 'Value Investing', level: 2 },
  { id: 'halalFunds', topic: 'Halal Mutual Funds', level: 3 },
  { id: 'tasiMarkets', topic: 'TASI Markets', level: 3 },
  { id: 'nasdaqMarkets', topic: 'NASDAQ Markets', level: 3 },
] as const;

const TIERS = [
  { level: 1, Icon: Compass },
  { level: 2, Icon: Target },
  { level: 3, Icon: Crown },
] as const;

export default function QuizListPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('Quiz');
  const locale = params.locale || 'en';
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ passed: boolean; xp: number; level: number } | null>(null);

  const handleComplete = async (passed: boolean, topic: string) => {
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, score: passed ? 100 : 0, passed }),
      });

      if (!res.ok) throw new Error('quiz_result_not_saved');
      const data = await res.json();
      setLastResult({ passed, xp: data.xp, level: data.level });
    } catch (error) {
      console.error('Failed to submit quiz complete status:', error);
      setLastResult({ passed, xp: 0, level: 0 });
    }
  };

  const openLesson = (topic: string) => {
    setSelectedTopic(topic);
    setIsModalOpen(true);
    setLastResult(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-8 text-foreground sm:px-6 sm:pt-12 md:pb-12">
      <header className="max-w-3xl text-start">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] rtl:tracking-normal sm:text-5xl">{t('title')}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/60 sm:text-base">{t('subtitle')}</p>
      </header>

      <StrategyLearningLab locale={locale} />

      {lastResult ? (
        <section
          className={`mt-8 flex flex-col gap-4 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${lastResult.passed ? 'bg-up/10' : 'bg-down/10'}`}
          aria-live="polite"
        >
          <div className="flex items-start gap-3 text-start">
            {lastResult.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-up" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-down" />}
            <div>
              <p className="text-sm font-semibold">{t(lastResult.passed ? 'resultPassed' : 'resultRetry')}</p>
              {lastResult.xp > 0 ? (
                <p className="mt-1 text-xs text-foreground/55">{t('resultRecord', { xp: lastResult.xp, level: lastResult.level })}</p>
              ) : (
                <p className="mt-1 text-xs text-foreground/55">{t('resultNotSaved')}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastResult(null)}
            className="self-start rounded-lg px-3 py-2 text-xs font-semibold text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:self-auto"
          >
            {t('dismiss')}
          </button>
        </section>
      ) : null}

      <div className="mt-12 space-y-14" aria-label={t('pathLabel')}>
        {TIERS.map(({ level, Icon }) => {
          const lessons = QUIZ_TOPICS.filter((lesson) => lesson.level === level);
          return (
            <section key={level} aria-labelledby={`quiz-tier-${level}`}>
              <header className="flex items-start gap-3 text-start">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-accent">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45 rtl:tracking-normal">{t('stage', { number: level })}</p>
                  <h2 id={`quiz-tier-${level}`} className="mt-1 text-xl font-semibold">{t(`tiers.${level}.title`)}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t(`tiers.${level}.description`)}</p>
                </div>
              </header>

              <ol className="relative mt-6 space-y-3 before:absolute before:bottom-7 before:start-5 before:top-7 before:w-px before:bg-foreground/10">
                {lessons.map((lesson) => {
                  const lessonNumber = QUIZ_TOPICS.findIndex((item) => item.id === lesson.id) + 1;
                  return (
                    <li key={lesson.id} className="relative ps-14">
                      <span className="absolute start-0 top-5 z-10 grid size-10 place-items-center rounded-full bg-background font-mono text-xs font-semibold tabular-nums text-foreground ring-1 ring-foreground/10">
                        {lessonNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => openLesson(lesson.topic)}
                        className="group flex w-full items-center justify-between gap-5 rounded-2xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_18px_42px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
                      >
                        <span className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45 rtl:tracking-normal">{t('lesson', { number: lessonNumber })}</span>
                          <span className="mt-1.5 block text-base font-semibold text-foreground">{t(`topics.${lesson.id}.title`)}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-foreground/55">{t(`topics.${lesson.id}.description`)}</span>
                        </span>
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none">
                          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      <QuizModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        topic={selectedTopic}
        locale={locale}
        onComplete={handleComplete}
      />
    </div>
  );
}
