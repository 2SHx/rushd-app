// src/app/[locale]/quiz/page.tsx
'use client';
import { useState } from 'react';
import { BookOpen, Trophy, ArrowRight, CheckCircle2, Star, Target, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import QuizModal from '@/components/QuizModal';

const QUIZ_TOPICS = [
  { topic: 'Stock Market Basics', topicAr: 'أساسيات سوق الأسهم', description: 'Learn how stocks are traded and the basics of shares.', descriptionAr: 'تعرف على كيفية تداول الأسهم والأساسيات المالية لحصص الشركات.', level: 1, type: 'basic' },
  { topic: 'Savings & Jars', topicAr: 'الادخار والحصالات', description: 'Understand Mudarabah savings split models and financial planning.', descriptionAr: 'افهم عقود المضاربة الشرعية لتوزيع الأرباح والتخطيط المالي.', level: 1, type: 'basic' },
  { topic: 'Compound Interest', topicAr: 'الفائدة المركبة', description: 'Analyze compound growth and differentiate it from Sharia-compliant models.', descriptionAr: 'حلل نمو الفائدة المركبة وفرق بينها وبين نماذج التمويل الإسلامي.', level: 1, type: 'basic' },
  { topic: 'Sharia Compliance', topicAr: 'التوافق الشرعي', description: 'Learn the sector and financial ratio criteria defined by AAOIFI.', descriptionAr: 'تعرف على معايير الأنشطة والنسب المالية التي حددتها معايير أيقوفي.', level: 2, type: 'intermediate' },
  { topic: 'Risk Management', topicAr: 'إدارة المخاطر', description: 'Discover portfolio diversification and risk reduction techniques.', descriptionAr: 'اكتشف تنويع المحفظة الاستثمارية وطرق تقليل المخاطر.', level: 2, type: 'intermediate' },
  { topic: 'Value Investing', topicAr: 'استثمار القيمة', description: 'Identify underpriced assets using financial ratios.', descriptionAr: 'حدد الأصول المقومة بأقل من قيمتها باستخدام النسب المالية.', level: 2, type: 'intermediate' },
  { topic: 'Halal Mutual Funds', topicAr: 'الصناديق الاستثمارية الحلال', description: 'Explore pooled funds tracking compliant instruments.', descriptionAr: 'استكشف الصناديق المشتركة التي تتبع أدوات استثمارية متوافقة.', level: 3, type: 'advanced' },
  { topic: 'TASI Markets', topicAr: 'سوق تاسي المالي', description: 'Master Saudi Tadawul specific calendars and numeric symbols.', descriptionAr: 'أتقن تقويمات السوق المالية السعودية (تداول) ورموز الأسهم.', level: 3, type: 'advanced' },
  { topic: 'NASDAQ Markets', topicAr: 'سوق ناسداك المالي', description: 'Analyze tech-heavy markets and USD exchange mechanics.', descriptionAr: 'حلل أسواق التقنية وآليات تحويل العملة وتداول الأسهم بالدولار.', level: 3, type: 'advanced' }
];

export default function QuizListPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const isAr = locale === 'ar';
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ passed: boolean; xp: number; level: number } | null>(null);

  const handleComplete = async (passed: boolean, topic: string) => {
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          score: passed ? 100 : 0,
          passed
        })
      });

      if (res.ok) {
        const data = await res.json();
        setLastResult({ passed, xp: data.xp, level: data.level });
      } else {
        setLastResult({ passed, xp: 0, level: 0 });
      }
    } catch (err) {
      console.error('Failed to submit quiz complete status:', err);
      setLastResult({ passed, xp: 0, level: 0 });
    }
  };

  const getTierBadge = (level: number) => {
    if (level === 1) {
      return {
        label: isAr ? 'مبتدئ' : 'Novice',
        classes: 'bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]',
        Icon: Compass
      };
    }
    if (level === 2) {
      return {
        label: isAr ? 'محترف' : 'Strategist',
        classes: 'bg-cyan-500/10 dark:bg-cyan-500/5 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]',
        Icon: Target
      };
    }
    return {
      label: isAr ? 'خبير' : 'Master',
      classes: 'bg-amber-500/10 dark:bg-amber-500/5 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]',
      Icon: Star
    };
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 text-slate-900 dark:text-white pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent tracking-tight">
          {isAr ? 'أكاديمية رشد التعليمية' : 'RUSHD Education Academy'}
        </h1>
        <p className="text-gray-400 mt-1.5 text-sm font-semibold">
          {isAr ? 'اختر موضوعاً لاختبار معرفتك الاستثمارية وكسب نقاط الخبرة.' : 'Earn XP and level up your financial intelligence by passing educational milestones.'}
        </p>
      </div>

      {lastResult && (
        <div className={`p-4 rounded-3xl border flex items-center justify-between shadow-lg ${
          lastResult.passed 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-extrabold text-sm">
                {lastResult.passed 
                  ? (isAr ? 'أحسنت! تم اجتياز الاختبار بنجاح (+50 XP)' : 'Congratulations! Quiz passed successfully (+50 XP)') 
                  : (isAr ? 'مراجعة قريبة! لم تجتز الاختبار، أعد المحاولة.' : 'Quiz completed but did not pass. Keep learning and try again!')}
              </p>
              {lastResult.passed && lastResult.xp > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {isAr 
                    ? `رصيد الخبرة الجديد: ${lastResult.xp} XP (مستوى ${lastResult.level})` 
                    : `Your learning record: ${lastResult.xp} XP (Level ${lastResult.level})`}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={() => setLastResult(null)} 
            className="text-xs font-black uppercase tracking-wider hover:underline"
          >
            {isAr ? 'تجاهل' : 'Dismiss'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {QUIZ_TOPICS.map((q, idx) => {
          const tier = getTierBadge(q.level);
          return (
            <div key={idx} className="glass-panel p-6 flex flex-col justify-between space-y-6 shadow-lg rounded-3xl relative overflow-hidden group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${tier.classes}`}>
                    <tier.Icon className="w-3 h-3" />
                    {tier.label}
                  </span>
                  <BookOpen className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg group-hover:text-emerald-400 transition-colors">
                    {isAr ? q.topicAr : q.topic}
                  </h3>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                    {isAr ? q.descriptionAr : q.description}
                  </p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedTopic(q.topic);
                  setIsModalOpen(true);
                  setLastResult(null);
                }}
                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse"
              >
                <span>{isAr ? 'ابدأ الاختبار' : 'Start Quiz'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180 text-emerald-400" />
              </motion.button>
            </div>
          );
        })}
      </div>

      <QuizModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        topic={selectedTopic} 
        locale={locale}
        onComplete={(passed: boolean) => handleComplete(passed, selectedTopic || '')} 
      />
    </div>
  );
}
