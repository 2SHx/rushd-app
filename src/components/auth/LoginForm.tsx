'use client';
// 'use client' reason: local form state + signIn()/router calls.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

const inputClass =
  'w-full glass-panel bg-black/30 px-4 py-3 text-start placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

export default function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('Auth.login');
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setHasError(false);
    setIsSubmitting(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (!result || result.error) {
        setHasError(true);
        return;
      }
      router.push(`/${locale}/dashboard`);
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-gray-400 mb-1 text-start">
            {t('emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-gray-400 mb-1 text-start">
            {t('passwordLabel')}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {hasError && (
          <p role="alert" className="text-sm text-red-400">
            {t('error')}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>

      <p className="text-sm text-gray-400 text-center">
        {t('noAccount')}{' '}
        <Link href={`/${locale}/register`} className="text-emerald-400 hover:underline">
          {locale === 'ar' ? 'إنشاء حساب جديد' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
