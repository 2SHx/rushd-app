// src/app/[locale]/profile/page.tsx
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { User as UserIcon, Shield, Trophy, Key, Star } from 'lucide-react';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      gamificationProfile: true,
      savingsJar: true
    }
  });

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          My Profile
        </h1>
        <p className="text-gray-400 mt-1">Manage your account information and preferences.</p>
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
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Account Role</span>
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
                <Shield className="w-4 h-4" />
                <span className="font-semibold">{user.role}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Premium Tier</span>
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-neonBlue">
                <Star className="w-4 h-4 fill-neonBlue/10" />
                <span className="font-semibold">{user.tier}</span>
              </div>
            </div>

            {user.role === 'PARENT' && (
              <div className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Family Access Code</span>
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-amber-400 bg-amber-400/5 border border-amber-400/10 p-3 rounded-xl mt-1">
                  <Key className="w-4 h-4 shrink-0" />
                  <span className="font-mono font-bold uppercase select-all tracking-wider">{user.familyCode}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gamification Card (Child Only) */}
        {user.role === 'CHILD' && (
          <div className="glass-panel p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
                <Trophy className="w-5 h-5" />
                <h3 className="font-bold">Investor Score</h3>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-gray-400">Current Level</span>
                <p className="text-4xl font-bold text-emerald-400">Level {user.gamificationProfile?.level ?? 1}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm text-gray-400">Total Experience Points</span>
                <p className="text-lg font-semibold">{user.gamificationProfile?.xp ?? 0} XP</p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <span className="text-xs text-gray-500 block mb-2">Unlocked Badges</span>
              <div className="flex flex-wrap gap-2">
                {user.gamificationProfile?.badges && user.gamificationProfile.badges.length > 0 ? (
                  user.gamificationProfile.badges.map((badge, idx) => (
                    <span key={idx} className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-xs text-gray-400">
                      {badge}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500 italic">No badges earned yet. Complete quizzes and trade compliant stocks to unlock!</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
