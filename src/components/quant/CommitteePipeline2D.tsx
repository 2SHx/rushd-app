'use client';

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
            className="-translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center cursor-pointer"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: isActive ? 1.12 : 1, opacity: 1, zIndex: isActive ? 40 : 10 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
            onClick={() => { if (agentSignal) onSelectAgent?.(node.id); }}
          >
            {/* Outer orbital ring (NASA-style) */}
            {isActive && (
              <div
                className="absolute rounded-full border-2 animate-spin"
                style={{
                  width: '72px', height: '72px',
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
                width: isActive ? '56px' : '40px',
                height: isActive ? '56px' : '40px',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                background: pColor.glow,
                transition: 'all 0.4s ease',
              }}
            />

            {/* Planet card */}
            <div className={`relative w-[140px] p-3 rounded-2xl border flex flex-col gap-1.5 transition-all duration-300 ${
              isActive
                ? 'border-emerald-400/60 bg-[#06150f]/90 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
                : sStyle
                ? 'border-white/10 bg-[#08091a]/85'
                : 'border-white/[0.06] bg-[#06080f]/80'
            }`} style={{ backdropFilter: 'blur(12px)' }}>
              {/* Planet sphere + status */}
              <div className="flex items-center justify-between">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center border-2 shrink-0"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${pColor.ring}, ${pColor.core})`,
                    borderColor: isActive ? pColor.ring : 'rgba(255,255,255,0.1)',
                    boxShadow: isActive ? `0 0 14px ${pColor.glow}` : `0 0 6px ${pColor.glow}`,
                  }}
                >
                  {node.icon ? (
                    <node.icon className="w-4 h-4 text-white" />
                  ) : node.id === 'SHARIA' ? (
                    passData?.shariaGate.compliant
                      ? <ShieldCheck className="w-4 h-4 text-white" />
                      : <ShieldAlert className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {isActive && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: pColor.ring }} />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: pColor.ring }} />
                    </span>
                  )}
                  {!isActive && agentSignal && simStep !== 'ingestion' && (
                    <span className={`text-[7px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md border ${sStyle?.bg} ${sStyle?.color} ${sStyle?.border}`}>
                      {agentSignal.stance}
                    </span>
                  )}
                </div>
              </div>

              {/* Node name */}
              <span className="text-[10px] font-bold text-gray-100 truncate leading-tight">
                {isAr ? node.nameAr : node.name}
              </span>

              {/* Conviction bar */}
              {agentSignal && simStep !== 'ingestion' && (
                <div>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[8px] text-gray-500">Conv</span>
                    <span className="text-[8px] font-mono text-gray-400">{pct(Number(agentSignal.conviction))}</span>
                  </div>
                  <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: pct(Number(agentSignal.conviction)),
                        background: pColor.ring,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Sharia verdict */}
              {node.id === 'SHARIA' && simStep !== 'ingestion' && simStep !== 'analysts' && passData && (
                <span className={`text-[8px] font-black uppercase ${
                  passData.shariaGate.compliant ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {passData.shariaGate.compliant ? '✓ HALAL CLEARED' : '✗ SHARIA VETO'}
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
