import { getTranslations } from 'next-intl/server';
import LoginForm from '@/components/auth/LoginForm';

export default async function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations('Auth.login');

  return (
    <section className="max-w-md mx-auto mt-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent mb-6 text-center">
        {t('title')}
      </h1>
      <LoginForm locale={locale} />
    </section>
  );
}
