'use client';

import { useEffect, useState } from 'react';
import { detectPrefersReducedMotion, detectWebglSupport } from '@/lib/webgl';

/**
 * Plain-DOM feature detection for gating 3D scenes (DR-13). Does not import
 * three/@react-three/fiber, so routes that only call this hook do not pull
 * the 3D bundle — the caller still needs a next/dynamic(ssr:false) boundary
 * around the actual scene component.
 */
export function useSceneAvailability() {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setWebglSupported(detectWebglSupport());
    setReducedMotion(detectPrefersReducedMotion());

    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handle = () => setReducedMotion(mql.matches);
    mql.addEventListener?.('change', handle);
    return () => mql.removeEventListener?.('change', handle);
  }, []);

  return { webglSupported, reducedMotion };
}
