import { getTranslations } from 'next-intl/server';
import RegisterForm from '@/components/auth/RegisterForm';

export default async function RegisterPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Auth.register');

  return (
    <section className="max-w-md mx-auto mt-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent mb-2 text-center">
        {t('title')}
      </h1>
      <p className="text-gray-400 text-center mb-6">{t('subtitle')}</p>
      <RegisterForm locale={locale} />
    </section>
  );
}
