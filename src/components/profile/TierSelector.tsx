'use client';

import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';

interface TierSelectorProps {
  currentTier: 'BASIC' | 'PREMIUM' | 'ULTRA';
  locale: string;
}

export default function TierSelector({ currentTier, locale }: TierSelectorProps) {
  const isAr = locale === 'ar';
  const [tier, setTier] = useState(currentTier);
  const [loading, setLoading] = useState(false);

  const handleTierChange = async (newTier: 'BASIC' | 'PREMIUM' | 'ULTRA') => {
    setLoading(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: newTier })
      });
      if (res.ok) {
        setTier(newTier);
        // Reload to refresh the server components showing the tier status
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to change tier:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
        {isAr ? 'تحديث مستوى العضوية (للمحاكاة)' : 'Update Subscription Tier (Simulated)'}
      </span>
      <div className="flex items-center space-x-2 rtl:space-x-reverse">
        {loading ? (
          <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
        ) : (
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 space-x-1 rtl:space-x-reverse">
            {(['BASIC', 'PREMIUM', 'ULTRA'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleTierChange(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tier === t
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
