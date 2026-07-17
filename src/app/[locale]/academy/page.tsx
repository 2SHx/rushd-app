import { BookOpen, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AcademyState } from '@/components/academy/AcademyState';
import { loadAcademy } from '@/components/academy/academyServer';

export default async function AcademyPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('Academy'); const academy = await loadAcademy();
  if (academy.state === 'error') throw new Error('academy_load_failed');
  const completed = new Set(academy.progress.filter((item) => item.status === 'COMPLETED').map((item) => item.lessonId));
  return <main className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 md:pb-16"><header className="max-w-3xl text-start"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] rtl:tracking-normal sm:text-5xl">{t('title')}</h1><p className="mt-4 text-base leading-8 text-foreground/60">{t('subtitle')}</p></header>
    {academy.tracks.length === 0 ? <AcademyState kind="empty" title={t('emptyTitle')} body={t('emptyBody')} /> : <div className="mt-12 grid gap-5 lg:grid-cols-3">{academy.tracks.map((track) => { const lessons = track.units.flatMap((unit) => unit.lessons); const done = lessons.filter((lesson) => completed.has(lesson.id)).length; return <Link key={track.id} href={`/${params.locale}/academy/${track.id}`} className="group rounded-3xl bg-foreground/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none"><BookOpen className="size-5 text-accent" aria-hidden="true" /><h2 className="mt-8 text-2xl font-semibold">{track.title[params.locale === 'ar' ? 'ar' : 'en']}</h2><p className="mt-2 text-sm text-foreground/65">{t('trackMeta', { units: track.units.length, lessons: lessons.length })}</p><div className="mt-8 flex items-center justify-between gap-4 text-xs text-foreground/65"><span>{t('progress', { completed: done, total: lessons.length })}</span>{done === lessons.length && <CheckCircle2 className="size-4 text-up" aria-label={t('completed')} />}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} /></div></Link>; })}</div>}
  </main>;
}
