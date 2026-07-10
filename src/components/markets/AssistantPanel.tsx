'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Sparkles, Loader2, Trophy, HelpCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

interface AssistantPanelProps {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  currentPrice: number;
  locale: string;
}

export default function AssistantPanel({ symbol, market, currentPrice, locale }: AssistantPanelProps) {
  const t = useTranslations('Markets');
  void locale;
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.replace('.SR', ''), market, currentPrice })
      });
      if (!res.ok) {
        throw new Error('Analysis request failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('AI Analyst error:', err);
      setError(t('searchError'));
    } finally {
      setLoading(false);
    }
  };

  const cleanSymbol = symbol.replace('.SR', '');

  return (
    <div className="glass-panel rounded-3xl p-5 space-y-4 text-start">
      {/* Mentor Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">{t('mentorAdvisor')}</h3>
            <p className="text-[10px] text-foreground/50">{t('aiAdvisorDesc')}</p>
          </div>
        </div>

        {!loading && !result && (
          <button
            onClick={triggerAnalysis}
            className="flex items-center space-x-1.5 rtl:space-x-reverse bg-accent hover:opacity-90 transition-opacity text-white text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('consultMentor')}</span>
          </button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-6 text-foreground/50 space-y-2">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
          <span className="text-xs">{t('loading')}</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-down bg-down/5 border border-down/10 p-3 rounded-2xl">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 mt-2">
          {/* Action & Shield Row */}
          <div className="flex justify-between items-center bg-foreground/[0.03] p-3 rounded-2xl border border-[var(--border-color)]">
            <div className="flex flex-col">
              <span className="text-[10px] text-foreground/50 uppercase">{t('questAction')}</span>
              <span className={`text-base font-extrabold font-sans mt-0.5 ${
                result.action === 'BUY' ? 'text-up' :
                result.action === 'SELL' ? 'text-down' : 'text-foreground/50'
              }`}>
                {result.action}
              </span>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse bg-foreground/5 px-3 py-1.5 rounded-xl border border-[var(--border-color)]">
              {result.complianceTag === 'HALAL' || result.complianceTag === 'EDUCATIONAL_ONLY' ? (
                <ShieldCheck className="w-4 h-4 text-up" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-noncompliant" />
              )}
              <span className={`text-xs font-bold ${
                result.complianceTag === 'HALAL' || result.complianceTag === 'EDUCATIONAL_ONLY'
                  ? 'text-up'
                  : 'text-noncompliant'
              }`}>
                {result.complianceTag}
              </span>
            </div>
          </div>

          {/* Mentor Rationale Card */}
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-1 w-2 h-2 rounded-full bg-accent shrink-0" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-foreground/50 uppercase">{t('mentorGuidanceAr')}</span>
                <p className="text-xs text-foreground/70 leading-relaxed font-sans">{result.reasoningArabic}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="mt-1 w-2 h-2 rounded-full bg-accent shrink-0" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-foreground/50 uppercase">{t('mentorGuidanceEn')}</span>
                <p className="text-xs text-foreground/70 leading-relaxed font-sans">{result.reasoningEnglish}</p>
              </div>
            </div>
          </div>

          {/* Educational Concept */}
          {result.educationalConcept && (
            <div className="bg-accent/5 border border-accent/10 p-3.5 rounded-2xl space-y-1">
              <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-accent text-xs font-bold">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{t('questWisdom')}</span>
              </div>
              <p className="text-[11px] text-foreground/60 leading-relaxed font-sans">{result.educationalConcept}</p>
            </div>
          )}

          {/* Gamified Reward */}
          {result.xpReward && (
            <div className="flex items-center justify-between bg-noncompliant/5 border border-noncompliant/10 p-3 rounded-2xl">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Trophy className="w-4 h-4 text-noncompliant" />
                <span className="text-xs font-bold text-noncompliant">{t('questComplete')}</span>
              </div>
              <span className="text-xs font-extrabold text-noncompliant font-mono tabular-nums">+{result.xpReward} XP</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
