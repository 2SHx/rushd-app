'use client';
// 'use client' reason: local form state (tabs, fields) + signIn()/router calls.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import clsx from 'clsx';

type Tab = 'parent' | 'child';

const inputClass =
  'w-full glass-panel bg-black/30 px-4 py-3 text-start placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

export default function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('Auth.login');
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('parent');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [familyCode, setFamilyCode] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setHasError(false);
    setIsSubmitting(true);
    const credentials =
      tab === 'parent' ? { email, password } : { familyCode, username, pin };
    try {
      const result = await signIn('credentials', { ...credentials, redirect: false });
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
      <div role="tablist" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'parent'}
          onClick={() => setTab('parent')}
          className={clsx(
            'flex-1 px-4 py-2 rounded-xl font-medium transition-colors',
            tab === 'parent' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
          )}
        >
          {t('parentTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'child'}
          onClick={() => setTab('child')}
          className={clsx(
            'flex-1 px-4 py-2 rounded-xl font-medium transition-colors',
            tab === 'child' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
          )}
        >
          {t('childTab')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {tab === 'parent' ? (
          <>
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
          </>
        ) : (
          <>
            <div>
              <label htmlFor="familyCode" className="block text-sm text-gray-400 mb-1 text-start">
                {t('familyCodeLabel')}
              </label>
              <input
                id="familyCode"
                type="text"
                required
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="username" className="block text-sm text-gray-400 mb-1 text-start">
                {t('usernameLabel')}
              </label>
              <input
                id="username"
                type="text"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pin" className="block text-sm text-gray-400 mb-1 text-start">
                {t('pinLabel')}
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                minLength={4}
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        )}

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
          {t('registerLink')}
        </Link>
      </p>
    </div>
  );
}
