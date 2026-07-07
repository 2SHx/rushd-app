'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, Trophy, ShieldCheck, ShieldAlert, ArrowLeft, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import QuizModal from '../QuizModal';
import PriceChartPanel from './PriceChartPanel';
import RScorePanel from './RScorePanel';
import FundamentalsPanel from './FundamentalsPanel';
import AssistantPanel from './AssistantPanel';
import TradeAction from './TradeAction';

interface StockDetailProps {
  data: any;
  locale: string;
  jarBalance: number;
  sharesOwned: number;
  isParent: boolean;
  onTradeExecuted: (newBalance: number, newShares: number) => void;
  onBack: () => void; // for mobile back button
}

function getRecommendedQuiz(symbol: string) {
  switch (symbol.replace('.SR', '')) {
    case 'NVDA':
      return { 
        topic: 'NASDAQ Markets', 
        descEnglish: 'Learn how NASDAQ technology markets work, trade times, and pricing in USD.',
        descArabic: 'تعرّف على كيفية عمل أسواق ناسداك التقنية ومواعيد التداول والتسعير بالدولار الأمريكي.'
      };
    case '2222':
      return { 
        topic: 'TASI Markets', 
        descEnglish: 'Master Saudi Tadawul specific calendars, TASI indices, and SAR trading.',
        descArabic: 'تعلم أساسيات مؤشر تاسي وتداول الأسهم بالريال السعودي وجداول عمل السوق المالية السعودية.'
      };
    case 'TSLA':
      return { 
        topic: 'Sharia Compliance', 
        descEnglish: 'Learn why some companies fail Sharia financial ratios or business screening.',
        descArabic: 'اكتشف معايير أيقوفي (AAOIFI) ولماذا لا تتوافق بعض الشركات مع ضوابط الاستثمار الإسلامي.'
      };
    case '1120':
      return { 
        topic: 'Savings & Jars', 
        descEnglish: 'Understand Mudarabah savings split models and sharia compliant yields.',
        descArabic: 'افهم عقود المضاربة الشرعية وكيفية توزيع الأرباح بين المودعين والمنصة لتنمية مدخراتك.'
      };
    default:
      return { 
        topic: 'Stock Market Basics', 
        descEnglish: 'Learn the fundamentals of stocks, shares, buy/sell spreads, and order books.',
        descArabic: 'تعلم المبادئ الأساسية للأسهم، وكيفية بيع وشراء حصص الشركات وتوزيع الأرباح الافتراضية.'
      };
  }
}

export default function StockDetail({
  data,
  locale,
  jarBalance,
  sharesOwned,
  isParent,
  onTradeExecuted,
  onBack
}: StockDetailProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizResult, setQuizResult] = useState<{ passed: boolean; xp: number; level: number } | null>(null);

  if (!data) return null;

  const cleanSymbol = data.symbol.replace('.SR', '');
  const displayName = isAr && data.arName ? data.arName : data.name || data.symbol;
  
  // Calculate daily price change details
  const history = data.history || [];
  const prevClose = history.length > 1 ? history[history.length - 2]?.close : (history[0]?.close ?? data.price);
  const change = data.price - prevClose;
  const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  
  const isUp = change > 0;
  const isDown = change < 0;
  
  const currency = data.market === 'TASI' ? (isAr ? 'ر.س' : 'SAR') : 'USD';
  const recommendedQuiz = getRecommendedQuiz(data.symbol);

  const handleQuizComplete = async (passed: boolean) => {
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: recommendedQuiz.topic,
          score: passed ? 100 : 0,
          passed
        })
      });

      if (res.ok) {
        const resData = await res.json();
        setQuizResult({ passed, xp: resData.xp, level: resData.level });
      } else {
        setQuizResult({ passed, xp: 0, level: 0 });
      }
    } catch (err) {
      console.error('Failed to submit quiz complete status:', err);
      setQuizResult({ passed, xp: 0, level: 0 });
    }
  };

  return (
    <div className="space-y-6">
      {/* Mobile Back Button & Header */}
      <div className="flex items-center space-x-3 rtl:space-x-reverse md:hidden p-4 border-b border-white/5 bg-[#0F1420]/70 backdrop-blur-md">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full text-emerald-400">
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <span className="font-bold text-white text-sm">{displayName} ({cleanSymbol})</span>
      </div>

      {/* Stock Quote Header Panel */}
      <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-6 space-y-4 text-start relative overflow-hidden">
        {/* Glowing backdrop circle */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl pointer-events-none" />

        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <h1 className="text-xl font-extrabold text-white">{cleanSymbol}</h1>
              <span className="text-[10px] text-gray-500 font-bold bg-white/5 border border-white/10 px-2 py-0.5 rounded-full uppercase">
                {data.market}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-normal">{displayName}</p>
          </div>

          {/* Sharia Shield Badge */}
          <div className={`flex items-center space-x-1.5 rtl:space-x-reverse px-3.5 py-1.5 rounded-full border text-xs font-bold ${
            data.isShariaCompliant 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/5' 
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/5'
          }`}>
            {data.isShariaCompliant ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            <span>{data.isShariaCompliant ? t('shariaBadgeCompliant') : t('shariaBadgeNonCompliant')}</span>
          </div>
        </div>

        {/* Live quote values */}
        <div className="flex items-baseline space-x-3 rtl:space-x-reverse">
          <span className="text-3xl font-extrabold font-mono text-white leading-none">
            {data.market === 'TASI' && isAr ? (
              <span>{data.price.toFixed(2)} {currency}</span>
            ) : data.market === 'TASI' ? (
              <span>{currency} {data.price.toFixed(2)}</span>
            ) : (
              <span>${data.price.toFixed(2)}</span>
            )}
          </span>
          <div className={`flex items-center space-x-1 rtl:space-x-reverse text-sm font-semibold font-mono ${
            isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-gray-400'
          }`}>
            {isUp ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : isDown ? (
              <ArrowDownRight className="w-4 h-4" />
            ) : (
              <Minus className="w-4 h-4" />
            )}
            <span>{isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{pct.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      {/* 2. Price Chart */}
      <PriceChartPanel history={history} />

      {/* 3. AI R-Score Gauge */}
      <RScorePanel symbol={data.symbol} locale={locale} />

      {/* 4. Recommended Quiz Quest */}
      <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
            <BookOpen className="w-4 h-4" />
            <h3 className="font-bold text-sm text-gray-200">{isAr ? 'اختبار تعليمي موصى به' : 'Recommended Quiz'}</h3>
          </div>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
            {recommendedQuiz.topic}
          </span>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          {isAr ? recommendedQuiz.descArabic : recommendedQuiz.descEnglish}
        </p>

        {quizResult && (
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            quizResult.passed 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400 font-semibold'
          }`}>
            <span>
              {quizResult.passed 
                ? (isAr ? 'تهانينا! نجحت في الاختبار واكتسبت (+50 XP)' : 'Congratulations! You passed (+50 XP)') 
                : (isAr ? 'لم تتجاوز الاختبار بنجاح، حاول مجدداً!' : 'Did not pass, try again!')}
            </span>
            <button onClick={() => setQuizResult(null)} className="underline hover:no-underline font-bold">
              {isAr ? 'إغلاق' : 'Dismiss'}
            </button>
          </div>
        )}

        <button
          onClick={() => { setIsQuizOpen(true); setQuizResult(null); }}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-bold text-xs text-white transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center space-x-2 rtl:space-x-reverse active:scale-95"
        >
          <Trophy className="w-4 h-4" />
          <span>{t('runQuiz')}</span>
        </button>
      </div>

      {/* 5. Sage AI Advisor */}
      <AssistantPanel symbol={data.symbol} market={data.market} currentPrice={data.price} locale={locale} />

      {/* 6. Company Biography & Financials */}
      <FundamentalsPanel data={data} locale={locale} />

      {/* 7. Virtual Trade Portal */}
      <TradeAction
        symbol={data.symbol}
        market={data.market}
        currentPrice={data.price}
        locale={locale}
        jarBalance={jarBalance}
        sharesOwned={sharesOwned}
        isParent={isParent}
        onTradeExecuted={onTradeExecuted}
      />

      {/* Quiz Modal */}
      <QuizModal 
        isOpen={isQuizOpen} 
        onClose={() => setIsQuizOpen(false)} 
        topic={recommendedQuiz.topic} 
        onComplete={handleQuizComplete} 
        locale={locale}
      />
    </div>
  );
}
