'use client';
// 'use client' reason: local form state + fetch('/api/register').
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

const inputClass =
  'w-full glass-panel bg-black/30 px-4 py-3 text-start placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

export default function RegisterForm({ locale }: { locale: string }) {
  const t = useTranslations('Auth.register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setHasError(false);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.status !== 201) {
        setHasError(true);
        return;
      }
      setIsSuccess(true);
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="glass-panel p-6 space-y-4 text-center">
        <h2 className="text-xl font-bold text-emerald-400">
          {locale === 'ar' ? 'تم إنشاء الحساب بنجاح!' : 'Account Created Successfully!'}
        </h2>
        <p className="text-sm text-gray-400">
          {locale === 'ar' 
            ? 'يمكنك الآن تسجيل الدخول باستخدام بريدك الإلكتروني وكلمة المرور لتجربة محاكاة التداول المتقدمة.' 
            : 'You can now log in using your email and password to start your advanced trading simulator.'}
        </p>
        <div className="pt-4">
          <Link
            href={`/${locale}/login`}
            className="w-full block py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20 text-center"
          >
            {locale === 'ar' ? 'تسجيل الدخول' : 'Log In'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm text-gray-400 mb-1 text-start">
            {t('nameLabel')}
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
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
            minLength={8}
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
        {t('haveAccount')}{' '}
        <Link href={`/${locale}/login`} className="text-emerald-400 hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </div>
  );
}
