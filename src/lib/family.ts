// src/lib/family.ts
// Pure generator for parent-facing family codes. Uniqueness (retry-on-P2002
// collision) is the caller's concern (see src/app/api/register/route.ts) —
// this module has no DB dependency.
import { randomInt } from 'crypto';

// Excludes ambiguous glyphs: 0/O, 1/I/L.
const FAMILY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FAMILY_CODE_LENGTH = 6;

export function generateFamilyCode(): string {
  let code = '';
  for (let i = 0; i < FAMILY_CODE_LENGTH; i++) {
    code += FAMILY_CODE_ALPHABET[randomInt(FAMILY_CODE_ALPHABET.length)];
  }
  return code;
}
