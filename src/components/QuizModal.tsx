// src/components/QuizModal.tsx
'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, HelpCircle, Trophy, Sparkles } from 'lucide-react';

export default function QuizModal({ isOpen, onClose, onComplete, topic, locale }: any) {
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const isAr = locale === 'ar';

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const url = topic 
        ? `/api/quiz?topic=${encodeURIComponent(topic)}&locale=${locale || 'en'}` 
        : `/api/quiz?locale=${locale || 'en'}`;
      fetch(url)
        .then(res => res.json())
        .then(data => {
          setQuiz(data);
          setLoading(false);
          setSelected(null);
          setShowResult(false);
        });
    }
  }, [isOpen, topic, locale]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-xl glass-panel p-6 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl relative text-start overflow-hidden bg-white/95 dark:bg-[#0A0E1A]/95 text-slate-900 dark:text-white"
      >
        {/* Glow circle details */}
        <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-gray-400 text-xs font-mono font-bold tracking-wider animate-pulse">
              {isAr ? 'جاري استدعاء الأسئلة من المعلم الذكي...' : 'GENERATING STRATEGIST INTELLIGENCE...'}
            </p>
          </div>
        ) : quiz ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider bg-gradient-to-r from-emerald-400 to-accent bg-clip-text text-transparent">
                  {isAr && quiz.topicAr ? quiz.topicAr : quiz.topic}
                </h2>
              </div>
              <button 
                onClick={onClose} 
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-gray-400 font-mono block">Question Quest</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-gray-150 leading-relaxed">
                {quiz.question}
              </p>
            </div>

            <div className="space-y-3">
              {quiz.options.map((opt: string, i: number) => {
                const isSelected = selected === i;
                const isCorrect = i === quiz.correctOptionIndex;
                let bgClass = "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10";
                
                if (showResult) {
                  if (isCorrect) {
                    bgClass = "bg-emerald-500/10 dark:bg-emerald-500/5 border-emerald-500/40 text-emerald-500 dark:text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.15)]";
                  } else if (isSelected && !isCorrect) {
                    bgClass = "bg-rose-500/10 dark:bg-rose-500/5 border-rose-500/40 text-rose-500 dark:text-rose-450 font-bold";
                  } else {
                    bgClass = "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-gray-500 dark:text-gray-600 opacity-60";
                  }
                } else if (isSelected) {
                  bgClass = "bg-emerald-500/10 dark:bg-emerald-500/5 border-emerald-400 text-emerald-600 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/20";
                }

                return (
                  <button 
                    key={i}
                    disabled={showResult}
                    onClick={() => setSelected(i)}
                    className={`w-full text-start p-4 rounded-2xl border transition-all text-xs font-semibold active:scale-98 ${bgClass}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {showResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5"
                >
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-1">Concept Explanation</span>
                    {quiz.explanation}
                  </div>
                  <button 
                    onClick={() => {
                      onComplete(selected === quiz.correctOptionIndex, quiz.topic);
                      onClose();
                    }}
                    className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-extrabold text-xs uppercase tracking-wider text-black shadow-lg shadow-emerald-500/25 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Trophy className="w-4 h-4 text-black" />
                    <span>{isAr ? 'متابعة المحفظة' : 'Continue Portfolio'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!showResult && (
              <button 
                onClick={() => setShowResult(true)}
                disabled={selected === null}
                className="w-full py-3 rounded-2xl bg-emerald-500 disabled:opacity-50 font-extrabold text-xs uppercase tracking-wider text-black transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 active:scale-95 disabled:pointer-events-none"
              >
                <HelpCircle className="w-4 h-4 text-black" />
                <span>{isAr ? 'إرسال الإجابة' : 'Submit Answer'}</span>
              </button>
            )}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
