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
  const [familyCode, setFamilyCode] = useState<string | null>(null);

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
      const data = await res.json();
      setFamilyCode(data.familyCode);
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (familyCode) {
    return (
      <div className="glass-panel p-6 space-y-4 text-center">
        <h2 className="text-xl font-bold text-emerald-400">{t('successTitle')}</h2>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-sm text-gray-400 mb-1">{t('familyCodeLabel')}</p>
          <p className="text-2xl font-bold tracking-widest text-white">{familyCode}</p>
        </div>
        <p className="text-sm text-gray-400">{t('saveCodeNote')}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/${locale}/family/new-child`}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20"
          >
            {t('addChildLink')}
          </Link>
          <Link href={`/${locale}/login`} className="text-emerald-400 hover:underline text-sm">
            {t('loginLink')}
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
