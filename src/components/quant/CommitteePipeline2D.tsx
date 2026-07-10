'use client';
import Image from 'next/image';

import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ShieldCheck, ShieldAlert, Gavel, Database } from 'lucide-react';
import type { PassResult, SimStep, Stance } from './CommitteeClient';
import { stanceStyle, pct } from './CommitteeClient';

interface CommitteeNode {
  id: string;
  name: string;
  nameAr: string;
  x: string;
  y: string;
  type: 'data' | 'analyst' | 'gate' | 'debate' | 'pm' | 'risk';
  icon?: typeof Database;
}

const NODES: CommitteeNode[] = [
  { id: 'ingest', name: 'Data Feed', nameAr: 'تغذية البيانات', x: '12%', y: '50%', type: 'data', icon: Database },
  { id: 'QUANT_CORE', name: 'Quant Core', nameAr: 'المؤشر الكمي', x: '31%', y: '16%', type: 'analyst' },
  { id: 'TECHNICAL', name: 'Technical', nameAr: 'التحليل الفني', x: '31%', y: '39%', type: 'analyst' },
  { id: 'PATTERN_ANALOG', name: 'Pattern Analog', nameAr: 'تحليل الأنماط', x: '31%', y: '61%', type: 'analyst' },
  { id: 'NEWS_CATALYST', name: 'News Catalyst', nameAr: 'الأخبار والمحفزات', x: '31%', y: '84%', type: 'analyst' },
  { id: 'FUNDAMENTAL', name: 'Fundamental', nameAr: 'التحليل المالي', x: '50%', y: '20%', type: 'analyst' },
  { id: 'RESEARCH', name: 'Research', nameAr: 'البحوث والمنشورات', x: '50%', y: '45%', type: 'analyst' },
  { id: 'SHARIA', name: 'Sharia Filter', nameAr: 'التوافق الشرعي', x: '50%', y: '75%', type: 'gate' },
  { id: 'debate', name: 'Debate Circle', nameAr: 'حلقة النقاش', x: '69%', y: '30%', type: 'debate', icon: Gavel },
  { id: 'PORTFOLIO_MANAGER', name: 'Portfolio Manager', nameAr: 'مدير المحفظة', x: '69%', y: '75%', type: 'pm', icon: Bot },
  { id: 'risk', name: 'Risk Envelope', nameAr: 'ضوابط المخاطر', x: '88%', y: '50%', type: 'risk', icon: Gavel },
];

const AVATARS: Record<string, string> = {
  ingest: '/avatars/quant_core.png',
  QUANT_CORE: '/avatars/quant_core.png',
  TECHNICAL: '/avatars/technical.png',
  PATTERN_ANALOG: '/avatars/technical.png',
  NEWS_CATALYST: '/avatars/quant_core.png',
  FUNDAMENTAL: '/avatars/pm.png',
  RESEARCH: '/avatars/quant_core.png',
  SHARIA: '/avatars/sharia.png',
  debate: '/avatars/pm.png',
  PORTFOLIO_MANAGER: '/avatars/pm.png',
  risk: '/avatars/sharia.png',
};

export interface CommitteePipeline2DProps {
  simStep: SimStep;
  activeAgentId: string | null;
  passData: PassResult | null;
  debateTurnIdx: number;
  isAr: boolean;
  onSelectAgent?: (id: string) => void;
}

/**
 * 2D SVG committee pipeline. Also serves as the DR-13 fallback (no-WebGL / loading)
 * for CommitteeScene3D — visual is unchanged from the original board.
 */
export default function CommitteePipeline2D({
  simStep,
  activeAgentId,
  passData,
  debateTurnIdx,
  isAr,
  onSelectAgent,
}: CommitteePipeline2DProps) {
  return (
    <div
      className="relative h-[560px] w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 30% 60%, rgba(99,102,241,0.08) 0%, transparent 45%), radial-gradient(ellipse at 75% 25%, rgba(16,185,129,0.07) 0%, transparent 40%), radial-gradient(ellipse at 50% 80%, rgba(139,92,246,0.05) 0%, transparent 50%), #010408',
      }}
    >
      {/* ─ Star field ─ */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {[...Array(80)].map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 5 === 0 ? '2px' : '1px',
              height: i % 5 === 0 ? '2px' : '1px',
              left: `${(i * 1.28 + 3) % 100}%`,
              top: `${(i * 2.17 + 7) % 100}%`,
              background: i % 7 === 0 ? 'rgba(99,102,241,0.8)' : i % 11 === 0 ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.5)',
              animation: `pulse ${1.5 + (i % 4) * 0.7}s ease-in-out ${(i * 0.13) % 2}s infinite alternate`,
            }}
          />
        ))}
      </div>
      {/* Nebula clouds */}
      <div className="absolute top-[15%] left-[40%] w-32 h-32 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[20%] right-[25%] w-24 h-24 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      {/* ── Orbital connection paths ─ */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes laser-flow {
            from {
              stroke-dashoffset: 40;
            }
            to {
              stroke-dashoffset: 0;
            }
          }
          .laser-path-flow {
            stroke-dasharray: 6 12;
            animation: laser-flow 2.5s linear infinite;
          }
          .laser-path-flow-active {
            stroke-dasharray: 8 8;
            animation: laser-flow 1s linear infinite;
          }
        `}} />
        <defs>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-cyan">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="flow-gradient-h" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0" />
            <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ingest → Analysts & Gate */}
        {NODES.filter((n) => n.type === 'analyst' || n.type === 'gate').map((node) => {
          const active = simStep === 'ingestion';
          return (
            <g key={`group-ingest-${node.id}`}>
              {/* Background Wireframe (always visible) */}
              <line
                x1="12%" y1="50%" x2={node.x} y2={node.y}
                stroke={active ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.3)'}
                strokeWidth={1.8}
              />
              {/* Flow Overlay */}
              <line
                x1="12%" y1="50%" x2={node.x} y2={node.y}
                stroke={active ? '#10B981' : 'rgba(99,102,241,0.45)'}
                strokeWidth={active ? 3.5 : 1.8}
                filter={active ? 'url(#glow-green)' : undefined}
                className={active ? 'laser-path-flow-active' : 'laser-path-flow'}
              />
            </g>
          );
        })}

        {/* Analysts/Gate → Debate/PM */}
        {NODES.filter((n) => n.type === 'analyst' || n.type === 'gate').map((node) => {
          const toX = '69%';
          const toY = node.id === 'SHARIA' ? '75%' : '30%';
          const active = node.id === 'SHARIA'
            ? (simStep === 'sharia' || simStep === 'pm' || simStep === 'risk' || simStep === 'done')
            : (simStep === 'analysts' || simStep === 'debate');
          
          const agentSignal = passData?.signals.find((s) => s.agent === node.id);
          const activeColor = node.id === 'SHARIA'
            ? (passData?.shariaGate.compliant ?? true ? '#10B981' : '#EF4444')
            : agentSignal?.stance === 'BULLISH'
            ? '#10B981'
            : agentSignal?.stance === 'BEARISH'
            ? '#EF4444'
            : '#00F0FF';

          const glowFilter = activeColor === '#10B981'
            ? 'url(#glow-green)'
            : activeColor === '#EF4444'
            ? 'url(#glow-red)'
            : 'url(#glow-cyan)';

          return (
            <g key={`group-debate-${node.id}`}>
              {/* Background Wireframe (always visible) */}
              <line
                x1={node.x} y1={node.y} x2={toX} y2={toY}
                stroke={active ? `${activeColor}44` : 'rgba(99,102,241,0.25)'}
                strokeWidth={1.5}
              />
              {/* Flow Overlay */}
              <line
                x1={node.x} y1={node.y} x2={toX} y2={toY}
                stroke={active ? activeColor : 'rgba(99,102,241,0.4)'}
                strokeWidth={active ? 3.2 : 1.5}
                filter={active ? glowFilter : undefined}
                className={active ? 'laser-path-flow-active' : 'laser-path-flow'}
              />
            </g>
          );
        })}

        {/* Debate → PM */}
        {(() => {
          const active = simStep === 'debate' || simStep === 'pm' || simStep === 'risk' || simStep === 'done';
          return (
            <g>
              {/* Background Wireframe */}
              <line
                x1="69%" y1="30%" x2="69%" y2="75%"
                stroke={active ? 'rgba(0,240,255,0.35)' : 'rgba(99,102,241,0.3)'}
                strokeWidth={2}
              />
              {/* Flow Overlay */}
              <line
                x1="69%" y1="30%" x2="69%" y2="75%"
                stroke={active ? '#00F0FF' : 'rgba(99,102,241,0.45)'}
                strokeWidth={active ? 3.5 : 2}
                filter={active ? 'url(#glow-cyan)' : undefined}
                className={active ? 'laser-path-flow-active' : 'laser-path-flow'}
              />
            </g>
          );
        })()}

        {/* PM → Risk */}
        {(() => {
          const active = simStep === 'pm' || simStep === 'risk' || simStep === 'done';
          return (
            <g>
              {/* Background Wireframe */}
              <line
                x1="69%" y1="75%" x2="88%" y2="50%"
                stroke={active ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.3)'}
                strokeWidth={2}
              />
              {/* Flow Overlay */}
              <line
                x1="69%" y1="75%" x2="88%" y2="50%"
                stroke={active ? '#10B981' : 'rgba(99,102,241,0.45)'}
                strokeWidth={active ? 3.5 : 2}
                filter={active ? 'url(#glow-green)' : undefined}
                className={active ? 'laser-path-flow-active' : 'laser-path-flow'}
              />
            </g>
          );
        })()}
      </svg>

      {/* ─ Agent Nodes as Planetary Spheres ─ */}
      {NODES.map((node) => {
        const isAnalystActive = simStep === 'analysts' && activeAgentId === node.id;
        const isShariaActive = simStep === 'sharia' && node.id === 'SHARIA';
        const isDebating = simStep === 'debate' && node.id === 'debate';
        const isPM = simStep === 'pm' && node.id === 'PORTFOLIO_MANAGER';
        const isRisk = simStep === 'risk' && node.id === 'risk';
        const agentSignal = passData?.signals.find((s) => s.agent === node.id);
        const sStyle = agentSignal ? stanceStyle(agentSignal.stance as Stance) : null;
        const isActive = isAnalystActive || isShariaActive || isDebating || isPM || isRisk;

        const planetColors = {
          data: { core: '#3b82f6', glow: 'rgba(59,130,246,0.4)', ring: '#60a5fa' },
          analyst: { core: '#6366f1', glow: 'rgba(99,102,241,0.35)', ring: '#818cf8' },
          gate: { core: '#f59e0b', glow: 'rgba(245,158,11,0.35)', ring: '#fbbf24' },
          debate: { core: '#8b5cf6', glow: 'rgba(139,92,246,0.35)', ring: '#a78bfa' },
          pm: { core: '#10b981', glow: 'rgba(16,185,129,0.4)', ring: '#34d399' },
          risk: { core: '#ef4444', glow: 'rgba(239,68,68,0.35)', ring: '#f87171' },
        };
        const pColor = isActive
          ? { core: '#10b981', glow: 'rgba(16,185,129,0.6)', ring: '#6ee7b7' }
          : sStyle && agentSignal
            ? (agentSignal.stance === 'BULLISH'
              ? { core: '#10b981', glow: 'rgba(16,185,129,0.4)', ring: '#34d399' }
              : agentSignal.stance === 'BEARISH'
              ? { core: '#ef4444', glow: 'rgba(239,68,68,0.35)', ring: '#f87171' }
              : planetColors[node.type as keyof typeof planetColors] ?? planetColors.analyst)
          : planetColors[node.type as keyof typeof planetColors] ?? planetColors.analyst;

        return (
          <motion.div
            key={node.id}
            style={{ left: node.x, top: node.y, position: 'absolute' }}
            className="-translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center cursor-pointer group"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: isActive ? 1.08 : 1, opacity: 1, zIndex: isActive ? 40 : 10 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
            onClick={() => { if (agentSignal) onSelectAgent?.(node.id); }}
          >
            {/* Outer orbital ring (NASA-style) */}
            {isActive && (
              <div
                className="absolute rounded-full border-2 animate-spin"
                style={{
                  width: '84px', height: '84px',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  borderColor: pColor.ring,
                  borderTopColor: 'transparent',
                  borderLeftColor: 'transparent',
                  opacity: 0.8,
                  animationDuration: '3s',
                }}
              />
            )}
            {/* Halo glow */}
            <div
              className="absolute rounded-full blur-md pointer-events-none"
              style={{
                width: isActive ? '68px' : '52px',
                height: isActive ? '68px' : '52px',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                background: pColor.glow,
                transition: 'all 0.4s ease',
              }}
            />

            {/* Compact circular avatar container */}
            <div
              className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all duration-300 shadow-md ${
                isActive
                  ? 'border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.3)] scale-105'
                  : sStyle && agentSignal
                  ? agentSignal.stance === 'BULLISH'
                    ? 'border-emerald-500/60'
                    : agentSignal.stance === 'BEARISH'
                    ? 'border-rose-500/60'
                    : 'border-white/20'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <Image
                src={AVATARS[node.id] || '/avatars/quant_core.png'}
                alt=""
                fill
                sizes="64px"
                className="object-cover rounded-full pointer-events-none"
              />
              
              {/* Overlay Badge at Bottom Right */}
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border flex items-center justify-center text-white ${
                isActive 
                  ? 'bg-emerald-500 border-emerald-400 shadow-sm'
                  : sStyle && agentSignal?.stance === 'BULLISH'
                  ? 'bg-emerald-600 border-emerald-500'
                  : sStyle && agentSignal?.stance === 'BEARISH'
                  ? 'bg-rose-600 border-rose-500'
                  : 'bg-[#0f111a] border-white/10'
              }`}>
                {node.icon ? (
                  <node.icon className="w-2.5 h-2.5" />
                ) : node.id === 'SHARIA' ? (
                  passData?.shariaGate.compliant ?? true ? (
                    <ShieldCheck className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <ShieldAlert className="w-2.5 h-2.5 text-white" />
                  )
                ) : (
                  <Bot className="w-2.5 h-2.5" />
                )}
              </div>
            </div>

            {/* Label below the circle */}
            <span className="text-[10px] font-extrabold text-gray-300 mt-1.5 whitespace-nowrap text-center drop-shadow-md transition-colors group-hover:text-white">
              {isAr ? node.nameAr : node.name}
            </span>

            {/* Hover Tooltip Card */}
            <div className="absolute top-[105%] left-1/2 -translate-x-1/2 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 w-[150px] p-2.5 rounded-xl border border-white/10 bg-[#080c14]/95 backdrop-blur-md shadow-2xl flex flex-col gap-1 text-start">
              <span className="text-[10px] font-bold text-gray-100">
                {isAr ? node.nameAr : node.name}
              </span>
              {agentSignal && simStep !== 'ingestion' && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between items-center text-[8px]">
                    <span className="text-gray-500">Conviction</span>
                    <span className="font-mono text-gray-400">{pct(Number(agentSignal.conviction))}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: pct(Number(agentSignal.conviction)),
                        background: pColor.ring,
                      }}
                    />
                  </div>
                  <span className={`text-[8px] font-bold uppercase mt-1 px-1.5 py-0.5 rounded-md border text-center ${sStyle?.bg} ${sStyle?.color} ${sStyle?.border}`}>
                    {agentSignal.stance}
                  </span>
                </div>
              )}
              {node.id === 'SHARIA' && simStep !== 'ingestion' && passData && (
                <span className={`text-[8px] font-black uppercase text-center mt-1 ${
                  passData.shariaGate.compliant ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {passData.shariaGate.compliant ? '✓ HALAL' : '✗ HARAM'}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* ── Debate Speech Bubble ── */}
      <AnimatePresence>
        {simStep === 'debate' && passData?.debateTranscript?.[debateTurnIdx] && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ left: '78%', top: '6%' }}
            className="absolute -translate-x-1/2 z-40 w-72 bg-[#080c14]/95 border border-indigo-500/20 p-4 rounded-2xl shadow-2xl shadow-indigo-500/10 pointer-events-auto"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${
                passData.debateTranscript[debateTurnIdx].side === 'BULL' ? 'bg-emerald-400' : 'bg-rose-400'
              }`} />
              <span className="text-[9px] font-extrabold uppercase text-gray-400 tracking-wider">
                {passData.debateTranscript[debateTurnIdx].side} — Round {passData.debateTranscript[debateTurnIdx].round}
              </span>
            </div>
            <p className="text-xs text-white leading-relaxed font-semibold" dir="rtl">
              {passData.debateTranscript[debateTurnIdx].argumentAr}
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed mt-1.5" dir="ltr">
              {passData.debateTranscript[debateTurnIdx].argumentEn}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ingestion pulse */}
      {simStep === 'ingestion' && (
        <div className="absolute left-[15%] top-1/2 -translate-y-1/2 w-5 h-5 bg-emerald-400 rounded-full blur-sm animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
