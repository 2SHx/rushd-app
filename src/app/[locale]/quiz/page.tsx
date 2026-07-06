// src/app/[locale]/quiz/page.tsx
'use client';
import { useState } from 'react';
import { BookOpen, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import QuizModal from '@/components/QuizModal';

const QUIZ_TOPICS = [
  { topic: 'Stock Market Basics', description: 'Learn how stocks are traded and the basics of shares.', level: 1 },
  { topic: 'Savings & Jars', description: 'Understand Mudarabah savings split models and financial planning.', level: 1 },
  { topic: 'Compound Interest', description: 'Analyze compound growth and differentiate it from Sharia-compliant models.', level: 1 },
  { topic: 'Sharia Compliance', description: 'Learn the sector and financial ratio criteria defined by AAOIFI.', level: 2 },
  { topic: 'Risk Management', description: 'Discover portfolio diversification and risk reduction techniques.', level: 2 },
  { topic: 'Value Investing', description: 'Identify underpriced assets using financial ratios.', level: 2 },
  { topic: 'Halal Mutual Funds', description: 'Explore pooled funds tracking compliant instruments.', level: 3 },
  { topic: 'TASI Markets', description: 'Master Saudi Tadawul specific calendars and numeric symbols.', level: 3 },
  { topic: 'NASDAQ Markets', description: 'Analyze tech-heavy markets and USD exchange mechanics.', level: 3 }
];

export default function QuizListPage() {
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
          Financial Quizzes
        </h1>
        <p className="text-gray-400 mt-1">Select a topic to test your knowledge and earn XP.</p>
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
                {lastResult.passed ? 'Quiz Passed! (+50 XP)' : 'Quiz Completed but did not pass. Try again!'}
              </p>
              {lastResult.passed && lastResult.xp > 0 && (
                <p className="text-xs text-gray-400">
                  New Balance: {lastResult.xp} XP (Level {lastResult.level})
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={() => setLastResult(null)} 
            className="text-sm font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {QUIZ_TOPICS.map((q, idx) => (
          <div key={idx} className="glass-panel p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Level {q.level} Topic
                </span>
                <BookOpen className="w-5 h-5 text-gray-500" />
              </div>
              <h3 className="font-bold text-lg">{q.topic}</h3>
              <p className="text-sm text-gray-400">{q.description}</p>
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
              <span>Start Quiz</span>
              <ArrowRight className="w-4 h-4" />
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
