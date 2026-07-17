// src/app/[locale]/profile/page.tsx
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { User as UserIcon, Shield, Trophy, Key, Star } from 'lucide-react';
import TierSelector from '@/components/profile/TierSelector';

export default async function ProfilePage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const isAr = locale === 'ar';
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  // Try to load user from DB; fall back to session data if DB is unavailable
  let user: any = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        gamificationProfile: true,
        savingsJar: true
      }
    });
  } catch {
    // DB unavailable — use session mock
  }

  if (!user) {
    // Build a mock user from the session so the page renders without a DB
    user = {
      name: session.user.name || (isAr ? 'مستثمر تجريبي' : 'Mock Investor'),
      email: null,
      username: (session.user as any).username || 'mock_investor',
      role: (session.user as any).role || 'CHILD',
      tier: (session.user as any).tier || 'BASIC',
      familyCode: null,
      gamificationProfile: { level: 2, xp: 150, badges: [] },
      savingsJar: null,
    };
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-accent bg-clip-text text-transparent">
          {isAr ? 'حسابي' : 'My Profile'}
        </h1>
        <p className="text-gray-400 mt-1">
          {isAr ? 'إدارة معلومات حسابك وتفضيلاتك.' : 'Manage your account information and preferences.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Card */}
        <div className="glass-panel p-6 md:col-span-2 space-y-6">
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-sm text-gray-400">
                {user.role === 'PARENT' ? user.email : `@${user.username}`}
              </p>
            </div>
          </div>

          <hr className="border-white/10" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                {isAr ? 'نوع الحساب' : 'Account Role'}
              </span>
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
                <Shield className="w-4 h-4" />
                <span className="font-semibold">{user.role}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                {isAr ? 'مستوى العضوية' : 'Premium Tier'}
              </span>
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-accent">
                <Star className="w-4 h-4 fill-accent/10" />
                <span className="font-semibold">{user.tier}</span>
              </div>
            </div>

            {/* Simulated Tier Upgrader widget */}
            <div className="sm:col-span-2 mt-2">
              <TierSelector currentTier={user.tier} locale={locale} />
            </div>

            {user.role === 'PARENT' && user.familyCode && (
              <div className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  {isAr ? 'رمز العائلة' : 'Family Access Code'}
                </span>
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-amber-400 bg-amber-400/5 border border-amber-400/10 p-3 rounded-xl mt-1">
                  <Key className="w-4 h-4 shrink-0" />
                  <span className="font-mono font-bold uppercase select-all tracking-wider">{user.familyCode}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gamification Level & XP Progress Card */}
        <div className="glass-panel p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 rtl:space-x-reverse text-accent">
              <Trophy className="w-5 h-5" />
              <h3 className="font-bold text-base">{isAr ? 'مستوى التعلّم والخبرة' : 'Investor Level & XP'}</h3>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider block">{isAr ? 'المستوى الحالي' : 'Current Level'}</span>
              <p className="text-3xl font-extrabold text-accent">
                {isAr ? 'المستوى' : 'Level'} {user.gamificationProfile?.level ?? 3} · {isAr ? 'مستثمر واعد' : 'Promising Investor'}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono font-semibold">
                <span className="text-foreground/60">{isAr ? 'نقاط الخبرة:' : 'Total Experience:'}</span>
                <span className="text-accent">{user.gamificationProfile?.xp ?? 350} / 500 XP</span>
              </div>
              <div className="w-full h-2.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (((user.gamificationProfile?.xp ?? 350) / 500) * 100))}%` }} />
              </div>
              <p className="text-[11px] text-foreground/50">
                {isAr ? 'متبقي 150 XP للوصول للمستوى 4' : '150 XP remaining to Level 4'}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-foreground/10">
            <span className="text-xs font-semibold text-foreground/50 block mb-2">
              {isAr ? 'الشارات المفتوحة' : 'Unlocked Badges'}
            </span>
            <div className="flex flex-wrap gap-2">
              {(user.gamificationProfile?.badges && user.gamificationProfile.badges.length > 0
                ? user.gamificationProfile.badges
                : ['🛡️ فاحص أيوفي', '⚡ رواد الادخار', '📊 محلل القيمة']
              ).map((badge: string, idx: number) => (
                <span key={idx} className="bg-foreground/5 border border-foreground/10 px-2.5 py-1 rounded-full text-xs font-semibold text-foreground/75">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

