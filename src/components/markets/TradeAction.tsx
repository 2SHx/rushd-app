'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ArrowRight } from 'lucide-react';

interface TradeActionProps {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  currentPrice: number;
  locale: string;
  jarBalance: number;
  sharesOwned: number;
  isParent: boolean;
  onTradeExecuted: (newBalance: number, newShares: number) => void;
}

export default function TradeAction({
  symbol,
  market,
  currentPrice,
  locale,
  jarBalance,
  sharesOwned,
  isParent,
  onTradeExecuted
}: TradeActionProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  
  // Drawer states
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);
  const [purificationDrawerOpen, setPurificationDrawerOpen] = useState(false);
  const [fractionalDrawerOpen, setFractionalDrawerOpen] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState(false);

  // Form states
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeShares, setTradeShares] = useState('1');
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const cleanSymbol = symbol.replace('.SR', '');
  const sh = parseFloat(tradeShares) || 0;
  const totalCost = sh * currentPrice;

  const handleTrade = async () => {
    setIsSubmittingTrade(true);
    setTradeError(null);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          market,
          action: tradeAction,
          shares: parseFloat(tradeShares)
        })
      });
      const resData = await res.json();
      if (!res.ok) {
        setTradeError(resData.message || resData.error || 'Execution failed');
      } else {
        onTradeExecuted(parseFloat(resData.balance), parseFloat(resData.sharesOwned));
        setTradeSuccess(true);
        setTradeDrawerOpen(false);
      }
    } catch (err) {
      setTradeError(t('tradeConnectionError'));
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  const formattedTotal = market === 'TASI'
    ? t('formatTasi', { amount: totalCost.toFixed(2) })
    : t('formatNasdaq', { amount: totalCost.toFixed(2) });

  return (
    <div className="space-y-4">
      {/* Action Buttons Sticky Trigger */}
      <div className="bg-[#0f1420]/50 backdrop-blur-md border border-white/5 p-4 rounded-3xl flex justify-between items-center space-x-3 rtl:space-x-reverse text-start">
        <div>
          <span className="text-[10px] text-gray-500 block uppercase">{t('virtualBalance')}</span>
          <span className="font-extrabold text-white font-mono">{jarBalance.toFixed(2)} SAR</span>
        </div>
        <div className="flex space-x-2 rtl:space-x-reverse">
          <button
            onClick={() => { setTradeAction('BUY'); setTradeDrawerOpen(true); }}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 transition-colors text-black active:scale-95 shadow-md shadow-emerald-500/10"
          >
            {t('buy')}
          </button>
          <button
            onClick={() => { setTradeAction('SELL'); setTradeDrawerOpen(true); }}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 transition-colors text-white active:scale-95 shadow-md shadow-rose-500/10"
          >
            {t('sell')}
          </button>
        </div>
      </div>

      {/* Info items linking to detail drawers */}
      <div className="flex justify-between items-center text-[10px] text-gray-500 px-2">
        <button onClick={() => setPurificationDrawerOpen(true)} className="hover:text-emerald-400 underline transition-colors">
          ✨ {t('learnPurification')}
        </button>
        <button onClick={() => setFractionalDrawerOpen(true)} className="hover:text-emerald-400 underline transition-colors">
          🍕 {t('whatAreFractional')}
        </button>
      </div>

      {/* Drawer: Purification Sheet */}
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
              className="fixed bottom-0 inset-x-0 bg-[#121824] border-t border-white/10 rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <h3 className="font-bold text-lg text-emerald-400">{t('purifyTitle')}</h3>
                <span className="text-xs text-gray-500 font-mono">AAOIFI standards</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{t('purifyDescription')}</p>
              <button
                onClick={() => setPurificationDrawerOpen(false)}
                className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-bold text-xs transition-all mt-4"
              >
                {t('close')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Drawer: Fractional Shares Sheet */}
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
              className="fixed bottom-0 inset-x-0 bg-[#121824] border-t border-white/10 rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <h3 className="font-bold text-lg text-emerald-400">{t('fractionalTitle')}</h3>
                <span className="text-xs text-gray-500 font-mono">Feature Details</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                {t('fractionalExplanation')}
              </p>
              <button
                onClick={() => setFractionalDrawerOpen(false)}
                className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-bold text-xs transition-all mt-4"
              >
                {t('understand')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Drawer: Trade Execution Sheet */}
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
              className="fixed bottom-0 inset-x-0 bg-[#121824] border-t border-white/10 rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <h3 className="font-bold text-lg text-white">
                  {t('tradeTitle', { symbol: cleanSymbol })}
                </h3>
                <span className="text-xs text-gray-500 font-mono">
                  {market === 'TASI'
                    ? t('formatTasi', { amount: currentPrice.toFixed(2) })
                    : t('formatNasdaq', { amount: currentPrice.toFixed(2) })
                  } / {t('sharePriceLabel')}
                </span>
              </div>

              <div className="flex bg-black/40 p-1 rounded-xl">
                <button
                  onClick={() => { setTradeAction('BUY'); setTradeError(null); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeAction === 'BUY' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('buy')}
                </button>
                <button
                  onClick={() => { setTradeAction('SELL'); setTradeError(null); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeAction === 'SELL' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t('sell')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-black/20 p-3 rounded-xl border border-white/5 font-mono">
                <div>
                  <span className="text-[10px] text-gray-500 block">{t('availableCash')}</span>
                  <span className="font-bold text-emerald-400">{jarBalance.toFixed(2)} SAR</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">{t('sharesOwned')}</span>
                  <span className="font-bold text-indigo-400">{sharesOwned.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-gray-400">
                  {t('numSharesLabel')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={tradeShares}
                  onChange={(e) => { setTradeShares(e.target.value); setTradeError(null); }}
                  className="w-full bg-[#0f1420] border border-white/5 rounded-xl px-4 py-3 text-left font-mono text-white outline-none focus:border-emerald-500/30"
                />
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-t border-white/5 pt-3">
                <span className="text-gray-400">{t('estimatedTotal')}</span>
                <span className="font-bold font-mono text-white">{formattedTotal}</span>
              </div>

              {tradeError && (
                <div className="text-xs text-rose-400 bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                  {tradeError}
                </div>
              )}

              {/* Submit button */}
              <button
                disabled={isSubmittingTrade || !tradeShares || sh <= 0}
                onClick={handleTrade}
                className={`w-full py-3 rounded-xl font-bold text-white transition-all text-xs flex items-center justify-center space-x-2 ${
                  isSubmittingTrade ? 'bg-gray-600' :
                  tradeAction === 'BUY' 
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600' 
                    : 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600'
                }`}
              >
                {isSubmittingTrade && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {isSubmittingTrade 
                    ? t('processing') 
                    : t('confirmTrade')}
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Success Modal */}
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
              <h3 className="font-bold text-lg">{t('questComplete')}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {t('tradeSuccessDesc', {
                  action: tradeAction === 'BUY' ? t('buy') : t('sell'),
                  symbol: cleanSymbol,
                  balance: jarBalance.toFixed(2)
                })}
              </p>
              <button
                onClick={() => setTradeSuccess(false)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs text-white transition-all shadow-lg"
              >
                {t('continueQuest')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
