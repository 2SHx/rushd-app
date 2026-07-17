import { getTranslations } from 'next-intl/server';
import NewChildForm from '@/components/auth/NewChildForm';

export default async function NewChildPage() {
  const t = await getTranslations('Auth.newChild');

  return (
    <section className="mx-auto mt-8 max-w-md px-4 pb-28 sm:px-0 md:pb-12">
      <h1 className="mb-2 text-center text-3xl font-semibold tracking-[-0.025em] rtl:tracking-normal">
        {t('title')}
      </h1>
      <p className="mb-6 text-center text-foreground/65">{t('subtitle')}</p>
      <NewChildForm />
    </section>
  );
}
