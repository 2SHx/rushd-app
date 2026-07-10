'use client';

import { useMemo } from 'react';

interface SparklineProps {
  pct: number;
  width?: number;
  height?: number;
}

// Deterministic, quiet trend line — a single hairline path, no glow. Color is
// inherited via currentColor so callers pair it with text-up/text-down.
export default function MarketSparkline({ pct, width = 56, height = 20 }: SparklineProps) {
  const points = useMemo(() => {
    const arr = [];
    const count = 9;
    const baseDir = pct >= 0 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const step = i / (count - 1);
      const wave = Math.sin(step * Math.PI * 1.5) * 0.4;
      const noise = Math.cos(step * Math.PI * 4 + Math.abs(pct)) * 0.25;
      const trend = step * baseDir * (Math.abs(pct) * 0.15 + 0.2);
      arr.push({
        x: step * width,
        y: height / 2 - (wave + noise + trend) * (height / 2.5),
      });
    }
    return arr;
  }, [pct, width, height]);

  const pathD = `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

  return (
    <svg width={width} height={height} className={pct >= 0 ? 'text-up' : 'text-down'} aria-hidden="true">
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
