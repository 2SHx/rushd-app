/**
 * Shared SAR/USD money formatting for the entire app.
 *
 * Rung: 6 (one-liner-ish helper) — reuses existing Intl.NumberFormat patterns
 * already in the codebase (the `-u-nu-latn` numbering convention used by the
 * majority of components: HistoricalComparisonChart, StrategyLeagueClient,
 * StrategyLearningLab, MarketSectorModal, quant/page.tsx). No new dependency.
 *
 * Every SAR amount in the app should render through `<RiyalAmount>` (JSX
 * contexts) or `formatSARNumber` (plain-string contexts, e.g. inside
 * `t.rich()` interpolations) so the official Saudi Riyal symbol renders
 * consistently instead of ad-hoc "SAR" / "ر.س" text.
 */

export type SupportedCurrency = 'SAR' | 'USD';

export interface FormatMoneyOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
  notation?: 'standard' | 'compact';
}

/** Matches the app-wide convention: Latin digits even in Arabic locale. */
function numberLocaleFor(locale: string) {
  return locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
}

/** Formats the numeric part of a SAR amount — no symbol attached. */
export function formatSARNumber(value: number, locale: string, opts: FormatMoneyOptions = {}): string {
  return new Intl.NumberFormat(numberLocaleFor(locale), {
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    signDisplay: opts.signDisplay,
    notation: opts.notation ?? 'standard',
  }).format(value);
}

/** Formats a full USD amount, e.g. "$1,234.56". Untouched by the riyal work. */
export function formatUSD(value: number, locale: string, opts: FormatMoneyOptions = {}): string {
  return new Intl.NumberFormat(numberLocaleFor(locale), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    signDisplay: opts.signDisplay,
    notation: opts.notation ?? 'standard',
  }).format(value);
}

/**
 * Saudi Riyal symbol — renders clean, standard text "ر.س" in Arabic or "SAR" in English,
 * eliminating the hashtag (#) visual confusion.
 */
export function RiyalSymbol({ className = '', locale = 'ar' }: { className?: string; locale?: string }) {
  const isAr = locale === 'ar';
  return (
    <span className={`inline-block font-sans font-extrabold text-[0.82em] text-foreground/80 leading-none shrink-0 ${className}`}>
      {isAr ? 'ر.س' : 'SAR'}
    </span>
  );
}

export interface RiyalAmountProps extends FormatMoneyOptions {
  value: number;
  locale: string;
  className?: string;
}

/** Renders a SAR amount with clean Saudi Riyal text badge (ر.س / SAR). */
export function RiyalAmount({
  value,
  locale,
  className = '',
  minimumFractionDigits,
  maximumFractionDigits,
  signDisplay,
  notation,
}: RiyalAmountProps) {
  const isAr = locale === 'ar';
  const number = formatSARNumber(value, locale, { minimumFractionDigits, maximumFractionDigits, signDisplay, notation });
  const label = `${number} ${isAr ? 'ريال' : 'SAR'}`;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} dir="ltr" aria-label={label}>
      {isAr ? (
        <>
          <span>{number}</span>
          <RiyalSymbol locale={locale} />
        </>
      ) : (
        <>
          <RiyalSymbol locale={locale} />
          <span>{number}</span>
        </>
      )}
    </span>
  );
}

/**
 * Generic money renderer for mixed-currency contexts (positions table etc.):
 * SAR renders via RiyalAmount, USD keeps its untouched "$" formatting.
 */
export function formatMoney(value: number, currency: SupportedCurrency, locale: string, opts: FormatMoneyOptions = {}) {
  if (currency === 'USD') return formatUSD(value, locale, opts);
  return <RiyalAmount value={value} locale={locale} {...opts} />;
}
