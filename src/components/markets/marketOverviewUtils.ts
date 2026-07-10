import type { TickerEntry } from '@/lib/tickers';

export interface SectorGroup {
  name: string;
  nameAr: string;
  avgPct: number;
  stocks: TickerEntry[];
}

export interface FearGreed {
  score: number;
  label: string;
  prevScore: number;
}

export interface FGInfo {
  label: string;
  labelAr: string;
  /** semantic text color for the score/label */
  textClass: string;
}

// Heat-scale utility classes for the sector heatmap tiles. Magnitude controls
// opacity; direction controls hue via the up/down semantic tokens — never a
// one-off hex (ui-craft §5).
export function heatBg(pct: number): string {
  if (pct >= 4) return 'bg-up/[0.22]';
  if (pct >= 2) return 'bg-up/[0.16]';
  if (pct >= 0.5) return 'bg-up/10';
  if (pct >= 0) return 'bg-up/[0.04]';
  if (pct >= -0.5) return 'bg-down/[0.04]';
  if (pct >= -2) return 'bg-down/10';
  if (pct >= -4) return 'bg-down/[0.16]';
  return 'bg-down/[0.22]';
}

export function heatBorder(pct: number): string {
  if (pct >= 0.5) return 'border-up/25';
  if (pct >= 0) return 'border-up/10';
  if (pct >= -0.5) return 'border-down/10';
  return 'border-down/25';
}

export function heatText(pct: number): string {
  return pct >= 0 ? 'text-up' : 'text-down';
}

export function fgInfo(score: number): FGInfo {
  if (score >= 75) return { label: 'Extreme Greed', labelAr: 'جشع مفرط', textClass: 'text-up' };
  if (score >= 55) return { label: 'Greed', labelAr: 'جشع', textClass: 'text-up' };
  if (score >= 45) return { label: 'Neutral', labelAr: 'محايد', textClass: 'text-foreground/70' };
  if (score >= 25) return { label: 'Fear', labelAr: 'خوف', textClass: 'text-down' };
  return { label: 'Extreme Fear', labelAr: 'خوف مفرط', textClass: 'text-down' };
}

export function computeLocalFG(tickers: TickerEntry[]): FearGreed {
  const gainers = tickers.filter((t) => t.pct > 0).length;
  const total = tickers.length;
  const avgPct = tickers.reduce((s, t) => s + t.pct, 0) / total;
  const breadth = (gainers / total) * 60;
  const momentum = Math.min(Math.max(avgPct * 8, -20), 20) + 20;
  const score = Math.round(Math.min(Math.max(breadth + momentum, 5), 95));
  return {
    score,
    label: fgInfo(score).label,
    prevScore: Math.max(5, score - Math.round(avgPct * 3)),
  };
}
