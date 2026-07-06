import { fetchMarketData } from '@/services/marketData';
import DashboardClient from '@/components/DashboardClient';
import ParentDashboardClient from '@/components/ParentDashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;
  const role = (session.user as any).role || 'CHILD';

  // Route to Parent Dashboard if parent
  if (role === 'PARENT') {
    try {
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
          locale={locale}
        />
      );
    } catch {
      // DB unavailable — fall through to child dashboard with mock data
    }
  }

  // Child Dashboard (or fallback when DB is unavailable)
  let xp = 150;
  let level = 2;

  try {
    let profile = await prisma.gamificationProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.gamificationProfile.create({
        data: { userId, xp: 0, level: 1 }
      });
    }

    xp = profile.xp;
    level = profile.level;
  } catch {
    // DB unavailable — use mock defaults
  }

  const tasiData = await fetchMarketData('1120.SR', 'TASI'); 
  const nasdaqData = await fetchMarketData('AAPL', 'NASDAQ');

  return (
    <DashboardClient 
      tasiData={tasiData} 
      nasdaqData={nasdaqData} 
      initialXp={xp}
      initialLevel={level}
      locale={locale}
    />
  );
}

