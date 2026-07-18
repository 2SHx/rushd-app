import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, PlayCircle, Sparkles } from 'lucide-react';
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
// Mirrors LESSON_COMPLETION_XP in src/app/api/academy/progress/route.ts — kept as a UI-only constant, not a cross-module import
// (that file is a route handler; no shared academy constants module exists yet to import from instead).
const LESSON_XP = 20;

/**
 * Fixed-width icon column shared by every node on the path (start/current/upcoming/waypoint).
 * The circle is packed to the top of the column (default flex-col start alignment) and an
 * opaque background sits behind it so translucent tinted circles never let the connector show
 * through; the connector itself is a flex-col sibling that fills the rest of the column's height
 * (which stretches to match the li's content) and bleeds a negative margin into the next li's
 * gap, so it's naturally absent for the last node — no dangling line past the final waypoint.
 * No transform/translate is used anywhere, so RTL just mirrors for free.
 */
function NodeSlot({ children, showConnector = true }: { children: React.ReactNode; showConnector?: boolean }) {
  return (
    <div className="relative z-10 flex w-12 shrink-0 flex-col items-center sm:w-14">
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-full bg-background" aria-hidden="true" />
        <div className="relative">{children}</div>
      </div>
      {showConnector ? <div className="-mb-6 w-0.5 flex-1 rounded-full bg-gradient-to-b from-accent/35 to-foreground/10 sm:-mb-7" aria-hidden="true" /> : null}
    </div>
  );
}

export default async function AcademyPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('Academy');
  const academy = await loadAcademy();
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
  // DR-19: the journey path is presentation over this same recommender queue — never a new access rule.
  const queue = nextUp(queueProfile, progressEntries, accessibleLessons).queue.slice(0, MAX_QUEUE_ITEMS);
  const [currentStep, ...ahead] = queue;
  const currentTrackId = currentStep?.trackId;

  function queueItemHref(item: (typeof queue)[number], unitEntry: NonNullable<ReturnType<typeof unitById.get>>) {
    if (item.reason !== 'practice') return `/academy/${item.trackId}/${item.unitId}/${item.lessonId}`;
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

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6 md:pb-16 text-start">
      <header className="max-w-3xl text-start">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-foreground rtl:tracking-normal sm:text-4xl md:text-5xl">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/65 md:text-base">{t('subtitle')}</p>
      </header>

      <AcademyDiagnostic locale={language} questions={diagnosticQuestions} hasProfile={hasProfile} personaLabel={personaLabel} />

      {hasProfile ? (
        !currentStep || !currentUnitEntry ? (
          <div className="mt-10"><AcademyState kind="empty" title={t('nextUp.emptyTitle')} body={t('nextUp.emptyBody')} /></div>
        ) : (
          <section aria-labelledby="journey-title" className="mt-10">
            <h2 id="journey-title" className="text-lg font-bold text-foreground">{t('journey.title')}</h2>
            <p className="mt-1 text-xs text-foreground/60">{t('journey.subtitle')}</p>

            <ol className="mt-6 space-y-6 sm:space-y-7">
              {/* Starting-point marker */}
              <li className="flex gap-4 sm:gap-5">
                <NodeSlot>
                  <div className="flex size-9 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-accent sm:size-10">
                    <Sparkles className="size-4" aria-hidden="true" />
                  </div>
                </NodeSlot>
                <div className="min-w-0 flex-1 pt-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/60 rtl:tracking-normal">{t('journey.startLabel')}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground/80">{personaLabel}</p>
                </div>
              </li>

              {/* Current step — the one loud node on the path */}
              <li className="flex gap-4 sm:gap-6">
                <NodeSlot>
                  <div className="flex size-12 animate-pulse items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 ring-4 ring-accent/20 motion-reduce:animate-none sm:size-14">
                    <PlayCircle className="size-6" aria-hidden="true" />
                  </div>
                </NodeSlot>
                <Link
                  href={`/${params.locale}${queueItemHref(currentStep, currentUnitEntry)}`}
                  className="group relative block flex-1 overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-surface-card via-surface-card to-accent/5 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.07)] transition-all duration-300 hover:border-accent/40 hover:shadow-[0_25px_70px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-7"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('hero.eyebrow')}</span>
                    {currentTrack ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                        <BookOpen className="size-3.5" aria-hidden="true" />
                        {currentTrack.title[language]}
                      </span>
                    ) : null}
                    <span className="ms-auto rounded-full bg-up/10 px-3 py-1 font-mono text-xs font-bold tabular-nums text-up">
                      {t('journey.xpBadge', { xp: LESSON_XP })}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-extrabold leading-tight text-foreground transition-colors duration-200 group-hover:text-accent sm:text-2xl">
                    {queueItemTitle(currentStep, currentUnitEntry)}
                  </h3>
                  <p className="mt-1.5 text-xs font-semibold text-foreground/50">{currentUnitEntry.unit.title[language]}</p>
                  <span className="mt-5 inline-flex items-center gap-2.5 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-accent/40 motion-reduce:transform-none">
                    {t('hero.cta')}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </span>
                </Link>
              </li>

              {/* Upcoming — muted, receding nodes on the same path (a glimpse, not a menu) */}
              {ahead.map((item, index) => {
                const unitEntry = unitById.get(`${item.trackId}::${item.unitId}`);
                if (!unitEntry) return null;
                const title = unitEntry.lessonTitles.get(item.lessonId)?.[language] ?? unitEntry.unit.title[language];
                return (
                  <li key={`${item.reason}-${item.trackId}-${item.unitId}-${item.lessonId}-${index}`} className="flex gap-4 sm:gap-6">
                    <NodeSlot>
                      <div className="flex size-9 items-center justify-center rounded-full border border-foreground/15 bg-background font-mono text-xs font-bold text-foreground/60 sm:size-10">
                        {index + 2}
                      </div>
                    </NodeSlot>
                    <div className="min-w-0 flex-1 rounded-2xl border border-foreground/10 bg-surface-card/60 px-4 py-3 sm:px-5 sm:py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground/70">{title}</span>
                        <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-foreground/55">{t(`nextUp.reason.${item.reason}`)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-foreground/60">{unitEntry.unit.title[language]}</p>
                    </div>
                  </li>
                );
              })}

              {/* Chapters — bigger waypoints continuing the same path; collapsed by default, link out to the full roadmap */}
              {academy.tracks.length === 0 ? (
                <li className="flex gap-4 sm:gap-6">
                  <NodeSlot showConnector={false}>
                    <div className="flex size-10 items-center justify-center rounded-full border border-foreground/15 bg-background text-foreground/35 sm:size-12">
                      <BookOpen className="size-4" aria-hidden="true" />
                    </div>
                  </NodeSlot>
                  <div className="min-w-0 flex-1"><AcademyState kind="empty" title={t('emptyTitle')} body={t('emptyBody')} /></div>
                </li>
              ) : academy.tracks.map((track, trackIndex) => {
                const lessons = track.units.flatMap((unit) => unit.lessons);
                const done = lessons.filter((lesson) => completed.has(lesson.id)).length;
                const isRecommended = track.id === currentTrackId;
                const isLast = trackIndex === academy.tracks.length - 1;
                return (
                  <li key={track.id} className="flex gap-4 sm:gap-6">
                    <NodeSlot showConnector={!isLast}>
                      <div className="flex size-10 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent sm:size-12">
                        <BookOpen className="size-4 sm:size-5" aria-hidden="true" />
                      </div>
                    </NodeSlot>
                    <details open={isRecommended} className={`group min-w-0 flex-1 rounded-2xl border shadow-sm transition-colors duration-200 ${isRecommended ? 'border-accent/30 bg-surface-card ring-1 ring-accent/15' : 'border-foreground/10 bg-surface-card hover:border-foreground/20'}`}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-5">
                        <div className="min-w-0">
                          {trackIndex === 0 ? <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/60 rtl:tracking-normal">{t('chapters.title')}</p> : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-bold text-foreground">{track.title[language]}</span>
                            {isRecommended && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">{t('chapters.recommended')}</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-foreground/50">{t('trackMeta', { units: track.units.length, lessons: lessons.length })}</p>
                        </div>
                        <div className="flex min-w-0 shrink-0 items-center gap-3 text-xs font-semibold text-foreground/60">
                          <span className="font-mono tabular-nums text-accent">{t('progress', { completed: done, total: lessons.length })}</span>
                          {done === lessons.length && <CheckCircle2 className="size-4 shrink-0 text-up" aria-label={t('completed')} />}
                          <ChevronDown className="size-4 shrink-0 text-foreground/40 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                        </div>
                      </summary>
                      <div className="border-t border-foreground/[0.06] px-4 py-4 sm:px-5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} />
                        </div>
                        <Link
                          href={`/${params.locale}/academy/${track.id}`}
                          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent/30 bg-transparent px-4 py-2.5 text-xs font-bold text-accent transition-colors duration-150 ease-out hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {t('chapters.open')}
                          <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                        </Link>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>
        )
      ) : null}
    </main>
  );
}
