'use client';

import { ArrowDownRight, ArrowUpRight, Flame, Layers3, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SectorGroup } from './marketOverviewUtils';
import { heatStyle, heatText } from './marketOverviewUtils';

interface Props {
  sectors: SectorGroup[];
  market: 'TASI' | 'NASDAQ';
  isAr: boolean;
  loading: boolean;
  onSelectSector: (sector: SectorGroup) => void;
}

export default function MarketSectorHeatmap({ sectors, market, isAr, loading, onSelectSector }: Props) {
  const t = useTranslations('Markets');
  const rankedSectors = [...sectors].sort((a, b) => b.avgPct - a.avgPct);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_20px_55px_rgba(0,0,0,0.08)] sm:p-7" aria-labelledby="market-themes-title">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden="true" />

      <header className="flex flex-col gap-4 text-start sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
            <Layers3 className="size-4 text-accent" aria-hidden="true" />
            {t('themeRankingsEyebrow')}
          </p>
          <h2 id="market-themes-title" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('themeRankingsTitle')}
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-foreground/55">
            {t('themeRankingsDescription', { market })}
          </p>
        </div>
        <p className="text-xs text-foreground/45">{t('themeRankingsHint')}</p>
      </header>

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('themeRankingsLoading')}>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none" />
          ))}
        </div>
      ) : rankedSectors.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-foreground/[0.035] px-5 py-10 text-center">
          <p className="font-medium">{t('themeRankingsEmptyTitle')}</p>
          <p className="mt-1 text-xs text-foreground/55">{t('themeRankingsEmptyBody')}</p>
        </div>
      ) : (
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rankedSectors.map((sector, index) => {
            const isUp = sector.avgPct > 0;
            const isDown = sector.avgPct < 0;
            const name = isAr ? sector.nameAr : sector.name;
            const DirectionIcon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : Minus;

            return (
              <li key={sector.name}>
                <button
                  type="button"
                  onClick={() => onSelectSector(sector)}
                  aria-label={t('themeCardLabel', { name, value: `${isUp ? '+' : ''}${sector.avgPct.toFixed(2)}%` })}
                  style={heatStyle(sector.avgPct)}
                  className="group flex min-h-36 w-full flex-col rounded-2xl border p-4 text-start shadow-[0_1px_1px_rgba(0,0,0,0.03)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-md bg-foreground/[0.06] px-2 py-1 font-mono text-[10px] font-semibold tabular-nums text-foreground/60">
                      #{index + 1}
                    </span>
                    {index < 3 ? (
                      <span className="flex items-center gap-1 rounded-full bg-down/10 px-2 py-1 text-[9px] font-semibold text-down">
                        <Flame className="size-3" aria-hidden="true" />
                        {t('themeLeading')}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{name}</h3>
                  <p className={`mt-2 flex items-center gap-1 font-mono text-xl font-semibold tabular-nums ${heatText(sector.avgPct)}`} dir="ltr">
                    <DirectionIcon className="size-4" aria-hidden="true" />
                    {isUp ? '+' : ''}{sector.avgPct.toFixed(2)}%
                  </p>

                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-foreground/[0.07] pt-3 text-[10px] text-foreground/55">
                    <span><span className="tabular-nums" dir="ltr">{sector.stocks.length}</span> {t('themeStocksLabel')}</span>
                    <span className="max-w-[55%] truncate font-mono" dir="ltr">
                      {sector.stocks.slice(0, 3).map((stock) => stock.symbol.replace('.SR', '')).join(' · ')}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-5 text-start text-[10px] leading-relaxed text-foreground/45">
        {t('themeRankingsDisclosure')}
      </p>
    </section>
  );
}
