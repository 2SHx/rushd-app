'use client';

import { useTranslations } from 'next-intl';
import { AcademyState } from '@/components/academy/AcademyState';

export default function AcademyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Academy');
  return <main className="mx-auto max-w-4xl px-4 py-10"><AcademyState kind="error" title={t('errorTitle')} body={t('errorBody')} /><button type="button" onClick={reset} className="mx-auto mt-5 block rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('retry')}</button></main>;
}
