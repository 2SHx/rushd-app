'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import { RiyalAmount, RiyalSymbol, formatUSD } from '@/lib/currency';

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
    ? <RiyalAmount value={totalCost} locale={locale} />
    : formatUSD(totalCost, locale);

  return (
    <div className="space-y-4">
      {/* Action Buttons Sticky Trigger */}
      <div className="glass-panel p-4 rounded-3xl flex justify-between items-center space-x-3 rtl:space-x-reverse text-start">
        <div>
          <span className="text-[10px] text-foreground/50 block uppercase">{t('virtualBalance')}</span>
          <span className="font-extrabold text-foreground font-mono tabular-nums"><RiyalAmount value={jarBalance} locale={locale} /></span>
        </div>
        <div className="flex space-x-2 rtl:space-x-reverse">
          <button
            onClick={() => { setTradeAction('BUY'); setTradeDrawerOpen(true); }}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-up hover:opacity-90 transition-opacity text-white active:scale-95"
          >
            {t('buy')}
          </button>
          <button
            onClick={() => { setTradeAction('SELL'); setTradeDrawerOpen(true); }}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-down hover:opacity-90 transition-opacity text-white active:scale-95"
          >
            {t('sell')}
          </button>
        </div>
      </div>

      {/* Info items linking to detail drawers */}
      <div className="flex justify-between items-center text-[10px] text-foreground/50 px-2">
        <button onClick={() => setPurificationDrawerOpen(true)} className="hover:text-accent underline transition-colors">
          ✨ {t('learnPurification')}
        </button>
        <button onClick={() => setFractionalDrawerOpen(true)} className="hover:text-accent underline transition-colors">
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
              className="fixed inset-0 bg-black/50 z-40 max-w-md mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 inset-x-0 bg-surface-card border-t border-[var(--border-color)] rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-foreground/15 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]">
                <h3 className="font-bold text-lg text-accent">{t('purifyTitle')}</h3>
                <span className="text-xs text-foreground/50 font-mono">AAOIFI standards</span>
              </div>
              <p className="text-xs text-foreground/60 leading-relaxed">{t('purifyDescription')}</p>
              <button
                onClick={() => setPurificationDrawerOpen(false)}
                className="w-full py-3 bg-foreground/5 border border-[var(--border-color)] hover:bg-foreground/10 rounded-xl font-bold text-xs transition-colors mt-4"
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
              className="fixed inset-0 bg-black/50 z-40 max-w-md mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 inset-x-0 bg-surface-card border-t border-[var(--border-color)] rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-foreground/15 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]">
                <h3 className="font-bold text-lg text-accent">{t('fractionalTitle')}</h3>
                <span className="text-xs text-foreground/50 font-mono">Feature Details</span>
              </div>
              <p className="text-xs text-foreground/60 leading-relaxed">
                {t('fractionalExplanation')}
              </p>
              <button
                onClick={() => setFractionalDrawerOpen(false)}
                className="w-full py-3 bg-foreground/5 border border-[var(--border-color)] hover:bg-foreground/10 rounded-xl font-bold text-xs transition-colors mt-4"
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
              className="fixed inset-0 bg-black/50 z-40 max-w-md mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed bottom-0 inset-x-0 bg-surface-card border-t border-[var(--border-color)] rounded-t-3xl p-6 z-50 text-start space-y-4 max-w-md mx-auto"
            >
              <div className="w-12 h-1 bg-foreground/15 rounded-full mx-auto mb-2" />

              <div className="flex justify-between items-center pb-2 border-b border-[var(--border-color)]">
                <h3 className="font-bold text-lg text-foreground">
                  {t('tradeTitle', { symbol: cleanSymbol })}
                </h3>
                <span className="text-xs text-foreground/50 font-mono tabular-nums">
                  {market === 'TASI'
                    ? <RiyalAmount value={currentPrice} locale={locale} />
                    : formatUSD(currentPrice, locale)
                  } / {t('sharePriceLabel')}
                </span>
              </div>

              <div className="flex bg-foreground/5 p-1 rounded-xl">
                <button
                  onClick={() => { setTradeAction('BUY'); setTradeError(null); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                    tradeAction === 'BUY' ? 'bg-up text-white' : 'text-foreground/50 hover:text-foreground'
                  }`}
                >
                  {t('buy')}
                </button>
                <button
                  onClick={() => { setTradeAction('SELL'); setTradeError(null); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                    tradeAction === 'SELL' ? 'bg-down text-white' : 'text-foreground/50 hover:text-foreground'
                  }`}
                >
                  {t('sell')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-foreground/[0.03] p-3 rounded-xl border border-[var(--border-color)] font-mono">
                <div>
                  <span className="text-[10px] text-foreground/50 block">{t('availableCash')}</span>
                  <span className="font-bold text-up tabular-nums"><RiyalAmount value={jarBalance} locale={locale} /></span>
                </div>
                <div>
                  <span className="text-[10px] text-foreground/50 block">{t('sharesOwned')}</span>
                  <span className="font-bold text-accent tabular-nums">{sharesOwned.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-foreground/60">
                  {t('numSharesLabel')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={tradeShares}
                  onChange={(e) => { setTradeShares(e.target.value); setTradeError(null); }}
                  className="w-full bg-surface-raised border border-[var(--border-color)] rounded-xl px-4 py-3 text-start font-mono tabular-nums text-foreground outline-none focus:border-accent/40"
                />
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-t border-[var(--border-color)] pt-3">
                <span className="text-foreground/60">{t('estimatedTotal')}</span>
                <span className="font-bold font-mono tabular-nums text-foreground">{formattedTotal}</span>
              </div>

              {tradeError && (
                <div className="text-xs text-down bg-down/5 p-3 rounded-xl border border-down/10">
                  {tradeError}
                </div>
              )}

              {/* Submit button */}
              <button
                disabled={isSubmittingTrade || !tradeShares || sh <= 0}
                onClick={handleTrade}
                className={`w-full py-3 rounded-xl font-bold text-white transition-opacity text-xs flex items-center justify-center space-x-2 disabled:opacity-50 ${
                  isSubmittingTrade ? 'bg-foreground/30' :
                  tradeAction === 'BUY'
                    ? 'bg-up hover:opacity-90'
                    : 'bg-down hover:opacity-90'
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="glass-panel p-6 rounded-3xl text-center space-y-4 max-w-xs"
            >
              <div className="w-12 h-12 rounded-full bg-up/10 flex items-center justify-center text-up mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-foreground">{t('questComplete')}</h3>
              <p className="text-xs text-foreground/60 leading-relaxed">
                {t.rich('tradeSuccessDesc', {
                  action: tradeAction === 'BUY' ? t('buy') : t('sell'),
                  symbol: cleanSymbol,
                  balance: jarBalance.toFixed(2),
                  riyal: () => <RiyalSymbol className="mx-0.5" />,
                })}
              </p>
              <button
                onClick={() => setTradeSuccess(false)}
                className="w-full py-3 bg-up hover:opacity-90 rounded-xl font-bold text-xs text-white transition-opacity"
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
