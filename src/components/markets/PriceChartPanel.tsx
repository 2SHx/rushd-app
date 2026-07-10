'use client';

import AdvancedTradingChart from '../AdvancedTradingChart';

interface PriceChartPanelProps {
  history: any[];
}

export default function PriceChartPanel({ history }: PriceChartPanelProps) {
  return (
    <div className="glass-panel p-4 rounded-3xl">
      <AdvancedTradingChart data={history} />
    </div>
  );
}
