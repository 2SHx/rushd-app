import { AlertCircle, BookOpen } from 'lucide-react';

export function AcademyState({ kind, title, body }: { kind: 'empty' | 'error'; title: string; body: string }) {
  const Icon = kind === 'error' ? AlertCircle : BookOpen;
  return <section className="mt-10 rounded-3xl bg-foreground/[0.035] px-6 py-14 text-center shadow-[0_18px_55px_rgba(0,0,0,0.08)]" role={kind === 'error' ? 'alert' : 'status'}><Icon className="mx-auto size-6 text-accent" aria-hidden="true" /><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-foreground/60">{body}</p></section>;
}
