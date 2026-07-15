'use client';

import { useState } from 'react';
import { Brain, Check, CheckCircle2, Clock3, RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface MasteryMilestone {
  earned: boolean;
  xp: number;
  response?: string | null;
  correct?: boolean | null;
  createdAt?: string;
}

export interface StrategyMasteryState {
  completion: MasteryMilestone;
  retrieval: MasteryMilestone;
  reflection: MasteryMilestone;
  earnedXp: number;
  maxXp: number;
  retrievalAvailableAt: string;
  retrievalReady: boolean;
}

interface KnowledgeQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correctOptionId?: string;
  explanation?: string;
}

const REFLECTION_CHOICES = [
  'PROCESS_OVER_OUTCOME',
  'RISK_OVER_RETURN',
  'DISCIPLINE_BEFORE_ENTRY',
] as const;

export default function StrategyMasteryRevisit({
  attemptId,
  mastery,
  knowledgeQuestion,
  locale,
  onUpdate,
}: {
  attemptId: string;
  mastery: StrategyMasteryState;
  knowledgeQuestion: KnowledgeQuestion | null;
  locale: string;
  onUpdate: (mastery: StrategyMasteryState) => void;
}) {
  const t = useTranslations('StrategyLearning');
  const [reflection, setReflection] = useState<typeof REFLECTION_CHOICES[number] | null>(null);
  const [retrievalAnswer, setRetrievalAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState<'REFLECTION' | 'RETRIEVAL' | null>(null);
  const [error, setError] = useState(false);
  const [retrievalCorrect, setRetrievalCorrect] = useState<boolean | null>(null);
  const dateLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const availableAt = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(mastery.retrievalAvailableAt));

  const award = async (body: Record<string, string>, kind: 'REFLECTION' | 'RETRIEVAL') => {
    setBusy(kind);
    setError(false);
    try {
      const response = await fetch(`/api/learning/strategy-attempts/${attemptId}/mastery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('mastery_award_failed');
      const data = await response.json() as {
        mastery: StrategyMasteryState;
        award: { correct?: boolean | null };
      };
      if (kind === 'RETRIEVAL') setRetrievalCorrect(data.award.correct ?? false);
      onUpdate(data.mastery);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl bg-background/70 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6" aria-labelledby="mastery-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="size-4" aria-hidden="true" />
            <h3 id="mastery-title" className="font-semibold text-foreground">{t('masteryTitle')}</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground/55">{t('masteryBody')}</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1.5 font-mono text-[10px] font-semibold text-accent" dir="ltr">
          {mastery.earnedXp}/{mastery.maxXp} XP
        </span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]" aria-label={t('masteryProgress')}>
        <div className="h-full origin-left rounded-full bg-accent rtl:origin-right" style={{ transform: `scaleX(${mastery.earnedXp / mastery.maxXp})` }} />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {(['completion', 'reflection', 'retrieval'] as const).map(kind => {
          const milestone = mastery[kind];
          return (
            <li key={kind} className={`rounded-xl p-3 ${milestone.earned ? 'bg-up/10' : 'bg-foreground/[0.035]'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold">{t(`mastery.${kind}`)}</span>
                {milestone.earned
                  ? <CheckCircle2 className="size-4 text-up" aria-hidden="true" />
                  : <Clock3 className="size-4 text-foreground/35" aria-hidden="true" />}
              </div>
              <p className="mt-1 font-mono text-[10px] text-foreground/50" dir="ltr">+{milestone.xp} XP</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 rounded-xl bg-foreground/[0.035] p-4">
        <div className="flex items-start gap-2.5">
          <Brain className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{t('reflectionPrompt')}</p>
            {mastery.reflection.earned ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-up"><Check className="size-4" aria-hidden="true" />{t('reflectionComplete')}</p>
            ) : (
              <>
                <div className="mt-3 space-y-2" role="group" aria-label={t('reflectionChoicesLabel')}>
                  {REFLECTION_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={reflection === choice}
                      onClick={() => setReflection(choice)}
                      className={`w-full rounded-xl px-3 py-2.5 text-start text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${reflection === choice ? 'bg-accent/10 ring-1 ring-accent' : 'bg-background/70 hover:bg-foreground/[0.04]'}`}
                    >
                      {t(`reflectionChoices.${choice}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!reflection || busy !== null}
                  onClick={() => reflection && void award({ kind: 'REFLECTION', response: reflection }, 'REFLECTION')}
                  className="mt-3 rounded-full bg-accent px-4 py-2 text-[11px] font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {busy === 'REFLECTION' ? t('savingReflection') : t('saveReflection')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-foreground/[0.035] p-4">
        <p className="text-xs font-semibold">{t('retrievalTitle')}</p>
        {mastery.retrieval.earned ? (
          <div className="mt-2 text-xs leading-relaxed">
            <p className="flex items-center gap-2 text-up"><Check className="size-4" aria-hidden="true" />{t('retrievalComplete')}</p>
            {knowledgeQuestion ? (
              <div className={`mt-3 rounded-lg p-3 ${mastery.retrieval.correct ? 'bg-up/10' : 'bg-down/10'}`}>
                <p className="font-semibold">{t(mastery.retrieval.correct ? 'retrievalCorrect' : 'retrievalTryAgain')}</p>
                <p className="mt-1 text-foreground/60">{knowledgeQuestion.explanation}</p>
              </div>
            ) : null}
          </div>
        ) : !mastery.retrievalReady ? (
          <p className="mt-2 text-xs leading-relaxed text-foreground/55">{t('retrievalAvailable', { date: availableAt })}</p>
        ) : knowledgeQuestion ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-foreground/70">{knowledgeQuestion.prompt}</p>
            <div className="mt-3 space-y-2" role="group" aria-label={t('retrievalChoices')}>
              {knowledgeQuestion.options.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={retrievalAnswer === option.id}
                  onClick={() => setRetrievalAnswer(option.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-start text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${retrievalAnswer === option.id ? 'bg-accent/10 ring-1 ring-accent' : 'bg-background/70 hover:bg-foreground/[0.04]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!retrievalAnswer || busy !== null}
              onClick={() => retrievalAnswer && void award({
                kind: 'RETRIEVAL', questionId: knowledgeQuestion.id, optionId: retrievalAnswer,
              }, 'RETRIEVAL')}
              className="mt-3 rounded-full bg-foreground px-4 py-2 text-[11px] font-semibold text-background disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busy === 'RETRIEVAL' ? t('checkingRetrieval') : t('checkRetrieval')}
            </button>
            {retrievalCorrect !== null ? (
              <div className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${retrievalCorrect ? 'bg-up/10' : 'bg-down/10'}`} aria-live="polite">
                <p className="font-semibold">{t(retrievalCorrect ? 'retrievalCorrect' : 'retrievalTryAgain')}</p>
                <p className="mt-1 text-foreground/60">{knowledgeQuestion.explanation}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-down/10 p-3 text-xs text-foreground/65" role="alert">
          <RotateCcw className="size-4 shrink-0 text-down" aria-hidden="true" />
          {t('masterySaveError')}
        </div>
      ) : null}
      <p className="mt-4 text-[10px] leading-relaxed text-foreground/45">{t('xpDisclosure')}</p>
    </section>
  );
}
