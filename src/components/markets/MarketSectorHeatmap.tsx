'use client';

import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import type { SectorGroup } from './marketOverviewUtils';
import { heatBg, heatBorder, heatText } from './marketOverviewUtils';

interface Props {
  sectors: SectorGroup[];
  isAr: boolean;
  onSelectSector: (sector: SectorGroup) => void;
}

export default function MarketSectorHeatmap({ sectors, isAr, onSelectSector }: Props) {
  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">
          <BarChart2 className="w-4 h-4 text-accent" />
          {isAr ? 'خريطة القطاعات' : 'Sector Map'}
        </span>
        <span className="text-[10px] text-foreground/40">{isAr ? 'انقر للتفاصيل' : 'Click a sector for detail'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sectors.map((sector) => (
          <motion.button
            key={sector.name}
            type="button"
            onClick={() => onSelectSector(sector)}
            className={`text-start rounded-2xl p-4 border transition-colors ${heatBg(sector.avgPct)} ${heatBorder(sector.avgPct)}`}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="flex justify-between items-center mb-2.5">
              <h3 className="font-semibold text-[13px] text-foreground tracking-tight">
                {isAr ? sector.nameAr : sector.name}
              </h3>
              <span className={`text-xs font-bold font-mono tabular-nums ${heatText(sector.avgPct)}`}>
                {sector.avgPct >= 0 ? '+' : ''}
                {sector.avgPct.toFixed(2)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {sector.stocks.slice(0, 3).map((stock) => (
                <div key={stock.symbol} className="rounded-lg p-2 bg-[var(--surface-card)]/60 border border-[var(--border-color)]">
                  <p className="text-[10px] font-semibold text-foreground">{stock.symbol}</p>
                  <p className={`text-[9px] font-mono tabular-nums font-semibold ${heatText(stock.pct)}`}>
                    {stock.pct >= 0 ? '+' : ''}
                    {stock.pct.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
