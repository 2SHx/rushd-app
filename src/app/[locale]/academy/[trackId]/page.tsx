import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PracticeLinks from '@/components/academy/PracticeLinks';
import { loadAcademy } from '@/components/academy/academyServer';

export default async function AcademyTrackPage({ params }: { params: { locale: string; trackId: string } }) {
  const t = await getTranslations('Academy'); const academy = await loadAcademy();
  if (academy.state === 'error') throw new Error('academy_load_failed');
  const track = academy.tracks.find((item) => item.id === params.trackId); if (!track) notFound();
  const completed = new Set(academy.progress.filter((item) => item.status === 'COMPLETED').map((item) => item.lessonId)); const language = params.locale === 'ar' ? 'ar' : 'en';
  return <main className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6 md:pb-16"><Link href={`/${params.locale}/academy`} className="text-sm text-foreground/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('backToCatalog')}</Link><header className="mt-8 text-start"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('trackEyebrow')}</p><h1 className="mt-3 text-4xl font-semibold">{track.title[language]}</h1></header><div className="mt-10 space-y-10">{track.units.map((unit, unitIndex) => <section key={unit.id} className="rounded-3xl bg-foreground/[0.035] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] sm:p-7"><p className="text-xs tabular-nums text-foreground/65">{t('unitNumber', { number: unitIndex + 1 })}</p><h2 className="mt-2 text-2xl font-semibold">{unit.title[language]}</h2><ol className="mt-6 space-y-2">{unit.lessons.map((lesson) => <li key={lesson.id}><Link href={`/${params.locale}/academy/${track.id}/${unit.id}/${lesson.id}`} className="flex items-center justify-between gap-4 rounded-2xl bg-background/60 px-4 py-4 text-start transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span><span className="font-semibold">{lesson.title[language]}</span><span className="mt-1 block text-xs leading-6 text-foreground/65">{lesson.summary[language]}</span></span>{completed.has(lesson.id) && <CheckCircle2 className="size-4 shrink-0 text-up" aria-label={t('completed')} />}</Link></li>)}</ol><PracticeLinks locale={params.locale} links={unit.practiceLinks} /></section>)}</div></main>;
}
