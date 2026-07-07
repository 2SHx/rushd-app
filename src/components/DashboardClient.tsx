'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import AdvancedTradingChart from './AdvancedTradingChart';
import QuizModal from './QuizModal';
import { TICKERS } from '@/lib/tickers';
import { 
  Bot, Trophy, ArrowUpRight, ArrowDownRight, Activity, Wallet, 
  Briefcase, History, TrendingUp, Layers, CheckCircle2, AlertTriangle, Coins
} from 'lucide-react';

export default function DashboardClient({ 
  tasiData, 
  nasdaqData, 
  initialXp, 
  initialLevel, 
  locale,
  initialJarBalance,
  initialPortfolio,
  initialTransactions
}: any) {
  const t = useTranslations('Dashboard');
  const [market, setMarket] = useState<'TASI' | 'NASDAQ'>('TASI');
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [xp, setXp] = useState<number>(initialXp ?? 0);
  const [level, setLevel] = useState<number>(initialLevel ?? 1);
  
  const [jarBal, setJarBal] = useState(initialJarBalance ?? 100000.0);
  const [portfolio, setPortfolio] = useState<any[]>(initialPortfolio ?? []);
  const [txs, setTxs] = useState<any[]>(initialTransactions ?? []);
  
  const [zakatPaidSuccess, setZakatPaidSuccess] = useState(false);
  const [zakatPaidAmount, setZakatPaidAmount] = useState('0.00');
  const [isZakatSubmitting, setIsZakatSubmitting] = useState(false);

  const currentData = market === 'TASI' ? tasiData : nasdaqData;
  const isAr = locale === 'ar';
  
  const listTickers = [...TICKERS.TASI, ...TICKERS.NASDAQ];
  const activeTicker = listTickers.find(ticker => ticker.symbol === currentData.symbol);
  const displayName = activeTicker ? (isAr ? activeTicker.arName : activeTicker.name) : currentData.symbol;

  // AI Signal State on Dashboard
  const [aiSignal, setAiSignal] = useState<any>(null);
  const [loadingSignal, setLoadingSignal] = useState(false);
  const [tradeExecutionError, setTradeExecutionError] = useState<string | null>(null);
  const [tradeExecutionSuccess, setTradeExecutionSuccess] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);

  useEffect(() => {
    if (currentData) {
      setLoadingSignal(true);
      setTradeExecutionError(null);
      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: currentData.symbol,
          market: currentData.market,
          currentPrice: currentData.price
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData?.symbol, currentData?.market, currentData?.price]);

  // Calculations
  const cashVal = jarBal;
  const stocksVal = portfolio.reduce((acc, item) => acc + (item.shares * item.price), 0);
  const nav = cashVal + stocksVal;
  
  const dailyReturn = portfolio.reduce((acc, item) => acc + (item.shares * item.price * (item.pct / 100)), 0);
  const dailyReturnPct = nav > 0 ? (dailyReturn / nav) * 100 : 0;

  // Zakat: 2.5% of Cash + Sharia-compliant Stock value
  const compliantStocksVal = portfolio.reduce((acc, item) => {
    return item.isCompliant ? acc + (item.shares * item.price) : acc;
  }, 0);
  const zakatableWealth = cashVal + compliantStocksVal;
  const zakatDue = zakatableWealth * 0.025;

  const handleQuizComplete = async (passed: boolean, topic: string) => {
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || 'Stock Market Basics',
          score: passed ? 100 : 0,
          passed
        })
      });

      if (res.ok) {
        const data = await res.json();
        setXp(data.xp);
        setLevel(data.level);
      }
    } catch (err) {
      console.error('Error submitting quiz results:', err);
    }
  };

  const handlePayZakat = async () => {
    setIsZakatSubmitting(true);
    try {
      const res = await fetch('/api/purify/zakat', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setJarBal(parseFloat(data.balance));
        setZakatPaidAmount(data.amountPaid);
        setZakatPaidSuccess(true);
        
        // Refresh local transaction list
        const refreshedTxs = await fetch(`/api/me`).then(() => {
          // Add temporary transaction locally to avoid delay
          const newTx = {
            id: Math.random().toString(),
            amount: -parseFloat(data.amountPaid),
            currency: 'SAR',
            type: 'WITHDRAWAL',
            description: `Zakat Purification / دفع الزكاة (2.5% of ${zakatableWealth.toFixed(2)} SAR)`,
            createdAt: new Date().toISOString()
          };
          setTxs(prev => [newTx, ...prev]);
        });
      } else {
        alert(data.message || 'Zakat payment failed.');
      }
    } catch (err) {
      console.error('Failed to pay Zakat:', err);
    } finally {
      setIsZakatSubmitting(false);
    }
  };

  const handleExecuteMockTrade = async () => {
    if (!aiSignal || !currentData) return;
    setIsExecutingTrade(true);
    setTradeExecutionError(null);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: currentData.symbol,
          market: currentData.market,
          action: aiSignal.action === 'BUY' ? 'BUY' : 'SELL',
          shares: 10 // execute 10 shares trade based on signal
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeExecutionError(data.message || data.error || 'Execution failed');
      } else {
        setJarBal(parseFloat(data.balance));
        setTradeExecutionSuccess(true);
        
        // Update local holdings representation or force reload dashboard
        window.location.reload();
      }
    } catch (err) {
      setTradeExecutionError('Connection error during trade execution.');
    } finally {
      setIsExecutingTrade(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 md:p-6">
      {/* Header & Gamification Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
            {isAr ? 'محطة التداول المتقدمة' : 'Advanced Trading Workstation'}
          </h1>
          <p className="text-gray-400 mt-1">
            {isAr ? `المستثمر المحترف • مستوى ${level}` : `Professional Trader • Level ${level}`}
          </p>
        </div>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsQuizOpen(true)}
          className="flex items-center space-x-2 rtl:space-x-reverse bg-gradient-to-r from-emerald-500/20 to-neonBlue/20 border border-emerald-500/40 px-6 py-3 rounded-2xl text-emerald-400 hover:from-emerald-500/35 hover:to-neonBlue/35 transition-all shadow-lg"
        >
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-xs uppercase tracking-wider">{isAr ? 'بدء اختبار المعرفة (+50 XP)' : 'Take Knowledge Quiz (+50 XP)'}</span>
        </motion.button>
      </div>

      {/* XP Level Bar */}
      <div className="glass-panel p-5 rounded-3xl border border-white/5 bg-black/40">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-gray-400 font-bold">
            {isAr ? `مؤشر الخبرة والتقدم` : `Experience Level Progress`}
          </span>
          <span className="font-bold text-emerald-400">{xp} / {Math.pow(level, 2) * 100} XP</span>
        </div>
        <div className="h-2 bg-black/50 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(xp / (Math.pow(level, 2) * 100)) * 100}%` }}
            className="h-full bg-gradient-to-r from-emerald-400 to-neonBlue rounded-full"
          />
        </div>
      </div>

      {/* Portfolio Performance Grid & Zakat Tool */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* NAV Widget */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-b from-[#121824] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-neonBlue/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'صافي قيمة الأصول (NAV)' : 'Net Asset Value (NAV)'}</span>
            <Wallet className="w-5 h-5 text-neonBlue" />
          </div>
          <h2 className="text-3xl font-mono font-bold text-white">{nav.toFixed(2)} <span className="text-xs text-gray-400">SAR</span></h2>
          
          <div className="pt-2 flex justify-between items-center text-xs border-t border-white/5">
            <span className="text-gray-500">{isAr ? 'السيولة في المحفظة' : 'Simulated Cash'}</span>
            <span className="font-mono text-gray-300 font-bold">{cashVal.toFixed(2)} SAR</span>
          </div>
        </div>

        {/* Daily P&L Return */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-b from-[#121824] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'العائد اليومي المقدر' : 'Estimated Daily Return'}</span>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className={`text-3xl font-mono font-bold flex items-center ${dailyReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {dailyReturn >= 0 ? '+' : ''}{dailyReturn.toFixed(2)} <span className="text-xs text-gray-400 ml-1">SAR</span>
          </h2>
          
          <div className="pt-2 flex justify-between items-center text-xs border-t border-white/5">
            <span className="text-gray-500">{isAr ? 'النسبة المئوية لليوم' : 'Daily Profit %'}</span>
            <span className={`font-bold ${dailyReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {dailyReturn >= 0 ? '+' : ''}{dailyReturnPct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Zakat purification Widget */}
        <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-gradient-to-b from-[#121824] to-black/40 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 blur-3xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs font-bold">{isAr ? 'مستحقات الزكاة الشرعية (2.5%)' : 'Estimated Due Zakat (2.5%)'}</span>
            <Coins className="w-5 h-5 text-yellow-400" />
          </div>
          <h2 className="text-3xl font-mono font-bold text-white">
            {zakatDue.toFixed(2)} <span className="text-xs text-gray-400">SAR</span>
          </h2>

          <div className="pt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 leading-tight">
              {isAr ? 'تزكية المحفظة (السيولة + الأسهم الحلال)' : 'Calculated on cash + halal stocks'}
            </span>
            <button
              onClick={handlePayZakat}
              disabled={isZakatSubmitting || zakatDue <= 0.01}
              className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {isZakatSubmitting ? (isAr ? 'جاري الدفع...' : 'Paying...') : (isAr ? 'تطهير الآن' : 'Purify Now')}
            </button>
          </div>
        </div>
      </div>

      {/* Asset Allocation Breakdown */}
      <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-black/30 space-y-4">
        <h3 className="font-bold text-sm text-gray-300 flex items-center space-x-2 rtl:space-x-reverse">
          <Layers className="w-4 h-4 text-neonBlue" />
          <span>{isAr ? 'توزيع أصول المحفظة الاستثمارية' : 'Asset Allocation Metrics'}</span>
        </h3>
        
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex justify-between text-gray-400">
              <span>{isAr ? 'نقد وسيولة (مضاربة)' : 'Mudarabah Cash'}</span>
              <span className="font-bold text-emerald-400">{nav > 0 ? ((cashVal / nav) * 100).toFixed(1) : '100'}%</span>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${nav > 0 ? (cashVal / nav) * 100 : 100}%` }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-gray-400">
              <span>{isAr ? 'الأسهم وحصص الشركات' : 'Stock Equity'}</span>
              <span className="font-bold text-neonBlue">{nav > 0 ? ((stocksVal / nav) * 100).toFixed(1) : '0'}%</span>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <div className="h-full bg-neonBlue" style={{ width: `${nav > 0 ? (stocksVal / nav) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Chart Widget */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex space-x-4 rtl:space-x-reverse">
            {(['TASI', 'NASDAQ'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`px-6 py-2 rounded-full font-bold text-xs uppercase tracking-wider transition-colors ${
                  market === m 
                    ? 'bg-emerald-500 text-white' 
                    : 'glass-panel text-gray-400 hover:text-white'
                }`}
              >
                {t(m.toLowerCase() as any)}
              </button>
            ))}
          </div>

          <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{displayName}</h3>
                <span className="text-xs text-gray-400 font-mono font-bold tracking-wider block mt-0.5">{currentData.symbol.replace('.SR', '')}</span>
                <p className="text-3xl font-mono font-bold mt-2 text-white">
                  {market === 'TASI' ? '' : '$'}{currentData.price.toFixed(2)} <span className="text-xs font-semibold text-gray-500">{market === 'TASI' ? 'SAR' : 'USD'}</span>
                </p>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                <Activity className="w-4 h-4 animate-pulse" />
                <span>{isAr ? 'مباشر' : 'Live'}</span>
              </div>
            </div>
            <AdvancedTradingChart data={currentData.history} />
          </div>

          {/* Portfolio positions table */}
          <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4">
            <h3 className="font-bold text-sm text-gray-300 flex items-center space-x-2 rtl:space-x-reverse">
              <Briefcase className="w-4 h-4 text-neonBlue" />
              <span>{isAr ? 'المراكز الاستثمارية المفتوحة' : 'Active Stock Holdings'}</span>
            </h3>

            {portfolio.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">
                {isAr 
                  ? 'لا توجد مراكز استثمارية مفتوحة في المحفظة حالياً. انتقل إلى علامة تبويب الأسهم لبدء التداول الافتراضي.' 
                  : 'No active stock positions. Go to Stocks tab to begin simulated trading!'
                }
              </p>
            ) : (
              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left rtl:text-right border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 font-bold">
                      <th className="pb-2">{isAr ? 'الرمز' : 'Symbol'}</th>
                      <th className="pb-2">{isAr ? 'الأسهم المملوكة' : 'Shares Owned'}</th>
                      <th className="pb-2 text-right rtl:text-left">{isAr ? 'السعر الحالي' : 'Market Price'}</th>
                      <th className="pb-2 text-right rtl:text-left">{isAr ? 'القيمة الإجمالية' : 'Market Value'}</th>
                      <th className="pb-2 text-center">{isAr ? 'الشرعية' : 'Sharia'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.map((item: any, idx: number) => {
                      const value = item.shares * item.price;
                      return (
                        <tr key={idx} className="border-b border-white/5 text-gray-300">
                          <td className="py-2.5 font-bold font-mono text-white">{item.symbol.replace('.SR', '')}</td>
                          <td className="py-2.5 font-mono">{item.shares.toFixed(2)}</td>
                          <td className="py-2.5 text-right rtl:text-left font-mono">${item.price.toFixed(2)}</td>
                          <td className="py-2.5 text-right rtl:text-left font-mono text-emerald-400 font-bold">{value.toFixed(2)} SAR</td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              item.isCompliant ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {item.isCompliant ? (isAr ? 'متوافق' : 'Halal') : (isAr ? 'غير متوافق' : 'Haram')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: AI recommendations & Transaction History */}
        <div className="space-y-6">
          {/* AI Signal Engine Panel */}
          <div className="glass-panel p-6 relative overflow-hidden bg-black/40 border border-white/5 rounded-3xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-neonBlue/10 blur-3xl rounded-full animate-pulse" />
            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-400 animate-bounce" />
              </div>
              <div>
                <h3 className="font-bold text-white">{isAr ? 'إشارة تداول الذكاء الاصطناعي' : 'AI Trade Recommendation'}</h3>
                <p className="text-xs text-gray-400">{isAr ? 'مدعوم بواسطة Qwen 2.5' : 'Powered by Qwen AI'}</p>
              </div>
            </div>

            {loadingSignal ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2 text-xs">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-500">{isAr ? 'جاري التحليل واستخلاص النتائج...' : 'AI is analyzing...'}</span>
              </div>
            ) : aiSignal ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-start rtl:text-right">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">{isAr ? 'التوجيه المقترح' : 'AI Recommendation'}</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md flex items-center text-[10px] ${
                      aiSignal.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' :
                      aiSignal.action === 'SELL' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                    }`}>
                      {aiSignal.action === 'BUY' ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : null}
                      {aiSignal.action}
                    </span>
                  </div>
                  <p className="text-gray-300 leading-relaxed">
                    {isAr ? aiSignal.reasoningArabic : aiSignal.reasoningEnglish}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neonBlue/5 border border-neonBlue/20 text-xs text-start rtl:text-right">
                  <span className="text-[10px] font-bold text-neonBlue uppercase tracking-wider block mb-1">
                    {isAr ? 'المفهوم المكتسب' : 'Concept Learned'}
                  </span>
                  <p className="text-gray-400">
                    {aiSignal.educationalConcept}
                  </p>
                </div>

                {tradeExecutionError && (
                  <p className="text-xs text-red-400 font-semibold">{tradeExecutionError}</p>
                )}

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isExecutingTrade || aiSignal.complianceTag === 'HARAM' || aiSignal.complianceTag === 'MASHBOOH'}
                  onClick={handleExecuteMockTrade}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-xs uppercase tracking-wider text-center"
                >
                  {isExecutingTrade 
                    ? (isAr ? 'جاري تنفيذ التداول...' : 'Executing Trade...') 
                    : aiSignal.complianceTag === 'HARAM' || aiSignal.complianceTag === 'MASHBOOH'
                      ? (isAr ? 'التداول محظور لغير المتوافقة' : 'Blocked (Non-Compliant)')
                      : (isAr ? `شراء 10 أسهم من ${currentData.symbol.replace('.SR', '')}` : `Buy 10 shares of ${currentData.symbol.replace('.SR', '')}`)}
                </motion.button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">{isAr ? 'فشل تحميل إشارة الذكاء الاصطناعي.' : 'Failed to load AI signal.'}</p>
            )}
          </div>
          
          {/* Sharia status card */}
          <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl">
             <h3 className="font-bold mb-4 text-sm text-gray-300">{isAr ? 'التوافق الشرعي للسوق' : 'Market Sharia Compliance'}</h3>
             <div className="flex items-center justify-between text-xs">
               <span className="text-gray-400">{isAr ? 'حالة السهم المختار' : 'Selected Symbol Status'}</span>
               {currentData.isShariaCompliant ? (
                 <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full font-bold uppercase text-[10px]">
                   {isAr ? 'متوافق شريعة' : 'Compliant'}
                 </span>
               ) : (
                 <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full font-bold uppercase text-[10px]">
                   {isAr ? 'غير متوافق شريعة' : 'Non-Compliant'}
                 </span>
               )}
             </div>
             {!currentData.isShariaCompliant && (
               <p className="text-xs text-red-400 mt-3 font-semibold border border-red-500/20 bg-red-500/10 p-2.5 rounded-lg text-center">
                 غير متوافق مع الشريعة — تعليمي فقط / Not Sharia-compliant — educational only
               </p>
             )}
          </div>

          {/* Dynamic Transaction history ledger */}
          <div className="glass-panel p-6 bg-black/40 border border-white/5 rounded-3xl space-y-4">
             <h3 className="font-bold text-sm text-gray-300 flex items-center space-x-2 rtl:space-x-reverse">
               <History className="w-4 h-4 text-neonBlue" />
               <span>{isAr ? 'سجل المعاملات والتدقيق المالي' : 'Transaction Audit Ledger'}</span>
             </h3>

             <div className="space-y-3 max-h-64 overflow-y-auto text-xs">
               {txs.length === 0 ? (
                 <p className="text-gray-500 text-center py-4">{isAr ? 'لا توجد معاملات مسجلة بعد.' : 'No transactions recorded yet.'}</p>
               ) : (
                 txs.map((tx: any, idx: number) => {
                   const isNegative = tx.amount < 0;
                   return (
                     <div key={idx} className="flex justify-between items-center p-3.5 bg-black/20 border border-white/5 rounded-2xl">
                       <div className="text-left rtl:text-right space-y-0.5">
                         <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                           tx.type === 'TRADE' ? 'bg-indigo-500/10 text-indigo-400' :
                           tx.type === 'PROFIT_SHARE' ? 'bg-emerald-500/10 text-emerald-400' :
                           'bg-yellow-500/10 text-yellow-400'
                         }`}>
                           {tx.type}
                         </span>
                         <p className="text-gray-400 text-[10px] leading-tight pt-1">{tx.description || tx.type}</p>
                       </div>
                       <span className={`font-mono font-bold ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
                         {isNegative ? '' : '+'}{tx.amount.toFixed(2)} SAR
                       </span>
                     </div>
                   );
                 })
               )}
             </div>
          </div>
        </div>
      </div>

      <QuizModal isOpen={isQuizOpen} onClose={() => setIsQuizOpen(false)} onComplete={handleQuizComplete} locale={locale} />

      {/* Dialog: Zakat success paid modal */}
      <AnimatePresence>
        {zakatPaidSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121824] border border-white/10 p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto animate-bounce">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? 'تم دفع الزكاة وتطهير المحفظة!' : 'Zakat Paid successfully!'}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? `تم سحب مبلغ الزكاة البالغ ${parseFloat(zakatPaidAmount).toFixed(2)} ريال سعودي بنجاح وتوجيهه للمصارف الشرعية لتطهير المحفظة.`
                  : `Simulated Zakat purification of ${parseFloat(zakatPaidAmount).toFixed(2)} SAR successfully paid from your cash balance.`
                }
              </p>
              <button
                onClick={() => setZakatPaidSuccess(false)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAr ? 'حسناً' : 'Done'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dialog: Trade success paid modal */}
      <AnimatePresence>
        {tradeExecutionSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121824] border border-white/10 p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? 'اكتمل تنفيذ تداول إشارة الذكاء الاصطناعي!' : 'AI Signal Trade Success!'}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {isAr 
                  ? `تم تنفيذ صفقة تداول بناءً على توصية إشارة الذكاء الاصطناعي بنجاح.`
                  : `Successfully executed stock transactions based on the dynamic AI analyst signal recommendation.`
                }
              </p>
              <button
                onClick={() => {
                  setTradeExecutionSuccess(false);
                  window.location.reload();
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20"
              >
                {isAr ? 'تحديث ومتابعة' : 'Refresh & Continue'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
