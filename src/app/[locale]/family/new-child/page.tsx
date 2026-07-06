import { getTranslations } from 'next-intl/server';
import NewChildForm from '@/components/auth/NewChildForm';

export default async function NewChildPage() {
  const t = await getTranslations('Auth.newChild');

  return (
    <section className="max-w-md mx-auto mt-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent mb-2 text-center">
        {t('title')}
      </h1>
      <p className="text-gray-400 text-center mb-6">{t('subtitle')}</p>
      <NewChildForm />
    </section>
  );
}
