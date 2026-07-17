'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ShieldCheck,
  TrendingUp,
  Award,
  Sparkles,
  Play,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Flame,
  UserCheck,
  Trophy,
  Activity,
  MessageSquareText,
} from 'lucide-react';

interface AgentPersonality {
  id: string;
  name: string;
  titleEn: string;
  titleAr: string;
  archetypeEn: string;
  archetypeAr: string;
  icon: any;
  color: string;
  discipline: number; // 0-100
  riskLevel: 'Low' | 'Medium' | 'High' | 'Zero';
  speed: 'Instant' | 'Ultra-Fast' | 'Fast' | 'Strategic';
  winRate: number;
  abilityEn: string;
  abilityAr: string;
  quoteEn: string;
  quoteAr: string;
}

interface MavericksSquadPanelProps {
  locale: string;
  onRunFinished?: (earnedXp: number) => void;
}

export default function MavericksSquadPanel({ locale, onRunFinished }: MavericksSquadPanelProps) {
  const t = useTranslations('Quant');
  const isAr = locale === 'ar';

  const agentPool: AgentPersonality[] = [
    {
      id: 'QUANT_CORE',
      name: 'Quant Core',
      titleEn: 'The Algo Arbitrageur',
      titleAr: 'خبير الخوارزميات الكمية',
      archetypeEn: 'Statistical Arbitrage',
      archetypeAr: 'التحكيم الإحصائي',
      icon: Cpu,
      color: 'from-blue-500 to-cyan-400',
      discipline: 98,
      riskLevel: 'Low',
      speed: 'Ultra-Fast',
      winRate: 84,
      abilityEn: 'Delta Mean-Reversion Engine',
      abilityAr: 'محرك العودة للوسط الإحصائي',
      quoteEn: 'Data removes emotion. Standard deviations dictate entry.',
      quoteAr: 'البيانات تلغي العاطفة. الانحراف المعياري يحدد لحظة الدخول.',
    },
    {
      id: 'TECHNICAL',
      name: 'Trend Surfer',
      titleEn: 'The Momentum Maverick',
      titleAr: 'فارس الزخم والاتجاهات',
      archetypeEn: 'Momentum Breakout',
      archetypeAr: 'اختراق الزخم',
      icon: TrendingUp,
      color: 'from-purple-500 to-pink-500',
      discipline: 78,
      riskLevel: 'High',
      speed: 'Instant',
      winRate: 72,
      abilityEn: 'VWAP Breakout Multiplier',
      abilityAr: 'مضاعف اختراق متوسط السعر بحجم التداول',
      quoteEn: 'Catch the wave early before retail volume arrives.',
      quoteAr: 'اقتنص الموجة مبكراً قبل تدفق سيولة أفراد التجزئة.',
    },
    {
      id: 'SHARIA',
      name: 'Halal Guardian',
      titleEn: 'The Sharia Gatekeeper',
      titleAr: 'حارس التوافق الشرعي',
      archetypeEn: 'AAOIFI Audit Veto',
      archetypeAr: 'الفيتو والرقابة الشرعية',
      icon: ShieldCheck,
      color: 'from-emerald-500 to-teal-400',
      discipline: 100,
      riskLevel: 'Zero',
      speed: 'Instant',
      winRate: 100,
      abilityEn: 'Imperial Sharia Veto & Purification',
      abilityAr: 'الفيتو الشرعي الصارم وحساب التطهير',
      quoteEn: 'Zero compromise on compliance. Clean earnings only.',
      quoteAr: 'لا تهاون في التوافق الشرعي. كسب حلال وطاهر فقط.',
    },
    {
      id: 'NEWS_CATALYST',
      name: 'Sentiment Radar',
      titleEn: 'The Hype Architect',
      titleAr: 'رادار الأخبار والمحفزات',
      archetypeEn: 'Catalyst & NLP Detector',
      archetypeAr: 'كاشف المحفزات وتحليل النصوص',
      icon: Flame,
      color: 'from-amber-500 to-orange-500',
      discipline: 72,
      riskLevel: 'High',
      speed: 'Instant',
      winRate: 68,
      abilityEn: 'Social Volume & Sentiment Surge',
      abilityAr: 'كاشف الزخم الإخباري والتفاعل الاجتماعي',
      quoteEn: 'Headlines move prices faster than quarterly reports.',
      quoteAr: 'العناوين العاجلة تحرك الأسعار أسرع من التقارير الربعية.',
    },
    {
      id: 'FUNDAMENTAL',
      name: 'Value Anchor',
      titleEn: 'The Fundamental Guru',
      titleAr: 'مرساة التقييم والبيانات',
      archetypeEn: 'DCF & Balance Sheet Anchor',
      archetypeAr: 'تقييم القوائم والتدفقات النقدية',
      icon: Sparkles,
      color: 'from-indigo-500 to-purple-400',
      discipline: 92,
      riskLevel: 'Medium',
      speed: 'Fast',
      winRate: 81,
      abilityEn: 'Margin of Safety Valuation',
      abilityAr: 'حساب هامش الأمان والقيمة العادلة',
      quoteEn: 'Price is what you pay. Value is what you get.',
      quoteAr: 'السعر هو ما تدفعه، أما القيمة فهي ما تحصل عليه.',
    },
    {
      id: 'PORTFOLIO_MANAGER',
      name: 'General Commander',
      titleEn: 'The Risk Commander',
      titleAr: 'قائد المخاطر وإدارة المحفظة',
      archetypeEn: 'Position Sizing & Circuit-Breaker',
      archetypeAr: 'توزيع الأحجام وقاطع الصدمات',
      icon: UserCheck,
      color: 'from-rose-500 to-red-500',
      discipline: 96,
      riskLevel: 'Medium',
      speed: 'Strategic',
      winRate: 89,
      abilityEn: 'Drawdown Circuit-Breaker & Allocation',
      abilityAr: 'قاطع الهبوط الحاد وتخصيص رأس المال',
      quoteEn: 'Capital preservation precedes return maximization.',
      quoteAr: 'حماية رأس المال أولاً قبل تعظيم العوائد.',
    },
    {
      id: 'RESEARCH',
      name: 'Academic Scholar',
      titleEn: 'The Literature Researcher',
      titleAr: 'باحث الدراسات والمنشورات',
      archetypeEn: 'Peer-Reviewed Factor RAG',
      archetypeAr: 'بحث الأدبيات الأكاديمية والإنتروبيا',
      icon: Award,
      color: 'from-teal-500 to-cyan-500',
      discipline: 95,
      riskLevel: 'Low',
      speed: 'Strategic',
      winRate: 86,
      abilityEn: 'OpenAlex Paper Evidence Synthesizer',
      abilityAr: 'تركيب أدلة الأبحاث الأكاديمية المفتوحة',
      quoteEn: 'Markets change, but empirical financial anomalies endure.',
      quoteAr: 'تتغير الأسواق، لكن الشذوذات المالية الموثقة أكاديمياً تدوم.',
    },
    {
      id: 'PATTERN_ANALOG',
      name: 'Shield Warden',
      titleEn: 'The Pattern Analogist',
      titleAr: 'محلل الأنماط التاريخية',
      archetypeEn: 'Historical Dynamic Warping',
      archetypeAr: 'مطابقة المتتاليات والأنماط',
      icon: Zap,
      color: 'from-violet-500 to-indigo-500',
      discipline: 88,
      riskLevel: 'Medium',
      speed: 'Ultra-Fast',
      winRate: 79,
      abilityEn: 'Multi-Asset Fractal Pattern Matcher',
      abilityAr: 'مطابق المتتاليات الكسرية عبر الأصول',
      quoteEn: 'History doesn’t repeat itself, but it often rhymes.',
      quoteAr: 'التاريخ لا يكرر نفسه بدقة، لكنه يعزف النغمة نفسها.',
    },
  ];

  const [activeSquad, setActiveSquad] = useState<string[]>([
    'QUANT_CORE',
    'TECHNICAL',
    'SHARIA',
    'NEWS_CATALYST',
    'PORTFOLIO_MANAGER',
  ]);

  const [isBattleRunning, setIsBattleRunning] = useState<boolean>(false);
  const [battleStep, setBattleStep] = useState<number>(0);
  const [battleLogs, setBattleLogs] = useState<{ agent: string; textEn: string; textAr: string; time: string }[]>([]);
  const [squadXp, setSquadXp] = useState<number>(1450);

  const toggleAgentInSquad = (id: string) => {
    if (activeSquad.includes(id)) {
      if (activeSquad.length <= 1) return; // Must have at least 1 agent
      setActiveSquad(activeSquad.filter((item) => item !== id));
    } else {
      setActiveSquad([...activeSquad, id]);
    }
  };

  const handleLaunchBattle = () => {
    if (isBattleRunning) return;
    setIsBattleRunning(true);
    setBattleStep(1);
    setBattleLogs([]);

    const selectedAgents = agentPool.filter((a) => activeSquad.includes(a.id));

    const simulatedSequence = [
      {
        agent: selectedAgents[0]?.name || 'Quant Core',
        textEn: '🔍 Scanning live market order book for NVDA & AAPL...',
        textAr: '🔍 جاري مسح دفتر الأوامر المباشر لأسهم NVDA و AAPL...',
        delay: 800,
      },
      {
        agent: selectedAgents.find((a) => a.id === 'TECHNICAL')?.name || 'Trend Surfer',
        textEn: '⚡ VWAP reclaim breakout detected on NVDA @ $128.40! RSI(14) = 64.2!',
        textAr: '⚡ تم كشف اختراق متوسط السعر (VWAP) لسهم NVDA عند $128.40! مؤشر RSI = 64.2!',
        delay: 1800,
      },
      {
        agent: selectedAgents.find((a) => a.id === 'SHARIA')?.name || 'Halal Guardian',
        textEn: '🛡️ Running AAOIFI Compliance Check: Interest Debt = 4.2% (<30%). Verdict: COMPLIANT!',
        textAr: '🛡️ فحص التوافق الشرعي مع معايير أيوفي: نسبة الديون الفائدة = 4.2% (أقل من 30%). النتيجة: متوافق!',
        delay: 2800,
      },
      {
        agent: selectedAgents.find((a) => a.id === 'FUNDAMENTAL')?.name || 'Value Anchor',
        textEn: '💎 DCF Fair Value calculated at $165.20 (+28.6% Implied Upside). High Margin of Safety!',
        textAr: '💎 القيمة العادلة للتدفقات النقدية = $165.20 (+28.6% ارتفاع متوقع). هامش أمان ممتاز!',
        delay: 3800,
      },
      {
        agent: selectedAgents.find((a) => a.id === 'PORTFOLIO_MANAGER')?.name || 'General Commander',
        textEn: '🚀 EXECUTION ORDER: Sizing position to 15% virtual cash ($15,000). Order Submitted!',
        textAr: '🚀 أمر التنفيذ: تخصيص 15% من السيولة الافتراضية ($15,000). تم إرسال الأمر بنجاح!',
        delay: 4800,
      },
    ];

    simulatedSequence.forEach((step, index) => {
      setTimeout(() => {
        setBattleLogs((prev) => [
          ...prev,
          {
            agent: step.agent,
            textEn: step.textEn,
            textAr: step.textAr,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
        ]);
        setBattleStep(index + 1);

        if (index === simulatedSequence.length - 1) {
          setIsBattleRunning(false);
          setSquadXp((prev) => prev + 150);
          if (onRunFinished) onRunFinished(150);
        }
      }, step.delay);
    });
  };

  return (
    <div className="space-y-6 text-start">
      {/* Top Header & Arena XP Card */}
      <div className="glass-panel rounded-3xl p-6 relative overflow-hidden bg-gradient-to-r from-purple-500/10 via-surface-card to-indigo-500/10 border border-purple-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Trophy className="w-5 h-5 text-amber-400 animate-bounce" />
              <h2 className="text-xl font-extrabold text-foreground">{t('mavericksTitle')}</h2>
            </div>
            <p className="text-xs text-foreground/60 leading-relaxed">{t('mavericksSubtitle')}</p>
          </div>

          <div className="flex items-center space-x-4 rtl:space-x-reverse self-start">
            <div className="px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-end">
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">{t('squadXp')}</span>
              <p className="text-lg font-black font-mono text-amber-400">{squadXp} XP</p>
            </div>

            <button
              onClick={handleLaunchBattle}
              disabled={isBattleRunning}
              className={`flex items-center space-x-2 rtl:space-x-reverse px-5 py-3 rounded-2xl font-extrabold text-sm text-white shadow-lg transition-all ${
                isBattleRunning
                  ? 'bg-purple-600/50 cursor-wait'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-[1.03] active:scale-[0.98]'
              }`}
            >
              {isBattleRunning ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              <span>{isBattleRunning ? t('battleInProgress') : t('launchBattle')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Battle Log Output */}
      <AnimatePresence>
        {battleLogs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-panel rounded-3xl p-5 space-y-3 bg-slate-950/60 text-white border border-purple-500/30"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Activity className="w-4 h-4 text-purple-400 animate-pulse" />
                <h4 className="text-xs font-bold">{t('battleLog')}</h4>
              </div>
              <span className="text-[10px] font-mono text-purple-400">{battleLogs.length}/5 Events</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
              {battleLogs.map((log, idx) => (
                <div key={idx} className="flex items-start space-x-2.5 rtl:space-x-reverse bg-white/[0.04] p-2.5 rounded-xl border border-white/5">
                  <span className="font-mono text-[10px] text-gray-400 whitespace-nowrap">{log.time}</span>
                  <span className="font-bold text-purple-300 font-mono">{log.agent}:</span>
                  <span className="text-gray-200">{isAr ? log.textAr : log.textEn}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glass-Box AI Agent Personality Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-foreground flex items-center space-x-2 rtl:space-x-reverse">
            <Cpu className="w-4 h-4 text-accent" />
            <span>{t('draftSquad')} ({activeSquad.length}/{agentPool.length} Active)</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentPool.map((agent) => {
            const Icon = agent.icon;
            const isDrafted = activeSquad.includes(agent.id);

            return (
              <div
                key={agent.id}
                onClick={() => toggleAgentInSquad(agent.id)}
                className={`group cursor-pointer rounded-3xl p-5 space-y-4 transition-all duration-300 border relative overflow-hidden ${
                  isDrafted
                    ? 'glass-panel border-accent/40 shadow-xl ring-1 ring-accent/30 bg-surface-card'
                    : 'bg-foreground/[0.02] border-foreground/[0.06] opacity-60 hover:opacity-100 hover:border-foreground/20'
                }`}
              >
                {/* Agent Card Header with Icon Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3.5 rtl:space-x-reverse">
                    <div className={`relative w-12 h-12 rounded-2xl border border-accent/40 shadow-md shrink-0 flex items-center justify-center bg-gradient-to-br ${agent.color}/10 group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="w-6 h-6 text-accent" />
                      <div className={`absolute bottom-0 inset-x-0 h-0.5 rounded-b-2xl bg-gradient-to-r ${agent.color}`} />
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                        <span>{agent.name}</span>
                        <Icon className="w-3.5 h-3.5 text-accent" />
                      </h4>
                      <p className="text-[11px] text-accent font-semibold">{isAr ? agent.titleAr : agent.titleEn}</p>
                      <span className="inline-block text-[9px] font-bold text-foreground/50 bg-foreground/5 px-2 py-0.5 rounded-md border border-foreground/10 uppercase tracking-wider">
                        {isAr ? agent.archetypeAr : agent.archetypeEn}
                      </span>
                    </div>
                  </div>

                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                    isDrafted ? 'bg-accent text-white border-accent shadow-sm' : 'border-foreground/20'
                  }`}>
                    {isDrafted && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                </div>

                {/* Quote Bubble */}
                <div className="p-2.5 rounded-xl bg-foreground/[0.03] dark:bg-white/[0.03] text-[11px] italic text-foreground/70 flex items-start space-x-2 rtl:space-x-reverse">
                  <MessageSquareText className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span>&quot;{isAr ? agent.quoteAr : agent.quoteEn}&quot;</span>
                </div>

                {/* Glass-Box Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="space-y-1 p-2 rounded-xl bg-foreground/[0.02] border border-foreground/[0.04]">
                    <div className="flex justify-between text-foreground/60">
                      <span>{t('discipline')}</span>
                      <span className="font-mono font-bold text-foreground">{agent.discipline}%</span>
                    </div>
                    <div className="h-1 bg-foreground/10 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${agent.discipline}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1 p-2 rounded-xl bg-foreground/[0.02] border border-foreground/[0.04]">
                    <div className="flex justify-between text-foreground/60">
                      <span>{t('executionSpeed')}</span>
                      <span className="font-mono font-bold text-purple-400">{agent.speed}</span>
                    </div>
                    <div className="flex items-center space-x-1 rtl:space-x-reverse text-[10px] font-bold text-amber-500">
                      <Zap className="w-3 h-3 fill-current" />
                      <span>{agent.winRate}% Win</span>
                    </div>
                  </div>
                </div>

                {/* Special Ability Badge */}
                <div className="pt-2 border-t border-[var(--border-color)] flex items-center justify-between text-[10px]">
                  <span className="text-foreground/50">{t('specialAbility')}:</span>
                  <span className="font-extrabold text-foreground bg-foreground/5 px-2 py-0.5 rounded-full border border-foreground/10">
                    {isAr ? agent.abilityAr : agent.abilityEn}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
