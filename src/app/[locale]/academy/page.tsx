import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardList, Lock, Sparkles } from 'lucide-react';
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
  // DR-19: story order is presentation over this same recommender queue — never a new access rule.
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
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 md:pb-16 text-start">
      <header className="max-w-3xl text-start">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-foreground rtl:tracking-normal sm:text-4xl md:text-5xl">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/65 md:text-base">{t('subtitle')}</p>
      </header>

      <AcademyDiagnostic locale={language} questions={diagnosticQuestions} hasProfile={hasProfile} personaLabel={personaLabel} />

      {hasProfile ? (
        <>
          {/* Current Step Hero Card */}
          <section aria-labelledby="current-step-title" className="mt-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('hero.eyebrow')}</p>
            {!currentStep || !currentUnitEntry ? (
              <div className="mt-4"><AcademyState kind="empty" title={t('nextUp.emptyTitle')} body={t('nextUp.emptyBody')} /></div>
            ) : (
              <Link
                href={`/${params.locale}${queueItemHref(currentStep, currentUnitEntry)}`}
                className="group relative mt-4 block overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-surface-card via-surface-card to-accent/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.07)] transition-all duration-300 hover:border-accent/40 hover:shadow-[0_25px_70px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-9"
              >
                <div className="absolute -end-16 -top-16 size-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-2.5">
                  {currentTrack ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3.5 py-1 text-xs font-bold text-accent">
                      <BookOpen className="size-3.5" aria-hidden="true" />
                      {currentTrack.title[language]}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-foreground/[0.06] px-3.5 py-1 text-xs font-semibold text-foreground/75">
                    {t(`nextUp.reason.${currentStep.reason}`)}
                  </span>
                  <span className="ms-auto rounded-full bg-up/10 px-3 py-1 font-mono text-xs font-bold tabular-nums text-up">
                    ⚡ +20 XP
                  </span>
                </div>

                <h2 id="current-step-title" className="mt-5 text-2xl font-extrabold leading-tight text-foreground transition-colors duration-200 group-hover:text-accent sm:text-3xl">
                  {queueItemTitle(currentStep, currentUnitEntry)}
                </h2>

                <p className="mt-2 text-xs font-semibold text-foreground/50">
                  {currentUnitEntry.unit.title[language]}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2.5 rounded-2xl bg-accent px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-accent/40">
                    {t('hero.cta')}
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            )}
          </section>

          {/* Ahead Queue Grid */}
          {ahead.length > 0 ? (
            <section aria-labelledby="ahead-title" className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 id="ahead-title" className="text-lg font-bold text-foreground">{t('ahead.title')}</h2>
                  <p className="mt-0.5 text-xs text-foreground/60">{t('ahead.subtitle')}</p>
                </div>
                <span className="rounded-full bg-foreground/[0.05] px-3 py-1 text-xs font-semibold text-foreground/60">
                  {ahead.length} {language === 'ar' ? 'دروس قادمة' : 'upcoming'}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ahead.map((item, index) => {
                  const unitEntry = unitById.get(`${item.trackId}::${item.unitId}`);
                  if (!unitEntry) return null;
                  const title = unitEntry.lessonTitles.get(item.lessonId)?.[language] ?? unitEntry.unit.title[language];
                  return (
                    <div
                      key={`${item.reason}-${item.trackId}-${item.unitId}-${item.lessonId}-${index}`}
                      className="group relative flex flex-col justify-between rounded-2xl border border-foreground/10 bg-surface-card p-5 shadow-sm transition-all duration-200 hover:border-foreground/20 hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-accent" dir="ltr">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                            {t(`nextUp.reason.${item.reason}`)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-sm font-bold leading-snug text-foreground">
                          {title}
                        </h3>
                        <p className="mt-1 text-[11px] font-medium text-foreground/50">
                          {unitEntry.unit.title[language]}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-foreground/[0.06] pt-3 text-[11px] text-foreground/45">
                        <span className="flex items-center gap-1.5">
                          <Lock className="size-3.5 text-foreground/35" aria-hidden="true" />
                          {language === 'ar' ? 'مُقفل مؤقتاً' : 'Locked'}
                        </span>
                        <span className="text-[10px] font-semibold text-accent/80">
                          {language === 'ar' ? 'يتطلب إكمال الخطوة السابقة' : 'Requires step 1'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Chapters / Tracks Accordions */}
          <section aria-labelledby="chapters-title" className="mt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="chapters-title" className="text-xl font-bold text-foreground">{t('chapters.title')}</h2>
                <p className="mt-0.5 text-xs text-foreground/60">{t('chapters.subtitle')}</p>
              </div>
            </div>

            {academy.tracks.length === 0 ? (
              <div className="mt-4">
                <AcademyState kind="empty" title={t('emptyTitle')} body={t('emptyBody')} />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {academy.tracks.map((track) => {
                  const lessons = track.units.flatMap((unit) => unit.lessons);
                  const done = lessons.filter((lesson) => completed.has(lesson.id)).length;
                  const isRecommended = track.id === currentTrackId;

                  return (
                    <details
                      key={track.id}
                      open={track.id === currentTrackId}
                      className={`group rounded-3xl border transition-all duration-200 shadow-sm ${
                        isRecommended
                          ? 'border-accent/30 bg-surface-card ring-1 ring-accent/15'
                          : 'border-foreground/10 bg-surface-card hover:border-foreground/20'
                      }`}
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-3xl p-5 sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                            isRecommended ? 'bg-accent text-white shadow-sm' : 'bg-accent/10 text-accent'
                          }`}>
                            <BookOpen className="size-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-base font-bold text-foreground">{track.title[language]}</span>
                              {isRecommended && (
                                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-extrabold text-accent">
                                  {language === 'ar' ? '✨ موصى به لمستواك' : '✨ Recommended'}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-foreground/50">
                              {t('trackMeta', { units: track.units.length, lessons: lessons.length })}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-4 text-xs font-semibold text-foreground/60">
                          <span className="font-mono tabular-nums text-accent">
                            {t('progress', { completed: done, total: lessons.length })}
                          </span>
                          {done === lessons.length && (
                            <CheckCircle2 className="size-4 shrink-0 text-up" aria-label={t('completed')} />
                          )}
                          <ChevronDown className="size-4 shrink-0 text-foreground/40 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                        </div>
                      </summary>

                      <div className="border-t border-foreground/[0.06] px-5 py-5 sm:px-6">
                        <div className="h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                          <div
                            className="h-full rounded-full bg-accent transition-all duration-300"
                            style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            {track.units.map((u) => (
                              <span key={u.id} className="rounded-xl bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-medium text-foreground/65">
                                {u.title[language]}
                              </span>
                            ))}
                          </div>
                          <Link
                            href={`/${params.locale}/academy/${track.id}`}
                            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {t('chapters.open')}
                            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
