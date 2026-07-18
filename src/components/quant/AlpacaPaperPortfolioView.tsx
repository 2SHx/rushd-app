'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import DashboardClient, { type Position } from '@/components/DashboardClient';
import type { AlpacaPaperViewModel } from '@/quant/portfolio/alpacaPaperView';

interface Props {
  data: Exclude<AlpacaPaperViewModel, { status: 'hidden' }>;
  locale: string;
}

export default function AlpacaPaperPortfolioView({ data, locale }: Props) {
  const t = useTranslations('Quant');

  if (data.status === 'unconfigured' || data.status === 'error') {
    const isError = data.status === 'error';
    return (
      <section className="mx-auto max-w-7xl p-4 md:p-6" role={isError ? 'alert' : 'status'}>
        <div className="rounded-3xl bg-surface-card p-6 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-8">
          <span className={`grid size-11 place-items-center rounded-2xl ${isError ? 'bg-down/10 text-down' : 'bg-noncompliant/10 text-noncompliant'}`}>
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">{t(isError ? 'alpacaErrorTitle' : 'alpacaUnconfiguredTitle')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/60">
            {t(isError ? 'alpacaErrorBody' : 'alpacaUnconfiguredBody')}
          </p>
          {isError ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('alpacaRetry')}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const equity = Number(data.account.equity);
  const cash = Number(data.account.cash);
  const grossExposure = data.positions.reduce((sum, position) => sum + Math.abs(Number(position.marketValue)), 0);
  const positions: Position[] = data.positions.map((position) => {
    const value = Number(position.marketValue);
    const side = position.side === 'short' ? 'short' as const : 'long' as const;
    return {
      symbol: position.symbol,
      name: position.symbol,
      market: 'NASDAQ',
      currency: 'USD',
      shares: Number(position.qty),
      costBasis: Number(position.avgEntryPrice),
      price: Number(position.currentPrice),
      value,
      weight: grossExposure > 0 ? Math.abs(value) / grossExposure : null,
      complianceStatus: 'UNVERIFIED',
      side,
    };
  });
  const positionsValue = positions.reduce((sum, position) => sum + position.value, 0);

  return (
    <DashboardClient
      locale={locale}
      accountKind="alpaca"
      initialNAV={equity}
      initialCash={cash}
      cashCurrency="USD"
      initialPositions={positions}
      initialSnapshots={[]}
      initialMetrics={{}}
      initialTransactions={[]}
      initialXP={0}
      initialLevel={1}
      performanceStatus="no_snapshots"
      currencyTotals={[{ currency: 'USD', positionsValue, cashValue: cash, totalValue: equity }]}
      paperAccount={{
        status: data.account.status,
        retrievedAt: data.retrievedAt,
        buyingPower: Number(data.account.buyingPower),
        tradingBlocked: data.account.tradingBlocked,
        dayPnl: { value: Number(data.account.dayPnl), pct: Number(data.account.dayPnlPct) * 100 },
        openOrders: data.openOrders,
      }}
    />
  );
}
