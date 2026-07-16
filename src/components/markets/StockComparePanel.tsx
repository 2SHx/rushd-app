'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Scale, Plus, X, ShieldCheck, Trophy, Sparkles } from 'lucide-react';

interface StockComparePanelProps {
  primaryData: any;
  locale: string;
}

interface PeerStock {
  symbol: string;
  name: string;
  price: number;
  pe: number;
  marketCap: number;
  growth: number;
  fcfMargin: number;
  sharia: boolean;
  rScore: number;
}

export default function StockComparePanel({ primaryData, locale }: StockComparePanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';

  const availablePeers: PeerStock[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 224.50, pe: 31.2, marketCap: 3.42e12, growth: 12.4, fcfMargin: 26.5, sharia: true, rScore: 8.8 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', price: 448.90, pe: 34.8, marketCap: 3.33e12, growth: 15.2, fcfMargin: 31.0, sharia: true, rScore: 9.1 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 178.30, pe: 24.1, marketCap: 2.21e12, growth: 14.8, fcfMargin: 24.2, sharia: true, rScore: 8.6 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 128.40, pe: 46.5, marketCap: 3.15e12, growth: 65.5, fcfMargin: 47.0, sharia: true, rScore: 9.5 },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 254.20, pe: 62.0, marketCap: 8.10e11, growth: 8.5, fcfMargin: 11.2, sharia: false, rScore: 6.9 },
  ];

  const initialPrimary: PeerStock = {
    symbol: primaryData.symbol.replace('.SR', ''),
    name: isAr && primaryData.arName ? primaryData.arName : primaryData.name || primaryData.symbol,
    price: Number(primaryData.price) || 150,
    pe: Number(primaryData.statistics?.peRatio) || 32,
    marketCap: Number(primaryData.statistics?.marketCap) || 2.5e12,
    growth: 25.0,
    fcfMargin: 47.0,
    sharia: true,
    rScore: 9.2,
  };

  const [selectedPeers, setSelectedPeers] = useState<PeerStock[]>([
    availablePeers.find((p) => p.symbol !== initialPrimary.symbol) || availablePeers[0],
    availablePeers.find((p) => p.symbol !== initialPrimary.symbol && p.symbol !== 'AAPL') || availablePeers[1],
  ]);

  const handleAddPeer = (symbol: string) => {
    if (selectedPeers.length >= 3) return;
    const peer = availablePeers.find((p) => p.symbol === symbol);
    if (peer && !selectedPeers.some((p) => p.symbol === peer.symbol)) {
      setSelectedPeers((prev) => [...prev, peer]);
    }
  };

  const handleRemovePeer = (symbol: string) => {
    setSelectedPeers((prev) => prev.filter((p) => p.symbol !== symbol));
  };

  const allColumns = [initialPrimary, ...selectedPeers];

  // Best-in-row calculation helpers
  const maxGrowth = Math.max(...allColumns.map((c) => c.growth));
  const minPe = Math.min(...allColumns.map((c) => c.pe));
  const maxFcf = Math.max(...allColumns.map((c) => c.fcfMargin));
  const maxRScore = Math.max(...allColumns.map((c) => c.rScore));

  return (
    <div className="glass-panel rounded-3xl p-6 space-y-6 text-start">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Scale className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-extrabold text-foreground">{t('comparePeersTitle')}</h3>
        </div>

        {/* Add Peer Selector */}
        {selectedPeers.length < 3 && (
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <span className="text-xs text-foreground/60">{t('addPeer')}:</span>
            <div className="flex flex-wrap gap-1.5">
              {availablePeers
                .filter((p) => !allColumns.some((col) => col.symbol === p.symbol))
                .map((p) => (
                  <button
                    key={p.symbol}
                    onClick={() => handleAddPeer(p.symbol)}
                    className="flex items-center space-x-1 rtl:space-x-reverse px-2.5 py-1 text-xs font-bold rounded-xl bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{p.symbol}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="p-3 font-bold text-foreground/50">Metric \ Symbol</th>
              {allColumns.map((col, idx) => (
                <th key={col.symbol} className="p-3 text-center min-w-[120px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold font-mono text-foreground text-sm">{col.symbol}</span>
                      {idx > 0 && (
                        <button
                          onClick={() => handleRemovePeer(col.symbol)}
                          className="p-0.5 rounded-full hover:bg-rose-500/20 text-rose-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-foreground/50 truncate max-w-[100px]">{col.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.04]">
            {/* Price */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">Market Price</td>
              {allColumns.map((col) => (
                <td key={col.symbol} className="p-3 text-center font-mono font-bold text-foreground">
                  ${col.price.toFixed(2)}
                </td>
              ))}
            </tr>

            {/* Rushd R-Score */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">Rushd AI Score</td>
              {allColumns.map((col) => {
                const isBest = col.rScore === maxRScore;
                return (
                  <td key={col.symbol} className="p-3 text-center font-mono">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black ${
                        isBest ? 'bg-accent text-white shadow-sm' : 'bg-foreground/5 text-foreground'
                      }`}
                    >
                      {isBest && <Trophy className="w-3 h-3 text-amber-300" />}
                      {col.rScore}/10
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* P/E Ratio */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">P/E Ratio</td>
              {allColumns.map((col) => {
                const isBest = col.pe === minPe;
                return (
                  <td
                    key={col.symbol}
                    className={`p-3 text-center font-mono font-bold ${
                      isBest ? 'text-emerald-500 font-black bg-emerald-500/10 rounded-xl' : 'text-foreground'
                    }`}
                  >
                    {col.pe.toFixed(1)}x
                  </td>
                );
              })}
            </tr>

            {/* Revenue Growth */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">YoY Revenue Growth</td>
              {allColumns.map((col) => {
                const isBest = col.growth === maxGrowth;
                return (
                  <td
                    key={col.symbol}
                    className={`p-3 text-center font-mono font-bold ${
                      isBest ? 'text-emerald-500 font-black bg-emerald-500/10 rounded-xl' : 'text-foreground'
                    }`}
                  >
                    +{col.growth.toFixed(1)}%
                  </td>
                );
              })}
            </tr>

            {/* FCF Margin */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">Free Cash Flow Margin</td>
              {allColumns.map((col) => {
                const isBest = col.fcfMargin === maxFcf;
                return (
                  <td
                    key={col.symbol}
                    className={`p-3 text-center font-mono font-bold ${
                      isBest ? 'text-emerald-500 font-black bg-emerald-500/10 rounded-xl' : 'text-foreground'
                    }`}
                  >
                    {col.fcfMargin.toFixed(1)}%
                  </td>
                );
              })}
            </tr>

            {/* Sharia Status */}
            <tr>
              <td className="p-3 font-semibold text-foreground/70">Sharia Compliance</td>
              {allColumns.map((col) => (
                <td key={col.symbol} className="p-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      col.sharia
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {col.sharia ? 'Halal Verified' : 'Non-Compliant'}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
