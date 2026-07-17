'use client';
// 'use client' reason: local form state + fetch('/api/family/children').
import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

const inputClass =
  'w-full rounded-xl border border-[var(--border-color)] bg-foreground/[0.03] px-4 py-3 text-start text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors duration-150';

export default function NewChildForm() {
  const t = useTranslations('Auth.newChild');
  const locale = useLocale();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [ageSegment, setAgeSegment] = useState<'KIDS' | 'TEENS'>('KIDS');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setHasError(false);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/family/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, pin, ageSegment }),
      });
      if (res.status !== 201) {
        setHasError(true);
        return;
      }
      const data = await res.json();
      setCreatedUsername(data.username);
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdUsername) {
    return (
      <div className="glass-panel p-6 space-y-4 text-center">
        <h2 className="text-xl font-semibold text-up">{t('successTitle')}</h2>
        <div className="p-4 rounded-xl bg-up/10 border border-up/30">
          <p className="text-sm text-foreground/60 mb-1">{t('usernameCreatedLabel')}</p>
          <p className="text-2xl font-semibold text-foreground">{createdUsername}</p>
        </div>
        <p className="text-sm text-foreground/60">{t('doneNote')}</p>
        <Link href={`/${locale}/family/settings`} className="inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {t('manageSegments')}
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="childName" className="block text-sm text-foreground/60 mb-1 text-start">
            {t('nameLabel')}
          </label>
          <input
            id="childName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="childUsername" className="block text-sm text-foreground/60 mb-1 text-start">
            {t('usernameLabel')}
          </label>
          <input
            id="childUsername"
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
          <label htmlFor="childPin" className="block text-sm text-foreground/60 mb-1 text-start">
            {t('pinLabel')}
          </label>
          <input
            id="childPin"
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
        <div>
          <label htmlFor="childAgeSegment" className="block text-sm text-foreground/60 mb-1 text-start">
            {t('ageSegmentLabel')}
          </label>
          <select
            id="childAgeSegment"
            value={ageSegment}
            onChange={(event) => setAgeSegment(event.target.value as 'KIDS' | 'TEENS')}
            className={inputClass}
          >
            <option value="KIDS">{t('ageSegments.kids')}</option>
            <option value="TEENS">{t('ageSegments.teens')}</option>
          </select>
          <p className="mt-2 text-start text-xs leading-relaxed text-foreground/65">
            {t('ageSegmentNote')}
          </p>
        </div>

        {hasError && (
          <p role="alert" className="text-sm text-down">
            {t('error')}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-accent font-semibold text-white transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}
