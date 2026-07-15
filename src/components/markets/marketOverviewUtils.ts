import type { TickerEntry } from '@/lib/tickers';

export interface SectorGroup {
  name: string;
  nameAr: string;
  avgPct: number;
  pricedCount?: number;
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

// Continuous theme-aware heat scale. A non-zero move starts visibly at 8%;
// magnitude then grows to 24% at |4%|, while zero remains a neutral card.
export function heatStyle(pct: number): {
  backgroundColor: string;
  backgroundImage: string;
  borderColor: string;
} {
  if (pct === 0) {
    return {
      backgroundColor: 'var(--surface-card)',
      backgroundImage: 'none',
      borderColor: 'var(--border-color)',
    };
  }
  const signal = pct > 0 ? 'var(--up)' : 'var(--down)';
  const strength = Math.round(8 + Math.min(Math.abs(pct), 4) / 4 * 16);
  const fadeStrength = Math.max(4, strength - 5);
  const borderStrength = Math.min(36, strength + 14);
  return {
    backgroundColor: 'var(--surface-card)',
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${signal} ${strength}%, var(--surface-card)) 0%, color-mix(in srgb, ${signal} ${fadeStrength}%, var(--surface-card)) 58%, var(--surface-card) 100%)`,
    borderColor: `color-mix(in srgb, ${signal} ${borderStrength}%, var(--border-color))`,
  };
}

export function heatText(pct: number): string {
  if (pct > 0) return 'text-up';
  if (pct < 0) return 'text-down';
  return 'text-foreground/60';
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
