'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';

interface SceneCanvasProps {
  children: ReactNode;
  /** When true, render a single static frame — no RAF loop (DR-13). */
  reducedMotion?: boolean;
  className?: string;
  cameraPosition?: [number, number, number];
  fov?: number;
}

/**
 * Shared 3D canvas boundary (DR-13 perf budget):
 * - RAF paused when the tab is hidden or the canvas scrolls off-screen.
 * - prefers-reduced-motion renders a static frame via frameloop="demand"
 *   (only re-renders when the committee state prop changes, never on a loop).
 * - transparent background so the near-monochrome page theme (light/dark)
 *   shows through — no scene.background set.
 * This wrapper is intentionally reusable so the landing hero (later dispatch)
 * can mount its own scene through the same gated boundary.
 */
export default function SceneCanvas({
  children,
  reducedMotion = false,
  className,
  cameraPosition = [0, 1.2, 11],
  fov = 42,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabVisible, setTabVisible] = useState(true);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const handleVisibility = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const frameloop = reducedMotion ? 'demand' : tabVisible && inView ? 'always' : 'never';

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        dpr={[1, 2]}
        frameloop={frameloop}
        camera={{ position: cameraPosition, fov }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        {children}
      </Canvas>
    </div>
  );
}
