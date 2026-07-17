'use client';

import { useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Lesson } from '@/academy/registry';

export default function AcademyCheckpoint({ trackId, unitId, lesson, locale, completed }: { trackId: string; unitId: string; lesson: Lesson; locale: 'en' | 'ar'; completed: boolean }) {
  const t = useTranslations('Academy');
  const router = useRouter();
  const [answer, setAnswer] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(completed ? 'saved' : 'idle');
  const text = (value: { en: string; ar: string }) => value[locale];
  async function submit() {
    if (answer === null) return;
    setState('saving');
    try {
      const response = await fetch('/api/academy/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId, unitId, lessonId: lesson.id, contentVersion: lesson.contentVersion, answers: { [lesson.checkpoint.id]: answer } }) });
      if (!response.ok) throw new Error('academy_progress_not_saved');
      setState('saved'); router.refresh();
    } catch { setState('error'); }
  }
  return <section className="mt-10 rounded-3xl bg-foreground/[0.035] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] sm:p-7" aria-labelledby="checkpoint-title">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('checkpointEyebrow')}</p>
    <h2 id="checkpoint-title" className="mt-3 text-xl font-semibold leading-8">{text(lesson.checkpoint.question)}</h2>
    <fieldset className="mt-6 space-y-3" disabled={state === 'saving' || state === 'saved'}><legend className="sr-only">{t('answerLegend')}</legend>{lesson.checkpoint.options.map((option, index) => <label key={option.en} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-background/60 px-4 py-3 text-sm leading-7 ring-1 ring-foreground/[0.07] transition-colors has-[:checked]:bg-accent/[0.08] has-[:checked]:ring-accent/40 focus-within:ring-2 focus-within:ring-accent"><input type="radio" name="academy-answer" className="mt-1.5 accent-current" checked={answer === index} onChange={() => setAnswer(index)} /><span>{text(option)}</span></label>)}</fieldset>
    {state === 'saved' ? <div className="mt-5 flex items-start gap-3 rounded-2xl bg-up/10 p-4 text-sm leading-7" role="status"><CheckCircle2 className="mt-1 size-4 shrink-0 text-up" aria-hidden="true" /><div><p className="font-semibold">{t('completeTitle')}</p>{answer !== null && <p className="text-foreground/65">{text(lesson.checkpoint.explanation)}</p>}</div></div> : <button type="button" onClick={submit} disabled={answer === null || state === 'saving'} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">{state === 'saving' && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{t(state === 'saving' ? 'saving' : 'submitAnswer')}</button>}
    {state === 'error' && <p className="mt-3 text-sm text-down" role="alert">{t('saveError')}</p>}
  </section>;
}
