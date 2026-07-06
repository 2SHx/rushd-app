// src/components/MarketsClient.tsx
'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Share2, Heart, Search, HelpCircle, Info, ChevronRight, Play, Check, BookOpen, Trophy 
} from 'lucide-react';
import AdvancedTradingChart from './AdvancedTradingChart';
import QuizModal from './QuizModal';

interface MarketsClientProps {
  currentData: any;
  locale: string;
  isParent: boolean;
}

const TICKERS = {
  TASI: [
    { symbol: '2222.SR', name: 'Saudi Aramco', arName: 'أرامكو السعودية', price: 26.1, change: -0.08, pct: -0.02 },
    { symbol: '1120.SR', name: 'Al Rajhi Bank', arName: 'الراجحي', price: 66.0, change: 0.0, pct: 0.0 },
    { symbol: '1020.SR', name: 'Bank AlJazira', arName: 'بنك الجزيرة', price: 16.09, change: 1.39, pct: 9.45 },
    { symbol: '8250.SR', name: 'Amana Insurance', arName: 'أمانة للتأمين', price: 8.25, change: 0.82, pct: 11.04 },
    { symbol: '6060.SR', name: 'East Agriculture', arName: 'الشرقية للتنمية', price: 15.86, change: 1.44, pct: 9.99 }
  ],
  NASDAQ: [
    { symbol: 'NVDA', name: 'NVIDIA Corporation', arName: 'إنفيديا', price: 194.83, change: -2.75, pct: -1.39 },
    { symbol: 'AAPL', name: 'Apple Inc.', arName: 'أبل', price: 175.25, change: 1.45, pct: 0.83 },
    { symbol: 'TSLA', name: 'Tesla Motors', arName: 'تسلا', price: 220.5, change: -4.8, pct: -2.13 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', arName: 'مايكروسوفت', price: 340.1, change: 2.1, pct: 0.62 }
  ]
};

function getRecommendedQuiz(symbol: string) {
  switch (symbol) {
    case 'NVDA':
      return { 
        topic: 'NASDAQ Markets', 
        descEnglish: 'Learn how NASDAQ technology markets work, trade times, and pricing in USD.',
        descArabic: 'تعرّف على كيفية عمل أسواق ناسداك التقنية ومواعيد التداول والتسعير بالدولار الأمريكي.'
      };
    case '2222.SR':
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
    case '1120.SR':
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

export default function MarketsClient({ currentData, locale, isParent }: MarketsClientProps) {
  const isAr = locale === 'ar';
  const [marketTab, setMarketTab] = useState<'TASI' | 'NASDAQ'>(currentData.market);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'sharia' | 'etfs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Detail sheet state
  const [activeSymbol, setActiveSymbol] = useState<string | null>(currentData.symbol);
  
  // Drawer states
  const [purificationDrawerOpen, setPurificationDrawerOpen] = useState(false);
  const [fractionalDrawerOpen, setFractionalDrawerOpen] = useState(false);
  const [tradeSuccessOpen, setTradeSuccessOpen] = useState(false);
  const [aboutReadMore, setAboutReadMore] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Quiz states
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizResult, setQuizResult] = useState<{ passed: boolean; xp: number; level: number } | null>(null);

  const recommendedQuiz = getRecommendedQuiz(currentData.symbol);

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
        const data = await res.json();
        setQuizResult({ passed, xp: data.xp, level: data.level });
      } else {
        setQuizResult({ passed, xp: 0, level: 0 });
      }
    } catch (err) {
      console.error('Failed to submit quiz complete status:', err);
      setQuizResult({ passed, xp: 0, level: 0 });
    }
  };

  // Find active ticker metadata
  const listTickers = [...TICKERS.TASI, ...TICKERS.NASDAQ];
  const activeTicker = listTickers.find(t => t.symbol === activeSymbol) || TICKERS.NASDAQ[0];
  const isCompliant = currentData.isShariaCompliant;

  // Filtered list based on search and category
  const activeList = marketTab === 'TASI' ? TICKERS.TASI : TICKERS.NASDAQ;
  const filteredList = activeList.filter(t => {
    const matchesSearch = t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.arName.includes(searchQuery);
    
    if (selectedCategory === 'sharia') {
      // TSLA is non-compliant in our mock dataset
      return matchesSearch && t.symbol !== 'TSLA';
    }
    return matchesSearch;
  });

  return (
    <div className="min-h-screen text-white select-none max-w-md mx-auto relative bg-[#080B11] border-x border-white/5 pb-24">
      <AnimatePresence mode="wait">
        {!activeSymbol ? (
          /* Market Overview / Dashboard View */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="p-4 space-y-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold font-sans">
                {isAr ? 'الأسهم' : 'Stocks'}
              </h1>
              <div className="flex space-x-3 rtl:space-x-reverse">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                  <span className="text-xs font-bold text-emerald-400">R</span>
                </div>
              </div>
            </div>

            {/* Smart Search */}
            <div className="relative">
              <Search className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 rtl:left-auto rtl:right-4" />
              <input
                type="text"
                placeholder={isAr ? 'جرب البحث الذكي' : 'Try smart search'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#121824] border border-transparent focus:border-emerald-500/30 rounded-2xl py-3 pl-12 pr-4 rtl:pl-4 rtl:pr-12 text-sm text-white placeholder-gray-500 outline-none transition-all"
              />
            </div>

            {/* Markets Selector Tabs */}
            <div className="grid grid-cols-2 bg-[#121824] p-1 rounded-2xl border border-white/5">
              <button
                onClick={() => setMarketTab('TASI')}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 ${
                  marketTab === 'TASI' ? 'bg-[#1D263B] text-white shadow-md' : 'text-gray-400'
                }`}
              >
                <span>🇸🇦</span>
                <span>{isAr ? 'السوق السعودي' : 'Saudi Market'}</span>
              </button>
              <button
                onClick={() => setMarketTab('NASDAQ')}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 ${
                  marketTab === 'NASDAQ' ? 'bg-[#1D263B] text-white shadow-md' : 'text-gray-400'
                }`}
              >
                <span>🇺🇸</span>
                <span>{isAr ? 'السوق الأمريكي' : 'US Market'}</span>
              </button>
            </div>

            {/* Status Banner */}
            <div className="bg-[#121824] rounded-2xl p-3 border border-white/5 flex items-center justify-between text-xs text-gray-400">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>{isAr ? 'السوق مغلق. يبدأ التداول الأحد' : 'Market closed. Trading starts Sunday'}</span>
              </div>
              <span className="font-mono">10:00 ص / 10:00 AM</span>
            </div>

            {/* Top Gainers Horizontal Carousel */}
            {marketTab === 'TASI' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <h3 className="font-bold text-gray-200">{isAr ? 'ملخص السوق' : 'Market Summary'}</h3>
                  <span className="text-xs text-emerald-400 font-semibold">{isAr ? 'الأكثر ارتفاعاً' : 'Top Gainers'}</span>
                </div>
                <div className="flex space-x-3 overflow-x-auto pb-2 pr-1 no-scrollbar rtl:space-x-reverse">
                  {TICKERS.TASI.filter(t => t.pct > 0).map((t) => (
                    <div
                      key={t.symbol}
                      onClick={() => {
                        window.location.href = `/markets?symbol=${t.symbol}&market=TASI`;
                      }}
                      className="bg-[#121824] border border-white/5 min-w-[120px] p-4 rounded-2xl text-center space-y-2 cursor-pointer hover:bg-white/5 transition-all shrink-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-400 mx-auto">
                        {t.symbol.replace('.SR', '')}
                      </div>
                      <p className="text-xs font-bold text-gray-300 truncate">{isAr ? t.arName : t.name}</p>
                      <p className="text-sm font-mono font-bold">{t.price.toFixed(2)}</p>
                      <p className="text-[10px] font-semibold text-emerald-400">+{t.pct}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explore categories pills */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-gray-200">{isAr ? 'استكشف' : 'Explore'}</h3>
              <div className="flex space-x-2 rtl:space-x-reverse text-xs overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-full border transition-all ${
                    selectedCategory === 'all' 
                      ? 'bg-white text-black font-semibold border-white' 
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {isAr ? 'الكل' : 'All'}
                </button>
                <button
                  onClick={() => setSelectedCategory('sharia')}
                  className={`px-4 py-2 rounded-full border transition-all ${
                    selectedCategory === 'sharia' 
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold' 
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {isAr ? 'الأسهم الشرعية' : 'Sharia-Compliant'}
                </button>
                <button
                  onClick={() => setSelectedCategory('all')} // default toggle
                  className="px-4 py-2 rounded-full border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 shrink-0"
                >
                  {isAr ? 'صناديق المؤشرات' : 'ETFs'}
                </button>
              </div>
            </div>

            {/* Ticker rows list */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">{isAr ? 'قائمة المتابعة' : 'Watchlist'}</h3>
              </div>
              <div className="space-y-2">
                {filteredList.map((t) => (
                  <div
                    key={t.symbol}
                    onClick={() => {
                      window.location.href = `/markets?symbol=${t.symbol}&market=${marketTab}`;
                    }}
                    className="bg-[#121824] border border-white/5 p-4 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400">
                        {t.symbol.replace('.SR', '')}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-gray-200">{isAr ? t.arName : t.name}</h4>
                        <span className="text-[10px] text-gray-500 font-mono">{t.symbol}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-sm text-white">{t.price.toFixed(2)}</p>
                      <p className={`text-xs font-semibold ${t.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.pct >= 0 ? '+' : ''}{t.pct}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          /* Detailed Stock View mimicking Slide 2 / 3 / 4 */
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Top Navigation Row */}
            <div className="p-4 flex justify-between items-center sticky top-0 bg-[#080B11]/90 backdrop-blur-md z-30">
              <button
                onClick={() => {
                  window.location.href = `/markets`;
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
              
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <span className="font-bold font-mono text-gray-300">{currentData.symbol}</span>
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Play className="w-3.5 h-3.5 fill-emerald-400" />
                </div>
              </div>

              <div className="flex space-x-2 rtl:space-x-reverse">
                <button 
                  onClick={() => setIsLiked(!isLiked)}
                  className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                    isLiked ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} />
                </button>
                <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Price Headers */}
            <div className="px-4 space-y-1">
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-mono font-bold tracking-tight text-white">
                  ${currentData.price.toFixed(2)}
                </h2>
                <span className="text-xs text-gray-400 font-medium font-sans">
                  {currentData.market === 'TASI' ? 'SAR' : 'USD'}
                </span>
              </div>
              <p className={`text-sm font-semibold font-mono ${activeTicker.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {activeTicker.change > 0 ? '+' : ''}{activeTicker.change.toFixed(2)} ({activeTicker.pct}%)
              </p>
            </div>

            {/* SVG line chart mimicking Slide 4 */}
            <div className="px-4">
              <div className="bg-[#121824] rounded-3xl p-4 border border-white/5 space-y-4">
                <AdvancedTradingChart data={currentData.history} />
                
                {/* Time range selector */}
                <div className="flex justify-between bg-black/40 p-1 rounded-xl text-xs font-semibold text-gray-400">
                  {['يوم', 'أسبوع', 'شهر', '3 أشهر', 'عام', '5 أعوام', 'الكل'].map((lbl, idx) => (
                    <button
                      key={idx}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        idx === 0 ? 'bg-[#1D263B] text-white shadow-sm' : 'hover:text-white'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sharia Tag Pills Section */}
            <div className="px-4">
              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                {/* Compliance Tag */}
                {isCompliant ? (
                  <span className="flex items-center space-x-1 rtl:space-x-reverse bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full">
                    <span>{isAr ? 'متوافق مع الشريعة' : 'Sharia Compliant'}</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 rtl:space-x-reverse bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-full">
                    <span>{isAr ? 'غير متوافق مع الشريعة' : 'Non-Compliant'}</span>
                  </span>
                )}

                {/* Purification Tag */}
                {isCompliant && currentData.purificationRatioBps && (
                  <button
                    onClick={() => setPurificationDrawerOpen(true)}
                    className="flex items-center space-x-1 rtl:space-x-reverse bg-white/5 border border-white/10 text-gray-300 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <span>{isAr ? 'نسبة التطهير' : 'Purification'} {currentData.purificationRatioBps / 100}%</span>
                    <Info className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Fractional Tag */}
                <button
                  onClick={() => setFractionalDrawerOpen(true)}
                  className="flex items-center space-x-1 rtl:space-x-reverse bg-white/5 border border-white/10 text-gray-300 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
                >
                  <span>{isAr ? 'سهم جزئي' : 'Fractional Share'}</span>
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Recommended Quiz Card */}
            <div className="px-4">
              <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
                    <BookOpen className="w-5 h-5" />
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
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    quizResult.passed 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-semibold' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400 font-semibold'
                  }`}>
                    <span>
                      {quizResult.passed 
                        ? (isAr ? 'تهانينا! نجحت في الاختبار (+50 XP)' : 'Congratulations! You passed (+50 XP)') 
                        : (isAr ? 'لم تتجاوز الاختبار بنجاح، حاول مجدداً!' : 'Did not pass, try again!')
                      }
                    </span>
                    <button onClick={() => setQuizResult(null)} className="underline hover:no-underline">
                      {isAr ? 'إغلاق' : 'Dismiss'}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    setIsQuizOpen(true);
                    setQuizResult(null);
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-bold text-xs text-white transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center space-x-2 rtl:space-x-reverse"
                >
                  <Trophy className="w-4 h-4" />
                  <span>{isAr ? 'ابدأ التحدي واكسب XP' : 'Start Challenge & Earn XP'}</span>
                </button>
              </div>
            </div>

            {/* Analyst Ratings Card (Slide 2) */}
            {currentData.analystRatings && (
              <div className="px-4">
                <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'تحليل السهم' : 'Stock Analyst Rating'}</h3>
                  
                  {/* Rating description */}
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {isAr 
                      ? `بناءً على تقييم المحللين لسهم ${currentData.symbol} خلال الأشهر الثلاثة الماضية.`
                      : `Based on analyst recommendations for ${currentData.symbol} over the last three months.`
                    }
                  </p>

                  {/* Ratings Distribution Sliders */}
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">{isAr ? 'شراء' : 'Buy'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentData.analystRatings.buy}%</p>
                    </div>

                    <div className="bg-gray-500/10 border border-gray-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">{isAr ? 'معلق' : 'Hold'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentData.analystRatings.hold}%</p>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-red-400 font-bold uppercase">{isAr ? 'بيع' : 'Sell'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentData.analystRatings.sell}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SVG Expected vs Actual Quarterly Earnings Chart (Slide 2) */}
            {currentData.earningsHistory && (
              <div className="px-4">
                <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'الأرباح' : 'Earnings'}</h3>

                  {/* SVG earnings plot */}
                  <div className="h-44 w-full relative flex items-end">
                    <svg className="w-full h-full" viewBox="0 0 320 160">
                      {/* Grid Lines */}
                      <line x1="20" y1="40" x2="310" y2="40" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                      <line x1="20" y1="80" x2="310" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                      <line x1="20" y1="120" x2="310" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />

                      {/* Connect Lines & Circles */}
                      {currentData.earningsHistory.map((item: any, i: number) => {
                        const x = 40 + i * 65;
                        const yExpected = 130 - item.expected * 50;
                        const yActual = 130 - item.actual * 50;

                        return (
                          <g key={i}>
                            {/* Vertical Line Connector expected-actual */}
                            <line x1={x} y1={yExpected} x2={x} y2={yActual} stroke="rgba(255,255,255,0.2)" />
                            
                            {/* Expected Circle (gray) */}
                            <circle cx={x} cy={yExpected} r="5" fill="#121824" stroke="#4B5563" strokeWidth="2.5" />
                            
                            {/* Actual Circle (green/emerald) */}
                            <circle cx={x} cy={yActual} r="5.5" fill="#121824" stroke="#34D399" strokeWidth="3" />
                            
                            {/* Text labels for Quarters */}
                            <text x={x} y="150" fill="#9CA3AF" fontSize="9" textAnchor="middle" fontWeight="500">
                              {item.quarter}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Legends */}
                  <div className="flex justify-center space-x-6 rtl:space-x-reverse text-[10px] font-semibold text-gray-400">
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-400 bg-[#121824]" />
                      <span>{isAr ? 'ربحية السهم الفعلية' : 'Actual EPS'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-gray-500 bg-[#121824]" />
                      <span>{isAr ? 'ربحية السهم المتوقعة' : 'Expected EPS'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* About Text Block (Slide 3) */}
            <div className="px-4">
              <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-4">
                <h3 className="font-bold text-sm text-gray-200">{isAr ? 'عن الشركة' : 'About the Company'}</h3>
                
                <p className={`text-xs text-gray-400 leading-relaxed ${aboutReadMore ? '' : 'line-clamp-3'}`}>
                  {isAr ? currentData.aboutTextArabic : currentData.aboutTextEnglish}
                </p>

                <button
                  onClick={() => setAboutReadMore(!aboutReadMore)}
                  className="text-xs font-semibold text-emerald-400 hover:underline"
                >
                  {aboutReadMore ? (isAr ? 'عرض أقل' : 'Show less') : (isAr ? 'المزيد' : 'Show more')}
                </button>

                <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'القطاع' : 'Sector'}</span>
                    <span className="font-bold">{isAr ? currentData.sectorArabic : currentData.sectorEnglish}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'عدد الموظفين' : 'Employees'}</span>
                    <span className="font-bold font-mono">{Number(currentData.employees).toLocaleString()}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'المدير التنفيزي' : 'CEO'}</span>
                    <span className="font-bold">{currentData.ceo}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'المقر' : 'Headquarters'}</span>
                    <span className="font-bold truncate block">{currentData.headquarters}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Movement reason (Slide 3) */}
            {currentData.movementReasonArabic && (
              <div className="px-4">
                <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-2">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'سبب حركة السهم' : 'Stock Movement Reason'}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {isAr ? currentData.movementReasonArabic : currentData.movementReasonEnglish}
                  </p>
                </div>
              </div>
            )}

            {/* Statistics Section Sliders (Slide 4) */}
            {currentData.statistics && (
              <div className="px-4">
                <div className="bg-[#121824] rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'الإحصائيات' : 'Statistics'}</h3>
                  
                  {/* Ranges sliders mock rendering */}
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'نطاق اليوم' : "Day's Range"}</span>
                        <span className="font-mono">${currentData.statistics.dayRange[0]} - ${currentData.statistics.dayRange[1]}</span>
                      </div>
                      <div className="h-1 bg-black/40 rounded-full relative">
                        <div className="absolute left-[35%] right-[25%] h-1 bg-emerald-400 rounded-full" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'نطاق 52 أسبوع' : '52-Week Range'}</span>
                        <span className="font-mono">${currentData.statistics.yearRange[0]} - ${currentData.statistics.yearRange[1]}</span>
                      </div>
                      <div className="h-1 bg-black/40 rounded-full relative">
                        <div className="absolute left-[50%] right-[10%] h-1 bg-emerald-400 rounded-full" />
                      </div>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Grid fields */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'سعر الافتتاح' : 'Open Price'}</span>
                      <span className="font-bold font-mono">${currentData.statistics.open}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'الإغلاق السابق' : 'Prev Close'}</span>
                      <span className="font-bold font-mono">${currentData.statistics.prevClose}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'الحجم' : 'Volume'}</span>
                      <span className="font-bold">{currentData.statistics.volume}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'متوسط الحجم' : 'Avg Volume'}</span>
                      <span className="font-bold">{currentData.statistics.avgVolume}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">{isAr ? 'القيمة السوقية' : 'Market Cap'}</span>
                      <span className="font-bold">{currentData.statistics.marketCap}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">{isAr ? 'مكرر الأرباح' : 'P/E Ratio'}</span>
                      <span className="font-bold font-mono">{currentData.statistics.peRatio}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sticky Bottom buying execution bar */}
            <div className="fixed bottom-16 inset-x-0 bg-[#0E1524] border-t border-white/10 px-4 py-3 flex justify-between items-center z-30 max-w-md mx-auto">
              <div className="text-left rtl:text-right">
                <p className="text-xs text-gray-400 font-medium">{isAr ? 'السعر الحالي' : 'Market Price'}</p>
                <p className="text-lg font-mono font-bold text-white">${currentData.price.toFixed(2)}</p>
              </div>

              <button
                onClick={() => setTradeSuccessOpen(true)}
                disabled={isParent || !isCompliant}
                className="px-8 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 font-bold transition-all text-sm shadow-md"
              >
                {isParent ? (isAr ? 'مغلق (للمراقبة)' : 'Locked') : !isCompliant ? (isAr ? 'مغلق (غير شرعي)' : 'Blocked') : (isAr ? 'شراء' : 'Buy')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer: Purification Ratio Details bottom sheet (Slide 5) */}
      <AnimatePresence>
        {purificationDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setPurificationDrawerOpen(false)}
              className="fixed inset-0 bg-black z-40 max-w-md mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 inset-x-0 bg-[#121824] border-t border-white/10 rounded-t-3xl p-6 z-50 text-right space-y-4 max-w-md mx-auto"
            >
              {/* Handle */}
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />

              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-sm text-gray-500 font-mono">Verdict Details</span>
                <h3 className="font-bold text-lg text-emerald-400">{isAr ? 'نسبة التطهير' : 'Purification Ratio'}</h3>
              </div>

              <div className="flex items-center space-x-3 rtl:space-x-reverse justify-end pt-2">
                <span className="text-xs text-gray-400">AAOIFI standards</span>
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Check className="w-4 h-4" />
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? 'تُطبق نسبة التطهير فقط في الحالات التي يقدم فيها السهم توزيعات نقدية على المساهمين. إذا لم تكن هناك توزيعات نقدية، فلا يلزم تطبيق نسبة التطهير الظاهرة.'
                  : 'Purification is only applied on actual cash dividends distributed to shareholders. If no dividends are distributed, purification is not required.'
                }
              </p>

              <p className="text-[10px] text-gray-500 leading-relaxed">
                {isAr
                  ? 'تحديد نسبة التطهير يتم وفقاً لمعايير هيئة المحاسبة والمراجعة للمؤسسات المالية الإسلامية (أيقوفي)، وذلك بالتعاون مع كبار علماء الشريعة.'
                  : 'Purification calculations follow AAOIFI standards guidelines in collaboration with Sharia advisors.'
                }
              </p>

              <button
                onClick={() => setPurificationDrawerOpen(false)}
                className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-bold text-xs transition-all mt-4"
              >
                {isAr ? 'حسناً' : 'Close'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Drawer: Fractional Shares Details bottom sheet (Slide 4) */}
      <AnimatePresence>
        {fractionalDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setFractionalDrawerOpen(false)}
              className="fixed inset-0 bg-black z-40 max-w-md mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 inset-x-0 bg-[#121824] border-t border-white/10 rounded-t-3xl p-6 z-50 text-right space-y-4 max-w-md mx-auto"
            >
              {/* Handle */}
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />

              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-sm text-gray-500 font-mono">Feature Details</span>
                <h3 className="font-bold text-lg text-emerald-400">{isAr ? 'الأسهم القابلة للتجزئة' : 'Fractional Shares'}</h3>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed pt-2">
                {isAr 
                  ? 'الأسهم القابلة للتجزئة تمنحك إمكانية شراء جزء من السهم بدلاً من شراء سهم كامل، أي يمكنك شراء ربع سهم أو نصف وهكذا، مما يجعل جميع الأسهم متاحة للاستثمار حسب ميزانيتك.'
                  : 'Fractional shares let you purchase a portion of a share instead of a full share, making all stocks accessible to invest in regardless of your budget.'
                }
              </p>

              <button
                onClick={() => setFractionalDrawerOpen(false)}
                className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-bold text-xs transition-all mt-4"
              >
                {isAr ? 'فهمت' : 'I Understand'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Dialog: Mock Trade Success Modal */}
      <AnimatePresence>
        {tradeSuccessOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121824] border border-white/10 p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? 'تم تنفيذ الصفقة الافتراضية!' : 'Mock Trade Executed!'}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? `لقد قمت بشراء سهم ${currentData.symbol} افتراضيًا بسعر $${currentData.price.toFixed(2)}. تم تحديث المحفظة الاستثمارية الخاصة بك.`
                  : `You bought ${currentData.symbol} share mock-execution at $${currentData.price.toFixed(2)}. Your portfolio is updated.`
                }
              </p>
              <button
                onClick={() => setTradeSuccessOpen(false)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAr ? 'استمرار' : 'Continue'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <QuizModal 
        isOpen={isQuizOpen} 
        onClose={() => setIsQuizOpen(false)} 
        topic={recommendedQuiz.topic} 
        onComplete={handleQuizComplete} 
      />
    </div>
  );
}
