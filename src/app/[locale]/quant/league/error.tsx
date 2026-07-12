'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function QuantResultsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('QuantResults');
  useEffect(() => {
    console.error('strategy league failed to render', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-3xl bg-surface-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_20px_50px_rgba(0,0,0,0.08)]">
        <AlertTriangle className="mb-5 h-7 w-7 text-noncompliant" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-foreground">{t('errorTitle')}</h1>
        <p className="mt-3 text-sm leading-7 text-foreground/65">{t('errorDescription')}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('retry')}
        </button>
      </section>
    </main>
  );
}
