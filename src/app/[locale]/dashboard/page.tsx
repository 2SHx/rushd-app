import { fetchMarketData } from '@/services/marketData';
import DashboardClient from '@/components/DashboardClient';
import ParentDashboardClient from '@/components/ParentDashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const role = session.user.role;

  // Route to Parent Dashboard if parent
  if (role === 'PARENT') {
    const parentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, familyCode: true }
    });

    const children = await prisma.user.findMany({
      where: { parentId: userId },
      include: {
        gamificationProfile: true,
        savingsJar: true,
        portfolioItems: true
      }
    });

    return (
      <ParentDashboardClient 
        parentName={parentUser?.name || ''}
        familyCode={parentUser?.familyCode || ''}
        childrenList={children}
      />
    );
  }

  // Otherwise route to Child Dashboard
  // Lazily get or create the child user's gamification profile
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
