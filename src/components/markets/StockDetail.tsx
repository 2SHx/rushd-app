'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { 
  ShieldCheck, ShieldAlert, ArrowLeft, ArrowUpRight, ArrowDownRight, 
  Minus, Sparkles, ChevronRight, Building2, User, Users, MapPin, 
  BarChart3, TrendingUp, Activity, Bot
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import PriceChartPanel from './PriceChartPanel';
import RScorePanel from './RScorePanel';
import FundamentalsPanel from './FundamentalsPanel';
import AssistantPanel from './AssistantPanel';

import ValuationSuitePanel from './ValuationSuitePanel';
import OpportunityMatrix from './OpportunityMatrix';
import StockComparePanel from './StockComparePanel';
import FinancialStatementsPanel from './FinancialStatementsPanel';

interface StockDetailProps {
  data: any;
  locale: string;
  jarBalance: number;
  sharesOwned: number;
  isParent: boolean;
  onTradeExecuted: (newBalance: number, newShares: number) => void;
  onBack: () => void;
}

type Tab = 'overview' | 'valuation' | 'financials' | 'compare' | 'assistant' | 'fundamentals' | 'sharia';

export default function StockDetail({
  data,
  locale,
  onBack
}: StockDetailProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  if (!data) return null;

  const cleanSymbol = data.symbol.replace('.SR', '');
  const displayName = isAr && data.arName ? data.arName : data.name || data.symbol;

  const history = data.history || [];
  const prevClose = history.length > 1 ? history[history.length - 2]?.close : (history[0]?.close ?? data.price);
  const change = data.price - prevClose;
  const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const isUp = change > 0;
  const isDown = change < 0;

  const tabs: { id: Tab; label: string; labelAr: string }[] = [
    { id: 'overview', label: 'Overview', labelAr: 'الرئيسية' },
    { id: 'valuation', label: 'Valuation', labelAr: 'التقييم العادل' },
    { id: 'financials', label: 'Financials', labelAr: 'القوائم المالية' },
    { id: 'compare', label: 'Compare', labelAr: 'المقارنة' },
    { id: 'assistant', label: 'AI Analysis', labelAr: 'التحليل الذكي' },
    { id: 'sharia', label: 'Sharia', labelAr: 'التوافق الشرعي' },
  ];

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowRight') nextIndex = (index + (isAr ? -1 : 1) + tabs.length) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index + (isAr ? 1 : -1) + tabs.length) % tabs.length;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`stock-tab-${tabs[nextIndex!].id}`)?.focus());
  };

  return (
    <div className="space-y-0 text-start">
      {/* Mobile Back Button */}
      <div className="flex items-center space-x-3 rtl:space-x-reverse md:hidden p-4 border-b border-[var(--border-color)] bg-surface-paper sticky top-0 z-40">
        <button
          onClick={onBack}
          aria-label={t('backToMarkets')}
          className="p-2 hover:bg-foreground/5 rounded-full text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <span className="font-bold text-foreground text-sm">{cleanSymbol}</span>
        <span className="text-foreground/50 text-xs truncate">• {displayName}</span>
      </div>

      {/* ── Hero Quote Header ── */}
      <div className="relative overflow-hidden rounded-3xl glass-panel p-6">
        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: Name + Price */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black font-mono tracking-widest text-foreground/50 bg-foreground/5 px-2.5 py-1 rounded-full border border-[var(--border-color)] uppercase">
                {data.market}
              </span>
              <span className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider">
                {cleanSymbol}
              </span>
            </div>

            <h1 className="text-lg font-extrabold text-foreground leading-tight">{displayName}</h1>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-black font-mono tabular-nums text-foreground leading-none tracking-tight">
                {data.market === 'TASI'
                  ? t('formatTasi', { amount: data.price.toFixed(2) })
                  : t('formatNasdaq', { amount: data.price.toFixed(2) })}
              </span>

              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold font-mono tabular-nums ${
                isUp
                  ? 'bg-up/10 text-up border border-up/20'
                  : isDown
                  ? 'bg-down/10 text-down border border-down/20'
                  : 'bg-foreground/5 text-foreground/50 border border-[var(--border-color)]'
              }`}>
                {isUp ? <ArrowUpRight className="w-4 h-4" /> : isDown ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                <span>{isUp ? '+' : ''}{change.toFixed(2)}</span>
                <span className="text-[10px] opacity-70">({isUp ? '+' : ''}{pct.toFixed(2)}%)</span>
              </div>
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${data.marketDataSource === 'live' ? 'bg-up animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[10px] text-foreground/50 font-mono font-bold uppercase tracking-wider">
                {data.marketDataSource === 'live'
                  ? t('liveMarketData')
                  : data.marketDataSource === 'delayed'
                    ? t('delayedMarketData')
                    : t('simulatedMarketData')}
              </span>
            </div>
          </div>

          {/* Right: Sharia Shield */}
          <div className={`self-start flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold ${
            data.isShariaCompliant
              ? 'bg-up/10 border-up/20 text-up'
              : 'bg-noncompliant/10 border-noncompliant/20 text-noncompliant'
          }`}>
            {data.isShariaCompliant
              ? <ShieldCheck className="w-5 h-5" />
              : <ShieldAlert className="w-5 h-5" />}
            <span>{data.isShariaCompliant ? t('shariaBadgeCompliant') : t('shariaBadgeNonCompliant')}</span>
          </div>
          {data.shariaSource !== 'zoya' && (
            <p className="text-[10px] text-foreground/60">{t('shariaDemoNote')}</p>
          )}
        </div>
      </div>

      {/* ── Tab Navigation (Horizontally Scrollable on Mobile) ── */}
      <div role="tablist" aria-label={t('stockDetailTabs')} className="flex overflow-x-auto gap-1.5 bg-foreground/[0.02] border border-[var(--border-color)] p-1.5 rounded-2xl mt-4 scrollbar-none">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`stock-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`stock-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`whitespace-nowrap py-2 px-4 rounded-xl text-xs font-extrabold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              activeTab === tab.id
                ? 'bg-accent text-white shadow-md'
                : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {isAr ? tab.labelAr : tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          id={`stock-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`stock-tab-${activeTab}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="mt-4 space-y-4"
        >
          {activeTab === 'overview' && (
            <>
              <PriceChartPanel
                history={history}
                symbol={data.symbol}
                market={data.market === 'TASI' ? 'TASI' : 'NASDAQ'}
                dataSource={data.marketDataSource}
              />
              <OpportunityMatrix symbol={data.symbol} locale={locale} />
              <RScorePanel symbol={data.symbol} locale={locale} />
              <FundamentalsPanel data={data} locale={locale} />
              {/* AI Committee CTA */}
              <Link
                href={`/${locale}/quant`}
                className="flex items-center justify-between p-4 rounded-2xl border border-accent/15 bg-accent/[0.03] hover:bg-accent/[0.06] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-accent" />
                  </div>
                  <div className="text-start">
                    <p className="text-sm font-bold text-foreground">
                      {isAr ? 'قرار لجنة الذكاء الاصطناعي' : 'View AI Committee Decision'}
                    </p>
                    <p className="text-[11px] text-foreground/50 mt-0.5">
                      {isAr ? 'شاهد كيف تقيّم اللجنة هذا السهم الآن' : 'See how the 8-agent committee rates this stock live'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-accent group-hover:translate-x-1 transition-transform rtl:rotate-180" />
              </Link>
            </>
          )}

          {activeTab === 'valuation' && (
            <ValuationSuitePanel data={data} locale={locale} />
          )}

          {activeTab === 'financials' && (
            <FinancialStatementsPanel data={data} locale={locale} />
          )}

          {activeTab === 'compare' && (
            <StockComparePanel primaryData={data} locale={locale} />
          )}

          {activeTab === 'assistant' && (
            <AssistantPanel symbol={data.symbol} market={data.market} currentPrice={data.price} locale={locale} />
          )}

          {activeTab === 'sharia' && (
            <ShariaTab data={data} locale={locale} t={t} isAr={isAr} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Sharia Tab (inline) ──────────────────────────────────────────
function ShariaTab({ data, locale, t, isAr }: { data: any; locale: string; t: any; isAr: boolean }) {
  const compliance = data.financials?.complianceRatios;

  const criteria = [
    {
      label: isAr ? 'نشاط تجاري حلال' : 'Halal Business Activity',
      description: isAr ? 'لا يشمل الكحول أو التبغ أو الأسلحة أو الترفيه المحظور' : 'No alcohol, tobacco, weapons, or prohibited entertainment',
      pass: data.isShariaCompliant,
    },
    {
      label: isAr ? 'نسبة الديون الربوية (<30%)' : 'Interest-Bearing Debt (<30%)',
      description: isAr ? 'الديون الربوية مقسومة على متوسط القيمة السوقية' : 'Interest-bearing debt divided by trailing 36-month average market cap',
      pass: compliance ? compliance.debtToMcap < 30 : data.isShariaCompliant,
      value: compliance ? `${Number(compliance.debtToMcap).toFixed(1)}%` : null,
    },
    {
      label: isAr ? 'دخل الفوائد (<5%)' : 'Interest Income (<5%)',
      description: isAr ? 'دخل الفوائد مقسوماً على إجمالي الإيرادات' : 'Interest income as a percentage of total revenue',
      pass: compliance ? compliance.interestIncomeToRevenue < 5 : data.isShariaCompliant,
      value: compliance ? `${Number(compliance.interestIncomeToRevenue).toFixed(1)}%` : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Verdict Banner */}
      <div className={`p-5 rounded-2xl border flex items-center gap-4 ${
        data.isShariaCompliant
          ? 'bg-up/5 border-up/20'
          : 'bg-noncompliant/5 border-noncompliant/20'
      }`}>
        {data.isShariaCompliant
          ? <ShieldCheck className="w-8 h-8 text-up shrink-0" />
          : <ShieldAlert className="w-8 h-8 text-noncompliant shrink-0" />}
        <div>
          <p className={`font-extrabold text-sm ${data.isShariaCompliant ? 'text-up' : 'text-noncompliant'}`}>
            {data.isShariaCompliant
              ? (isAr ? 'متوافق مع الشريعة الإسلامية' : 'Sharia Compliant — Halal to Invest')
              : (isAr ? 'غير متوافق مع الشريعة الإسلامية' : 'Non-Compliant — Caution Advised')}
          </p>
          <p className="text-xs text-foreground/60 mt-1">
            {data.shariaSource === 'zoya' ? t('shariaVerifiedNote') : t('shariaDemoNote')}
          </p>
        </div>
      </div>

      {/* Criteria Cards */}
      <div className="space-y-3">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-2xl glass-panel">
            <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-black mt-0.5 ${
              c.pass ? 'bg-up/20 text-up' : 'bg-down/20 text-down'
            }`}>
              {c.pass ? '✓' : '✗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-foreground">{c.label}</p>
                {c.value && (
                  <span className={`text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-full ${
                    c.pass ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                  }`}>{c.value}</span>
                )}
              </div>
              <p className="text-xs text-foreground/50 mt-1 leading-relaxed">{c.description}</p>

              {/* Progress bar for ratio criteria */}
              {c.value && compliance && (
                <div className="mt-2 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${c.pass ? 'bg-up' : 'bg-down'}`}
                    style={{
                      width: `${Math.min(
                        i === 1 ? (compliance.debtToMcap / 30) * 100 : (compliance.interestIncomeToRevenue / 5) * 100,
                        100
                      )}%`
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Purification Note */}
      <div className="p-4 rounded-2xl bg-noncompliant/5 border border-noncompliant/10 text-xs text-noncompliant/80 leading-relaxed">
        <span className="font-bold text-noncompliant">
          {isAr ? 'ملاحظة التطهير: ' : 'Purification Note: '}
        </span>
        {isAr
          ? 'إذا كانت الشركة تحقق دخلاً من فوائد بنسبة أقل من الحد المسموح، يجب تبرع جزء من الأرباح للجهات الخيرية.'
          : 'If a compliant company earns minor interest income below the threshold, a proportionate amount of dividends must be donated to charity.'}
      </div>
    </div>
  );
}
