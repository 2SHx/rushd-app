import { getTranslations } from 'next-intl/server';

const NODE_ROWS = [
  { circle: 'size-9 sm:size-10', card: 'h-12' },
  { circle: 'size-12 sm:size-14', card: 'h-40 sm:h-48' },
  { circle: 'size-9 sm:size-10', card: 'h-16' },
  { circle: 'size-9 sm:size-10', card: 'h-16' },
  { circle: 'size-10 sm:size-12', card: 'h-14' },
] as const;

export default async function AcademyLoading() {
  const t = await getTranslations('Academy');
  return <main className="mx-auto max-w-3xl animate-pulse px-4 pb-28 pt-10 motion-reduce:animate-none sm:px-6 md:pb-16" aria-busy="true" aria-label={t('loading')}>
    <header className="max-w-3xl">
      <div className="h-3 w-28 rounded bg-foreground/10" />
      <div className="mt-4 h-10 max-w-2xl rounded bg-foreground/10 sm:h-12" />
      <div className="mt-4 h-6 max-w-xl rounded bg-foreground/[0.07]" />
    </header>
    <div className="mt-10 h-16 rounded-3xl bg-foreground/[0.06]" />
    <div className="mt-10 h-5 w-40 rounded bg-foreground/10" />
    <div className="mt-6 space-y-6 sm:space-y-7">
      {NODE_ROWS.map((row, index) => (
        <div key={index} className="flex gap-4 sm:gap-6">
          <div className={`shrink-0 rounded-full bg-foreground/10 ${row.circle}`} />
          <div className={`min-w-0 flex-1 rounded-2xl bg-foreground/[0.06] ${row.card}`} />
        </div>
      ))}
    </div>
  </main>;
}
