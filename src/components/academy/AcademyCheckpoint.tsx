'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, LoaderCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Lesson } from '@/academy/registry';

export default function AcademyCheckpoint({
  trackId,
  unitId,
  lesson,
  locale,
  completed,
}: {
  trackId: string;
  unitId: string;
  lesson: Lesson;
  locale: 'en' | 'ar';
  completed: boolean;
}) {
  const t = useTranslations('Academy');
  const router = useRouter();
  const [answer, setAnswer] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(completed ? 'saved' : 'idle');
  const text = (value: { en: string; ar: string }) => value[locale];

  const correctIndex = lesson.checkpoint.correctOptionIndex;
  const isCorrect = answer === correctIndex;

  async function submit() {
    if (answer === null) return;
    setState('saving');
    try {
      const response = await fetch('/api/academy/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId,
          unitId,
          lessonId: lesson.id,
          contentVersion: lesson.contentVersion,
          answers: { [lesson.checkpoint.id]: answer },
        }),
      });
      if (!response.ok) throw new Error('academy_progress_not_saved');
      setState('saved');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  return (
    <section className="mt-10 rounded-3xl border border-accent/25 bg-surface-card p-5 shadow-[0_18px_55px_rgba(0,0,0,0.06)] sm:p-7" aria-labelledby="checkpoint-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
          {t('checkpointEyebrow')}
        </p>
        {state === 'saved' && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold ${
            isCorrect
              ? 'bg-up/15 text-up border border-up/40 shadow-[0_0_12px_rgba(4,120,87,0.2)]'
              : 'bg-down/15 text-down border border-down/40 shadow-[0_0_12px_rgba(190,18,60,0.2)]'
          }`}>
            {isCorrect ? '✓ إجابة صحيحة (+20 XP)' : '✕ إجابة غير صحيحة'}
          </span>
        )}
      </div>

      <h2 id="checkpoint-title" className="mt-3 text-xl font-extrabold leading-8 text-foreground">
        {text(lesson.checkpoint.question)}
      </h2>

      <fieldset className="mt-6 space-y-3.5" disabled={state === 'saving' || state === 'saved'}>
        <legend className="sr-only">{t('answerLegend')}</legend>
        {lesson.checkpoint.options.map((option, index) => {
          const isSelected = answer === index;
          const isThisCorrect = index === correctIndex;
          const isSubmitted = state === 'saved';

          let optionStyle = 'border border-accent/35 bg-surface-card hover:border-accent hover:bg-accent/10 hover:shadow-md';
          if (isSelected && !isSubmitted) {
            optionStyle = 'border-2 border-accent bg-accent/10 ring-2 ring-accent/30 shadow-md';
          } else if (isSubmitted) {
            if (isThisCorrect) {
              optionStyle = 'border-2 border-up bg-up/15 text-up font-bold ring-2 ring-up/30 shadow-[0_0_16px_rgba(4,120,87,0.25)]';
            } else if (isSelected && !isThisCorrect) {
              optionStyle = 'border-2 border-down bg-down/15 text-down font-bold ring-2 ring-down/30 shadow-[0_0_16px_rgba(190,18,60,0.25)]';
            } else {
              optionStyle = 'border border-foreground/10 bg-foreground/[0.02] opacity-50';
            }
          }

          return (
            <label
              key={option.en}
              className={`group flex cursor-pointer items-start justify-between gap-3 rounded-2xl p-4 text-sm font-semibold leading-7 transition-all duration-200 ${optionStyle}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="radio"
                  name="academy-answer"
                  className="mt-1.5 size-4 accent-accent"
                  checked={isSelected}
                  onChange={() => setAnswer(index)}
                />
                <span className="break-words">{text(option)}</span>
              </div>

              {isSubmitted && isThisCorrect && (
                <CheckCircle2 className="size-5 shrink-0 text-up animate-in zoom-in duration-200" aria-hidden="true" />
              )}
              {isSubmitted && isSelected && !isThisCorrect && (
                <XCircle className="size-5 shrink-0 text-down animate-in zoom-in duration-200" aria-hidden="true" />
              )}
            </label>
          );
        })}
      </fieldset>

      {state === 'saved' ? (
        <div className={`mt-6 rounded-2xl border p-5 text-sm leading-relaxed animate-in fade-in duration-300 ${
          isCorrect ? 'border-up/40 bg-up/10 text-up shadow-[0_0_15px_rgba(4,120,87,0.15)]' : 'border-down/40 bg-down/10 text-down shadow-[0_0_15px_rgba(190,18,60,0.15)]'
        }`} role="status">
          <div className="flex items-center gap-2.5 font-bold text-base">
            {isCorrect ? (
              <>
                <CheckCircle2 className="size-5 text-up" aria-hidden="true" />
                <span>{t('completeTitle')}</span>
              </>
            ) : (
              <>
                <XCircle className="size-5 text-down" aria-hidden="true" />
                <span>{locale === 'ar' ? 'راجع الإجابة الصحيحة المحددة باللون الأخضر أعلاه' : 'Review the correct answer highlighted in green above'}</span>
              </>
            )}
          </div>
          <p className="mt-2 text-foreground/75 font-normal">
            {text(lesson.checkpoint.explanation)}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={answer === null || state === 'saving'}
          className="group relative mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl border border-accent bg-accent px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent/90 hover:shadow-accent/40 active:scale-95 disabled:cursor-not-allowed disabled:border-foreground/10 disabled:bg-foreground/10 disabled:text-foreground/40 disabled:shadow-none"
        >
          {state === 'saving' && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          <span>{t(state === 'saving' ? 'saving' : 'submitAnswer')}</span>
          <Sparkles className="size-4 opacity-70 group-hover:opacity-100" />
        </button>
      )}

      {state === 'error' && (
        <p className="mt-3 text-sm font-bold text-down" role="alert">
          {t('saveError')}
        </p>
      )}
    </section>
  );
}
