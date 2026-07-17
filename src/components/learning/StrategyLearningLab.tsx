'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { StrategyLearningReplayResult } from '@/quant/learning/strategyLearningReplay';
import { DEFAULT_STRATEGY_LEARNING_SETUP_ID } from '@/quant/learning/strategyLearningSetupIds';
import StrategyLearningComparisonChart from './StrategyLearningComparisonChart';
import StrategyMasteryRevisit, { type StrategyMasteryState } from './StrategyMasteryRevisit';

type Area = 'ENTRY' | 'EXIT' | 'SIZING' | 'HOLDING' | 'RISK';
interface CurriculumOption { id: string; label: string; feedback: string }
interface CurriculumQuestion {
  id: string;
  role: 'KNOWLEDGE_CHECK' | 'POLICY_DECISION';
  area: Area;
  prompt: string;
  options: CurriculumOption[];
  correctOptionId?: string;
  explanation?: string;
  teamOptionId?: string;
}
interface Curriculum {
  setupId: string;
  setupVersion: string;
  questionSetVersion: string;
  complianceTag: 'EDUCATIONAL_ONLY';
  title: string;
  questions: CurriculumQuestion[];
}
interface Completion {
  attempt: {
    id: string;
    attemptNumber: number;
    answers: Array<{ questionId: string; optionId: string }>;
    sealedAt: string;
  };
  result: StrategyLearningReplayResult;
  mastery: StrategyMasteryState;
}
type Phase = 'overview' | 'questions' | 'review' | 'submitting' | 'submitError' | 'result';

const PROCESS_ICONS = [BookOpen, Sparkles, Scale, BarChart3] as const;
const SERIES = ['learner', 'team', 'spus', 'spy'] as const;

export default function StrategyLearningLab({
  locale,
  setupId,
}: {
  locale: string;
  setupId?: string;
}) {
  const t = useTranslations('StrategyLearning');
  const requestedSetupId = setupId ?? DEFAULT_STRATEGY_LEARNING_SETUP_ID;
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [phase, setPhase] = useState<Phase>('overview');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [retryOfAttemptId, setRetryOfAttemptId] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [latestCompletion, setLatestCompletion] = useState<Completion | null>(null);

  const loadCurriculum = useCallback(async (signal?: AbortSignal) => {
    setLoadState('loading');
    try {
      const query = new URLSearchParams({ locale, setupId: requestedSetupId });
      const response = await fetch(`/api/learning/strategy-attempts?${query}`, { signal });
      if (!response.ok) throw new Error('curriculum_load_failed');
      const data = await response.json() as Curriculum;
      setCurriculum(data);
      const latestResponse = await fetch(
        `/api/learning/strategy-attempts/latest?setupId=${encodeURIComponent(requestedSetupId)}`,
        { signal },
      );
      if (latestResponse.ok && latestResponse.status !== 204) {
        setLatestCompletion(await latestResponse.json() as Completion);
      } else if (latestResponse.status === 204) {
        setLatestCompletion(null);
      }
      setLoadState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadState('error');
    }
  }, [locale, requestedSetupId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCurriculum(controller.signal);
    return () => controller.abort();
  }, [loadCurriculum]);

  const currentQuestion = curriculum?.questions[questionIndex] ?? null;
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : undefined;
  const selectedOption = currentQuestion?.options.find(option => option.id === selectedOptionId);
  const processStep = phase === 'overview'
    ? 0
    : phase === 'result'
      ? 3
      : phase === 'review' || phase === 'submitting' || phase === 'submitError'
        ? 2
      : currentQuestion?.role === 'KNOWLEDGE_CHECK'
        ? 1
        : 2;
  const orderedAnswers = useMemo(() => curriculum?.questions.map(question => ({
    questionId: question.id,
    optionId: answers[question.id],
  })) ?? [], [answers, curriculum]);

  const start = () => {
    setAnswers({});
    setQuestionIndex(0);
    setIdempotencyKey(crypto.randomUUID());
    setPhase('questions');
  };

  const submit = async () => {
    if (!curriculum || !idempotencyKey || orderedAnswers.some(answer => !answer.optionId)) return;
    setPhase('submitting');
    try {
      const response = await fetch('/api/learning/strategy-attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          setupId: curriculum.setupId,
          idempotencyKey,
          answers: orderedAnswers,
          ...(retryOfAttemptId ? { retryOfAttemptId } : {}),
        }),
      });
      if (!response.ok) throw new Error('attempt_submit_failed');
      const completed = await response.json() as Completion;
      setCompletion(completed);
      setLatestCompletion(completed);
      setPhase('result');
    } catch {
      setPhase('submitError');
    }
  };

  const beginRetry = () => {
    setRetryOfAttemptId(completion?.attempt.id ?? null);
    setCompletion(null);
    setAnswers({});
    setQuestionIndex(0);
    setIdempotencyKey(crypto.randomUUID());
    setPhase('overview');
  };

  return (
    <section className="mt-10 overflow-hidden rounded-3xl bg-surface-card shadow-[0_2px_5px_rgba(0,0,0,0.06),0_28px_80px_rgba(0,0,0,0.08)]" aria-labelledby="strategy-learning-title">
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-col gap-5 text-start lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-[10px] font-semibold text-accent">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t('eyebrow')}
            </div>
            <h2 id="strategy-learning-title" className="mt-4 text-2xl font-semibold tracking-[-0.025em] rtl:tracking-normal sm:text-3xl">{t('title')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/60">{t('subtitle')}</p>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-noncompliant/10 px-4 py-3 text-start text-xs leading-relaxed text-foreground/70 lg:max-w-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-noncompliant" aria-hidden="true" />
            <p>{t('disclosure')}</p>
          </div>
        </header>

        <ol className="mt-7 grid grid-cols-4 gap-2" aria-label={t('processLabel')}>
          {[0, 1, 2, 3].map(step => {
            const Icon = PROCESS_ICONS[step];
            const active = step <= processStep;
            return (
              <li key={step} className={`rounded-xl px-2 py-3 text-center text-[10px] font-semibold ${active ? 'bg-accent/10 text-accent' : 'bg-foreground/[0.03] text-foreground/40'}`}>
                <Icon className="mx-auto mb-1.5 size-4" aria-hidden="true" />
                {t(`process.${step}`)}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="bg-foreground/[0.018] px-5 py-6 sm:px-8 sm:py-8">
        {loadState === 'loading' ? <LoadingState label={t('loading')} /> : null}
        {loadState === 'error' ? (
          <StateMessage
            Icon={RefreshCw}
            title={t('loadErrorTitle')}
            body={t('loadErrorBody')}
            action={t('tryAgain')}
            onAction={() => void loadCurriculum()}
          />
        ) : null}
        {loadState === 'ready' && curriculum?.questions.length === 0 ? (
          <StateMessage Icon={BookOpen} title={t('emptyTitle')} body={t('emptyBody')} />
        ) : null}

        {loadState === 'ready' && curriculum && phase === 'overview' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
            <div className="rounded-2xl bg-background/65 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45 rtl:tracking-normal">{t('chooseTeam')}</p>
                  <h3 className="mt-2 text-xl font-semibold">{curriculum.title}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 font-mono text-[10px] text-foreground/55" dir="ltr">v2</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/60">{t('conceptBody')}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {['entry', 'risk', 'discipline'].map(item => (
                  <div key={item} className="rounded-xl bg-foreground/[0.035] p-3">
                    <p className="text-xs font-semibold">{t(`concepts.${item}.title`)}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-foreground/55">{t(`concepts.${item}.body`)}</p>
                  </div>
                ))}
              </div>
            </div>
            <aside className="rounded-2xl bg-background/65 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45 rtl:tracking-normal">{t('beforeStart')}</p>
              <ul className="mt-4 space-y-3 text-xs leading-relaxed text-foreground/65">
                {['sealed', 'bounded', 'mastery'].map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-up" aria-hidden="true" />
                    <span>{t(`guardrails.${item}`)}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={start}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
              >
                {retryOfAttemptId ? t('startRetry') : t('startLesson')}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </button>
              {latestCompletion ? (
                <div className="mt-3 rounded-xl bg-foreground/[0.04] p-3 text-start">
                  <p className="text-xs font-semibold">{t('latestAttemptTitle', { number: latestCompletion.attempt.attemptNumber })}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/55">{t('latestAttemptBody')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCompletion(latestCompletion);
                      setAnswers(Object.fromEntries(latestCompletion.attempt.answers.map(answer => [answer.questionId, answer.optionId])));
                      setPhase('result');
                    }}
                    className="mt-2 rounded-full px-3 py-2 text-[11px] font-semibold text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {t('continueMastery')}
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        {loadState === 'ready' && curriculum && phase === 'questions' && currentQuestion ? (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-4 text-[10px] font-semibold text-foreground/45">
              <span>{t('questionCount', { current: questionIndex + 1, total: curriculum.questions.length })}</span>
              <span>{t(`areas.${currentQuestion.area}`)}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]" aria-label={t('progressLabel')}>
              <div className="h-full origin-left rounded-full bg-accent rtl:origin-right" style={{ transform: `scaleX(${(questionIndex + 1) / curriculum.questions.length})` }} />
            </div>
            <div className="mt-6 rounded-2xl bg-background/70 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
                {t(currentQuestion.role === 'KNOWLEDGE_CHECK' ? 'knowledgeCheck' : 'policyDecision')}
              </p>
              <h3 className="mt-3 text-xl font-semibold leading-relaxed">{currentQuestion.prompt}</h3>
              <div className="mt-6 space-y-3" role="group" aria-label={t('answerChoices')}>
                {currentQuestion.options.map((option, index) => {
                  const selected = selectedOptionId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAnswers(previous => ({ ...previous, [currentQuestion.id]: option.id }))}
                      className={`flex w-full items-start gap-3 rounded-2xl p-4 text-start text-sm leading-relaxed transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.995] motion-reduce:transform-none ${selected ? 'bg-accent/10 ring-2 ring-accent' : 'bg-foreground/[0.035] hover:bg-foreground/[0.06]'}`}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background/70 font-mono text-[11px] font-semibold" dir="ltr">{String.fromCharCode(65 + index)}</span>
                      <span className="pt-1">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {selectedOption ? (
                <div className="mt-5 rounded-xl bg-foreground/[0.04] p-4 text-sm leading-relaxed text-foreground/65" aria-live="polite">
                  <div className="flex items-start gap-2.5">
                    {currentQuestion.role === 'KNOWLEDGE_CHECK' ? (
                      selectedOption.id === currentQuestion.correctOptionId
                        ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-up" aria-hidden="true" />
                        : <X className="mt-0.5 size-4 shrink-0 text-down" aria-hidden="true" />
                    ) : <Scale className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />}
                    <div>
                      <p className="font-semibold text-foreground">{t('mechanismFeedback')}</p>
                      <p className="mt-1">{selectedOption.feedback}</p>
                      {currentQuestion.role === 'KNOWLEDGE_CHECK' && currentQuestion.explanation ? (
                        <p className="mt-2 text-foreground/55">{currentQuestion.explanation}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => questionIndex === 0 ? setPhase('overview') : setQuestionIndex(index => index - 1)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-foreground/60 hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                  {t('back')}
                </button>
                <button
                  type="button"
                  disabled={!selectedOptionId}
                  onClick={() => questionIndex === curriculum.questions.length - 1 ? setPhase('review') : setQuestionIndex(index => index + 1)}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {questionIndex === curriculum.questions.length - 1 ? t('reviewChoices') : t('continue')}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loadState === 'ready' && curriculum && phase === 'review' ? (
          <div className="mx-auto max-w-3xl text-start">
            <div className="rounded-2xl bg-background/70 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-7">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <h3 className="text-xl font-semibold">{t('sealTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/60">{t('sealBody')}</p>
                </div>
              </div>
              <ol className="mt-6 space-y-2">
                {curriculum.questions.map((question, index) => {
                  const option = question.options.find(item => item.id === answers[question.id]);
                  return (
                    <li key={question.id} className="flex items-start gap-3 rounded-xl bg-foreground/[0.035] p-3 text-xs">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background font-mono text-[10px]">{index + 1}</span>
                      <div>
                        <p className="font-semibold">{t(`areas.${question.area}`)}</p>
                        <p className="mt-1 leading-relaxed text-foreground/60">{option?.label}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => setPhase('questions')} className="rounded-full px-5 py-3 text-xs font-semibold text-foreground/60 hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('editChoices')}</button>
                <button type="button" onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                  <LockKeyhole className="size-4" aria-hidden="true" />
                  {t('sealAndCompare')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {phase === 'submitting' ? <LoadingState label={t('runningReplay')} /> : null}
        {phase === 'submitError' ? (
          <StateMessage
            Icon={RotateCcw}
            title={t('submitErrorTitle')}
            body={t('submitErrorBody')}
            action={t('retrySubmission')}
            onAction={() => void submit()}
          />
        ) : null}

        {phase === 'result' && completion ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-background/70 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('attemptLabel', { number: completion.attempt.attemptNumber })}</p>
                  <h3 className="mt-2 text-2xl font-semibold">{t('comparisonTitle')}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/60">{t('resultBody')}</p>
                </div>
                <div className="inline-flex items-center gap-2 self-start rounded-full bg-foreground/[0.05] px-3 py-2 text-[10px] font-semibold text-foreground/60">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  {t('sealed')}
                </div>
              </div>
              <div className="mt-6">
                <StrategyLearningComparisonChart result={completion.result} locale={locale} />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-background/70 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="px-5 py-4 text-start sm:px-6">
                <h3 className="font-semibold">{t('metricsTitle')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t('metricsBody')}</p>
              </div>
              <MetricsTable result={completion.result} locale={locale} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
              <div className="rounded-2xl bg-background/70 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6">
                <h3 className="font-semibold">{t('choicesTitle')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t('choicesBody')}</p>
                <ul className="mt-4 space-y-3">
                  {curriculum?.questions.filter(question => question.role === 'POLICY_DECISION').map(question => {
                    const option = question.options.find(item => item.id === answers[question.id]);
                    return (
                      <li key={question.id} className="rounded-xl bg-foreground/[0.035] p-4">
                        <p className="text-xs font-semibold">{t(`areas.${question.area}`)} · {option?.label}</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">{option?.feedback}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="space-y-3">
                <StrategyMasteryRevisit
                  attemptId={completion.attempt.id}
                  mastery={completion.mastery}
                  knowledgeQuestion={curriculum?.questions.find(question => question.role === 'KNOWLEDGE_CHECK') ?? null}
                  locale={locale}
                  onUpdate={mastery => setCompletion(current => current ? { ...current, mastery } : current)}
                />
                <aside className="rounded-2xl bg-background/70 p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6">
                  <div className="flex items-start gap-2 rounded-xl bg-noncompliant/10 p-3 text-xs leading-relaxed text-foreground/65">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-noncompliant" aria-hidden="true" />
                  <p>{t('shariaBlocked')}</p>
                  </div>
                  <button type="button" onClick={beginRetry} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-xs font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {t('newAttempt')}
                  </button>
                  <Link
                    href={`/${locale}/quant/league?setup=${encodeURIComponent(completion.result.setupId)}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-xs font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {t('viewTeamEvidence')}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </aside>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-8" role="status" aria-label={label}>
      <div className="h-5 w-40 animate-pulse rounded bg-foreground/[0.07] motion-reduce:animate-none" />
      <div className="h-20 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.045] motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.045] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function StateMessage({
  Icon,
  title,
  body,
  action,
  onAction,
}: {
  Icon: typeof RefreshCw;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center" role="status">
      <Icon className="mx-auto size-7 text-foreground/45" aria-hidden="true" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/55">{body}</p>
      {action && onAction ? (
        <button type="button" onClick={onAction} className="mt-5 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">{action}</button>
      ) : null}
    </div>
  );
}

function MetricsTable({ result, locale }: { result: StrategyLearningReplayResult; locale: string }) {
  const t = useTranslations('StrategyLearning');
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const percent = (value: number, signed = false) => new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    signDisplay: signed ? 'always' : 'auto',
    maximumFractionDigits: 1,
  }).format(value);
  const integer = (value: number) => new Intl.NumberFormat(numberLocale).format(value);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-start text-xs">
        <thead className="bg-foreground/[0.035] text-foreground/50">
          <tr>
            <th className="px-5 py-3 font-medium sm:px-6">{t('metricSeries')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('metricReturn')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('metricDrawdown')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('metricVolatility')}</th>
            <th className="px-5 py-3 text-end font-medium sm:px-6">{t('metricTrades')}</th>
          </tr>
        </thead>
        <tbody>
          {SERIES.map(key => {
            const metric = result.metrics[key];
            return (
              <tr key={key} className="border-t border-foreground/[0.06]">
                <th className="px-5 py-4 font-semibold sm:px-6">{t(`series.${key}`)}</th>
                <td className={`px-4 py-4 text-end tabular-nums ${metric.return > 0 ? 'text-up' : metric.return < 0 ? 'text-down' : ''}`} dir="ltr">{percent(metric.return, true)}</td>
                <td className="px-4 py-4 text-end tabular-nums" dir="ltr">{percent(metric.maxDrawdown)}</td>
                <td className="px-4 py-4 text-end tabular-nums" dir="ltr">{percent(metric.annualizedVolatility)}</td>
                <td className="px-5 py-4 text-end tabular-nums sm:px-6" dir="ltr">{integer(metric.trades)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
