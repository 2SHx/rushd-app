'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import AdvancedTradingChart from './AdvancedTradingChart';
import QuizModal from './QuizModal';
import { Bot, Trophy, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

export default function DashboardClient({ tasiData, nasdaqData }: any) {
  const t = useTranslations('Dashboard');
  const [market, setMarket] = useState<'TASI' | 'NASDAQ'>('TASI');
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [xp, setXp] = useState(450);
  const [level, setLevel] = useState(3);
  
  const currentData = market === 'TASI' ? tasiData : nasdaqData;

  const handleQuizComplete = (passed: boolean) => {
    if (passed) {
      setXp(prev => {
        const newXp = prev + 50;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
        if (newLevel > level) setLevel(newLevel);
        return newXp;
      });
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header & Gamification */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
            {t('portfolioHealth')}
          </h1>
          <p className="text-gray-400 mt-1">Level {level} Investor</p>
        </div>

        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsQuizOpen(true)}
          className="flex items-center space-x-2 rtl:space-x-reverse glass-panel px-6 py-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <Trophy className="w-5 h-5" />
          <span className="font-semibold">Take Quiz (+50 XP)</span>
        </motion.button>
      </div>

      {/* XP Progress Bar */}
      <div className="glass-panel p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Level {level} Progress</span>
          <span className="font-medium text-emerald-400">{xp} / {Math.pow(level, 2) * 100} XP</span>
        </div>
        <div className="h-3 bg-black/50 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(xp / (Math.pow(level, 2) * 100)) * 100}%` }}
            className="h-full bg-gradient-to-r from-emerald-500 to-neonBlue"
          />
        </div>
      </div>

      {/* Market Selector & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex space-x-4 rtl:space-x-reverse">
            {(['TASI', 'NASDAQ'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`px-6 py-2 rounded-full font-medium transition-colors ${
                  market === m 
                    ? 'bg-emerald-500 text-white' 
                    : 'glass-panel text-gray-400 hover:text-white'
                }`}
              >
                {t(m.toLowerCase() as any)}
              </button>
            ))}
          </div>

          <div className="glass-panel p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold">{currentData.symbol}</h3>
                <p className="text-3xl font-medium mt-2">{currentData.price.toFixed(2)}</p>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Live</span>
              </div>
            </div>
            <AdvancedTradingChart data={currentData.history} />
          </div>
        </div>

        {/* AI Signal Engine Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-neonBlue/10 blur-3xl rounded-full" />
            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold">AI Trade Signal</h3>
                <p className="text-sm text-gray-400">Powered by Qwen 2.5</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Recommendation</span>
                  <span className="font-bold text-emerald-400 flex items-center">
                    <ArrowUpRight className="w-4 h-4 mr-1" /> BUY
                  </span>
                </div>
                <p className="text-sm">The stock appears undervalued based on momentum indicators and provides a solid growth opportunity.</p>
              </div>

              <div className="p-4 rounded-xl bg-neonBlue/5 border border-neonBlue/20">
                <span className="text-xs font-bold text-neonBlue uppercase tracking-wider block mb-1">Concept Learned</span>
                <p className="text-sm">Value Investing: Buying underpriced assets with strong fundamentals.</p>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20"
              >
                Execute Mock Trade
              </motion.button>
            </div>
          </div>
          
          <div className="glass-panel p-6">
             <h3 className="font-bold mb-4">Sharia Compliance</h3>
             <div className="flex items-center justify-between">
               <span className="text-gray-400">AAOIFI Status</span>
               {currentData.isShariaCompliant ? (
                 <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">Compliant</span>
               ) : (
                 <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">Non-Compliant</span>
               )}
             </div>
          </div>
        </div>
      </div>

      <QuizModal isOpen={isQuizOpen} onClose={() => setIsQuizOpen(false)} onComplete={handleQuizComplete} />
    </div>
  );
}
