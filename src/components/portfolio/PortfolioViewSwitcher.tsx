'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Landmark, WalletCards } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import AlpacaPaperPortfolioView from '@/components/quant/AlpacaPaperPortfolioView';
import type { AlpacaPaperViewModel } from '@/quant/portfolio/alpacaPaperView';

interface Props {
  children: ReactNode;
  data: AlpacaPaperViewModel;
}

export default function PortfolioViewSwitcher({ children, data }: Props) {
  const t = useTranslations('Quant');
  const locale = useLocale();
  const [view, setView] = useState<'rushd' | 'alpaca'>('rushd');

  if (data.status === 'hidden') return children;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
        <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_30px_rgba(0,0,0,0.06)]" role="tablist" aria-label={t('portfolioTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'rushd'}
            onClick={() => setView('rushd')}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              view === 'rushd' ? 'bg-accent text-white' : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground'
            }`}
          >
            <WalletCards className="size-4" aria-hidden="true" />
            {t('portfolioTitle')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'alpaca'}
            onClick={() => setView('alpaca')}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              view === 'alpaca' ? 'bg-accent text-white' : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground'
            }`}
          >
            <Landmark className="size-4" aria-hidden="true" />
            {t('alpacaTab')}
          </button>
        </div>
      </div>

      {view === 'rushd' ? children : <AlpacaPaperPortfolioView data={data} locale={locale} />}
    </>
  );
}
