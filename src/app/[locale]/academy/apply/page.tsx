import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AcademyState } from '@/components/academy/AcademyState';
import StrategyLearningLab from '@/components/learning/StrategyLearningLab';

export default async function AcademyApplyPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { setupId?: string | string[] };
}) {
  const t = await getTranslations('Academy');
  const setupId = typeof searchParams?.setupId === 'string' && searchParams.setupId.length > 0 ? searchParams.setupId : null;

  return <main className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6 md:pb-16">
    <Link href={`/${params.locale}/academy`} className="text-sm text-foreground/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('backToCatalog')}</Link>
    <header className="mt-8 text-start">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('apply.eyebrow')}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] rtl:tracking-normal">{t('apply.title')}</h1>
    </header>
    {setupId ? <div className="mt-6"><StrategyLearningLab locale={params.locale} setupId={setupId} /></div>
      : <div className="mt-10"><AcademyState kind="empty" title={t('apply.invalidTitle')} body={t('apply.invalidBody')} /></div>}
  </main>;
}
