'use client';

import { useState, useEffect, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { TICKERS, type TickerEntry } from '@/lib/tickers';
import MarketOverviewHeader from './MarketOverviewHeader';
import MarketSectorHeatmap from './MarketSectorHeatmap';
import MarketSentimentPanel from './MarketSentimentPanel';
import MarketMoversPanel from './MarketMoversPanel';
import MarketSectorModal from './MarketSectorModal';
import type { SectorGroup, FearGreed } from './marketOverviewUtils';
import { computeLocalFG } from './marketOverviewUtils';

interface Props {
  market: 'TASI' | 'NASDAQ';
  locale: string;
  onSelectStock: (symbol: string) => void;
}

export default function MarketOverviewPanel({ market, locale, onSelectStock }: Props) {
  const isAr = locale === 'ar';
  const tickers = TICKERS[market];

  const [fg, setFg] = useState<FearGreed | null>(null);
  const [selectedSector, setSelectedSector] = useState<SectorGroup | null>(null);

  // Fetch CNN Fear & Greed, falling back to a locally computed proxy
  useEffect(() => {
    setFg(null);
    fetch('/api/fear-greed')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const fg_node = data?.fear_and_greed;
        if (fg_node?.score != null) {
          setFg({
            score: Math.round(Number(fg_node.score)),
            label: String(fg_node.rating ?? ''),
            prevScore: Math.round(Number(fg_node.previous_close ?? fg_node.score)),
          });
        } else {
          setFg(computeLocalFG(tickers));
        }
      })
      .catch(() => setFg(computeLocalFG(tickers)));
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectors = useMemo((): SectorGroup[] => {
    const map = new Map<string, TickerEntry[]>();
    tickers.forEach((t) => {
      if (!map.has(t.sector)) map.set(t.sector, []);
      map.get(t.sector)!.push(t);
    });
    return Array.from(map.entries())
      .map(([name, stocks]) => ({
        name,
        nameAr: stocks[0].sectorAr,
        avgPct: stocks.reduce((s, t) => s + t.pct, 0) / stocks.length,
        stocks,
      }))
      .sort((a, b) => b.stocks.length - a.stocks.length);
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const up = tickers.filter((t) => t.pct > 0);
    const dn = tickers.filter((t) => t.pct < 0);
    const avg = tickers.reduce((s, t) => s + t.pct, 0) / tickers.length;
    const top5 = [...tickers].sort((a, b) => b.pct - a.pct).slice(0, 5);
    const bot5 = [...tickers].sort((a, b) => a.pct - b.pct).slice(0, 5);
    return { up, dn, avg, top5, bot5 };
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  const upPct = Math.round((stats.up.length / tickers.length) * 100);

  return (
    <div className="space-y-6 pb-12">
      <MarketOverviewHeader
        isAr={isAr}
        locale={locale}
        market={market}
        avgPct={stats.avg}
        upCount={stats.up.length}
        dnCount={stats.dn.length}
        upPct={upPct}
        fg={fg}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8">
          <MarketSectorHeatmap sectors={sectors} isAr={isAr} onSelectSector={setSelectedSector} />
        </div>
        <div className="xl:col-span-4">
          <MarketSentimentPanel fg={fg} sectors={sectors} isAr={isAr} />
        </div>
      </div>

      <MarketMoversPanel top5={stats.top5} bot5={stats.bot5} isAr={isAr} onSelectStock={onSelectStock} />

      {/* AI autopilot callout — demoted to a quiet, single-line strip; the
          numbers above remain the focal point (ui-craft: decoration recedes). */}
      <div className="rounded-2xl border border-accent/15 bg-accent/[0.03] p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-start md:items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/10 text-accent shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm">
              {isAr ? 'الطيار الآلي للذكاء الاصطناعي' : 'Autonomous Strategy Desk'}
            </h4>
            <p className="text-[11px] text-foreground/50 max-w-xl mt-0.5">
              {isAr
                ? 'يقوم وكلاء المعرفة الشرعية والمالية بفحص السوق والتداول بشكل مستمر.'
                : 'Multi-agent screening performs real-time market ingestion, compliance gating, and risk review.'}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold tracking-wide text-accent bg-accent/10 px-2.5 py-1 rounded-lg uppercase shrink-0">
          {isAr ? 'تلقائي' : 'Autopilot'}
        </span>
      </div>

      <MarketSectorModal
        sector={selectedSector}
        isAr={isAr}
        onClose={() => setSelectedSector(null)}
        onSelectStock={onSelectStock}
      />
    </div>
  );
}
