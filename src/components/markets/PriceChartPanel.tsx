'use client';

import AdvancedTradingChart from '../AdvancedTradingChart';

interface PriceChartPanelProps {
  history: any[];
}

export default function PriceChartPanel({ history }: PriceChartPanelProps) {
  return (
    <div className="glass-panel p-4 rounded-3xl border border-white/5 bg-[#0f1420]/30">
      <AdvancedTradingChart data={history} />
    </div>
  );
}
