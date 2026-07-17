import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import ChildAgeSegmentSettings from '@/components/auth/ChildAgeSegmentSettings';

export default async function FamilySettingsPage({ params }: { params: { locale: string } }) {
  const session = await auth();
  if (!session?.user) redirect(`/${params.locale}/login`);
  if (session.user.role !== 'PARENT') redirect(`/${params.locale}/academy`);
  const t = await getTranslations('Auth.childSettings');
  const childrenRows = await prisma.user.findMany({
    where: { parentId: session.user.id, role: 'CHILD' },
    select: { id: true, name: true, username: true, ageSegment: true },
    orderBy: { createdAt: 'asc' },
  });
  const childrenList = childrenRows.map((child) => ({
    ...child,
    ageSegment: child.ageSegment === 'TEENS' ? 'TEENS' as const : 'KIDS' as const,
  }));
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6 md:pb-16">
    <header className="max-w-2xl text-start">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] rtl:tracking-normal">{t('title')}</h1>
      <p className="mt-4 text-sm leading-7 text-foreground/60">{t('body')}</p>
    </header>
    <div className="mt-10"><ChildAgeSegmentSettings childrenList={childrenList} /></div>
  </main>;
}
