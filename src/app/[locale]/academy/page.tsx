import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardList } from 'lucide-react';
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
  // DR-19: story order is presentation over this same recommender queue — never a new access rule.
  const queue = nextUp(queueProfile, progressEntries, accessibleLessons).queue.slice(0, MAX_QUEUE_ITEMS);
  const [currentStep, ...ahead] = queue;
  const currentTrackId = currentStep?.trackId;

  function queueItemHref(item: (typeof queue)[number], unitEntry: NonNullable<ReturnType<typeof unitById.get>>) {
    if (item.reason !== 'practice') return `/${params.locale}/academy/${item.trackId}/${item.unitId}/${item.lessonId}`;
    const primary = unitEntry.unit.practiceLinks[0];
    let href = practiceLinkHref(primary);
    if (primary.kind !== 'strategySetup') {
      const setupLink = unitEntry.unit.practiceLinks.find((link) => link.kind === 'strategySetup');
      if (setupLink) href += `&apply=${encodeURIComponent(setupLink.setupId)}`;
    }
    return href;
  }
  function queueItemTitle(item: (typeof queue)[number], unitEntry: NonNullable<ReturnType<typeof unitById.get>>) {
    return item.reason === 'practice' ? unitEntry.unit.title[language] : unitEntry.lessonTitles.get(item.lessonId)?.[language] ?? unitEntry.unit.title[language];
  }

  const currentUnitEntry = currentStep ? unitById.get(`${currentStep.trackId}::${currentStep.unitId}`) : undefined;
  const currentTrack = currentStep ? academy.tracks.find((track) => track.id === currentStep.trackId) : undefined;

  return <main className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 md:pb-16"><header className="max-w-3xl text-start"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] rtl:tracking-normal sm:text-5xl">{t('title')}</h1><p className="mt-4 text-base leading-8 text-foreground/60">{t('subtitle')}</p></header>
    <AcademyDiagnostic locale={language} questions={diagnosticQuestions} hasProfile={hasProfile} personaLabel={personaLabel} />

    {hasProfile ? <>
      <section aria-labelledby="current-step-title" className="mt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('hero.eyebrow')}</p>
        {!currentStep || !currentUnitEntry ? <div className="mt-4"><AcademyState kind="empty" title={t('nextUp.emptyTitle')} body={t('nextUp.emptyBody')} /></div> : <Link href={`/${params.locale}${queueItemHref(currentStep, currentUnitEntry)}`} className="group mt-4 flex flex-col gap-6 rounded-3xl bg-foreground/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none sm:p-9">
          <div className="flex flex-wrap items-center gap-3">
            {currentTrack ? <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{currentTrack.title[language]}</span> : null}
            <span className="rounded-full bg-foreground/[0.06] px-3 py-1 text-xs font-semibold text-foreground/65">{t(`nextUp.reason.${currentStep.reason}`)}</span>
          </div>
          <h2 id="current-step-title" className="text-2xl font-semibold leading-tight sm:text-3xl">{queueItemTitle(currentStep, currentUnitEntry)}</h2>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none">
            {t('hero.cta')}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </span>
        </Link>}
      </section>

      {ahead.length > 0 ? <section aria-labelledby="ahead-title" className="mt-10">
        <h2 id="ahead-title" className="text-sm font-semibold text-foreground/70">{t('ahead.title')}</h2>
        <p className="mt-1 text-xs text-foreground/50">{t('ahead.subtitle')}</p>
        <ol className="relative mt-5 space-y-3 ps-6 before:absolute before:bottom-4 before:start-[7px] before:top-4 before:w-px before:bg-foreground/10">
          {ahead.map((item, index) => {
            const unitEntry = unitById.get(`${item.trackId}::${item.unitId}`);
            if (!unitEntry) return null;
            return <li key={`${item.reason}-${item.trackId}-${item.unitId}-${item.lessonId}-${index}`} className="relative">
              <span className="absolute -start-6 top-1.5 grid size-3.5 place-items-center rounded-full bg-foreground/20" aria-hidden="true" />
              <div className="flex items-center justify-between gap-4 rounded-xl px-3 py-2 text-start text-sm text-foreground/55">
                <span className="flex min-w-0 items-center gap-2"><ClipboardList className="size-3.5 shrink-0 text-foreground/35" aria-hidden="true" /><span className="min-w-0 truncate">{unitEntry.lessonTitles.get(item.lessonId)?.[language] ?? unitEntry.unit.title[language]}</span></span>
                <span className="shrink-0 text-xs text-foreground/40">{t(`nextUp.reason.${item.reason}`)}</span>
              </div>
            </li>;
          })}
        </ol>
      </section> : null}

      <section aria-labelledby="chapters-title" className="mt-12">
        <h2 id="chapters-title" className="text-lg font-semibold">{t('chapters.title')}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t('chapters.subtitle')}</p>
        {academy.tracks.length === 0 ? <div className="mt-4"><AcademyState kind="empty" title={t('emptyTitle')} body={t('emptyBody')} /></div> : <div className="mt-5 space-y-3">{academy.tracks.map((track) => {
          const lessons = track.units.flatMap((unit) => unit.lessons);
          const done = lessons.filter((lesson) => completed.has(lesson.id)).length;
          return <details key={track.id} open={track.id === currentTrackId} className="group rounded-2xl bg-foreground/[0.035] shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="flex min-w-0 items-center gap-3"><BookOpen className="size-4 shrink-0 text-accent" aria-hidden="true" /><span className="min-w-0 truncate font-semibold">{track.title[language]}</span></span>
              <span className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-foreground/60">
                <span>{t('trackMeta', { units: track.units.length, lessons: lessons.length })}</span>
                <span>{t('progress', { completed: done, total: lessons.length })}</span>
                {done === lessons.length && <CheckCircle2 className="size-4 shrink-0 text-up" aria-label={t('completed')} />}
                <ChevronDown className="size-4 shrink-0 text-foreground/40 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </span>
            </summary>
            <div className="border-t border-foreground/[0.06] px-5 py-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} /></div>
              <Link href={`/${params.locale}/academy/${track.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('chapters.open')}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Link>
            </div>
          </details>;
        })}</div>}
      </section>
    </> : null}
  </main>;
}
