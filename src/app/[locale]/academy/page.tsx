import { BookOpen, CheckCircle2, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { diagnosticQuestions, defaultProfile, type DiagnosticProfile } from '@/academy/diagnostic';
import { nextUp, type Lesson as AdaptiveLesson, type ProgressEntry } from '@/academy/adaptive';
import AcademyDiagnostic from '@/components/academy/AcademyDiagnostic';
import { AcademyState } from '@/components/academy/AcademyState';
import { practiceLinkHref } from '@/components/academy/academyAccess';
import { loadAcademy, loadLearnerProfile } from '@/components/academy/academyServer';

const MAX_QUEUE_ITEMS = 5;
const PERSONAS_FALLBACK = ['CURIOUS_KID', 'TEEN_SAVER', 'ADULT_BEGINNER', 'ADULT_PRACTITIONER', 'QUANT_CANDIDATE'] as const;

export default async function AcademyPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('Academy'); const academy = await loadAcademy();
  if (academy.state === 'error') throw new Error('academy_load_failed');
  const language = params.locale === 'ar' ? 'ar' : 'en';
  const completed = new Set(academy.progress.filter((item) => item.status === 'COMPLETED').map((item) => item.lessonId));
  const learnerProfile = await loadLearnerProfile();
  const hasProfile = learnerProfile !== null;
  const queueProfile: DiagnosticProfile = learnerProfile
    ? { persona: (PERSONAS_FALLBACK as readonly string[]).includes(learnerProfile.persona) ? (learnerProfile.persona as DiagnosticProfile['persona']) : 'ADULT_BEGINNER', baselineKnowledge: 0, skillLevel: learnerProfile.skillLevel, profileVersion: 1 }
    : defaultProfile({ isChild: academy.isChild });
  const personaLabel = hasProfile ? t(`diagnostic.personas.${queueProfile.persona}`) : null;

  const unitById = new Map<string, { trackId: string; unit: (typeof academy.tracks)[number]['units'][number]; lessonTitles: Map<string, { en: string; ar: string }> }>();
  const accessibleLessons: AdaptiveLesson[] = [];
  for (const track of academy.tracks) {
    for (const unit of track.units) {
      const unitKey = `${track.id}::${unit.id}`;
      unitById.set(unitKey, { trackId: track.id, unit, lessonTitles: new Map(unit.lessons.map((lesson) => [lesson.id, lesson.title])) });
      for (const lesson of unit.lessons) {
        accessibleLessons.push({ trackId: track.id, unitId: unit.id, lessonId: lesson.id, practiceLinkId: `${unit.id}-practice` });
      }
    }
  }
  const progressEntries: ProgressEntry[] = academy.progress.map((item) => ({ trackId: item.trackId, unitId: item.unitId, lessonId: item.lessonId, status: item.status as ProgressEntry['status'], score: item.score ?? undefined }));
  const queue = nextUp(queueProfile, progressEntries, accessibleLessons).queue.slice(0, MAX_QUEUE_ITEMS);

  return <main className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 md:pb-16"><header className="max-w-3xl text-start"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] rtl:tracking-normal sm:text-5xl">{t('title')}</h1><p className="mt-4 text-base leading-8 text-foreground/60">{t('subtitle')}</p></header>
    <AcademyDiagnostic locale={language} questions={diagnosticQuestions} hasProfile={hasProfile} personaLabel={personaLabel} />
    <section aria-labelledby="next-up-title" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="next-up-title" className="text-lg font-semibold">{t('nextUp.title')}</h2>
      </div>
      <p className="mt-1 text-sm text-foreground/60">{t('nextUp.subtitle')}</p>
      {queue.length === 0 ? <div className="mt-4"><AcademyState kind="empty" title={t('nextUp.emptyTitle')} body={t('nextUp.emptyBody')} /></div> : <ol className="mt-4 space-y-2">{queue.map((item, index) => {
        const unitEntry = unitById.get(`${item.trackId}::${item.unitId}`);
        if (!unitEntry) return null;
        const isPractice = item.reason === 'practice';
        const href = isPractice ? practiceLinkHref(unitEntry.unit.practiceLinks[0]) : `/${params.locale}/academy/${item.trackId}/${item.unitId}/${item.lessonId}`;
        const title = isPractice ? unitEntry.unit.title[language] : unitEntry.lessonTitles.get(item.lessonId)?.[language] ?? unitEntry.unit.title[language];
        return <li key={`${item.reason}-${item.trackId}-${item.unitId}-${item.lessonId}-${index}`}>
          <Link href={href} className="flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.035] px-5 py-4 text-start shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-colors duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="flex min-w-0 items-center gap-3"><ClipboardList className="size-4 shrink-0 text-accent" aria-hidden="true" /><span className="min-w-0 break-words font-semibold">{title}</span></span>
            <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{t(`nextUp.reason.${item.reason}`)}</span>
          </Link>
        </li>;
      })}</ol>}
    </section>
    {academy.tracks.length === 0 ? <AcademyState kind="empty" title={t('emptyTitle')} body={t('emptyBody')} /> : <div className="mt-12 grid gap-5 lg:grid-cols-3">{academy.tracks.map((track) => { const lessons = track.units.flatMap((unit) => unit.lessons); const done = lessons.filter((lesson) => completed.has(lesson.id)).length; return <Link key={track.id} href={`/${params.locale}/academy/${track.id}`} className="group rounded-3xl bg-foreground/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none"><BookOpen className="size-5 text-accent" aria-hidden="true" /><h2 className="mt-8 text-2xl font-semibold">{track.title[params.locale === 'ar' ? 'ar' : 'en']}</h2><p className="mt-2 text-sm text-foreground/65">{t('trackMeta', { units: track.units.length, lessons: lessons.length })}</p><div className="mt-8 flex items-center justify-between gap-4 text-xs text-foreground/65"><span>{t('progress', { completed: done, total: lessons.length })}</span>{done === lessons.length && <CheckCircle2 className="size-4 text-up" aria-label={t('completed')} />}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} /></div></Link>; })}</div>}
  </main>;
}
