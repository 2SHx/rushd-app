import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  const session = await auth();
  if (session?.user) {
    redirect(`/${locale}/dashboard`);
  }

  try {
    await signIn('credentials', {
      email: 'parent@rushd.com',
      password: 'password',
      redirectTo: `/${locale}/dashboard`,
    });
  } catch (err) {
    // Next.js redirect throws a specific redirect error, which is caught and handled by Next.js
    throw err;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 space-y-3">
      <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-bold">Signing in automatically to demo account...</p>
    </div>
  );
}
