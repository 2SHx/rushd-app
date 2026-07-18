import { notFound, redirect } from 'next/navigation';
import { SHOW_STRATEGY_TEAMS } from '@/lib/featureFlags';

export default function LegacyQuantTeamsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { setup?: string };
}) {
  if (!SHOW_STRATEGY_TEAMS) notFound();

  const query = new URLSearchParams({ section: 'teams' });
  if (searchParams?.setup) query.set('setup', searchParams.setup);
  redirect(`/${params.locale || 'ar'}/quant?${query.toString()}#quant-workspace`);
}
