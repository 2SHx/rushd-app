'use client';

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Database,
  Droplets,
  Gauge,
  LockKeyhole,
  Minus,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import PriceChartPanel from './PriceChartPanel';
import FundamentalsPanel from './FundamentalsPanel';
import { RiyalAmount, formatUSD } from '@/lib/currency';

interface StockDetailProps {
  data: any;
  locale: string;
  jarBalance: number;
  sharesOwned: number;
  isParent: boolean;
  onTradeExecuted: (newBalance: number, newShares: number) => void;
  onBack: () => void;
}

const WORKSPACE_SECTIONS = [
  { id: 'sharia', number: 1 },
  { id: 'price', number: 2 },
  { id: 'key-financials', number: 3 },
  { id: 'charts', number: 4 },
  { id: 'statements', number: 5 },
  { id: 'valuation', number: 6 },
  { id: 'committee', number: 7 },
  { id: 'compare', number: 8 },
  { id: 'ai', number: 9 },
  { id: 'snapshot', number: 10 },
  { id: 'earnings', number: 11 },
  { id: 'filings', number: 12 },
  { id: 'thesis', number: 13 },
] as const;

type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]['id'];

function WorkspaceChip({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'positive' | 'caution' | 'neutral';
}) {
  const toneClass = tone === 'positive'
    ? 'bg-up/10 text-up'
    : tone === 'caution'
      ? 'bg-noncompliant/10 text-noncompliant'
      : 'bg-foreground/[0.05] text-foreground/70';

  return (
    <div className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 ${toneClass}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="text-[10px] text-current/70">{label}</span>
      <span className="font-mono text-xs font-bold tabular-nums" dir="ltr">{value}</span>
    </div>
  );
}

function WorkspaceSection({
  id,
  number,
  title,
  children,
}: {
  id: WorkspaceSectionId;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-44 space-y-4 md:scroll-mt-48">
      <header className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] font-bold tabular-nums text-accent" aria-hidden="true">
          {String(number).padStart(2, '0')}
        </span>
        <h2 id={`${id}-title`} className="text-lg font-bold text-foreground md:text-xl">
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function PendingSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.025] px-5 py-6 shadow-[0_1px_1px_rgba(0,0,0,0.04),0_14px_40px_rgba(0,0,0,0.04)]">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/55">{body}</p>
    </div>
  );
}

export default function StockDetail({
  data,
  locale,
  onBack
}: StockDetailProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>('sharia');
  const isMetered = data?.workspaceAccess?.state === 'metered';

  useEffect(() => {
    if (!data || isMetered) return;
    const sections = WORKSPACE_SECTIONS
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id as WorkspaceSectionId);
    }, { rootMargin: '-28% 0px -62% 0px', threshold: [0, 0.1] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [data, isMetered]);

  if (!data) return null;

  const cleanSymbol = data.symbol.replace('.SR', '');
  const displayName = isAr && data.arName ? data.arName : data.name || data.symbol;

  const history = data.history || [];
  const prevClose = history.length > 1 ? history[history.length - 2]?.close : (history[0]?.close ?? data.price);
  const change = data.price - prevClose;
  const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const isUp = change > 0;
  const isDown = change < 0;
  const complianceKnown = typeof data.isShariaCompliant === 'boolean';
  const purificationKnown = Number.isFinite(data.purificationRatioBps);
  const currency = data.market === 'TASI' ? 'SAR' : 'USD';
  const marketCap = Number.isFinite(data.statistics?.marketCap)
    ? (currency === 'SAR'
        ? <RiyalAmount value={data.statistics.marketCap} locale={locale} notation="compact" maximumFractionDigits={1} minimumFractionDigits={0} />
        : formatUSD(data.statistics.marketCap, locale, { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 }))
    : t('workspace.unverified');
  const provenance = data.marketDataSource === 'live' && data.shariaSource === 'zoya'
    ? t('workspace.chips.live')
    : data.marketDataSource === 'delayed' && data.shariaSource !== 'mock'
      ? t('workspace.chips.delayed')
      : data.marketDataSource === 'mock' || data.shariaSource === 'mock'
        ? t('workspace.chips.demo')
        : t('workspace.unverified');

  const handleAnchorKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = WORKSPACE_SECTIONS.length - 1;
    if (event.key === 'ArrowRight') nextIndex = (index + (isAr ? -1 : 1) + WORKSPACE_SECTIONS.length) % WORKSPACE_SECTIONS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index + (isAr ? 1 : -1) + WORKSPACE_SECTIONS.length) % WORKSPACE_SECTIONS.length;
    if (nextIndex === null) return;
    event.preventDefault();
    document.getElementById(`workspace-anchor-${WORKSPACE_SECTIONS[nextIndex].id}`)?.focus();
  };

  const handleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>, id: WorkspaceSectionId) => {
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
    setActiveSection(id);
  };

  return (
    <div className="text-start">
      <div className="sticky top-0 z-40 -mx-1 rounded-2xl bg-background/95 px-1 pb-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/85">
        <div className="rounded-2xl bg-surface-paper/95 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_36px_rgba(0,0,0,0.05)] md:px-5">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t('backToMarkets')}
              className="mt-0.5 rounded-full p-2 text-foreground/55 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-foreground/45" dir="ltr">{data.market}</span>
                <span className="font-mono text-[10px] font-bold text-foreground/65" dir="ltr">{cleanSymbol}</span>
                <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-foreground/60">
                  {(isAr ? data.sectorArabic : data.sectorEnglish) || t('workspace.unverified')}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                <div>
                  <h1 className="truncate text-sm font-semibold text-foreground">{displayName}</h1>
                  <span className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground md:text-3xl" dir="ltr">
                    {currency === 'SAR'
                      ? <RiyalAmount value={data.price} locale={locale} />
                      : formatUSD(data.price, locale)}
                  </span>
                </div>
                <div className={`mb-0.5 flex items-center gap-1 font-mono text-xs font-bold tabular-nums ${
                  isUp ? 'text-up' : isDown ? 'text-down' : 'text-foreground/55'
                }`} dir="ltr">
                  {isUp ? <ArrowUpRight className="size-3.5" /> : isDown ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
                  <span>{isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)</span>
                </div>
              </div>
            </div>

            <div className="hidden text-end sm:block">
              <p className="text-[10px] text-foreground/45">{t('workspace.marketCap')}</p>
              <p className="font-mono text-sm font-semibold tabular-nums text-foreground" dir="ltr">{marketCap}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label={t('workspace.chips.label')}>
            <WorkspaceChip
              icon={complianceKnown && data.isShariaCompliant ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              label={t('workspace.chips.aaofi')}
              value={complianceKnown
                ? (data.isShariaCompliant ? t('workspace.chips.compliant') : t('workspace.chips.nonCompliant'))
                : t('workspace.unverified')}
              tone={!complianceKnown ? 'neutral' : data.isShariaCompliant ? 'positive' : 'caution'}
            />
            <WorkspaceChip
              icon={<Droplets className="size-3.5" />}
              label={t('workspace.chips.purification')}
              value={purificationKnown ? `${(data.purificationRatioBps / 100).toFixed(2)}%` : t('workspace.unverified')}
            />
            <WorkspaceChip
              icon={<Gauge className="size-3.5" />}
              label={t('workspace.chips.rScore')}
              value={t('workspace.unverified')}
            />
            <WorkspaceChip
              icon={<Database className="size-3.5" />}
              label={t('workspace.chips.provenance')}
              value={provenance}
            />
          </div>

          {!isMetered && (
            <nav className="mt-3 overflow-x-auto border-t border-foreground/[0.06] pt-2 scrollbar-none" aria-label={t('workspace.navLabel')}>
              <div className="flex min-w-max gap-1">
                {WORKSPACE_SECTIONS.map((section, index) => (
                  <a
                    key={section.id}
                    id={`workspace-anchor-${section.id}`}
                    href={`#${section.id}`}
                    aria-current={activeSection === section.id ? 'location' : undefined}
                    onClick={(event) => handleAnchorClick(event, section.id)}
                    onKeyDown={(event) => handleAnchorKeyDown(event, index)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      activeSection === section.id
                        ? 'bg-accent text-white'
                        : 'text-foreground/55 hover:bg-foreground/5 hover:text-foreground'
                    }`}
                  >
                    <span className="font-mono tabular-nums" aria-hidden="true">{String(section.number).padStart(2, '0')}</span>
                    <span className="ms-1.5">{t(`workspace.sections.${section.id}`)}</span>
                  </a>
                ))}
              </div>
            </nav>
          )}
        </div>
      </div>

      {isMetered ? (
        <div className="mx-auto mt-8 max-w-2xl rounded-3xl bg-surface-paper px-6 py-8 text-start shadow-[0_2px_4px_rgba(0,0,0,0.05),0_24px_72px_rgba(0,0,0,0.07)] md:px-8 md:py-10">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <LockKeyhole className="size-5" />
          </div>
          <p className="mt-5 text-xs font-semibold text-accent">{t('workspace.meterEyebrow')}</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{t('workspace.meterTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/60">{t('workspace.meterCost', { limit: 5 })}</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground/45">{t('workspace.meterRevisit')}</p>
          <Link
            href={`/${locale}/profile`}
            className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t('workspace.meterAction')}
          </Link>
        </div>
      ) : (
        <main className="mt-10 space-y-16 pb-16 md:space-y-20">
          {WORKSPACE_SECTIONS.map((section) => (
            <WorkspaceSection
              key={section.id}
              id={section.id}
              number={section.number}
              title={t(`workspace.sections.${section.id}`)}
            >
              {section.id === 'sharia' ? (
                <ShariaTab data={data} locale={locale} t={t} isAr={isAr} />
              ) : section.id === 'price' ? (
                <PriceChartPanel
                  history={history}
                  symbol={data.symbol}
                  market={data.market === 'TASI' ? 'TASI' : 'NASDAQ'}
                  dataSource={data.marketDataSource}
                />
              ) : section.id === 'key-financials' ? (
                <FundamentalsPanel data={data} locale={locale} />
              ) : (
                <PendingSection title={t('workspace.pendingTitle')} body={t('workspace.pendingBody')} />
              )}
            </WorkspaceSection>
          ))}
        </main>
      )}
    </div>
  );
}

// ── Sharia Tab (inline) ──────────────────────────────────────────
type VerdictState = 'verified' | 'demo' | 'unverified';

function getVerdictState(data: any): VerdictState {
  if (data.shariaSource === 'mock') return 'demo';
  if (data.isShariaCompliant === null || data.isShariaCompliant === undefined || data.shariaSource === 'none') return 'unverified';
  return 'verified';
}

function ShariaTab({ data, locale, t, isAr }: { data: any; locale: string; t: any; isAr: boolean }) {
  const compliance = data.financials?.complianceRatios;
  const purificationKnown = Number.isFinite(data.purificationRatioBps);
  const verdictState = getVerdictState(data);
  const compliant = data.isShariaCompliant === true;

  const bannerTone = verdictState === 'unverified'
    ? 'neutral'
    : compliant ? 'positive' : 'caution';

  const bannerClass = bannerTone === 'positive'
    ? 'bg-up/5 border-up/20'
    : bannerTone === 'caution'
      ? 'bg-noncompliant/5 border-noncompliant/20'
      : 'bg-foreground/[0.03] border-foreground/10';

  const bannerTextClass = bannerTone === 'positive' ? 'text-up' : bannerTone === 'caution' ? 'text-noncompliant' : 'text-foreground/70';

  const verdictLabel = verdictState === 'unverified'
    ? t('workspace.unverified')
    : compliant ? t('workspace.chips.compliant') : t('workspace.chips.nonCompliant');

  const sourceNote = verdictState === 'demo'
    ? t('workspace.sharia.demoNote')
    : verdictState === 'unverified'
      ? t('workspace.sharia.unverifiedNote')
      : data.shariaSource === 'zoya'
        ? t('workspace.sharia.verifiedNoteZoya')
        : data.shariaSource === 'etf-holdings'
          ? t('workspace.sharia.verifiedNoteEtf')
          : t('workspace.sharia.verifiedNoteSaudiList');

  const criteria = [
    {
      label: isAr ? 'نشاط تجاري حلال' : 'Halal Business Activity',
      description: isAr ? 'لا يشمل الكحول أو التبغ أو الأسلحة أو الترفيه المحظور' : 'No alcohol, tobacco, weapons, or prohibited entertainment',
      known: verdictState !== 'unverified',
      pass: compliant,
      hasRatio: false,
      value: null as string | null,
      ratio: 0,
    },
    {
      label: isAr ? 'نسبة الديون الربوية (<30%)' : 'Interest-Bearing Debt (<30%)',
      description: isAr ? 'الديون الربوية مقسومة على متوسط القيمة السوقية' : 'Interest-bearing debt divided by trailing 36-month average market cap',
      known: Number.isFinite(compliance?.debtToMcap),
      pass: Number.isFinite(compliance?.debtToMcap) ? compliance.debtToMcap < 30 : false,
      hasRatio: true,
      value: Number.isFinite(compliance?.debtToMcap) ? `${Number(compliance.debtToMcap).toFixed(1)}%` : null,
      ratio: Number.isFinite(compliance?.debtToMcap) ? Math.min((compliance.debtToMcap / 30) * 100, 100) : 0,
    },
    {
      label: isAr ? 'دخل الفوائد (<5%)' : 'Interest Income (<5%)',
      description: isAr ? 'دخل الفوائد مقسوماً على إجمالي الإيرادات' : 'Interest income as a percentage of total revenue',
      known: Number.isFinite(compliance?.interestIncomeToRevenue),
      pass: Number.isFinite(compliance?.interestIncomeToRevenue) ? compliance.interestIncomeToRevenue < 5 : false,
      hasRatio: true,
      value: Number.isFinite(compliance?.interestIncomeToRevenue) ? `${Number(compliance.interestIncomeToRevenue).toFixed(1)}%` : null,
      ratio: Number.isFinite(compliance?.interestIncomeToRevenue) ? Math.min((compliance.interestIncomeToRevenue / 5) * 100, 100) : 0,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Verdict Banner */}
      <div className={`flex items-center gap-4 rounded-2xl border p-5 ${bannerClass}`}>
        {verdictState === 'unverified'
          ? <ShieldAlert className="size-8 shrink-0 text-foreground/50" />
          : compliant
            ? <ShieldCheck className="size-8 shrink-0 text-up" />
            : <ShieldAlert className="size-8 shrink-0 text-noncompliant" />}
        <div>
          <p className={`text-sm font-extrabold ${bannerTextClass}`}>{verdictLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{sourceNote}</p>
          {verdictState === 'demo' && (
            <span className="mt-1 inline-flex w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              {t('workspace.chips.demo')}
            </span>
          )}
        </div>
      </div>

      {/* Criteria Cards */}
      <div className="space-y-3">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl glass-panel p-4">
            <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
              !c.known ? 'bg-foreground/10 text-foreground/50' : c.pass ? 'bg-up/20 text-up' : 'bg-down/20 text-down'
            }`}>
              {!c.known ? '?' : c.pass ? '✓' : '✗'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{c.label}</p>
                {c.hasRatio && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold tabular-nums ${
                    !c.known ? 'bg-foreground/[0.06] text-foreground/50' : c.pass ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                  }`}>
                    {c.value ?? t('workspace.sharia.ratioUnavailable')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/50">{c.description}</p>

              {/* Progress bar for ratio criteria */}
              {c.hasRatio && c.known && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${c.pass ? 'bg-up' : 'bg-down'}`}
                    style={{ width: `${c.ratio}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Purification Note */}
      <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 text-xs leading-relaxed text-foreground/70">
        <p>
          <span className="font-bold text-foreground">{t('workspace.sharia.purificationTitle')}: </span>
          {purificationKnown
            ? t('workspace.sharia.purificationValue', { value: (data.purificationRatioBps / 100).toFixed(2) })
            : t('workspace.unverified')}
        </p>
        <p className="mt-2 text-foreground/55">{t('workspace.sharia.purificationExplain')}</p>
        <p className="mt-1 text-foreground/55">{t('workspace.sharia.purificationZakatNote')}</p>
      </div>

      {/* Academy education note */}
      <div className="rounded-2xl border border-accent/15 bg-accent/5 p-4 text-xs leading-relaxed text-foreground/70">
        <p>{t('workspace.sharia.academyNote')}</p>
        <Link
          href={`/${locale}/academy/foundations`}
          className="mt-2 inline-flex items-center gap-1 font-semibold text-accent underline-offset-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t('workspace.sharia.academyLink')}
        </Link>
      </div>
    </div>
  );
}
