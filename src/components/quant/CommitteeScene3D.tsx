'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import SceneCanvas from '@/components/three/SceneCanvas';
import type { PassResult, SimStep, Stance } from './CommitteeClient';

// Module-level scratch objects reused across frames/instances — never
// allocated inside useFrame (DR-13).
const _scaleTarget = new THREE.Vector3();

const ANALYST_IDS = [
  'QUANT_CORE',
  'TECHNICAL',
  'PATTERN_ANALOG',
  'NEWS_CATALYST',
  'FUNDAMENTAL',
  'RESEARCH',
  'SHARIA',
] as const;

const RADIUS = 4.4;
const NEUTRAL = '#8a8a93';
const ACCENT = '#5B5BD6';
const UP = '#10b981';
const DOWN = '#e11d48';
const AMBER = '#d97706';

function stanceHex(stance: Stance | undefined): string {
  if (stance === 'BULLISH') return UP;
  if (stance === 'BEARISH') return DOWN;
  return NEUTRAL;
}

interface AnalystNodeProps {
  position: [number, number, number];
  colorHex: string;
  active: boolean;
  conviction: number;
  isGate: boolean;
  gateCompliant: boolean;
}

function AnalystNode({ position, colorHex, active, conviction, isGate, gateCompliant }: AnalystNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const currentColor = useRef(new THREE.Color(colorHex));
  const targetColor = useMemo(() => new THREE.Color(isGate && !gateCompliant ? AMBER : colorHex), [colorHex, isGate, gateCompliant]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;
    const t = Math.min(1, delta * 3);
    const targetScale = active ? 1 + conviction * 0.3 : 1;
    _scaleTarget.set(targetScale, targetScale, targetScale);
    mesh.scale.lerp(_scaleTarget, t);
    currentColor.current.lerp(targetColor, Math.min(1, delta * 2.2));
    material.color.copy(currentColor.current);
    material.emissive.copy(currentColor.current);
    const targetEmissive = active ? 0.3 + conviction * 0.35 : 0.1;
    material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, targetEmissive, t);
  });

  return (
    <mesh ref={meshRef} position={position}>
      {isGate ? <octahedronGeometry args={[0.5, 0]} /> : <sphereGeometry args={[0.46, 24, 24]} />}
      <meshStandardMaterial ref={materialRef} roughness={0.45} metalness={0.15} color={colorHex} emissive={colorHex} emissiveIntensity={0.1} />
    </mesh>
  );
}

interface LinkLineProps {
  from: [number, number, number];
  to: [number, number, number];
  colorHex: string;
  active: boolean;
}

function LinkLine({ from, to, colorHex, active }: LinkLineProps) {
  const currentColor = useRef(new THREE.Color(active ? colorHex : '#3f3f46'));
  const targetColor = useMemo(() => new THREE.Color(active ? colorHex : '#3f3f46'), [active, colorHex]);

  // THREE.Line built imperatively and mounted via <primitive> — the JSX
  // intrinsic `line` collides with the DOM SVG <line> type, so r3f's
  // three.js element can't be used directly here.
  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3));
    const material = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.25 });
    return new THREE.Line(geometry, material);
  }, [from, to, colorHex]);

  // <primitive> does not auto-dispose imperatively-created objects — do it
  // explicitly whenever the object is replaced or the component unmounts.
  useEffect(() => {
    return () => {
      lineObject.geometry.dispose();
      (lineObject.material as THREE.LineBasicMaterial).dispose();
    };
  }, [lineObject]);

  useFrame((_, delta) => {
    const material = lineObject.material as THREE.LineBasicMaterial;
    currentColor.current.lerp(targetColor, Math.min(1, delta * 2.5));
    material.color.copy(currentColor.current);
    material.opacity = THREE.MathUtils.lerp(material.opacity, active ? 0.9 : 0.25, Math.min(1, delta * 3));
  });

  return <primitive object={lineObject} />;
}

interface CommitteeGroupProps {
  simStep: SimStep;
  activeAgentId: string | null;
  passData: PassResult | null;
}

function CommitteeGroup({ simStep, activeAgentId, passData }: CommitteeGroupProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.04;
  });

  const analystPositions = useMemo<Record<string, [number, number, number]>>(() => {
    const positions: Record<string, [number, number, number]> = {};
    ANALYST_IDS.forEach((id, i) => {
      const angle = (i / ANALYST_IDS.length) * Math.PI * 2;
      positions[id] = [Math.cos(angle) * RADIUS, Math.sin(angle) * 0.4, Math.sin(angle) * RADIUS];
    });
    return positions;
  }, []);

  const gateCompliant = passData?.shariaGate.compliant ?? true;
  const debateActive = simStep === 'debate';
  const ingestionActive = simStep === 'ingestion';
  const convergenceActive = simStep === 'pm' || simStep === 'risk' || simStep === 'done';

  return (
    <group ref={groupRef}>
      {/* Portfolio Manager — central node */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.68, 28, 28]} />
        <meshStandardMaterial
          color={ACCENT}
          emissive={ACCENT}
          emissiveIntensity={convergenceActive ? 0.45 : 0.18}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      {ANALYST_IDS.map((id) => {
        const signal = passData?.signals.find((s) => s.agent === id);
        const conviction = signal ? Math.max(0, Math.min(1, Number(signal.conviction) || 0.5)) : 0.3;
        const isGate = id === 'SHARIA';
        const active =
          (simStep === 'analysts' && activeAgentId === id) ||
          (isGate && simStep === 'sharia');
        const colorHex = signal ? stanceHex(signal.stance as Stance) : NEUTRAL;

        return (
          <group key={id}>
            <AnalystNode
              position={analystPositions[id]}
              colorHex={colorHex}
              active={active}
              conviction={conviction}
              isGate={isGate}
              gateCompliant={gateCompliant}
            />
            <LinkLine
              from={analystPositions[id]}
              to={[0, 0, 0]}
              colorHex={isGate ? (gateCompliant ? UP : AMBER) : debateActive ? (colorHex === DOWN ? DOWN : UP) : ACCENT}
              active={ingestionActive || active || debateActive || convergenceActive}
            />
          </group>
        );
      })}
    </group>
  );
}

export interface CommitteeScene3DProps {
  simStep: SimStep;
  activeAgentId: string | null;
  passData: PassResult | null;
  debateTurnIdx: number;
  reducedMotion: boolean;
}

/**
 * State-driven r3f committee scene. Stance drives node tint (legible label
 * lives in the DOM cards beside the canvas, never in-canvas only); conviction
 * drives emissive intensity/scale; simStep drives which links pulse. Slow
 * institutional drift only — no bounce, no bloom, no particles.
 */
export default function CommitteeScene3D({ simStep, activeAgentId, passData, reducedMotion }: CommitteeScene3DProps) {
  return (
    <SceneCanvas className="relative h-[560px] w-full overflow-hidden bg-[#010408]" reducedMotion={reducedMotion}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} />
      <directionalLight position={[-5, -3, -4]} intensity={0.25} />
      <CommitteeGroup simStep={simStep} activeAgentId={activeAgentId} passData={passData} />
    </SceneCanvas>
  );
}
