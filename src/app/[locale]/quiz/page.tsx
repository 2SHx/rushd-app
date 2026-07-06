// src/app/[locale]/quiz/page.tsx
'use client';
import { useState } from 'react';
import { BookOpen, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import QuizModal from '@/components/QuizModal';

const QUIZ_TOPICS = [
  { topic: 'Stock Market Basics', topicAr: 'أساسيات سوق الأسهم', description: 'Learn how stocks are traded and the basics of shares.', descriptionAr: 'تعرف على كيفية تداول الأسهم والأساسيات المالية لحصص الشركات.', level: 1 },
  { topic: 'Savings & Jars', topicAr: 'الادخار والحصالات', description: 'Understand Mudarabah savings split models and financial planning.', descriptionAr: 'افهم عقود المضاربة الشرعية لتوزيع الأرباح والتخطيط المالي.', level: 1 },
  { topic: 'Compound Interest', topicAr: 'الفائدة المركبة', description: 'Analyze compound growth and differentiate it from Sharia-compliant models.', descriptionAr: 'حلل نمو الفائدة المركبة وفرق بينها وبين نماذج التمويل الإسلامي.', level: 1 },
  { topic: 'Sharia Compliance', topicAr: 'التوافق الشرعي', description: 'Learn the sector and financial ratio criteria defined by AAOIFI.', descriptionAr: 'تعرف على معايير الأنشطة والنسب المالية التي حددتها معايير أيقوفي.', level: 2 },
  { topic: 'Risk Management', topicAr: 'إدارة المخاطر', description: 'Discover portfolio diversification and risk reduction techniques.', descriptionAr: 'اكتشف تنويع المحفظة الاستثمارية وطرق تقليل المخاطر.', level: 2 },
  { topic: 'Value Investing', topicAr: 'استثمار القيمة', description: 'Identify underpriced assets using financial ratios.', descriptionAr: 'حدد الأصول المقومة بأقل من قيمتها باستخدام النسب المالية.', level: 2 },
  { topic: 'Halal Mutual Funds', topicAr: 'الصناديق الاستثمارية الحلال', description: 'Explore pooled funds tracking compliant instruments.', descriptionAr: 'استكشف الصناديق المشتركة التي تتبع أدوات استثمارية متوافقة.', level: 3 },
  { topic: 'TASI Markets', topicAr: 'سوق تاسي المالي', description: 'Master Saudi Tadawul specific calendars and numeric symbols.', descriptionAr: 'أتقن تقويمات السوق المالية السعودية (تداول) ورموز الأسهم.', level: 3 },
  { topic: 'NASDAQ Markets', topicAr: 'سوق ناسداك المالي', description: 'Analyze tech-heavy markets and USD exchange mechanics.', descriptionAr: 'حلل أسواق التقنية وآليات تحويل العملة وتداول الأسهم بالدولار.', level: 3 }
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

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          {isAr ? 'الاختبارات المالية' : 'Financial Quizzes'}
        </h1>
        <p className="text-gray-400 mt-1">
          {isAr ? 'اختر موضوعاً لاختبار معرفتك وكسب نقاط الخبرة.' : 'Select a topic to test your knowledge and earn XP.'}
        </p>
      </div>

      {lastResult && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          lastResult.passed 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">
                {lastResult.passed 
                  ? (isAr ? 'تم اجتياز الاختبار بنجاح! (+50 XP)' : 'Quiz Passed! (+50 XP)') 
                  : (isAr ? 'اكتمل الاختبار ولكنك لم تجتزه. حاول مرة أخرى!' : 'Quiz Completed but did not pass. Try again!')}
              </p>
              {lastResult.passed && lastResult.xp > 0 && (
                <p className="text-xs text-gray-400">
                  {isAr 
                    ? `الرصيد الجديد: ${lastResult.xp} XP (مستوى ${lastResult.level})` 
                    : `New Balance: ${lastResult.xp} XP (Level ${lastResult.level})`}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={() => setLastResult(null)} 
            className="text-sm font-semibold hover:underline"
          >
            {isAr ? 'تجاهل' : 'Dismiss'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {QUIZ_TOPICS.map((q, idx) => (
          <div key={idx} className="glass-panel p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {isAr ? `مستوى ${q.level}` : `Level ${q.level} Topic`}
                </span>
                <BookOpen className="w-5 h-5 text-gray-500" />
              </div>
              <h3 className="font-bold text-lg">{isAr ? q.topicAr : q.topic}</h3>
              <p className="text-sm text-gray-400">{isAr ? q.descriptionAr : q.description}</p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setSelectedTopic(q.topic);
                setIsModalOpen(true);
                setLastResult(null);
              }}
              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse"
            >
              <span>{isAr ? 'ابدأ الاختبار' : 'Start Quiz'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </motion.button>
          </div>
        ))}
      </div>

      <QuizModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        topic={selectedTopic} 
        onComplete={(passed: boolean) => handleComplete(passed, selectedTopic || '')} 
      />
    </div>
  );
}
