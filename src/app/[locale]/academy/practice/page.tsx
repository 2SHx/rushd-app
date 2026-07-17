import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AcademyState } from '@/components/academy/AcademyState';
import AcademyPracticeClient from '@/components/academy/AcademyPracticeClient';
import { isValidQuizTopic } from '@/components/academy/quizTopics';

export default async function AcademyPracticePage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { topic?: string | string[] };
}) {
  const t = await getTranslations('Academy');
  const requestedTopic = typeof searchParams?.topic === 'string' ? searchParams.topic : null;
  const topic = requestedTopic && isValidQuizTopic(requestedTopic) ? requestedTopic : null;

  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6 md:pb-16">
    <Link href={`/${params.locale}/academy`} className="text-sm text-foreground/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t('backToCatalog')}</Link>
    <header className="mt-8 text-start">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('practice.eyebrow')}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] rtl:tracking-normal">{t('practice.title')}</h1>
    </header>
    {topic ? <div className="mt-6"><AcademyPracticeClient topic={topic} locale={params.locale} academyHref={`/${params.locale}/academy`} /></div>
      : <div className="mt-6"><AcademyState kind="empty" title={t('practice.invalidTitle')} body={t('practice.invalidBody')} /></div>}
  </main>;
}
