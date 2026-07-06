// src/components/ParentDashboardClient.tsx
'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { User, Users, Plus, Award, Wallet, Briefcase, Key } from 'lucide-react';
import { TICKERS } from './MarketsClient';

interface ParentDashboardClientProps {
  parentName: string;
  familyCode: string;
  childrenList: any[];
  locale?: string;
}

export default function ParentDashboardClient({ parentName, familyCode, childrenList, locale }: ParentDashboardClientProps) {
  const isAr = locale === 'ar';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
            {isAr ? 'لوحة تحكم ولي الأمر' : 'Parent Dashboard'}
          </h1>
          <p className="text-gray-400 mt-1">
            {isAr ? `مرحباً بك مجدداً، ${parentName}` : `Welcome back, ${parentName}`}
          </p>
        </div>

        <Link href={`/${locale}/family/new-child`}>
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center space-x-2 rtl:space-x-reverse glass-panel px-6 py-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span className="font-semibold">{isAr ? 'إضافة حساب ابن' : 'Add Child Account'}</span>
          </motion.div>
        </Link>
      </div>

      {/* Family Code Banner */}
      <div className="glass-panel p-6 border-neonBlue/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-neonBlue/10 blur-3xl rounded-full" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-4 rtl:space-x-reverse">
            <div className="w-12 h-12 rounded-xl bg-neonBlue/20 flex items-center justify-center text-neonBlue shrink-0">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">
                {isAr ? 'رمز دعوة العائلة الخاص بك' : 'Your Family Invitation Code'}
              </h3>
              <p className="text-sm text-gray-400">
                {isAr 
                  ? 'شارك هذا الرمز مع أبنائك ليتمكنوا من تسجيل الدخول إلى حساباتهم.' 
                  : 'Share this code with your children to let them log into their accounts.'}
              </p>
            </div>
          </div>
          <div className="bg-black/50 border border-white/10 px-6 py-3 rounded-2xl text-center">
            <span className="font-mono text-2xl font-bold text-emerald-400 tracking-wider uppercase select-all">
              {familyCode}
            </span>
          </div>
        </div>
      </div>

      {/* Children List */}
      <div>
        <h2 className="text-xl font-bold mb-6 flex items-center space-x-2 rtl:space-x-reverse">
          <Users className="w-5 h-5 text-emerald-400" />
          <span>
            {isAr 
              ? `الحسابات الخاضعة للرقابة (${childrenList.length})` 
              : `Supervised Child Accounts (${childrenList.length})`}
          </span>
        </h2>

        {childrenList.length === 0 ? (
          <div className="glass-panel p-12 text-center text-gray-400 space-y-4">
            <p>{isAr ? 'لم يتم إنشاء أي حسابات أبناء بعد.' : 'No child accounts created yet.'}</p>
            <Link href={`/${locale}/family/new-child`} className="text-emerald-400 font-semibold hover:underline">
              {isAr ? 'أضف حساب الابن الأول للبدء ←' : 'Add your first child account to get started →'}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {childrenList.map((child) => {
              const profile = child.gamificationProfile;
              const jar = child.savingsJar;
              const holdings = child.portfolioItems || [];

              return (
                <div key={child.id} className="glass-panel p-6 space-y-6">
                  {/* Child header */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{child.name}</h3>
                        <p className="text-xs text-gray-400">@{child.username}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-400">
                      {isAr ? `الفئة: ${child.tier}` : `Tier: ${child.tier}`}
                    </span>
                  </div>

                  <hr className="border-white/10" />

                  {/* Child Gamification and Savings Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400">
                        <Award className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {isAr ? `المستوى ${profile?.level ?? 1}` : `Level ${profile?.level ?? 1}`}
                        </span>
                      </div>
                      <p className="text-2xl font-bold">{profile?.xp ?? 0} <span className="text-xs text-gray-400 font-normal">XP</span></p>
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse text-neonBlue">
                        <Wallet className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {isAr ? 'حصالة الادخار' : 'Savings Jar'}
                        </span>
                      </div>
                      <p className="text-2xl font-bold">
                        {Number(jar?.balance ?? 0).toFixed(2)} <span className="text-xs text-gray-400 font-normal">{jar?.currency ?? 'SAR'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Portfolio Holdings */}
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse text-gray-400">
                      <Briefcase className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {isAr ? 'الاستثمارات المحاكاة' : 'Simulated Holdings'}
                      </span>
                    </div>

                    {holdings.length === 0 ? (
                      <p className="text-sm text-gray-500">{isAr ? 'لا توجد أصول مملوكة.' : 'No assets owned.'}</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {holdings.map((item: any) => {
                          const listTickers = [...TICKERS.TASI, ...TICKERS.NASDAQ];
                          const activeTicker = listTickers.find(t => t.symbol === item.symbol);
                          const displayName = activeTicker ? (isAr ? activeTicker.arName : activeTicker.name) : item.symbol;
                          
                          return (
                            <div key={item.id} className="flex justify-between items-center text-sm">
                              <span className="font-semibold text-gray-300">{displayName}</span>
                              <span className="text-gray-400">
                                {Number(item.shares).toFixed(2)} {isAr ? 'حصة' : `share${Number(item.shares) !== 1 ? 's' : ''}`} ({item.market})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
