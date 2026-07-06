'use client';
// 'use client' reason: local form state + fetch('/api/family/children').
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

const inputClass =
  'w-full glass-panel bg-black/30 px-4 py-3 text-start placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

export default function NewChildForm() {
  const t = useTranslations('Auth.newChild');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
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
        body: JSON.stringify({ name, username, pin }),
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
        <h2 className="text-xl font-bold text-emerald-400">{t('successTitle')}</h2>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-sm text-gray-400 mb-1">{t('usernameCreatedLabel')}</p>
          <p className="text-2xl font-bold text-white">{createdUsername}</p>
        </div>
        <p className="text-sm text-gray-400">{t('doneNote')}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="childName" className="block text-sm text-gray-400 mb-1 text-start">
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
          <label htmlFor="childUsername" className="block text-sm text-gray-400 mb-1 text-start">
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
          <label htmlFor="childPin" className="block text-sm text-gray-400 mb-1 text-start">
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
    </div>
  );
}
