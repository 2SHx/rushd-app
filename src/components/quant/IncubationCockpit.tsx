import { getTranslations } from 'next-intl/server';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { formatUSD } from '@/lib/currency';
import { INCUBATION_BOOKS } from '@/quant/automation/incubationBooks';
import {
  loadIncubationCockpitData,
  type IncubationBookCockpit,
  type IncubationCockpitData,
  type IndexedPoint,
} from '@/quant/automation/incubationCockpitData';

interface Props {
  locale: string;
}

/**
 * Suspense fallback for the streamed cockpit fetch — a real loading state, not a spinner over
 * fake numbers. Mirrors the populated layout exactly (same header, same aggregate-tile and
 * book-card grids, same book count) so resolving the data causes zero layout shift.
 */
export async function IncubationCockpitFallback({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'IncubationCockpit' });
  return (
    <section aria-busy="true" aria-labelledby="incubation-cockpit-title" className="rounded-[1.75rem] border border-foreground/10 bg-surface-card p-6 shadow-sm sm:p-7 text-start">
      <div className="mb-5">
        <h2 id="incubation-cockpit-title" className="text-xl font-extrabold text-foreground">{t('title')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground/55">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none" />
        ))}
      </div>

      <div className="mb-3 mt-7 h-4 w-32 animate-pulse rounded bg-foreground/[0.06] motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {INCUBATION_BOOKS.map(book => (
          <div key={book.bookId} className="h-52 animate-pulse rounded-2xl border border-foreground/10 bg-foreground/[0.04] motion-reduce:animate-none" />
        ))}
      </div>

      <p className="sr-only">{t('loadingBody')}</p>
    </section>
  );
}

function dateFmt(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC',
  }).format(new Date(iso));
}

function percentFmt(locale: string, value: number): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

/** Known bench-flag codes (incubationEvaluation.ts) mapped to translated labels; an unrecognized
 * code still renders (bidi-isolated) rather than being silently dropped. */
function benchFlagLabel(code: string, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const known: Record<string, string> = {
    DRAWDOWN_BREAKER: t('benchFlagDrawdownBreaker'),
    TRACKING_ERROR_BREACH: t('benchFlagTrackingErrorBreach'),
  };
  return known[code] ?? code;
}

/** Inline-SVG NAV-vs-benchmark line, following the existing polyline pattern (DashboardClient/PortfolioClient). */
function BookNavChart({ book }: { book: IncubationBookCockpit }) {
  if (book.navSeries.length < 2) return null;
  const w = 320;
  const h = 96;
  const pad = 4;
  const series: IndexedPoint[][] = [book.navSeries, ...(book.benchmarks.spy ? [book.benchmarks.spy] : []), ...(book.benchmarks.spus ? [book.benchmarks.spus] : [])];
  const values = series.flatMap(s => s.map(p => p.index));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = book.navSeries.length;
  const mapPoint = (idx: number, value: number) => {
    const x = pad + (idx / (n - 1)) * (w - 2 * pad);
    const y = h - pad - ((value - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const navPoints = book.navSeries.map((p, i) => mapPoint(i, p.index)).join(' ');
  const spyPoints = book.benchmarks.spy?.map((p, i) => mapPoint(i, p.index)).join(' ');
  const spusPoints = book.benchmarks.spus?.map((p, i) => mapPoint(i, p.index)).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full overflow-visible text-accent" preserveAspectRatio="none" aria-hidden="true">
      {spyPoints ? <polyline points={spyPoints} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-foreground/25" /> : null}
      {spusPoints ? <polyline points={spusPoints} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-foreground/45" /> : null}
      <polyline points={navPoints} fill="none" stroke="currentColor" strokeWidth="2.25" />
    </svg>
  );
}

function BookCard({ book, locale, t }: { book: IncubationBookCockpit; locale: string; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const hasData = book.latestAsOf !== null;
  const pnlUp = (book.dailyPnl ?? 0) >= 0;
  const statusPill = book.benched
    ? { label: t('benchedStatus'), className: 'bg-down/10 text-down' }
    : book.requiresRevalidation
      ? { label: t('requiresRevalidationStatus'), className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
      : { label: t('activeStatus'), className: 'bg-foreground/[0.06] text-foreground/60' };

  return (
    <article className="rounded-2xl border border-foreground/10 bg-surface-card p-5 shadow-sm text-start">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-foreground" dir="ltr">{book.bookId}</p>
          <p className="mt-1 text-[10px] font-semibold text-foreground/60">{t('incubationLabel')}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusPill.className}`}>
          {statusPill.label}
        </span>
      </div>

      {!hasData ? (
        <p className="mt-6 py-6 text-center text-xs leading-relaxed text-foreground/50">{t('noBookDataYet')}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 text-start">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{t('navLabel')}</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground" dir="ltr">{formatUSD(book.nav ?? 0, locale)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{t('dailyPnlLabel')}</p>
              <p className={`mt-1 flex items-center gap-0.5 font-mono text-sm font-semibold tabular-nums ${pnlUp ? 'text-up' : 'text-down'}`} dir="ltr">
                {pnlUp ? <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /> : <ArrowDownRight className="size-3.5 shrink-0" aria-hidden="true" />}
                {formatUSD(book.dailyPnl ?? 0, locale, { signDisplay: 'never' })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">{t('drawdownLabel')}</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-down" dir="ltr">
                {percentFmt(locale, -(book.drawdown ?? 0))}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <BookNavChart book={book} />
            {(book.benchmarks.spy || book.benchmarks.spus) ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-foreground/60">
                <span className="flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-accent" aria-hidden="true" />{t('chartLegendBook')}</span>
                {book.benchmarks.spy ? <span className="flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-foreground/25" aria-hidden="true" /><bdi dir="ltr">{t('chartLegendSpy')}</bdi></span> : null}
                {book.benchmarks.spus ? <span className="flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-foreground/45" aria-hidden="true" /><bdi dir="ltr">{t('chartLegendSpus')}</bdi></span> : null}
              </div>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-foreground/45">{t('benchmarkUnavailable')}</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.06] pt-3 text-[10px] text-foreground/50">
            <span>{t('latestAsOf', { date: dateFmt(locale, book.latestAsOf!) })}</span>
            <span className="font-mono">{t('trackingErrorLabel')}: <bdi dir="ltr">{percentFmt(locale, book.trackingError ?? 0)}</bdi></span>
          </div>

          {book.benchFlags.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/[0.07] p-2.5 text-[10px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-semibold">{t('benchFlagsLabel')}: </span>
                <bdi dir="ltr">{book.benchFlags.map(code => benchFlagLabel(code, t)).join(', ')}</bdi>
              </p>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default async function IncubationCockpit({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: 'IncubationCockpit' });

  let data: IncubationCockpitData | null = null;
  try {
    data = await loadIncubationCockpitData();
  } catch {
    data = null;
  }

  // A book only reaches this component with latestAsOf === null for every book when no
  // evaluation row exists anywhere — in that exact case the aggregate window is also empty,
  // so runRatePerDay is only ever null when noBooksYet is true (i.e. never inside this branch).
  const noBooksYet = data !== null && data.books.every(book => book.latestAsOf === null);

  return (
    <section className="rounded-[1.75rem] border border-foreground/10 bg-surface-card p-6 shadow-sm sm:p-7 text-start" aria-labelledby="incubation-cockpit-title">
      <div className="mb-5">
        <h2 id="incubation-cockpit-title" className="text-xl font-extrabold text-foreground">{t('title')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground/55">{t('subtitle')}</p>
      </div>

      {data === null ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-down/10 p-4 text-sm text-down">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('errorTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{t('errorBody')}</p>
          </div>
        </div>
      ) : noBooksYet ? (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 text-center">
          <p className="text-sm font-semibold text-foreground/70">{t('emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-foreground/50">{t('emptyBody')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-foreground/[0.03] p-4">
              <p className="text-[10px] font-semibold text-foreground/60">{t('runRateLabel')}</p>
              <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${(data.aggregate.runRatePerDay ?? 0) >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
                {formatUSD(data.aggregate.runRatePerDay ?? 0, locale)}
              </p>
              <p className="mt-1 text-[10px] text-foreground/45">
                {data.aggregate.windowDays > 0 ? t('runRateWindow', { days: data.aggregate.windowDays }) : ''}
              </p>
            </div>
            <div className="rounded-2xl bg-foreground/[0.03] p-4">
              <p className="text-[10px] font-semibold text-foreground/60">{t('targetLabel')}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground/80" dir="ltr">{formatUSD(1000, locale)}</p>
            </div>
            <div className="rounded-2xl bg-foreground/[0.03] p-4">
              <p className="text-[10px] font-semibold text-foreground/60">{t('capitalNeededLabel')}</p>
              {data.aggregate.capitalNeeded !== null ? (
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground" dir="ltr">
                  {formatUSD(data.aggregate.capitalNeeded, locale, { maximumFractionDigits: 0 })}
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-foreground/60">{t('capitalNeededNotComputable')}</p>
              )}
              <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">{t('capitalNeededHint')}</p>
            </div>
          </div>

          <h3 className="mb-3 mt-7 text-sm font-bold text-foreground">{t('booksHeading')}</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.books.map(book => (
              <BookCard key={book.bookId} book={book} locale={locale} t={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
