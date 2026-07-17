'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Child = { id: string; name: string; username: string | null; ageSegment: 'KIDS' | 'TEENS' | null };

export default function ChildAgeSegmentSettings({ childrenList }: { childrenList: Child[] }) {
  const t = useTranslations('Auth.childSettings');
  const [segments, setSegments] = useState<Record<string, 'KIDS' | 'TEENS'>>(
    Object.fromEntries(childrenList.map((child) => [child.id, child.ageSegment ?? 'KIDS'])),
  );
  const [state, setState] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  async function save(childId: string) {
    setState((current) => ({ ...current, [childId]: 'saving' }));
    try {
      const response = await fetch('/api/family/children', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, ageSegment: segments[childId] }),
      });
      if (!response.ok) throw new Error('age_segment_not_saved');
      setState((current) => ({ ...current, [childId]: 'saved' }));
    } catch {
      setState((current) => ({ ...current, [childId]: 'error' }));
    }
  }

  if (childrenList.length === 0) {
    return <p className="rounded-2xl bg-foreground/[0.035] p-6 text-sm leading-7 text-foreground/60">{t('empty')}</p>;
  }

  return <div className="space-y-4">{childrenList.map((child) => {
    const childState = state[child.id] ?? 'idle';
    return <section key={child.id} className="rounded-2xl bg-foreground/[0.035] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-start">
          <h2 className="font-semibold">{child.name}</h2>
          <p className="mt-1 text-xs text-foreground/65" dir="ltr">@{child.username}</p>
          <label htmlFor={`segment-${child.id}`} className="mt-4 block text-sm text-foreground/65">{t('segmentLabel')}</label>
          <select id={`segment-${child.id}`} value={segments[child.id]} onChange={(event) => {
            setSegments((current) => ({ ...current, [child.id]: event.target.value as 'KIDS' | 'TEENS' }));
            setState((current) => ({ ...current, [child.id]: 'idle' }));
          }} className="mt-2 w-full rounded-xl bg-background px-4 py-3 text-start ring-1 ring-foreground/10 focus:outline-none focus:ring-2 focus:ring-accent sm:w-72">
            <option value="KIDS">{t('kids')}</option>
            <option value="TEENS">{t('teens')}</option>
          </select>
        </div>
        <button type="button" onClick={() => save(child.id)} disabled={childState === 'saving'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50">
          {childState === 'saved' && <CheckCircle2 className="size-4" aria-hidden="true" />}
          {t(childState === 'saving' ? 'saving' : childState === 'saved' ? 'saved' : 'save')}
        </button>
      </div>
      {childState === 'error' && <p role="alert" className="mt-3 text-sm text-down">{t('error')}</p>}
    </section>;
  })}</div>;
}
