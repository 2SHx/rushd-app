'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck } from 'lucide-react';
import type { SectorGroup } from './marketOverviewUtils';
import MarketSparkline from './MarketSparkline';

interface Props {
  sector: SectorGroup | null;
  isAr: boolean;
  onClose: () => void;
  onSelectStock: (symbol: string) => void;
}

export default function MarketSectorModal({ sector, isAr, onClose, onSelectStock }: Props) {
  return (
    <AnimatePresence>
      {sector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />

          <motion.div
            initial={{ scale: 0.98, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.98, y: 8, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-2xl rounded-3xl glass-panel p-6 max-h-[85vh] flex flex-col"
          >
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border-color)]">
              <div>
                <span className="text-[10px] font-semibold uppercase text-accent tracking-wide">
                  {isAr ? 'تفاصيل القطاع' : 'Sector Breakdown'}
                </span>
                <h3 className="text-lg font-bold text-foreground mt-0.5">{isAr ? sector.nameAr : sector.name}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={isAr ? 'إغلاق' : 'Close'}
                className="p-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 border border-[var(--border-color)] p-3 rounded-2xl my-4 text-center">
              <div>
                <p className="text-[9px] uppercase font-semibold text-foreground/50">{isAr ? 'الأداء العام' : 'Avg return'}</p>
                <p className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${sector.avgPct >= 0 ? 'text-up' : 'text-down'}`}>
                  {sector.avgPct >= 0 ? '+' : ''}{sector.avgPct.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-semibold text-foreground/50">{isAr ? 'عدد الأوراق' : 'Constituents'}</p>
                <p className="text-lg font-bold text-foreground mt-0.5 font-mono tabular-nums">{sector.stocks.length}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase font-semibold text-foreground/50">{isAr ? 'توافق شرعي' : 'Sharia safety'}</p>
                <p className="text-lg font-bold text-up mt-0.5 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-4 h-4" /> 100%
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 ps-0 pe-1">
              {sector.stocks.map((stock) => (
                <button
                  key={stock.symbol}
                  type="button"
                  onClick={() => {
                    onSelectStock(stock.symbol);
                    onClose();
                  }}
                  className="w-full flex justify-between items-center p-3 rounded-2xl hover:bg-foreground/[0.03] transition-colors text-start"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{stock.symbol}</p>
                    <p className="text-[10px] text-foreground/50 mt-0.5">{isAr ? stock.arName : stock.name}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <MarketSparkline pct={stock.pct} />
                    <div className="text-end">
                      <span className={`text-xs font-bold font-mono tabular-nums ${stock.pct >= 0 ? 'text-up' : 'text-down'}`}>
                        {stock.pct >= 0 ? '+' : ''}{stock.pct.toFixed(2)}%
                      </span>
                      <p className="text-[9px] text-foreground/50 font-mono tabular-nums mt-0.5">${stock.price.toFixed(2)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
