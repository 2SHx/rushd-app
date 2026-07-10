'use client';
// 'use client' reason: local form state + signIn()/router calls.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

const inputClass =
  'w-full rounded-xl border border-[var(--border-color)] bg-foreground/[0.03] px-4 py-3 text-start text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors duration-150';

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
          <label htmlFor="email" className="block text-sm text-foreground/60 mb-1 text-start">
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
          <label htmlFor="password" className="block text-sm text-foreground/60 mb-1 text-start">
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
          <p role="alert" className="text-sm text-down">
            {t('error')}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-accent font-semibold text-white transition-colors duration-150 hover:bg-accent/90 disabled:opacity-60"
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>

      {/* Developer Bypass Mode */}
      <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-foreground/50 font-semibold text-center">
          {locale === 'ar' ? 'أدوات المطور: الدخول السريع' : 'Developer: Quick Testing Access'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={async () => {
              setIsSubmitting(true);
              setHasError(false);
              const res = await signIn('credentials', { email: 'parent@rushd.com', password: 'password', redirect: false });
              if (res && !res.error) {
                router.push(`/${locale}/dashboard`);
              } else {
                setHasError(true);
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="py-2.5 rounded-xl bg-foreground/[0.03] border border-[var(--border-color)] hover:bg-foreground/[0.06] text-xs font-semibold text-foreground transition-colors duration-150 disabled:opacity-60"
          >
            {locale === 'ar' ? 'دخول ولي الأمر' : 'Demo Parent'}
          </button>
          <button
            onClick={async () => {
              setIsSubmitting(true);
              setHasError(false);
              const res = await signIn('credentials', { username: 'child', familyCode: 'RUSHD123', redirect: false });
              if (res && !res.error) {
                router.push(`/${locale}/dashboard`);
              } else {
                setHasError(true);
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="py-2.5 rounded-xl bg-foreground/[0.03] border border-[var(--border-color)] hover:bg-foreground/[0.06] text-xs font-semibold text-accent transition-colors duration-150 disabled:opacity-60"
          >
            {locale === 'ar' ? 'دخول الابن/الابنة' : 'Demo Child'}
          </button>
        </div>
      </div>

      <p className="text-sm text-foreground/60 text-center">
        {t('noAccount')}{' '}
        <Link href={`/${locale}/register`} className="text-accent hover:underline">
          {locale === 'ar' ? 'إنشاء حساب جديد' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
