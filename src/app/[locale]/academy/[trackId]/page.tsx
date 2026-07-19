import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lock,
  PlayCircle,
  Sparkles,
  Trophy,
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
            {completedCount}/{totalLessons} {language === 'ar' ? 'دروس مكتملة' : 'lessons completed'}
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-foreground rtl:tracking-normal sm:text-4xl">
          {track.title[language]}
        </h1>

        {/* Progress Bar */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-foreground/70">
            <span>{language === 'ar' ? 'مسار الإنجاز في الفصل' : 'Chapter Progress'}</span>
            <span className="font-mono text-accent tabular-nums">{progressPercent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out shadow-[0_0_12px_rgba(var(--accent-color-rgb),0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Start / Continue Hero CTA */}
        {activeLesson && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/[0.08] pt-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">
                {language === 'ar' ? '👉 ابدأ من هذه الخطوة الان' : '👉 Start Here Now'}
              </p>
              <p className="mt-1 text-base font-extrabold text-foreground">
                {activeLesson.title[language]}
              </p>
            </div>
            <Link
              href={`/${params.locale}/academy/${track.id}/${activeLesson.unitId}/${activeLesson.id}`}
              className="group inline-flex items-center gap-2 rounded-2xl border border-accent bg-accent px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all hover:scale-[1.02] hover:shadow-accent/40 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{completedCount === 0 ? (language === 'ar' ? 'ابدأ رحلة الفصل الان' : 'Start Chapter') : (language === 'ar' ? 'متابعة التعلم الان' : 'Continue Learning')}</span>
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
                        {language === 'ar' ? 'مكتملة بالكامل' : 'Completed'}
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
              <div className="relative mt-8 px-2 sm:px-4">
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
                          ) : (
                            <span className="text-foreground/75">{lessonIndex + 1}</span>
                          )}
                        </div>

                        {/* Highly Clickable Interactive Step Card */}
                        <Link
                          href={`/${params.locale}/academy/${track.id}/${unit.id}/${lesson.id}`}
                          className={`group/card flex-1 block rounded-2xl border-2 p-5 sm:p-6 transition-all duration-300 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            isCurrent
                              ? 'border-accent bg-accent/[0.07] ring-4 ring-accent/15 shadow-lg shadow-accent/10'
                              : isDone
                              ? 'border-up/40 bg-surface-card hover:border-up hover:shadow-md'
                              : 'border-accent/25 bg-surface-card hover:border-accent hover:shadow-md'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-extrabold text-accent">
                                {language === 'ar' ? `الدرس #${lessonIndex + 1}` : `Lesson #${lessonIndex + 1}`}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold text-white shadow-md animate-pulse">
                                  {language === 'ar' ? '⚡ الخطوة الحالية - ابدأ من هنا' : '⚡ Current Step - Start Here'}
                                </span>
                              )}
                              {isDone && (
                                <span className="rounded-full bg-up/15 border border-up/30 px-3 py-1 text-[10px] font-extrabold text-up">
                                  {language === 'ar' ? '✓ أكملت الدرس (+20 XP)' : '✓ Completed (+20 XP)'}
                                </span>
                              )}
                            </div>
                            <span className="rounded-full bg-accent/10 px-3 py-1 font-mono text-xs font-extrabold tabular-nums text-accent">
                              ⚡ +20 XP
                            </span>
                          </div>

                          <h3 className="mt-3 text-xl font-extrabold text-foreground group-hover/card:text-accent transition-colors">
                            {lesson.title[language]}
                          </h3>

                          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-foreground/70">
                            {lesson.summary[language]}
                          </p>

                          <div className="mt-5 border-t border-foreground/[0.08] pt-4">
                            <div
                              className={`inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-5 py-3 text-xs sm:text-sm font-extrabold transition-all duration-200 ${
                                isCurrent
                                  ? 'bg-accent text-white shadow-md shadow-accent/30 group-hover/card:bg-accent/90'
                                  : isDone
                                  ? 'bg-up/10 text-up border border-up/30 group-hover/card:bg-up group-hover/card:text-white'
                                  : 'bg-accent/10 text-accent border border-accent/30 group-hover/card:bg-accent group-hover/card:text-white'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                                <span>
                                  {isCurrent
                                    ? (language === 'ar' ? `اضغط هنا لبدء هذا الدرس الآن ⚡` : `Click here to start this lesson now ⚡`)
                                    : isDone
                                    ? (language === 'ar' ? `اضغط هنا لمراجعة الدرس` : `Click here to review lesson`)
                                    : (language === 'ar' ? `اضغط هنا لبدء الدرس (+20 XP)` : `Click here to start lesson (+20 XP)`)}
                                </span>
                              </span>
                              <ArrowRight className="size-4 shrink-0 rtl:rotate-180 transition-transform group-hover/card:translate-x-1.5 rtl:group-hover/card:-translate-x-1.5" aria-hidden="true" />
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Applied Quiz / Practice Links */}
              <PracticeLinks locale={params.locale} links={unit.practiceLinks} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
