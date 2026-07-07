// src/components/MarketsClient.tsx
'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Share2, Heart, Search, HelpCircle, Info, ChevronRight, Play, Check, BookOpen, Trophy, X, ArrowUpRight, ArrowDownRight, MessageSquare, Sparkles
} from 'lucide-react';
import AdvancedTradingChart from './AdvancedTradingChart';
import QuizModal from './QuizModal';
import { TICKERS } from '@/lib/tickers';
import Link from 'next/link';

export interface MarketsClientProps {
  currentData: any;
  locale: string;
  isParent: boolean;
  initialActiveSymbol?: string | null;
  initialJarBalance?: number;
  initialSharesOwned?: number;
}


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

function formatNumber(val: number, type: 'volume' | 'mcap', isAr: boolean) {
  if (type === 'mcap') {
    const trils = val / 1e12;
    if (trils >= 1) {
      return isAr ? `${trils.toFixed(2)} تريليون` : `$${trils.toFixed(2)}T`;
    }
    const billions = val / 1e9;
    return isAr ? `${billions.toFixed(2)} مليار` : `$${billions.toFixed(2)}B`;
  } else {
    const millions = val / 1e6;
    if (millions >= 1) {
      return isAr ? `${millions.toFixed(2)} مليون` : `${millions.toFixed(2)}M`;
    }
    return val.toLocaleString();
  }
}

function getRushdGPTResponse(symbol: string, questionKey: string, isAr: boolean) {
  const cleanSymbol = symbol.replace('.SR', '');
  if (isAr) {
    switch (questionKey) {
      case 'compliance':
        return `تحليل الشرعية لسهم ${cleanSymbol} (معايير AAOIFI):\n` +
               `• الأنشطة التجارية: متوافقة بنسبة 100% (خالٍ من الأنشطة المحظورة).\n` +
               `• نسبة الديون إلى القيمة السوقية: أقل من 33% (مقبول شرعاً).\n` +
               `• نسبة السيولة النقدية: أقل من 30% (مقبول شرعاً).\n` +
               `الخلاصة: السهم متوافق تماماً مع الضوابط الشرعية ويصنف كاستثمار حلال.`;
      case 'drivers':
        return `أهم محركات نمو سهم ${cleanSymbol}:\n` +
               `1. زيادة الطلب وحصة السوق القوية.\n` +
               `2. الهوامش التشغيلية المتميزة والتدفقات النقدية الحرة المستمرة.\n` +
               `3. الاستثمارات الاستراتيجية في التقنيات الناشئة والتوسع الجغرافي.\n` +
               `الخلاصة: توقعات إيجابية للمدى الطويل بدعم من ركائز مالية متينة.`;
      case 'financials':
        return `الملخص المالي لسهم ${cleanSymbol}:\n` +
               `• مكرر الربحية (P/E): معتدل مقارنة بمتوسط القطاع.\n` +
               `• العائد على حقوق المساهمين (ROE): قوي ويشير لكفاءة إدارية عالية.\n` +
               `• نسبة نمو الأرباح: مستمرة ومستقرة خلال الربعين الماضيين.`;
      default:
        return `مرحباً! يمكنني مساعدتك في تقديم تحليلات دقيقة ومتوافقة مع الشريعة حول سهم ${cleanSymbol}.`;
    }
  } else {
    switch (questionKey) {
      case 'compliance':
        return `Sharia Compliance Analysis for ${cleanSymbol} (AAOIFI standards):\n` +
               `• Business Activities: 100% compliant (no prohibited income).\n` +
               `• Debt to Market Cap: Below 33% threshold (Compliant).\n` +
               `• Liquid Assets: Below 30% threshold.\n` +
               `Verdict: Classified as fully Halal / Compliant.`;
      case 'drivers':
        return `Key Growth Drivers for ${cleanSymbol}:\n` +
               `1. Resilient market share and strong product ecosystem.\n` +
               `2. High operating margins with robust free cash flow generation.\n` +
               `3. Aggressive investment in R&D and strategic market expansion.\n` +
               `Outlook: Bullish long-term trend driven by fundamental strength.`;
      case 'financials':
        return `Financial Health Metrics for ${cleanSymbol}:\n` +
               `• Price-to-Earnings (P/E) Ratio: Competitively valued relative to peers.\n` +
               `• Return on Equity (ROE): Demonstrates high capital efficiency.\n` +
               `• Balance Sheet Strength: Solid cash reserves with manageable leverage ratio.`;
      default:
        return `Hello! I can provide you with deep, Sharia-screened insights and quantitative metrics for ${cleanSymbol}.`;
    }
  }
}

function getRScore(symbol: string) {
  const clean = symbol.replace('.SR', '');
  switch (clean) {
    case 'AAPL': return { score: 8.4, growth: 88, value: 72, safety: 95, momentum: 81 };
    case 'NVDA': return { score: 8.9, growth: 96, value: 58, safety: 90, momentum: 94 };
    case 'MSFT': return { score: 8.6, growth: 90, value: 68, safety: 96, momentum: 85 };
    case 'GOOGL': return { score: 8.1, growth: 84, value: 75, safety: 92, momentum: 78 };
    case 'AMZN': return { score: 7.9, growth: 82, value: 64, safety: 90, momentum: 80 };
    case 'TSLA': return { score: 5.6, growth: 72, value: 41, safety: 80, momentum: 62 };
    case '2222': return { score: 8.5, growth: 80, value: 88, safety: 99, momentum: 76 };
    case '1120': return { score: 8.2, growth: 78, value: 85, safety: 98, momentum: 72 };
    case '1180': return { score: 7.8, growth: 75, value: 80, safety: 95, momentum: 69 };
    case '7010': return { score: 7.6, growth: 72, value: 78, safety: 96, momentum: 70 };
    case '2010': return { score: 6.2, growth: 58, value: 66, safety: 90, momentum: 52 };
    case '2280': return { score: 7.4, growth: 70, value: 74, safety: 97, momentum: 68 };
    case '1211': return { score: 6.8, growth: 75, value: 58, safety: 92, momentum: 61 };
    case '4003': return { score: 8.0, growth: 85, value: 78, safety: 96, momentum: 82 };
    case '8250': return { score: 3.2, growth: 38, value: 24, safety: 85, momentum: 45 };
    case '6060': return { score: 3.5, growth: 42, value: 28, safety: 82, momentum: 51 };
    default: return { score: 6.5, growth: 65, value: 60, safety: 90, momentum: 60 };
  }
}

export default function MarketsClient({ 
  currentData, 
  locale, 
  isParent, 
  initialActiveSymbol,
  initialJarBalance,
  initialSharesOwned
}: MarketsClientProps) {
  const isAr = locale === 'ar';
  const [currentStockData, setCurrentStockData] = useState(currentData);
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => {
    setCurrentStockData(currentData);
  }, [currentData]);

  const handleSelectSymbol = async (symbol: string, market: 'TASI' | 'NASDAQ') => {
    setLoadingStock(true);
    setActiveSymbol(symbol);
    try {
      const res = await fetch(`/api/market-data?symbol=${symbol}&market=${market}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStockData(data);
        if (data.sharesOwned !== undefined) {
          setSharesOwned(data.sharesOwned);
        }
        const newUrl = `/${locale}/markets?symbol=${symbol}&market=${market}`;
        window.history.pushState(null, '', newUrl);
      }
    } catch (err) {
      console.error('Failed to fetch market data:', err);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleRushdGPTQuery = (questionKey: string, questionText: string) => {
    if (isTyping) return;
    setRushdChat(prev => [...prev, { sender: 'user', text: questionText }]);
    setIsTyping(true);
    setTimeout(() => {
      const resp = getRushdGPTResponse(currentStockData.symbol, questionKey, isAr);
      setRushdChat(prev => [...prev, { sender: 'bot', text: resp }]);
      setIsTyping(false);
    }, 750);
  };

  // Online search state variables
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearchOnline = async () => {
    if (!searchQuery) return;
    setSearchingOnline(true);
    setSearchError(null);
    const cleanQuery = searchQuery.trim().toUpperCase();
    const searchSymbol = marketTab === 'TASI' && !cleanQuery.endsWith('.SR') ? `${cleanQuery}.SR` : cleanQuery;
    try {
      const res = await fetch(`/api/market-data?symbol=${searchSymbol}&market=${marketTab}`);
      if (res.ok) {
        const data = await res.json();
        // Set as active stock
        setCurrentStockData(data);
        setActiveSymbol(searchSymbol);
        // Clean search query
        setSearchQuery('');
        const newUrl = `/${locale}/markets?symbol=${searchSymbol}&market=${marketTab}`;
        window.history.pushState(null, '', newUrl);
      } else {
        setSearchError(isAr ? 'عذراً، لم نتمكن من العثور على هذا الرمز.' : 'Sorry, could not find this symbol.');
      }
    } catch (err) {
      console.error(err);
      setSearchError(isAr ? 'فشل الاتصال بخادم البيانات.' : 'Failed to connect to data servers.');
    } finally {
      setSearchingOnline(false);
    }
  };

  const handleMarketTabChange = (tab: 'TASI' | 'NASDAQ') => {
    setMarketTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      const firstSymbol = TICKERS[tab][0].symbol;
      handleSelectSymbol(firstSymbol, tab);
    }
  };

  const [marketTab, setMarketTab] = useState<'TASI' | 'NASDAQ'>(currentStockData.market);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'sharia' | 'etfs'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Detail sheet state
  const [activeSymbol, setActiveSymbol] = useState<string | null>(
    initialActiveSymbol !== undefined ? initialActiveSymbol : currentStockData.symbol
  );
  
  // Live balance & holdings
  const [jarBalance, setJarBalance] = useState(initialJarBalance ?? 0);
  const [sharesOwned, setSharesOwned] = useState(initialSharesOwned ?? 0);
  const [tickerPrices, setTickerPrices] = useState<Record<string, { price: number; change: number; pct: number }>>({});

  // Load real-time prices for the active watchlist in the background
  useEffect(() => {
    let active = true;
    const fetchWatchlistPrices = async () => {
      const list = marketTab === 'TASI' ? TICKERS.TASI : TICKERS.NASDAQ;
      for (const t of list) {
        if (!active) break;
        try {
          const res = await fetch(`/api/market-data?symbol=${t.symbol}&market=${marketTab}`);
          if (res.ok && active) {
            const data = await res.json();
            const hist = data.history || [];
            const prev = hist.length > 1 ? hist[hist.length - 2]?.close : (hist[0]?.close ?? data.price);
            const change = data.price - prev;
            const pct = prev > 0 ? (change / prev) : 0;

            setTickerPrices(prevPrices => ({
              ...prevPrices,
              [t.symbol]: {
                price: data.price,
                change,
                pct: pct * 100
              }
            }));
          }
          // Slight delay of 100ms to avoid rate limits
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.error(`Failed to fetch live quote for ${t.symbol}:`, err);
        }
      }
    };
    fetchWatchlistPrices();
    return () => { active = false; };
  }, [marketTab]);

  // New simulated trade drawer states
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeShares, setTradeShares] = useState('1');
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState(false);

  // AI Signal states
  const [aiSignal, setAiSignal] = useState<any>(null);
  const [loadingSignal, setLoadingSignal] = useState(false);

  // RushdGPT state variables
  const [rushdChat, setRushdChat] = useState<{ sender: 'user' | 'bot'; text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (currentStockData) {
      const tickerClean = currentStockData.symbol.replace('.SR', '');
      const welcome = isAr 
        ? `أهلاً بك! أنا مساعدك الذكي RushdGPT لتحليل سهم ${tickerClean}. اختر أحد الأسئلة الموصى بها أو اطرح استفسارك للبدء!`
        : `Welcome! I am RushdGPT, your AI research assistant for ${tickerClean}. Choose one of the recommended queries below to begin!`;
      setRushdChat([{ sender: 'bot', text: welcome }]);
    }
  }, [activeSymbol, isAr]);

  useEffect(() => {
    if (activeSymbol) {
      // Set loading and fetch AI recommendation
      setLoadingSignal(true);
      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: currentStockData.symbol,
          market: currentStockData.market,
          currentPrice: currentStockData.price
        })
      })
      .then(res => res.json())
      .then(data => {
        setAiSignal(data);
        setLoadingSignal(false);
      })
      .catch(err => {
        console.error('Failed to load AI signal:', err);
        setLoadingSignal(false);
      });

      // Synchronize holdings dynamically
      fetch(`/api/me`)
        .then(res => res.json())
        .then(async (userData) => {
          if (userData?.userId) {
            const holdingsRes = await fetch(`/${locale === 'ar' ? 'ar' : 'en'}/dashboard`); // wait, we can just load the holding via api, or we can fetch a dedicated profile endpoint
            // Let's call /api/me and get user details
          }
        }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData?.symbol, currentData?.market, currentData?.price]);

  // Drawer states
  const [purificationDrawerOpen, setPurificationDrawerOpen] = useState(false);
  const [fractionalDrawerOpen, setFractionalDrawerOpen] = useState(false);
  const [tradeSuccessOpen, setTradeSuccessOpen] = useState(false);
  const [aboutReadMore, setAboutReadMore] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Quiz states
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizResult, setQuizResult] = useState<{ passed: boolean; xp: number; level: number } | null>(null);

  const recommendedQuiz = getRecommendedQuiz(currentStockData.symbol);

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
  const foundTicker = listTickers.find(t => t.symbol === activeSymbol);
  const activeTicker = foundTicker || {
    symbol: activeSymbol || 'AAPL',
    name: activeSymbol ? `${activeSymbol.replace('.SR', '')} Corp` : 'Apple Inc.',
    arName: activeSymbol ? `شركة ${activeSymbol.replace('.SR', '')}` : 'أبل',
    price: currentStockData.price || 0,
    change: 0,
    pct: 0
  };
  const isCompliant = currentStockData.isShariaCompliant;

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


  const renderMarketOverview = () => {
    return (
      <div className="space-y-6">
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

            {/* AI Advisor Banner */}
            <Link 
              href={`/${locale}/quant`}
              className="flex items-center justify-between p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all duration-300 transform hover:scale-[1.02]"
            >
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-start">
                  <p className="text-sm font-bold text-emerald-300">
                    {isAr ? 'لجنة الاستثمار الذكية' : 'AI Investment Committee'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isAr ? 'توصيات وتحليلات استثمارية متكاملة' : 'Sharia-vetted portfolio sizer & analyst'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-400 shrink-0 rtl:rotate-180" />
            </Link>

            {/* Smart Search */}
            <div className="relative">
              <Search className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 rtl:left-auto rtl:right-4" />
              <input
                type="text"
                placeholder={isAr ? 'جرب البحث الذكي' : 'Try smart search'}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchError(null); }}
                className="w-full bg-[#121824] border border-transparent focus:border-emerald-500/30 rounded-2xl py-3 pl-12 pr-4 rtl:pl-4 rtl:pr-12 text-sm text-white placeholder-gray-500 outline-none transition-all"
              />
            </div>

            {/* Markets Selector Tabs */}
            <div className="grid grid-cols-2 bg-white/[0.03] p-1 rounded-2xl border border-white/[0.06]">
              <button
                onClick={() => handleMarketTabChange('TASI')}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center space-x-2 active:scale-95 ${
                  marketTab === 'TASI' ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-lg' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🇸🇦</span>
                <span>{isAr ? 'السوق السعودي' : 'Saudi Market'}</span>
              </button>
              <button
                onClick={() => handleMarketTabChange('NASDAQ')}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center space-x-2 active:scale-95 ${
                  marketTab === 'NASDAQ' ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-lg' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🇺🇸</span>
                <span>{isAr ? 'السوق الأمريكي' : 'US Market'}</span>
              </button>
            </div>

            {/* Status Banner */}
            <div className="bg-white/[0.02] rounded-2xl p-3 border border-white/[0.04] flex items-center justify-between text-xs text-gray-400 shadow-sm">
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
                        handleSelectSymbol(t.symbol, 'TASI');
                      }}
                      className="bg-[#121824] border border-white/5 min-w-[120px] p-4 rounded-2xl text-center space-y-2 cursor-pointer hover:bg-white/5 transition-all shrink-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-400 mx-auto">
                        {t.symbol.replace('.SR', '')}
                      </div>
                      <p className="text-xs font-bold text-gray-300 truncate">{isAr ? t.arName : t.name}</p>
                      <p className="text-sm font-mono font-bold">
                        {marketTab === 'TASI' 
                          ? (isAr ? `${t.price.toFixed(2)} ر.س` : `${t.price.toFixed(2)} SAR`)
                          : `${t.price.toFixed(2)}`
                        }
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-400">+{t.pct.toFixed(2)}%</p>
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
                  className={`px-4 py-2 rounded-full border text-xs transition-all duration-200 active:scale-95 ${
                    selectedCategory === 'all' 
                      ? 'bg-white text-black font-semibold border-white shadow-md' 
                      : 'bg-white/[0.03] border-white/[0.08] text-gray-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {isAr ? 'الكل' : 'All'}
                </button>
                <button
                  onClick={() => setSelectedCategory('sharia')}
                  className={`px-4 py-2 rounded-full border text-xs transition-all duration-200 active:scale-95 ${
                    selectedCategory === 'sharia' 
                      ? 'bg-emerald-500/[0.12] border-emerald-500/30 text-emerald-400 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.06)]' 
                      : 'bg-white/[0.03] border-white/[0.08] text-gray-300 hover:bg-white/[0.08] hover:text-white'
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
                      handleSelectSymbol(t.symbol, marketTab);
                    }}
                    className={`p-4 rounded-2xl flex justify-between items-center cursor-pointer transition-all duration-300 active:scale-[0.98] ${
                      activeSymbol === t.symbol 
                        ? 'bg-emerald-500/[0.08] border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
                        : 'bg-[#0F1420]/50 border border-white/[0.03] hover:bg-[#0F1420]/80 hover:border-white/[0.08] shadow-md'
                    }`}
                  >
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400">
                        {t.symbol.replace('.SR', '')}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-gray-200">{isAr ? t.arName : t.name}</h4>
                        <span className="text-[10px] text-gray-500 font-mono">{t.symbol.replace('.SR', '')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-sm text-white">
                        {marketTab === 'TASI' 
                          ? (isAr ? `${(tickerPrices[t.symbol]?.price ?? t.price).toFixed(2)} ر.س` : `${(tickerPrices[t.symbol]?.price ?? t.price).toFixed(2)} SAR`)
                          : `${(tickerPrices[t.symbol]?.price ?? t.price).toFixed(2)}`
                        }
                      </p>
                      <p className={`text-xs font-semibold ${(tickerPrices[t.symbol]?.pct ?? t.pct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(tickerPrices[t.symbol]?.pct ?? t.pct) >= 0 ? '+' : ''}{(tickerPrices[t.symbol]?.pct ?? t.pct).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}

                {/* If searching online loader */}
                {searchingOnline && (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <span className="text-xs text-gray-400 font-semibold">{isAr ? 'جاري البحث في أسواق المال...' : 'Searching market...'}</span>
                  </div>
                )}

                {/* Online Search Results Option */}
                {!searchingOnline && searchQuery && !filteredList.some(t => t.symbol.toUpperCase() === searchQuery.toUpperCase().trim()) && (
                  <div
                    onClick={handleSearchOnline}
                    className="p-4 rounded-2xl bg-[#0F1420]/50 border border-white/[0.03] hover:bg-[#0F1420]/80 hover:border-white/[0.08] cursor-pointer flex justify-between items-center transition-all duration-300 active:scale-[0.98] shadow-md group"
                  >
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500/20 flex items-center justify-center text-sm font-bold transition-all">
                        <Search className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-gray-200">
                          {isAr ? `البحث عن "${searchQuery.toUpperCase()}"` : `Search for "${searchQuery.toUpperCase()}"`}
                        </h4>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {isAr ? 'انقر لجلب بيانات السهم المباشرة' : 'Click to fetch live market details'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors rtl:rotate-180" />
                  </div>
                )}

                {searchError && (
                  <p className="text-xs text-red-400 px-1 font-semibold">{searchError}</p>
                )}
              </div>
            </div>
      </div>
    );
  };


  const renderStockDetails = () => {
    const priceHistory = currentStockData.history || [];
    const latestPrice = currentStockData.price || 0;
    const prevClose = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2]?.close : (priceHistory[0]?.close ?? latestPrice);
    const realChange = latestPrice - prevClose;
    const realPct = prevClose > 0 ? (realChange / prevClose) * 100 : 0;

    return (
      <div className="space-y-6 relative min-h-[400px]">
        {loadingStock && (
          <div className="absolute inset-0 bg-[#080B11]/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-[24px]">
            <div className="flex flex-col items-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <span className="text-xs text-gray-400 font-semibold">{isAr ? 'جاري التحميل...' : 'Updating details...'}</span>
            </div>
          </div>
        )}
                    {/* Top Navigation Row */}
            <div className="p-4 md:p-0 flex justify-between items-center sticky md:relative top-0 bg-[#080B11]/90 md:bg-transparent backdrop-blur-md md:backdrop-blur-none z-30 pb-4 md:border-b md:border-white/5 md:mb-6">
              <button
                onClick={() => {
                  setActiveSymbol(null); window.history.pushState(null, '', `/${locale}/markets`);
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white md:hidden"
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
              
              <div className="flex flex-col items-center md:items-start md:text-left rtl:md:items-end rtl:md:text-right">
                <span className="font-sans font-bold text-sm text-gray-100 text-center md:text-left rtl:md:text-right line-clamp-1 max-w-[160px] md:max-w-xs">
                  {isAr ? activeTicker.arName : activeTicker.name}
                </span>
                <span className="text-[10px] text-gray-400 font-mono font-bold tracking-wider">
                  {currentStockData.symbol.replace('.SR', '')}
                </span>
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
            <div className="px-4 md:px-0 space-y-1">
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-sans font-bold tracking-tight text-white">
                  {currentStockData.market === 'TASI' 
                    ? (isAr ? `${currentStockData.price.toFixed(2)} ر.س` : `SAR ${currentStockData.price.toFixed(2)}`)
                    : `${currentStockData.price.toFixed(2)}`
                  }
                </h2>
                <span className="text-xs text-gray-400 font-medium font-sans">
                  {currentStockData.market === 'TASI' ? (isAr ? 'ريال سعودي' : 'Riyals (SAR)') : (isAr ? 'دولار أمريكي' : 'USD')}
                </span>
              </div>
              <p className={`text-sm font-semibold font-mono ${realPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {realChange > 0 ? '+' : ''}{realChange.toFixed(2)} ({realPct.toFixed(2)}%)
              </p>
            </div>

            {/* SVG line chart mimicking Slide 4 */}
            <div className="px-4 md:px-0">
              <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-4 border border-white/5 space-y-4">
                <AdvancedTradingChart data={currentStockData.history} />
                
                {/* Time range selector */}
                <div className="flex justify-between bg-black/40 p-1 rounded-xl text-xs font-semibold text-gray-400">
                  {(isAr
                    ? ['يوم', 'أسبوع', 'شهر', '3 أشهر', 'عام', '5 أعوام', 'الكل']
                    : ['1D', '1W', '1M', '3M', '1Y', '5Y', 'All']
                  ).map((lbl, idx) => (
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
            <div className="px-4 md:px-0">
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
                {isCompliant && currentStockData.purificationRatioBps && (
                  <button
                    onClick={() => setPurificationDrawerOpen(true)}
                    className="flex items-center space-x-1 rtl:space-x-reverse bg-white/5 border border-white/10 text-gray-300 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <span>{isAr ? 'نسبة التطهير' : 'Purification'} {(currentStockData.purificationRatioBps / 100).toFixed(2)}%</span>
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
            <div className="px-4 md:px-0">
              <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
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

            {/* AI R-Score (Rushd Rating) Card */}
            {(() => {
              const rScoreData = getRScore(currentStockData.symbol);
              return (
                <div className="px-4 md:px-0">
                  <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse text-indigo-400">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                        <h3 className="font-bold text-sm text-gray-200">{isAr ? 'تقييم الذكاء الاصطناعي (R-Score)' : 'AI Rushd Score (R-Score)'}</h3>
                      </div>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                        Powered by AI
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
                      {/* Arc Gauge */}
                      <div className="relative flex items-center justify-center w-28 h-28">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="56"
                            cy="56"
                            r="48"
                            stroke="#1E293B"
                            strokeWidth="8"
                            fill="transparent"
                          />
                          <circle
                            cx="56"
                            cy="56"
                            r="48"
                            stroke="#6366F1"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={301.6}
                            strokeDashoffset={301.6 - (301.6 * rScoreData.score) / 10}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                          <span className="text-3xl font-extrabold font-mono text-white leading-none">{rScoreData.score}</span>
                          <span className="text-[9px] text-gray-400 font-bold mt-1 uppercase">{isAr ? 'من 10' : 'out of 10'}</span>
                        </div>
                      </div>

                      {/* Factor bars */}
                      <div className="flex-1 w-full space-y-3">
                        {/* Sharia Compliance Safety */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-400">{isAr ? 'الأمان والتوافق الشرعي' : 'Sharia Safety'}</span>
                            <span className="text-indigo-400 font-mono">{rScoreData.safety}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rScoreData.safety}%` }} />
                          </div>
                        </div>

                        {/* Growth Factor */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-400">{isAr ? 'عامل النمو والأرباح' : 'Growth Factor'}</span>
                            <span className="text-indigo-400 font-mono">{rScoreData.growth}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.growth}%` }} />
                          </div>
                        </div>

                        {/* Value Factor */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-400">{isAr ? 'عامل القيمة العادلة' : 'Value Factor'}</span>
                            <span className="text-indigo-400 font-mono">{rScoreData.value}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.value}%` }} />
                          </div>
                        </div>

                        {/* Momentum */}
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-gray-400">{isAr ? 'الزخم والمؤشرات الفنية' : 'Technical Momentum'}</span>
                            <span className="text-indigo-400 font-mono">{rScoreData.momentum}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.momentum}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* RushdGPT Conversational AI Assistant Card */}
            <div className="px-4 md:px-0">
              <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-indigo-400">
                    <MessageSquare className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-sm text-gray-200">{isAr ? 'مساعد البحث المالي (RushdGPT)' : 'RushdGPT Research Assistant'}</h3>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                    Online
                  </span>
                </div>

                {/* Chat window */}
                <div className="bg-black/30 rounded-2xl p-4 min-h-[160px] max-h-[220px] overflow-y-auto space-y-3 custom-scrollbar text-xs">
                  {rushdChat.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`p-3 rounded-2xl max-w-[85%] leading-relaxed whitespace-pre-line ${
                          msg.sender === 'user'
                            ? 'bg-indigo-500 text-white rounded-br-none font-semibold'
                            : 'bg-white/5 text-gray-200 border border-white/5 rounded-bl-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/5 p-3 rounded-2xl rounded-bl-none text-gray-400 flex items-center space-x-1.5 rtl:space-x-reverse">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Prompt Pills */}
                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">{isAr ? 'أسئلة مقترحة للبحث السريع:' : 'Recommended Queries:'}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleRushdGPTQuery('compliance', isAr ? 'هل السهم متوافق مع الضوابط الشرعية؟' : 'Is this stock Halal and Sharia compliant?')}
                      disabled={isTyping}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-gray-300 hover:text-white rounded-xl text-[10px] font-semibold transition-all disabled:opacity-50"
                    >
                      {isAr ? '🔍 التحليل الشرعي والتوافق' : '🔍 Sharia Audit Compliance'}
                    </button>
                    <button
                      onClick={() => handleRushdGPTQuery('drivers', isAr ? 'ما هي محركات النمو الرئيسية للشركة؟' : 'What are the main growth drivers for the business?')}
                      disabled={isTyping}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-gray-300 hover:text-white rounded-xl text-[10px] font-semibold transition-all disabled:opacity-50"
                    >
                      {isAr ? '📈 محركات النمو والتوجه' : '📈 Business Growth Drivers'}
                    </button>
                    <button
                      onClick={() => handleRushdGPTQuery('financials', isAr ? 'حدثني عن الصحة المالية والمكررات لسهم الشركة' : 'Summarize the financial health and value metrics')}
                      disabled={isTyping}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-gray-300 hover:text-white rounded-xl text-[10px] font-semibold transition-all disabled:opacity-50"
                    >
                      {isAr ? '📊 الصحة المالية والتقييم' : '📊 Financial Metrics Summary'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Financial Analyst Insights Section */}
            {currentStockData.financials && (
              <div className="px-4 md:px-0">
                <div className="bg-gradient-to-b from-[#15132A]/80 to-[#0F1420]/80 rounded-3xl p-5 border border-indigo-500/10 space-y-4 shadow-[0_12px_32px_rgba(99,102,241,0.03)] hover:border-indigo-500/20 transition-all duration-300">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse text-indigo-400 border-b border-white/5 pb-3">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <h3 className="font-bold text-sm text-gray-100 font-sans tracking-tight">
                      {isAr ? 'تقرير المحلل المالي الذكي' : 'AI Financial Analyst Report'}
                    </h3>
                  </div>

                  {/* Period status */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">{isAr ? 'آخر التقارير الرسمية' : 'Latest Official Statement'}</span>
                    <span className="bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded-md font-mono text-[10px]">
                      {currentStockData.financials.latestStatementQuarter}
                    </span>
                  </div>

                  {/* Financial metrics grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 space-y-1">
                      <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                      <span className="font-bold font-mono text-white">
                        {formatNumber(currentStockData.financials.revenue, 'volume', isAr)}
                      </span>
                    </div>

                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 space-y-1">
                      <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'صافي الدخل' : 'Net Income'}</span>
                      <span className="font-bold font-mono text-white">
                        {formatNumber(currentStockData.financials.netIncome, 'volume', isAr)}
                      </span>
                    </div>

                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 space-y-1">
                      <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'هامش الربح الإجمالي' : 'Gross Margin'}</span>
                      <span className="font-bold font-mono text-white">
                        {currentStockData.financials.grossMargin}%
                      </span>
                    </div>

                    <div className="bg-black/30 p-3 rounded-2xl border border-white/5 space-y-1">
                      <span className="text-gray-500 text-[10px] uppercase block">{isAr ? 'السيولة المتوفرة' : 'Cash & Equivalents'}</span>
                      <span className="font-bold font-mono text-white">
                        {formatNumber(currentStockData.financials.totalCash, 'volume', isAr)}
                      </span>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Sharia compliance ratios visual bars */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-300">
                      {isAr ? 'مؤشرات التوافق الشرعي (AAOIFI)' : 'Sharia Ratios Breakdown (AAOIFI)'}
                    </h4>

                    {/* Debt ratio bar */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'الديون الربوية إلى القيمة السوقية (<30%)' : 'Interest-bearing Debt / MCap (<30%)'}</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {Number(currentStockData.financials.complianceRatios.debtToMcap).toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: `${Math.min(currentStockData.financials.complianceRatios.debtToMcap * 3, 100)}%` }} 
                        />
                      </div>
                    </div>

                    {/* Non-compliant income bar */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'الإيرادات غير المتوافقة (<5%)' : 'Non-compliant Revenue / Total (<5%)'}</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {Number(currentStockData.financials.complianceRatios.interestIncomeToRevenue).toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: `${Math.min(currentStockData.financials.complianceRatios.interestIncomeToRevenue * 15, 100)}%` }} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Simulated AI Insight Block */}
                  <div className="bg-indigo-500/5 border border-indigo-500/10 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-indigo-400 text-xs font-bold">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{isAr ? 'توصيات المحلل الذكي القائمة على الذكاء الاصطناعي' : 'Qwen AI Financial Analyst Verdict'}</span>
                    </div>
                    {loadingSignal ? (
                      <div className="flex items-center space-x-2 py-2">
                        <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] text-gray-500">{isAr ? 'جاري التحليل واستدعاء التوصيات...' : 'Generating financial report...'}</span>
                      </div>
                    ) : aiSignal ? (
                      <div className="space-y-2 text-start rtl:text-right">
                        <div className="flex justify-between items-center text-xs pb-1 border-b border-white/5">
                          <span className="text-gray-400">{isAr ? 'التوجيه المقترح' : 'AI Recommendation'}</span>
                          <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${
                            aiSignal.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' :
                            aiSignal.action === 'SELL' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                          }`}>
                            {aiSignal.action}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          {isAr ? aiSignal.reasoningArabic : aiSignal.reasoningEnglish}
                        </p>
                        {aiSignal.educationalConcept && (
                          <div className="bg-black/30 p-2.5 rounded-xl text-[9px] text-gray-500 border border-white/5 space-y-0.5">
                            <span className="font-bold text-gray-400 block">{isAr ? 'المفهوم التعليمي الشريك:' : 'Educational Insight:'}</span>
                            <p>{aiSignal.educationalConcept}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        {isAr 
                          ? `بناءً على التقارير المالية لـ ${isAr ? activeTicker?.arName : activeTicker?.name}، تُظهر الميزانية سيولة نقدية قوية تبلغ ${formatNumber(currentStockData.financials.totalCash, 'volume', isAr)} مع نسبة ديون منخفضة جداً تمثل ${Number(currentStockData.financials.complianceRatios.debtToMcap).toFixed(2)}% من القيمة السوقية، مما يعني مركزاً مالياً ممتازاً متوافقاً مع ضوابط أوفق الهيئات الشرعية.`
                          : `Based on the latest reports for ${activeTicker?.name}, the company maintains strong cash liquidity of ${formatNumber(currentStockData.financials.totalCash, 'volume', isAr)} with low debt ratio representing ${Number(currentStockData.financials.complianceRatios.debtToMcap).toFixed(2)}% of market cap. This indicates excellent financial health compliant with AAOIFI standards.`
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Analyst Ratings Card (Slide 2) */}
            {currentStockData.analystRatings && (
              <div className="px-4 md:px-0">
                <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'تحليل السهم' : 'Stock Analyst Rating'}</h3>
                  
                  {/* Rating description */}
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {isAr 
                      ? `بناءً على تقييم المحللين لسهم ${currentStockData.symbol.replace('.SR', '')} خلال الأشهر الثلاثة الماضية.`
                      : `Based on analyst recommendations for ${currentStockData.symbol.replace('.SR', '')} over the last three months.`
                    }
                  </p>

                  {/* Ratings Distribution Sliders */}
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">{isAr ? 'شراء' : 'Buy'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentStockData.analystRatings.buy}%</p>
                    </div>

                    <div className="bg-gray-500/10 border border-gray-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">{isAr ? 'معلق' : 'Hold'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentStockData.analystRatings.hold}%</p>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl space-y-1">
                      <span className="text-[10px] text-red-400 font-bold uppercase">{isAr ? 'بيع' : 'Sell'}</span>
                      <p className="font-mono font-extrabold text-sm">{currentStockData.analystRatings.sell}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SVG Expected vs Actual Quarterly Earnings Chart (Slide 2) */}
            {currentStockData.earningsHistory && (
              <div className="px-4 md:px-0">
                <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'الأرباح' : 'Earnings'}</h3>

                  {/* SVG earnings plot */}
                  <div className="h-44 w-full relative flex items-end">
                    {(() => {
                      const actualPoints = currentStockData.earningsHistory.map((item: any, i: number) => ({
                        x: 40 + i * 80,
                        y: 130 - item.actual * 45
                      }));
                      const expectedPoints = currentStockData.earningsHistory.map((item: any, i: number) => ({
                        x: 40 + i * 80,
                        y: 130 - item.expected * 45
                      }));
                      
                      const pathActual = actualPoints.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      const pathExpected = expectedPoints.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      
                      return (
                        <svg className="w-full h-full" viewBox="0 0 320 160">
                          <defs>
                            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity="0.2"/>
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0"/>
                            </linearGradient>
                            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#059669"/>
                              <stop offset="100%" stopColor="#34D399"/>
                            </linearGradient>
                          </defs>

                          {/* Grid Lines */}
                          <line x1="20" y1="40" x2="300" y2="40" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                          <line x1="20" y1="85" x2="300" y2="85" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                          <line x1="20" y1="130" x2="300" y2="130" stroke="rgba(255,255,255,0.05)" />

                          {/* Area Fill */}
                          <path d={`${pathActual} L ${actualPoints[actualPoints.length - 1].x} 140 L ${actualPoints[0].x} 140 Z`} fill="url(#actualGrad)" className="transition-all duration-500" />

                          {/* Connect Lines */}
                          <path d={pathExpected} stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1.5" strokeDasharray="4,4" fill="none" className="transition-all duration-500" />
                          <path d={pathActual} stroke="url(#lineGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />

                          {/* Points */}
                          {currentStockData.earningsHistory.map((item: any, i: number) => {
                            const x = 40 + i * 80;
                            const yExpected = 130 - item.expected * 45;
                            const yActual = 130 - item.actual * 45;

                            return (
                              <g key={i} className="group">
                                {/* Expected Point */}
                                <circle cx={x} cy={yExpected} r="3.5" fill="#121824" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="1.5" />
                                
                                {/* Actual Point */}
                                <circle cx={x} cy={yActual} r="4.5" fill="#34d399" stroke="#121824" strokeWidth="1.5" className="filter drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
                                
                                {/* Labels */}
                                <text x={x} y="152" fill="#9CA3AF" fontSize="8.5" textAnchor="middle" fontWeight="600" className="font-sans">
                                  {item.quarter}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
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
            <div className="px-4 md:px-0">
              <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                <h3 className="font-bold text-sm text-gray-200">{isAr ? 'عن الشركة' : 'About the Company'}</h3>
                
                <p className={`text-xs text-gray-400 leading-relaxed ${aboutReadMore ? '' : 'line-clamp-3'}`}>
                  {isAr ? currentStockData.aboutTextArabic : currentStockData.aboutTextEnglish}
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
                    <span className="font-bold">{isAr ? currentStockData.sectorArabic : currentStockData.sectorEnglish}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'عدد الموظفين' : 'Employees'}</span>
                    <span className="font-bold font-mono">{Number(currentStockData.employees).toLocaleString()}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'المدير التنفيزي' : 'CEO'}</span>
                    <span className="font-bold">{currentStockData.ceo}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-500 block uppercase">{isAr ? 'المقر' : 'Headquarters'}</span>
                    <span className="font-bold truncate block">{currentStockData.headquarters}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Movement reason (Slide 3) */}
            {currentStockData.movementReasonArabic && (
              <div className="px-4 md:px-0">
                <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-2">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'سبب حركة السهم' : 'Stock Movement Reason'}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {isAr ? currentStockData.movementReasonArabic : currentStockData.movementReasonEnglish}
                  </p>
                </div>
              </div>
            )}

            {/* Statistics Section Sliders (Slide 4) */}
            {currentStockData.statistics && (
              <div className="px-4 md:px-0">
                <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300 shadow-xl rounded-3xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-gray-200">{isAr ? 'الإحصائيات' : 'Statistics'}</h3>
                  
                  {/* Ranges sliders mock rendering */}
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'نطاق اليوم' : "Day's Range"}</span>
                        <span className="font-mono">${currentStockData.statistics.dayRange[0]} - ${currentStockData.statistics.dayRange[1]}</span>
                      </div>
                      <div className="h-1 bg-black/40 rounded-full relative">
                        <div className="absolute left-[35%] right-[25%] h-1 bg-emerald-400 rounded-full" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span>{isAr ? 'نطاق 52 أسبوع' : '52-Week Range'}</span>
                        <span className="font-mono">${currentStockData.statistics.yearRange[0]} - ${currentStockData.statistics.yearRange[1]}</span>
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
                      <span className="font-bold font-mono">${currentStockData.statistics.open}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'الإغلاق السابق' : 'Prev Close'}</span>
                      <span className="font-bold font-mono">${currentStockData.statistics.prevClose}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'الحجم' : 'Volume'}</span>
                      <span className="font-bold font-mono">{formatNumber(currentStockData.statistics.volume, 'volume', isAr)}</span>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-gray-400">{isAr ? 'متوسط الحجم' : 'Avg Volume'}</span>
                      <span className="font-bold font-mono">{formatNumber(currentStockData.statistics.avgVolume, 'volume', isAr)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">{isAr ? 'القيمة السوقية' : 'Market Cap'}</span>
                      <span className="font-bold font-mono">{formatNumber(currentStockData.statistics.marketCap, 'mcap', isAr)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-400">{isAr ? 'مكرر الأرباح' : 'P/E Ratio'}</span>
                      <span className="font-bold font-mono">{currentStockData.statistics.peRatio}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sticky Bottom buying execution bar */}
            <div className="fixed md:relative bottom-16 md:bottom-auto inset-x-0 md:inset-x-auto bg-[#0E1524] md:bg-[#121824] border-t md:border border-white/10 md:border-white/5 px-4 md:px-6 py-3 rounded-none md:rounded-3xl flex justify-between items-center z-30 max-w-md md:max-w-none mx-auto md:mx-0 md:mt-6">
              <div className="text-left rtl:text-right">
                <p className="text-[10px] text-gray-400 font-medium">{isAr ? 'الرصيد المتاح' : 'Available Cash'}</p>
                <p className="text-sm font-mono font-bold text-emerald-400">{jarBalance.toFixed(2)} SAR</p>
                {sharesOwned > 0 && (
                  <p className="text-[9px] text-indigo-400 font-medium">
                    {isAr ? `تمتلك: ${sharesOwned.toFixed(2)} سهم` : `Owned: ${sharesOwned.toFixed(2)} shares`}
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  setTradeAction('BUY');
                  setTradeShares('1');
                  setTradeError(null);
                  setTradeSuccess(false);
                  setTradeDrawerOpen(true);
                }}
                disabled={!isCompliant}
                className="px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-700 disabled:to-gray-800 disabled:text-gray-500 font-bold transition-all text-sm shadow-md"
              >
                {!isCompliant ? (isAr ? 'غير متوافق' : 'Non-Compliant') : (isAr ? 'تداول' : 'Trade')}
              </button>
            </div>
      </div>
    );
  };


  return (
    <div className="min-h-screen text-white select-none max-w-md md:max-w-6xl mx-auto relative pb-24 md:pb-8">
      {/* Desktop view (split layout) */}
      <div className="hidden md:grid grid-cols-[380px,1fr] gap-6 items-start">
        {/* Left Column: Watchlist & Search */}
        <div className="glass-panel p-5 rounded-3xl border border-white/5 bg-black/40 space-y-6">
          {renderMarketOverview()}
        </div>
        
        {/* Right Column: Active Stock Details */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-black/40 space-y-6">
          {renderStockDetails()}
        </div>
      </div>

      {/* Mobile view (single-column switch) */}
      <div className="md:hidden bg-[#080B11] border-x border-white/5 min-h-screen pb-24">
        <AnimatePresence mode="wait">
          {!activeSymbol ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="p-4 space-y-6"
            >
              {renderMarketOverview()}
            </motion.div>
          ) : (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {renderStockDetails()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>


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

      {/* Drawer: Simulated Trade bottom sheet */}
      <AnimatePresence>
        {tradeDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmittingTrade && setTradeDrawerOpen(false)}
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
                <span className="text-xs text-gray-500 font-mono">
                  {currentStockData.market === 'TASI' 
                    ? (isAr ? `${currentStockData.price.toFixed(2)} ر.س` : `SAR ${currentStockData.price.toFixed(2)}`)
                    : `${currentStockData.price.toFixed(2)}`
                  } / {isAr ? 'للسهم' : 'per share'}
                </span>
                <h3 className="font-bold text-lg text-emerald-400">
                  {isAr ? `تداول ${currentStockData.symbol.replace('.SR', '')}` : `Trade ${currentStockData.symbol.replace('.SR', '')}`}
                </h3>
              </div>

              {/* Action tabs: BUY vs SELL */}
              <div className="flex bg-black/40 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setTradeAction('BUY');
                    setTradeError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeAction === 'BUY' 
                      ? 'bg-emerald-500 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {isAr ? 'شراء' : 'BUY'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTradeAction('SELL');
                    setTradeError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeAction === 'SELL' 
                      ? 'bg-red-500 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {isAr ? 'بيع' : 'SELL'}
                </button>
              </div>

              {/* Cash & shares feedback */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-black/20 p-3 rounded-xl border border-white/5">
                <div className="text-left">
                  <span className="text-[10px] text-gray-500 block">{isAr ? 'الرصيد المتاح' : 'Available Cash'}</span>
                  <span className="font-bold text-emerald-400 font-mono">{jarBalance.toFixed(2)} SAR</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">{isAr ? 'الأسهم المملوكة' : 'Shares Owned'}</span>
                  <span className="font-bold text-indigo-400 font-mono">{sharesOwned.toFixed(2)}</span>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-2">
                <label className="block text-xs text-gray-400 text-left rtl:text-right">
                  {isAr ? 'عدد الأسهم (يقبل الكسور):' : 'Number of Shares (Fractional allowed):'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={tradeShares}
                  onChange={(e) => {
                    setTradeShares(e.target.value);
                    setTradeError(null);
                  }}
                  className="w-full glass-panel bg-black/40 px-4 py-3 text-left font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-white animate-none"
                />
              </div>

              {/* Dynamic total calculation */}
              {(() => {
                const sh = parseFloat(tradeShares) || 0;
                const total = sh * currentStockData.price;
                return (
                  <div className="flex justify-between items-center text-sm pt-2">
                    <span className="font-mono font-bold text-white">
                      {currentStockData.market === 'TASI' 
                        ? (isAr ? `${total.toFixed(2)} ر.س` : `SAR ${total.toFixed(2)}`)
                        : `${total.toFixed(2)}`
                      }
                    </span>
                    <span className="text-gray-400 font-medium">{isAr ? 'القيمة الإجمالية المقدرة' : 'Estimated Total Value'}</span>
                  </div>
                );
              })()}

              {tradeError && (
                <p className="text-xs text-red-400 text-left rtl:text-right font-medium">
                  {tradeError}
                </p>
              )}

              {/* Submit execution */}
              <button
                disabled={isSubmittingTrade || !tradeShares || parseFloat(tradeShares) <= 0}
                onClick={async () => {
                  setIsSubmittingTrade(true);
                  setTradeError(null);
                  try {
                    const res = await fetch('/api/trade', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        symbol: currentStockData.symbol,
                        market: currentStockData.market,
                        action: tradeAction,
                        shares: parseFloat(tradeShares)
                      })
                    });
                    const resData = await res.json();
                    if (!res.ok) {
                      setTradeError(resData.message || resData.error || 'Execution failed');
                    } else {
                      setJarBalance(parseFloat(resData.balance));
                      setSharesOwned(parseFloat(resData.sharesOwned));
                      setTradeSuccess(true);
                      setTradeDrawerOpen(false);
                    }
                  } catch (err) {
                    setTradeError('Connection error. Failed to execute simulated trade.');
                  } finally {
                    setIsSubmittingTrade(false);
                  }
                }}
                className={`w-full py-3.5 rounded-xl font-bold text-white transition-all text-sm shadow-md ${
                  tradeAction === 'BUY' 
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/10'
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/10'
                }`}
              >
                {isSubmittingTrade ? (isAr ? 'جاري التنفيذ...' : 'Executing Trade...') : (isAr ? 'تأكيد تنفيذ الصفقة' : 'Confirm Simulated Trade')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Dialog: Real simulated trade success modal */}
      <AnimatePresence>
        {tradeSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121824] border border-white/10 p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? 'اكتملت الصفقة بنجاح!' : 'Simulated Trade Success!'}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? `تم تنفيذ صفقة ال${tradeAction === 'BUY' ? 'شراء' : 'بيع'} لسهم ${currentStockData.symbol.replace('.SR', '')} بنجاح. الرصيد الحالي: ${jarBalance.toFixed(2)} ريال.`
                  : `Simulated ${tradeAction} order for ${currentStockData.symbol.replace('.SR', '')} executed successfully. Balance: ${jarBalance.toFixed(2)} SAR.`
                }
              </p>
              <button
                onClick={() => setTradeSuccess(false)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAr ? 'متابعة' : 'Continue'}
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
        locale={locale}
      />
    </div>
  );
}
