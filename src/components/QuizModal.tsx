'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, RotateCcw, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface QuizData {
  topic: string;
  topicAr?: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (passed: boolean, topic: string) => void | Promise<void>;
  topic: string | null;
  locale: string;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuizModal({ isOpen, onClose, onComplete, topic, locale }: QuizModalProps) {
  const t = useTranslations('Quiz');
  const reduceMotion = useReducedMotion();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const fetchQuiz = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    setQuiz(null);
    setSelected(null);
    setShowResult(false);

    try {
      const url = topic
        ? `/api/quiz?topic=${encodeURIComponent(topic)}&locale=${locale || 'en'}`
        : `/api/quiz?locale=${locale || 'en'}`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('quiz_load_failed');
      setQuiz(await response.json());
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
      console.error('Failed to load quiz:', fetchError);
      setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [locale, topic]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void fetchQuiz(controller.signal);
    return () => controller.abort();
  }, [fetchQuiz, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const passed = quiz !== null && selected === quiz.correctOptionIndex;

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-background/80 p-3 backdrop-blur-md sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-dialog-title"
            className="relative my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-surface-card shadow-[0_2px_6px_rgba(0,0,0,0.08),0_32px_90px_rgba(0,0,0,0.18)]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
          >
            <header className="flex items-center gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
              <button
                type="button"
                onClick={onClose}
                aria-label={t('closeLesson')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]" aria-label={t('progressLabel')}>
                  <div className="h-full w-full rounded-full bg-accent" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-foreground/45">
                  <span>{t('questionProgress')}</span>
                  <span>{t('singleLesson')}</span>
                </div>
              </div>
            </header>

            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-5 pb-6 sm:px-7 sm:pb-7">
              {loading ? (
                <div className="space-y-5 py-4" aria-label={t('loadingQuestion')}>
                  <div className="h-4 w-28 animate-pulse rounded bg-foreground/[0.06] motion-reduce:animate-none" />
                  <div className="h-16 animate-pulse rounded-xl bg-foreground/[0.06] motion-reduce:animate-none" />
                  <div className="space-y-3">
                    {OPTION_LABELS.map((label) => <div key={label} className="h-14 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none" />)}
                  </div>
                </div>
              ) : error ? (
                <div className="py-14 text-center">
                  <XCircle className="mx-auto size-8 text-down" aria-hidden="true" />
                  <h2 id="quiz-dialog-title" className="mt-4 text-lg font-semibold">{t('loadErrorTitle')}</h2>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-foreground/55">{t('loadErrorBody')}</p>
                  <button
                    type="button"
                    onClick={() => void fetchQuiz()}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {t('retry')}
                  </button>
                </div>
              ) : quiz ? (
                <div className="pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
                    {locale === 'ar' && quiz.topicAr ? quiz.topicAr : quiz.topic}
                  </p>
                  <h2 id="quiz-dialog-title" className="mt-4 text-xl font-semibold leading-relaxed sm:text-2xl">{quiz.question}</h2>

                  <div className="mt-7 space-y-3.5" role="group" aria-label={t('answerChoices')}>
                    {quiz.options.map((option, index) => {
                      const isSelected = selected === index;
                      const isCorrect = index === quiz.correctOptionIndex;
                      
                      let resultClass = 'border border-accent/35 bg-surface-card hover:border-accent hover:bg-accent/10 hover:shadow-md';
                      if (isSelected && !showResult) {
                        resultClass = 'border-2 border-accent bg-accent/10 ring-2 ring-accent/30 text-foreground font-bold shadow-md';
                      } else if (showResult) {
                        if (isCorrect) {
                          resultClass = 'border-2 border-up bg-up/15 text-up font-bold ring-2 ring-up/30 shadow-[0_0_15px_rgba(4,120,87,0.25)]';
                        } else if (isSelected && !isCorrect) {
                          resultClass = 'border-2 border-down bg-down/15 text-down font-bold ring-2 ring-down/30 shadow-[0_0_15px_rgba(190,18,60,0.25)]';
                        } else {
                          resultClass = 'border border-foreground/10 bg-foreground/[0.02] text-foreground/40 opacity-50';
                        }
                      }

                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={showResult}
                          aria-pressed={isSelected}
                          onClick={() => setSelected(index)}
                          className={`flex w-full items-start justify-between gap-3 rounded-2xl p-4 text-start text-sm leading-relaxed transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99] disabled:cursor-default motion-reduce:transform-none ${resultClass}`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <span className={`grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold ${
                              showResult && isCorrect ? 'bg-up text-white' : showResult && isSelected && !isCorrect ? 'bg-down text-white' : 'bg-background/80 text-foreground border border-foreground/15'
                            }`} dir="ltr">{OPTION_LABELS[index]}</span>
                            <span className="pt-0.5">{option}</span>
                          </div>
                          {showResult && isCorrect && <CheckCircle2 className="size-5 shrink-0 text-up animate-in zoom-in duration-200" aria-hidden="true" />}
                          {showResult && isSelected && !isCorrect && <XCircle className="size-5 shrink-0 text-down animate-in zoom-in duration-200" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>

                  {showResult ? (
                    <div className={`mt-6 rounded-2xl p-5 ${passed ? 'bg-up/10' : 'bg-down/10'}`} aria-live="polite">
                      <div className="flex items-center gap-2">
                        {passed ? <CheckCircle2 className="size-5 text-up" /> : <XCircle className="size-5 text-down" />}
                        <p className="font-semibold">{t(passed ? 'answerCorrect' : 'answerIncorrect')}</p>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-foreground/65">{quiz.explanation}</p>
                      <button
                        type="button"
                        onClick={() => {
                          void onComplete(passed, quiz.topic);
                          onClose();
                        }}
                        className="mt-5 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
                      >
                        {t('finishLesson')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowResult(true)}
                      disabled={selected === null}
                      className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-[transform,opacity] duration-150 ease-out active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
                    >
                      {t('checkAnswer')}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
