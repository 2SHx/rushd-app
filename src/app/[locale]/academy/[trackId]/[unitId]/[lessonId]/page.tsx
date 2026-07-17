import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import AcademyCheckpoint from '@/components/academy/AcademyCheckpoint';
import PracticeLinks from '@/components/academy/PracticeLinks';
import { loadAcademy } from '@/components/academy/academyServer';

export default async function AcademyLessonPage({ params }: { params: { locale: string; trackId: string; unitId: string; lessonId: string } }) {
  const t = await getTranslations('Academy'); const academy = await loadAcademy();
  if (academy.state === 'error') throw new Error('academy_load_failed');
  const track = academy.tracks.find((item) => item.id === params.trackId); const unit = track?.units.find((item) => item.id === params.unitId); const lesson = unit?.lessons.find((item) => item.id === params.lessonId); if (!track || !unit || !lesson) notFound();
  const language = params.locale === 'ar' ? 'ar' : 'en'; const completed = academy.progress.some((item) => item.lessonId === lesson.id && item.status === 'COMPLETED');
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6 md:pb-16"><Link href={`/${params.locale}/academy/${track.id}`} className="text-sm text-foreground/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('backToTrack')}</Link><article className="mt-8 text-start"><div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/65 rtl:tracking-normal"><span>{unit.title[language]}</span><span aria-hidden="true">·</span><span>{t(`compliance.${lesson.complianceTag}`)}</span></div><h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">{lesson.title[language]}</h1><p className="mt-4 text-lg leading-8 text-foreground/65">{lesson.summary[language]}</p><div className="mt-10 whitespace-pre-line text-base leading-8 text-foreground/85 sm:text-lg sm:leading-9">{lesson.body[language]}</div></article><AcademyCheckpoint trackId={track.id} unitId={unit.id} lesson={lesson} locale={language} completed={completed} /><PracticeLinks locale={params.locale} links={unit.practiceLinks} /></main>;
}
