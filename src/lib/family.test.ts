// src/lib/family.test.ts
// Pure generator, no DB — the only thing worth asserting is the shape of its
// output (SYSTEM_DESIGN.md: 6 chars, A-Z2-9 unambiguous alphabet).
import { describe, it, expect } from 'vitest';
import { generateFamilyCode } from './family';

describe('generateFamilyCode', () => {
  it('produces a 6-character code drawn only from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateFamilyCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-Z2-9]+$/);
    }
  });

  it('never contains ambiguous glyphs (0, O, 1, I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateFamilyCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});
