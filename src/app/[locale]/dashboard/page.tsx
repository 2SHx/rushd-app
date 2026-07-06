import { fetchMarketData } from '@/services/marketData';
import DashboardClient from '@/components/DashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;

  // Lazily get or create the user's gamification profile
  let profile = await prisma.gamificationProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    profile = await prisma.gamificationProfile.create({
      data: { userId, xp: 0, level: 1 }
    });
  }

  const tasiData = await fetchMarketData('1120.SR', 'TASI'); 
  const nasdaqData = await fetchMarketData('AAPL', 'NASDAQ');

  return (
    <DashboardClient 
      tasiData={tasiData} 
      nasdaqData={nasdaqData} 
      initialXp={profile.xp}
      initialLevel={profile.level}
    />
  );
}
