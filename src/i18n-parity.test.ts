// src/i18n-parity.test.ts
// Cheapest i18n regression net: en.json and ar.json must expose the same key set.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeys(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe('messages/en.json <-> messages/ar.json key parity', () => {
  const en = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../messages/en.json'), 'utf-8')
  );
  const ar = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../messages/ar.json'), 'utf-8')
  );

  it('has an identical set of nested translation keys', () => {
    const enKeys = collectKeys(en).sort();
    const arKeys = collectKeys(ar).sort();

    const missingInAr = enKeys.filter((k) => !arKeys.includes(k));
    const missingInEn = arKeys.filter((k) => !enKeys.includes(k));

    expect(missingInAr, `keys missing in ar.json: ${missingInAr.join(', ')}`).toEqual([]);
    expect(missingInEn, `keys missing in en.json: ${missingInEn.join(', ')}`).toEqual([]);
  });
});
