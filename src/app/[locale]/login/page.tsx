import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';

export default async function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  const session = await auth();
  if (session?.user) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="mx-auto max-w-md py-12 px-4">
      <h1 className="text-2xl font-bold text-center mb-6 text-foreground">
        {locale === 'ar' ? 'تسجيل الدخول إلى رشد' : 'Sign in to Rushd'}
      </h1>
      <LoginForm locale={locale} />
    </div>
  );
}
