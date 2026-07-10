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

interface StockDetailProps {
  data: any;
  locale: string;
  jarBalance: number;
  sharesOwned: number;
  isParent: boolean;
  onTradeExecuted: (newBalance: number, newShares: number) => void;
  onBack: () => void;
}

type Tab = 'overview' | 'assistant' | 'fundamentals' | 'sharia';

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
    { id: 'overview', label: 'Chart', labelAr: 'الرسم البياني' },
    { id: 'assistant', label: 'AI Analysis', labelAr: 'تحليل الذكاء الاصطناعي' },
    { id: 'fundamentals', label: 'Fundamentals', labelAr: 'البيانات المالية' },
    { id: 'sharia', label: 'Sharia', labelAr: 'التوافق الشرعي' },
  ];

  return (
    <div className="space-y-0">
      {/* Mobile Back Button */}
      <div className="flex items-center space-x-3 rtl:space-x-reverse md:hidden p-4 border-b border-white/5 bg-[#080B11]/90 backdrop-blur-md sticky top-0 z-40">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full text-emerald-400 transition-colors">
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <span className="font-bold text-white text-sm">{cleanSymbol}</span>
        <span className="text-gray-400 text-xs truncate">• {displayName}</span>
      </div>

      {/* ── Hero Quote Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a0f1e] via-[#0d1520] to-[#070c18] border border-white/[0.06] p-6 shadow-xl">
        {/* Ambient glow based on compliance */}
        <div className={`absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none ${
          data.isShariaCompliant ? 'bg-emerald-400' : 'bg-amber-400'
        }`} />
        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full blur-3xl opacity-10 bg-indigo-500 pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: Name + Price */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black font-mono tracking-widest text-gray-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 uppercase">
                {data.market}
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {cleanSymbol}
              </span>
            </div>

            <h1 className="text-lg font-extrabold text-white leading-tight">{displayName}</h1>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-black font-mono text-white leading-none tracking-tight">
                {data.market === 'TASI'
                  ? t('formatTasi', { amount: data.price.toFixed(2) })
                  : t('formatNasdaq', { amount: data.price.toFixed(2) })}
              </span>

              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold font-mono ${
                isUp
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : isDown
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                  : 'bg-white/5 text-gray-400 border border-white/10'
              }`}>
                {isUp ? <ArrowUpRight className="w-4 h-4" /> : isDown ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                <span>{isUp ? '+' : ''}{change.toFixed(2)}</span>
                <span className="text-[10px] opacity-70">({isUp ? '+' : ''}{pct.toFixed(2)}%)</span>
              </div>
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider">Live Market Data</span>
            </div>
          </div>

          {/* Right: Sharia Shield */}
          <div className={`self-start flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all ${
            data.isShariaCompliant
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.15)]'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
          }`}>
            {data.isShariaCompliant
              ? <ShieldCheck className="w-5 h-5" />
              : <ShieldAlert className="w-5 h-5" />}
            <span>{data.isShariaCompliant ? t('shariaBadgeCompliant') : t('shariaBadgeNonCompliant')}</span>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 bg-white/[0.02] border border-white/[0.05] p-1 rounded-2xl mt-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="mt-4 space-y-4"
        >
          {activeTab === 'overview' && (
            <>
              <PriceChartPanel history={history} />
              <RScorePanel symbol={data.symbol} locale={locale} />
              {/* AI Committee CTA */}
              <Link
                href={`/${locale}/quant`}
                className="flex items-center justify-between p-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-indigo-500/5 hover:from-emerald-500/10 hover:to-indigo-500/10 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-start">
                    <p className="text-sm font-bold text-white">
                      {isAr ? 'قرار لجنة الذكاء الاصطناعي' : 'View AI Committee Decision'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isAr ? 'شاهد كيف تقيّم اللجنة هذا السهم الآن' : 'See how the 8-agent committee rates this stock live'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform rtl:rotate-180" />
              </Link>
            </>
          )}

          {activeTab === 'assistant' && (
            <AssistantPanel symbol={data.symbol} market={data.market} currentPrice={data.price} locale={locale} />
          )}

          {activeTab === 'fundamentals' && (
            <FundamentalsPanel data={data} locale={locale} />
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
      label: isAr ? 'نسبة الدين (<33%)' : 'Debt Ratio (<33%)',
      description: isAr ? 'الديون الكلية مقسومة على متوسط القيمة السوقية' : 'Total debt divided by trailing 36-month average market cap',
      pass: compliance ? compliance.debtToMcap < 33 : data.isShariaCompliant,
      value: compliance ? `${Number(compliance.debtToMcap).toFixed(1)}%` : null,
    },
    {
      label: isAr ? 'دخل الفوائد (<5%)' : 'Interest Income (<5%)',
      description: isAr ? 'دخل الفوائد مقسوم على إجمالي الإيرادات' : 'Interest income as a percentage of total revenue',
      pass: compliance ? compliance.interestIncomeToRevenue < 5 : data.isShariaCompliant,
      value: compliance ? `${Number(compliance.interestIncomeToRevenue).toFixed(1)}%` : null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Verdict Banner */}
      <div className={`p-5 rounded-2xl border flex items-center gap-4 ${
        data.isShariaCompliant
          ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.08)]'
          : 'bg-amber-500/5 border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.08)]'
      }`}>
        {data.isShariaCompliant
          ? <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
          : <ShieldAlert className="w-8 h-8 text-amber-400 shrink-0" />}
        <div>
          <p className={`font-extrabold text-sm ${data.isShariaCompliant ? 'text-emerald-400' : 'text-amber-400'}`}>
            {data.isShariaCompliant
              ? (isAr ? 'متوافق مع الشريعة الإسلامية' : 'Sharia Compliant — Halal to Invest')
              : (isAr ? 'غير متوافق مع الشريعة الإسلامية' : 'Non-Compliant — Caution Advised')}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {isAr ? 'وفقاً لمعايير هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية (AAOIFI)' : 'Screened per AAOIFI financial ratio standards'}
          </p>
        </div>
      </div>

      {/* Criteria Cards */}
      <div className="space-y-3">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-black mt-0.5 ${
              c.pass ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}>
              {c.pass ? '✓' : '✗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-white">{c.label}</p>
                {c.value && (
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                    c.pass ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>{c.value}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.description}</p>

              {/* Progress bar for ratio criteria */}
              {c.value && compliance && (
                <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${c.pass ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{
                      width: `${Math.min(
                        i === 1 ? (compliance.debtToMcap / 33) * 100 : (compliance.interestIncomeToRevenue / 5) * 100,
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
      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-400/80 leading-relaxed">
        <span className="font-bold text-amber-400">
          {isAr ? 'ملاحظة التطهير: ' : 'Purification Note: '}
        </span>
        {isAr
          ? 'إذا كانت الشركة تحقق دخلاً من فوائد بنسبة أقل من الحد المسموح، يجب تبرع جزء من الأرباح للجهات الخيرية.'
          : 'If a compliant company earns minor interest income below the threshold, a proportionate amount of dividends must be donated to charity.'}
      </div>
    </div>
  );
}
