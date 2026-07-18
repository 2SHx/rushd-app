'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Gauge,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import type { StrategyLearningSetupId } from '@/quant/learning/strategyLearningSetupIds';

type RiskChoice = 'lower' | 'balanced' | 'higher';
type Scene = 'risk' | 'match' | 'answer' | 'compare';

const RISK_OPTIONS = [
  { key: 'lower', setupId: 'ts-momentum-halal-basket-v3', Icon: ShieldCheck },
  { key: 'balanced', setupId: 'bollinger-mr-long-v2', Icon: Scale },
  { key: 'higher', setupId: 'stocks-in-play-orb', Icon: Gauge },
] as const satisfies readonly { key: RiskChoice; setupId: StrategyLearningSetupId; Icon: LucideIcon }[];

const PROCESS_STEPS = ['risk', 'match', 'answer', 'compare'] as const;
const COMPARISON_SERIES = ['learner', 'strategy', 'spus', 'spy'] as const;
const SCENE_BOUNDARIES = {
  introExit: 0.22,
  matchExit: 0.45,
  finalEnter: 0.66,
} as const;

function CinematicWorld({ progress }: { progress: MotionValue<number> }) {
  const farScale = useTransform(progress, [0, 1], [1, 1.08]);
  const farY = useTransform(progress, [0, 1], [12, -10]);
  const midScale = useTransform(progress, [0, 0.66, 1], [0.94, 1.04, 1.08]);
  const midY = useTransform(progress, [0, 1], [26, -24]);
  const dialScale = useTransform(progress, [0, 0.45, 0.72, 1], [0.84, 1.04, 0.72, 0.62]);
  const dialRotate = useTransform(progress, [0, 1], [-5, 7]);
  const dialY = useTransform(progress, [0, 0.22, 0.45, 1], [150, 110, 0, -10]);
  const dialOpacity = useTransform(progress, [0, 0.14, 0.22, 0.28], [1, 1, 0.7, 0]);
  const nearTopY = useTransform(progress, [0, 0.45, 1], [0, -54, -88]);
  const nearBottomY = useTransform(progress, [0, 0.45, 1], [0, 58, 92]);
  const worldOpacity = useTransform(progress, [0, 0.72, 1], [1, 0.82, 0.48]);

  return (
    <motion.div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden" style={{ opacity: worldOpacity }}>
      <div
        className="absolute inset-0 bg-background"
        style={{
          backgroundImage: 'linear-gradient(rgba(var(--accent-color-rgb),0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--accent-color-rgb),0.045) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute inset-0 bg-foreground/[0.015]" />

      <motion.div
        data-depth="0.2"
        className="absolute inset-[9%] rounded-full border border-foreground/[0.07]"
        style={{ scale: farScale, y: farY }}
      >
        <div className="absolute inset-[12%] rounded-full border border-accent/10" />
      </motion.div>

      <motion.div
        data-depth="0.5"
        className="absolute inset-[19%] rounded-full border border-foreground/10 bg-surface-card/40 shadow-[0_2px_5px_rgba(0,0,0,0.04),0_28px_80px_rgba(0,0,0,0.06)] backdrop-blur-[2px]"
        style={{ scale: midScale, y: midY }}
      >
        <span className="absolute start-[7%] top-1/2 size-2 rounded-full bg-accent/60" />
        <span className="absolute end-[7%] top-1/2 size-2 rounded-full bg-accent/35" />
        <span className="absolute start-1/2 top-[7%] size-2 -translate-x-1/2 rounded-full bg-foreground/25 rtl:translate-x-1/2" />
      </motion.div>

      <motion.div
        data-depth="0.7"
        className="absolute inset-0 m-auto grid size-32 place-items-center rounded-full bg-foreground text-background shadow-[0_3px_8px_rgba(0,0,0,0.16),0_34px_90px_rgba(0,0,0,0.18)] sm:size-40"
        style={{ opacity: dialOpacity, scale: dialScale, rotate: dialRotate, y: dialY }}
      >
        <div className="absolute inset-3 rounded-full border border-background/20" />
        <SlidersHorizontal className="size-8 sm:size-10" />
      </motion.div>

      <motion.div
        data-depth="0.9"
        className="absolute inset-x-[8%] top-0 h-[14%] rounded-b-[2.5rem] bg-surface-card/88 shadow-[0_20px_60px_rgba(0,0,0,0.06)] backdrop-blur-md"
        style={{ y: nearTopY }}
      />
      <motion.div
        data-depth="0.9"
        className="absolute inset-x-[8%] bottom-0 h-[14%] rounded-t-[2.5rem] bg-surface-card/88 shadow-[0_-20px_60px_rgba(0,0,0,0.06)] backdrop-blur-md"
        style={{ y: nearBottomY }}
      />
    </motion.div>
  );
}

function RiskSelectionPanel({
  compact = false,
  idPrefix,
  interactive,
  locale,
  onRailMove,
  railIndex,
  railRef,
  selected,
  selectedRisk,
  setSelectedRisk,
}: {
  compact?: boolean;
  idPrefix: string;
  interactive: boolean;
  locale: string;
  onRailMove: (delta: number) => void;
  railIndex: number;
  railRef: React.RefObject<HTMLDivElement>;
  selected: (typeof RISK_OPTIONS)[number] | null;
  selectedRisk: RiskChoice | null;
  setSelectedRisk: (risk: RiskChoice) => void;
}) {
  const t = useTranslations('Academy.labEntry');
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div className={compact ? 'w-full' : 'mt-7'}>
      <fieldset disabled={!interactive} aria-describedby={`${idPrefix}-strategy-risk-help`}>
        <div className="flex items-end justify-between gap-4">
          <div className="text-start">
            <legend className={`${compact ? 'text-sm sm:text-base' : 'text-base'} font-bold leading-relaxed text-foreground`}>{t('riskQuestion')}</legend>
            <p id={`${idPrefix}-strategy-risk-help`} className="mt-1 text-xs leading-relaxed text-foreground/55">{t('riskHelp')}</p>
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <button
              type="button"
              disabled={!interactive || railIndex === 0}
              onClick={() => onRailMove(-1)}
              className="grid size-10 place-items-center rounded-xl bg-foreground/[0.045] text-foreground/65 transition-colors duration-150 hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
              aria-label={t('previousStrategy')}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <output className="min-w-14 text-center font-mono text-[10px] tabular-nums text-foreground/45" aria-live="polite" dir="ltr">
              0{railIndex + 1} / 03
            </output>
            <button
              type="button"
              disabled={!interactive || railIndex === RISK_OPTIONS.length - 1}
              onClick={() => onRailMove(1)}
              className="grid size-10 place-items-center rounded-xl bg-foreground/[0.045] text-foreground/65 transition-colors duration-150 hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
              aria-label={t('nextStrategy')}
            >
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div ref={railRef} className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
          {RISK_OPTIONS.map(({ key, Icon }, index) => {
            const isSelected = selectedRisk === key;
            return (
              <button
                key={key}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                aria-pressed={isSelected}
                aria-describedby={`${idPrefix}-strategy-risk-${key}`}
                onClick={() => setSelectedRisk(key)}
                className={`min-h-32 min-w-[82%] snap-center rounded-2xl p-4 text-start transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99] motion-reduce:transform-none sm:min-w-0 ${isSelected ? 'bg-accent/10 shadow-[inset_0_0_0_2px_var(--accent-color)]' : 'bg-foreground/[0.035] hover:bg-foreground/[0.06]'}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={`grid size-8 place-items-center rounded-xl ${isSelected ? 'bg-accent text-white' : 'bg-background text-foreground/55'}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                      <Check className="size-3" aria-hidden="true" />
                      {t('selected')}
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 block text-sm font-bold text-foreground">{t(`riskOptions.${key}.title`)}</span>
                <span id={`${idPrefix}-strategy-risk-${key}`} className="mt-1 block text-xs leading-relaxed text-foreground/60">{t(`riskOptions.${key}.body`)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={`${compact ? 'mt-3' : 'mt-5'} bg-foreground/[0.018]`} aria-live="polite">
        {selected ? (
          <div data-testid={`${idPrefix}-academy-strategy-match`} className="rounded-2xl bg-background/75 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl text-start">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('matchEyebrow')}</p>
                  <span className="rounded-full bg-foreground/[0.055] px-2.5 py-1 text-[10px] font-semibold text-foreground/60">{t(`riskOptions.${selected.key}.title`)}</span>
                </div>
                <h3 className="mt-2 text-lg font-extrabold leading-relaxed text-foreground sm:text-xl">{t(`strategies.${selected.key}.title`)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-foreground/65 sm:text-sm">{t(`strategies.${selected.key}.body`)}</p>
                <p className={`${compact ? 'mt-1.5 text-[11px]' : 'mt-2 text-xs'} leading-relaxed text-foreground/55`}>{t(`strategies.${selected.key}.reason`)}</p>
              </div>
              {interactive ? (
                <Link
                  href={`/${locale}/academy/apply?setupId=${encodeURIComponent(selected.setupId)}`}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-white transition-[transform,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:-translate-y-0.5"
                >
                  {t('cta')}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              ) : null}
            </div>

            <div className={`${compact ? 'mt-3 pt-2' : 'mt-4 pt-3'} border-t border-foreground/[0.08]`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50 rtl:tracking-normal">{t('comparisonLabel')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {COMPARISON_SERIES.map((series) => (
                  <span key={series} dir={series === 'spus' || series === 'spy' ? 'ltr' : undefined} className="rounded-full bg-foreground/[0.055] px-3 py-1.5 text-[11px] font-semibold text-foreground/65">
                    {t(`series.${series}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-foreground/[0.035] p-3 text-start sm:p-4">
            <p className="text-sm font-bold text-foreground">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t('emptyBody')}</p>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-foreground/50">{t('disclosure')}</p>
      </div>
    </div>
  );
}

export default function StrategyPracticeEntry({ locale }: { locale: string }) {
  const t = useTranslations('Academy.labEntry');
  const sectionRef = useRef<HTMLDivElement>(null);
  const staticRailRef = useRef<HTMLDivElement>(null);
  const cinematicRailRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [selectedRisk, setSelectedRiskState] = useState<RiskChoice | null>(null);
  const [activeScene, setActiveScene] = useState<Scene>('risk');
  const [railIndex, setRailIndex] = useState(0);
  const selected = RISK_OPTIONS.find((option) => option.key === selectedRisk) ?? null;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 135, damping: 28, mass: 0.22 });

  const introOpacity = useTransform(smoothProgress, [0, 0.04, 0.14, 0.22], [1, 1, 1, 0]);
  const introY = useTransform(smoothProgress, [0, 0.22], [0, -28]);
  const matchOpacity = useTransform(smoothProgress, [0.18, 0.27, 0.36, 0.45], [0, 1, 1, 0]);
  const matchY = useTransform(smoothProgress, [0.18, 0.27, 0.45], [24, 0, -18]);
  const processOpacity = useTransform(smoothProgress, [0.42, 0.5, 0.6, 0.68], [0, 1, 1, 0]);
  const processY = useTransform(smoothProgress, [0.42, 0.5, 0.68], [24, 0, -18]);
  const finalOpacity = useTransform(smoothProgress, [0.66, 0.76, 1], [0, 1, 1]);
  const finalY = useTransform(smoothProgress, [0.66, 0.76], [28, 0]);

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const nextScene: Scene = value >= SCENE_BOUNDARIES.finalEnter
      ? 'compare'
      : value >= SCENE_BOUNDARIES.matchExit
        ? 'answer'
        : value >= SCENE_BOUNDARIES.introExit
          ? 'match'
          : 'risk';
    setActiveScene((current) => current === nextScene ? current : nextScene);
  });

  function selectRisk(risk: RiskChoice) {
    setSelectedRiskState(risk);
    setRailIndex(RISK_OPTIONS.findIndex((option) => option.key === risk));
  }

  function moveRail(delta: number, rail: React.RefObject<HTMLDivElement>) {
    const nextIndex = Math.min(RISK_OPTIONS.length - 1, Math.max(0, railIndex + delta));
    setRailIndex(nextIndex);
    const target = rail.current?.querySelectorAll('button[aria-pressed]')[nextIndex];
    target?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }

  return (
    <section data-testid="academy-strategy-entry" aria-label={t('title')} className="mt-10">
      <div className="hidden rounded-3xl bg-surface-card p-5 shadow-[0_2px_5px_rgba(0,0,0,0.05),0_24px_70px_rgba(0,0,0,0.07)] motion-reduce:block sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.025em] text-foreground rtl:tracking-normal sm:text-3xl">{t('title')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65">{t('body')}</p>
        <ol className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-foreground/[0.08] sm:grid-cols-4" aria-label={t('processLabel')}>
          {PROCESS_STEPS.map((step, index) => (
            <li key={step} className="bg-background/80 p-3 text-start sm:p-4">
              <span className="font-mono text-[10px] font-bold tabular-nums text-accent" dir="ltr">0{index + 1}</span>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground/70">{t(`steps.${step}`)}</p>
            </li>
          ))}
        </ol>
        <RiskSelectionPanel
          idPrefix="static"
          interactive
          locale={locale}
          onRailMove={(delta) => moveRail(delta, staticRailRef)}
          railIndex={railIndex}
          railRef={staticRailRef}
          selected={selected}
          selectedRisk={selectedRisk}
          setSelectedRisk={selectRisk}
        />
      </div>

      <div ref={sectionRef} data-testid="academy-cinematic-timeline" className="relative h-[240svh] motion-reduce:hidden sm:h-[300svh]">
        <div className="sticky top-8 h-[calc(100svh-6rem)] min-h-[620px] max-h-[820px] overflow-hidden rounded-[2rem] bg-surface-card shadow-[0_3px_8px_rgba(0,0,0,0.08),0_36px_100px_rgba(0,0,0,0.12)] [isolation:isolate]">
          <CinematicWorld progress={smoothProgress} />

          <motion.div
            aria-hidden={activeScene !== 'risk'}
            className="absolute inset-0 z-20 grid place-items-center px-6 pb-24 pt-16 sm:px-12"
            style={{ opacity: introOpacity, y: introY }}
          >
            <div className="max-w-2xl text-start">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-0.035em] text-foreground rtl:tracking-normal sm:text-5xl">{t('cinematic.risk.title')}</h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/65 sm:text-base">{t('cinematic.risk.body')}</p>
              <div className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-foreground/50">
                <ChevronDown className="size-4" aria-hidden="true" />
                {t('scrollLabel')}
              </div>
            </div>
          </motion.div>

          <motion.div
            aria-hidden={activeScene !== 'match'}
            className="absolute inset-0 z-20 grid place-items-center px-6 pb-24 pt-16 sm:px-12"
            style={{ opacity: matchOpacity, y: matchY }}
          >
            <div className="max-w-xl rounded-3xl bg-surface-card/88 p-6 text-start shadow-[0_2px_5px_rgba(0,0,0,0.06),0_26px_80px_rgba(0,0,0,0.1)] backdrop-blur-md sm:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('cinematic.match.eyebrow')}</p>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">{t('cinematic.match.title')}</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">{t('cinematic.match.body')}</p>
            </div>
          </motion.div>

          <motion.div
            aria-hidden={activeScene !== 'answer'}
            className="absolute inset-0 z-20 grid place-items-center px-6 pb-24 pt-16 sm:px-12"
            style={{ opacity: processOpacity, y: processY }}
          >
            <div className="max-w-2xl text-start">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('cinematic.answer.eyebrow')}</p>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight text-foreground sm:text-4xl">{t('cinematic.answer.title')}</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/65">{t('cinematic.answer.body')}</p>
              <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label={t('cinematic.answer.processLabel')}>
                {(['answer', 'seal', 'compare'] as const).map((step, index) => (
                  <li key={step} className="rounded-2xl bg-surface-card/82 p-4 shadow-[0_2px_5px_rgba(0,0,0,0.05),0_18px_50px_rgba(0,0,0,0.07)] backdrop-blur-md">
                    <span className="font-mono text-[10px] font-bold text-accent" dir="ltr">0{index + 1}</span>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground/70">{t(`cinematic.answer.steps.${step}`)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>

          <motion.div
            data-testid="academy-cinematic-final"
            aria-hidden={activeScene !== 'compare'}
            className="absolute inset-0 z-20 flex items-start overflow-y-auto px-4 pb-20 pt-8 sm:items-center sm:px-8"
            style={{ opacity: finalOpacity, y: finalY }}
          >
            <RiskSelectionPanel
              compact
              idPrefix="cinematic"
              interactive={activeScene === 'compare'}
              locale={locale}
              onRailMove={(delta) => moveRail(delta, cinematicRailRef)}
              railIndex={railIndex}
              railRef={cinematicRailRef}
              selected={selected}
              selectedRisk={selectedRisk}
              setSelectedRisk={selectRisk}
            />
          </motion.div>

          <ol className="absolute inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-full bg-surface-card/88 px-3 py-2 shadow-[0_2px_5px_rgba(0,0,0,0.05),0_16px_50px_rgba(0,0,0,0.08)] backdrop-blur-md" aria-label={t('processLabel')}>
            {PROCESS_STEPS.map((scene) => (
              <li key={scene} aria-current={activeScene === scene ? 'step' : undefined} className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${activeScene === scene ? 'bg-accent' : 'bg-foreground/20'}`} aria-hidden="true" />
                <span className={activeScene === scene ? 'text-[10px] font-bold text-foreground' : 'sr-only'}>{t(`steps.${scene}`)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
