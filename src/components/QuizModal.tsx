'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function QuizModal({ isOpen, onClose, onComplete, topic }: any) {
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const url = topic ? `/api/quiz?topic=${encodeURIComponent(topic)}` : '/api/quiz';
      fetch(url)
        .then(res => res.json())
        .then(data => {
          setQuiz(data);
          setLoading(false);
          setSelected(null);
          setShowResult(false);
        });
    }
  }, [isOpen, topic]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg glass-panel p-6"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Generating Financial Quiz...</p>
          </div>
        ) : quiz ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">{quiz.topic}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            
            <p className="text-lg font-medium">{quiz.question}</p>

            <div className="space-y-3">
              {quiz.options.map((opt: string, i: number) => {
                const isSelected = selected === i;
                const isCorrect = i === quiz.correctOptionIndex;
                let bgClass = "bg-white/5 hover:bg-white/10";
                
                if (showResult) {
                  if (isCorrect) bgClass = "bg-emerald-500/20 border-emerald-500 text-emerald-400";
                  else if (isSelected && !isCorrect) bgClass = "bg-red-500/20 border-red-500 text-red-400";
                } else if (isSelected) {
                  bgClass = "bg-white/20 border-white/40";
                }

                return (
                  <button 
                    key={i}
                    onClick={() => !showResult && setSelected(i)}
                    className={`w-full text-left p-4 rounded-xl border border-transparent transition-all ${bgClass}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {showResult ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-300 bg-white/5 p-4 rounded-lg">{quiz.explanation}</p>
                <button 
                  onClick={() => {
                    onComplete(selected === quiz.correctOptionIndex, quiz.topic);
                    onClose();
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20"
                >
                  Continue
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowResult(true)}
                disabled={selected === null}
                className="w-full py-3 rounded-xl bg-emerald-500 disabled:opacity-50 font-bold text-white"
              >
                Submit Answer
              </button>
            )}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
