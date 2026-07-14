'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  Landmark,
  ListOrdered,
  Minus,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { AlpacaPaperViewModel } from '@/quant/portfolio/alpacaPaperView';

interface Props {
  data: Exclude<AlpacaPaperViewModel, { status: 'hidden' }>;
}

export default function AlpacaPaperPortfolioView({ data }: Props) {
  const t = useTranslations('Quant');
  const locale = useLocale();
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';

  if (data.status === 'unconfigured' || data.status === 'error') {
    const isError = data.status === 'error';
    return (
      <section className="rounded-3xl bg-surface-card p-6 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-8" role={isError ? 'alert' : 'status'}>
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
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('alpacaRetry')}
          </button>
        ) : null}
      </section>
    );
  }

  const money = (value: string, signDisplay: 'auto' | 'always' = 'auto') => new Intl.NumberFormat(numberLocale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    signDisplay,
  }).format(Number(value));
  const percent = (value: string) => new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(Number(value));
  const quantity = (value: string) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 6 }).format(Number(value));
  const dateTime = (value: string) => new Intl.DateTimeFormat(numberLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
  }).format(new Date(value));
  const dayPnl = Number(data.account.dayPnl);
  const DayIcon = dayPnl > 0 ? ArrowUpRight : dayPnl < 0 ? ArrowDownRight : Minus;
  const dayColor = dayPnl > 0 ? 'text-up' : dayPnl < 0 ? 'text-down' : 'text-foreground/60';

  const cards = [
    { key: 'equity', label: t('alpacaEquity'), value: money(data.account.equity), Icon: Landmark, color: 'text-foreground' },
    { key: 'cash', label: t('alpacaCash'), value: money(data.account.cash), Icon: CircleDollarSign, color: data.account.cashNegative ? 'text-down' : 'text-foreground' },
    { key: 'buying-power', label: t('alpacaBuyingPower'), value: money(data.account.buyingPower), Icon: WalletCards, color: 'text-foreground' },
    { key: 'day-pnl', label: t('alpacaDayPnl'), value: `${money(data.account.dayPnl, 'always')} · ${percent(data.account.dayPnlPct)}`, Icon: DayIcon, color: dayColor },
  ];

  return (
    <section className="space-y-6" aria-labelledby="alpaca-paper-title">
      <header className="rounded-3xl bg-surface-card p-6 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase text-accent ltr:tracking-[0.14em] rtl:tracking-normal">
                {t('alpacaPaperBadge')}
              </span>
              <span className="rounded-full bg-up/10 px-3 py-1 text-[10px] font-semibold text-up">{data.account.status}</span>
              {data.account.tradingBlocked ? (
                <span className="rounded-full bg-down/10 px-3 py-1 text-[10px] font-semibold text-down">{t('alpacaTradingBlocked')}</span>
              ) : null}
            </div>
            <h2 id="alpaca-paper-title" className="mt-4 text-2xl font-semibold tracking-tight">{t('alpacaTitle')}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/60">{t('alpacaSubtitle')}</p>
          </div>
          <p className="inline-flex shrink-0 items-center gap-2 text-xs text-foreground/50" dir="ltr">
            <Clock3 className="size-4" aria-hidden="true" />
            {dateTime(data.retrievedAt)}
          </p>
        </div>

        {data.account.cashNegative ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-down/10 p-4 text-sm text-down" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">{t('alpacaNegativeCashWarning')}</p>
          </div>
        ) : null}
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-noncompliant/10 p-4 text-xs text-noncompliant" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">{t('alpacaShariaDisclosure')}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ key, label, value, Icon, color }) => (
          <article key={key} className="rounded-2xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 text-xs text-foreground/55">
              <Icon className={`size-4 ${color}`} aria-hidden="true" />
              {label}
            </div>
            <p className={`mt-4 font-mono text-xl font-semibold tabular-nums ${color}`} dir="ltr">{value}</p>
          </article>
        ))}
      </div>

      <section className="rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_36px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="alpaca-positions-title">
        <h3 id="alpaca-positions-title" className="flex items-center gap-2 text-base font-semibold">
          <Landmark className="size-4 text-accent" aria-hidden="true" />
          {t('alpacaPositions')}
          <span className="font-mono text-xs tabular-nums text-foreground/45" dir="ltr">{data.positions.length}</span>
        </h3>
        {data.positions.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-foreground/[0.035] p-8 text-center">
            <p className="font-medium">{t('alpacaNoPositionsTitle')}</p>
            <p className="mt-1 text-xs text-foreground/55">{t('alpacaNoPositionsBody')}</p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <thead className="text-foreground/45">
                <tr>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-start font-medium">{t('symbol')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-start font-medium">{t('alpacaSide')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaQuantity')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaAverageEntry')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('price')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaMarketValue')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaUnrealizedPnl')}</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((position) => {
                  const pnl = Number(position.unrealizedPnl);
                  const PnlIcon = pnl > 0 ? ArrowUpRight : pnl < 0 ? ArrowDownRight : Minus;
                  const pnlColor = pnl > 0 ? 'text-up' : pnl < 0 ? 'text-down' : 'text-foreground/60';
                  return (
                    <tr key={position.symbol} className="border-b border-foreground/[0.05] last:border-0">
                      <td className="px-3 py-4 font-mono font-semibold text-foreground" dir="ltr">{position.symbol}</td>
                      <td className="px-3 py-4 text-foreground/65">{t(position.side === 'short' ? 'alpacaShort' : 'alpacaLong')}</td>
                      <td className="px-3 py-4 text-end font-mono tabular-nums" dir="ltr">{quantity(position.qty)}</td>
                      <td className="px-3 py-4 text-end font-mono tabular-nums" dir="ltr">{money(position.avgEntryPrice)}</td>
                      <td className="px-3 py-4 text-end font-mono tabular-nums" dir="ltr">{money(position.currentPrice)}</td>
                      <td className="px-3 py-4 text-end font-mono font-semibold tabular-nums" dir="ltr">{money(position.marketValue)}</td>
                      <td className={`px-3 py-4 text-end font-mono font-semibold tabular-nums ${pnlColor}`} dir="ltr">
                        <span className="inline-flex items-center justify-end gap-1">
                          <PnlIcon className="size-3.5" aria-hidden="true" />
                          {money(position.unrealizedPnl, 'always')} · {percent(position.unrealizedPnlPct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_36px_rgba(0,0,0,0.06)] sm:p-6" aria-labelledby="alpaca-orders-title">
        <h3 id="alpaca-orders-title" className="flex items-center gap-2 text-base font-semibold">
          <ListOrdered className="size-4 text-accent" aria-hidden="true" />
          {t('alpacaOpenOrders')}
          <span className="font-mono text-xs tabular-nums text-foreground/45" dir="ltr">{data.openOrders.length}</span>
        </h3>
        {data.openOrders.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-foreground/[0.035] p-6 text-center text-sm text-foreground/55">{t('alpacaNoOpenOrders')}</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead className="text-foreground/45">
                <tr>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-start font-medium">{t('symbol')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-start font-medium">{t('alpacaSide')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-start font-medium">{t('alpacaOrderType')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaQuantity')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaFilled')}</th>
                  <th className="border-b border-foreground/[0.07] px-3 py-3 text-end font-medium">{t('alpacaOrderStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {data.openOrders.map((order) => (
                  <tr key={order.id} className="border-b border-foreground/[0.05] last:border-0">
                    <td className="px-3 py-4 font-mono font-semibold" dir="ltr">{order.symbol}</td>
                    <td className={`px-3 py-4 font-semibold ${order.side === 'buy' ? 'text-up' : 'text-down'}`}>
                      {t(order.side === 'buy' ? 'alpacaBuy' : 'alpacaSell')}
                    </td>
                    <td className="px-3 py-4 uppercase text-foreground/65">{order.type}</td>
                    <td className="px-3 py-4 text-end font-mono tabular-nums" dir="ltr">{quantity(order.qty)}</td>
                    <td className="px-3 py-4 text-end font-mono tabular-nums" dir="ltr">{quantity(order.filledQty)}</td>
                    <td className="px-3 py-4 text-end font-medium uppercase text-foreground/65">{order.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
