import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./StockDetail.tsx', import.meta.url), 'utf8');
const containerSource = readFileSync(new URL('./MarketsContainer.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
const ar = JSON.parse(readFileSync(new URL('../../../messages/ar.json', import.meta.url), 'utf8'));

const sectionIds = [
  'sharia',
  'price',
  'key-financials',
  'charts',
  'statements',
  'valuation',
  'committee',
  'compare',
  'ai',
  'snapshot',
  'earnings',
  'filings',
  'thesis',
];

describe('M13 stock workspace shell', () => {
  it('replaces tabs with the binding S1-S13 anchor order', () => {
    expect(source).not.toContain('type Tab');
    expect(source).not.toContain('role="tablist"');

    const positions = sectionIds.map((id) => source.indexOf(`id: '${id}'`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('supports scroll-spy, keyboard navigation, and the metered pre-spend state', () => {
    expect(source).toContain('IntersectionObserver');
    expect(source).toContain('aria-current');
    expect(source).toContain('handleAnchorKeyDown');
    expect(source).toContain("workspaceAccess?.state === 'metered'");
    expect(source).toContain("t('workspace.meterCost', { limit: 5 })");
    expect(containerSource.match(/<StockDetail/g)).toHaveLength(1);
  });

  it('keeps every new shell label bilingual', () => {
    expect(Object.keys(en.Markets.workspace)).toEqual(Object.keys(ar.Markets.workspace));
    expect(Object.keys(en.Markets.workspace.sections)).toEqual(Object.keys(ar.Markets.workspace.sections));
    expect(Object.keys(en.Markets.workspace.chips)).toEqual(Object.keys(ar.Markets.workspace.chips));
  });
});
