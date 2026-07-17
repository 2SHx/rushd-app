import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lock,
  PlayCircle,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import PracticeLinks from '@/components/academy/PracticeLinks';
import { loadAcademy } from '@/components/academy/academyServer';

export default async function AcademyTrackPage({
  params,
}: {
  params: { locale: string; trackId: string };
}) {
  const t = await getTranslations('Academy');
  const academy = await loadAcademy();
  if (academy.state === 'error') throw new Error('academy_load_failed');

  const track = academy.tracks.find((item) => item.id === params.trackId);
  if (!track) notFound();

  const completed = new Set(
    academy.progress.filter((item) => item.status === 'COMPLETED').map((item) => item.lessonId),
  );
  const language = params.locale === 'ar' ? 'ar' : 'en';

  // Flatten all lessons across units in order for sequential Duolingo-style progression
  const allLessons = track.units.flatMap((unit) =>
    unit.lessons.map((lesson) => ({
      ...lesson,
      unitId: unit.id,
      unitTitle: unit.title[language],
    })),
  );

  const totalLessons = allLessons.length;
  const completedCount = allLessons.filter((l) => completed.has(l.id)).length;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Find the first uncompleted lesson as the active current step
  const activeLessonIndex = allLessons.findIndex((l) => !completed.has(l.id));
  const activeLesson = activeLessonIndex !== -1 ? allLessons[activeLessonIndex] : allLessons[0];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:px-6 md:pb-16 text-start">
      {/* Back Link */}
      <Link
        href={`/${params.locale}/academy`}
        className="inline-flex items-center gap-2 text-xs font-bold text-foreground/65 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        <span>{t('backToCatalog')}</span>
      </Link>

      {/* Track Header & Progress Banner */}
      <header className="relative mt-6 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-surface-card via-surface-card to-accent/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.07)] sm:p-8">
        <div className="absolute -end-16 -top-16 size-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" aria-hidden="true" />
        
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3.5 py-1 text-xs font-bold text-accent">
            <BookOpen className="size-3.5" aria-hidden="true" />
            {t('trackEyebrow')}
          </span>
          <span className="rounded-full bg-foreground/[0.06] px-3 py-1 font-mono text-xs font-bold text-foreground/75">
            {completedCount}/{totalLessons} {language === 'ar' ? 'دروس ممتلئة' : 'lessons completed'}
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-foreground rtl:tracking-normal sm:text-4xl">
          {track.title[language]}
        </h1>

        {/* Progress Bar */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-foreground/70">
            <span>{language === 'ar' ? 'مسار الإنجاز' : 'Journey Progress'}</span>
            <span className="font-mono text-accent tabular-nums">{progressPercent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out shadow-[0_0_12px_rgba(var(--accent-color-rgb),0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Start / Continue Button */}
        {activeLesson && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/[0.08] pt-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
                {language === 'ar' ? '👉 خطوتك الحالية' : '👉 Your Current Step'}
              </p>
              <p className="mt-1 text-base font-extrabold text-foreground">
                {activeLesson.title[language]}
              </p>
            </div>
            <Link
              href={`/${params.locale}/academy/${track.id}/${activeLesson.unitId}/${activeLesson.id}`}
              className="group inline-flex items-center gap-2 rounded-2xl border border-accent bg-accent px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all hover:scale-[1.02] hover:shadow-accent/40 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{completedCount === 0 ? (language === 'ar' ? 'ابدأ رحلة التعلم' : 'Start Journey') : (language === 'ar' ? 'واصل التعلم الان' : 'Continue Learning')}</span>
              <ArrowRight className="size-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        )}
      </header>

      {/* Units & Duolingo Path Journey */}
      <div className="mt-12 space-y-12">
        {track.units.map((unit, unitIndex) => {
          const unitCompleted = unit.lessons.every((l) => completed.has(l.id));

          return (
            <section
              key={unit.id}
              className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-surface-card p-6 shadow-sm sm:p-8"
            >
              {/* Unit Milestone Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/[0.08] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-accent" dir="ltr">
                      UNIT {unitIndex + 1}
                    </span>
                    {unitCompleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-up/10 px-2.5 py-0.5 text-[10px] font-extrabold text-up">
                        <CheckCircle2 className="size-3" />
                        {language === 'ar' ? 'مكتملة' : 'Completed'}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1.5 text-2xl font-extrabold text-foreground">
                    {unit.title[language]}
                  </h2>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-2 font-mono text-xs font-bold text-accent">
                  <Trophy className="size-4 text-accent" />
                  <span>+50 XP {language === 'ar' ? 'مكافأة الوحدة' : 'Bonus'}</span>
                </div>
              </div>

              {/* Duolingo Journey Nodes (Winding / Sequential Step Path) */}
              <div className="relative mt-8 px-2 sm:px-6">
                {/* Connecting Path Line */}
                <div
                  className="absolute bottom-6 top-6 start-8 sm:start-12 w-1 -translate-x-1/2 rounded-full bg-foreground/10 pointer-events-none"
                  aria-hidden="true"
                />

                <ol className="relative space-y-8" role="list">
                  {unit.lessons.map((lesson, lessonIndex) => {
                    const isDone = completed.has(lesson.id);
                    const globalIndex = allLessons.findIndex((l) => l.id === lesson.id);
                    const isCurrent = activeLessonIndex === globalIndex;
                    const isLocked = !isDone && !isCurrent && globalIndex > activeLessonIndex;

                    return (
                      <li key={lesson.id} className="relative flex items-start gap-4 sm:gap-6 group">
                        {/* Step Node Circle (Duolingo Icon Node) */}
                        <div
                          className={`relative z-10 flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border-2 font-mono font-extrabold shadow-sm transition-all duration-300 ${
                            isDone
                              ? 'border-up bg-up text-white shadow-up/20 ring-4 ring-up/10'
                              : isCurrent
                              ? 'border-accent bg-accent text-white shadow-accent/40 ring-4 ring-accent/25 animate-pulse'
                              : 'border-foreground/15 bg-background text-foreground/45'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="size-6 text-white" aria-hidden="true" />
                          ) : isCurrent ? (
                            <PlayCircle className="size-6 text-white" aria-hidden="true" />
                          ) : isLocked ? (
                            <Lock className="size-5 text-foreground/40" aria-hidden="true" />
                          ) : (
                            <span>{lessonIndex + 1}</span>
                          )}
                        </div>

                        {/* Step Card Content */}
                        <div
                          className={`flex-1 rounded-2xl border p-5 transition-all duration-200 ${
                            isCurrent
                              ? 'border-accent/40 bg-accent/[0.05] ring-2 ring-accent/20 shadow-md'
                              : isDone
                              ? 'border-up/30 bg-surface-card hover:border-up/60'
                              : 'border-foreground/10 bg-surface-card/60 opacity-75 hover:opacity-100 hover:border-foreground/20'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-accent" dir="ltr">
                                #{lessonIndex + 1}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                                  {language === 'ar' ? '⚡ ابدأ من هنا' : '⚡ Start Here'}
                                </span>
                              )}
                              {isDone && (
                                <span className="rounded-full bg-up/10 px-2.5 py-0.5 text-[10px] font-bold text-up">
                                  {language === 'ar' ? '✓ أكملت الدرس' : '✓ Finished'}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs font-bold tabular-nums text-accent">
                              ⚡ +20 XP
                            </span>
                          </div>

                          <h3 className="mt-2 text-lg font-bold text-foreground">
                            {lesson.title[language]}
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
                            {lesson.summary[language]}
                          </p>

                          <div className="mt-4 flex items-center justify-between pt-2">
                            <Link
                              href={`/${params.locale}/academy/${track.id}/${unit.id}/${lesson.id}`}
                              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 ${
                                isCurrent
                                  ? 'bg-accent text-white shadow-md shadow-accent/20 hover:scale-[1.02]'
                                  : isDone
                                  ? 'bg-foreground/[0.06] text-foreground hover:bg-foreground/10'
                                  : 'bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/10'
                              }`}
                            >
                              <span>
                                {isCurrent
                                  ? (language === 'ar' ? 'ابدأ الدرس الآن' : 'Start Lesson Now')
                                  : isDone
                                  ? (language === 'ar' ? 'مراجعة الدرس' : 'Review Lesson')
                                  : (language === 'ar' ? 'فتح الدرس' : 'Open Lesson')}
                              </span>
                              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Practice / Applied Quiz Section */}
              <PracticeLinks locale={params.locale} links={unit.practiceLinks} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
