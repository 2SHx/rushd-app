import { getTranslations } from 'next-intl/server';

export default async function AcademyLoading() {
  const t = await getTranslations('Academy');
  return <main className="mx-auto max-w-6xl animate-pulse px-4 pb-28 pt-10 motion-reduce:animate-none sm:px-6 md:pb-16" aria-busy="true" aria-label={t('loading')}>
    <header className="max-w-3xl">
      <div className="h-3 w-28 rounded bg-foreground/10" />
      <div className="mt-4 h-12 max-w-2xl rounded bg-foreground/10" />
      <div className="mt-4 h-7 max-w-xl rounded bg-foreground/[0.07]" />
    </header>
    <div className="mt-12 grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-64 rounded-3xl bg-foreground/[0.06] p-6"><div className="size-5 rounded bg-foreground/10" /><div className="mt-8 h-8 w-3/4 rounded bg-foreground/10" /><div className="mt-3 h-5 w-1/2 rounded bg-foreground/[0.08]" /><div className="mt-8 h-4 w-2/3 rounded bg-foreground/[0.08]" /><div className="mt-3 h-1.5 rounded-full bg-foreground/10" /></div>)}</div>
  </main>;
}
