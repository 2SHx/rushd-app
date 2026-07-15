'use client';

import AdvancedTradingChart from '../AdvancedTradingChart';

interface PriceChartPanelProps {
  history: any[];
  symbol?: string;
  market?: 'TASI' | 'NASDAQ';
  dataSource?: string;
}

export default function PriceChartPanel({ history, symbol, market, dataSource }: PriceChartPanelProps) {
  return (
    <div className="glass-panel p-4 rounded-3xl">
      <AdvancedTradingChart data={history} symbol={symbol} market={market} dataSource={dataSource} />
    </div>
  );
}
