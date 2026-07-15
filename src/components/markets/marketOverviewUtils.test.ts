import { describe, expect, it } from 'vitest';
import { heatStyle, heatText } from './marketOverviewUtils';

describe('market theme heat scale', () => {
  it('keeps a zero move neutral', () => {
    expect(heatStyle(0)).toEqual({
      backgroundColor: 'var(--surface-card)',
      backgroundImage: 'none',
      borderColor: 'var(--border-color)',
    });
    expect(heatText(0)).toBe('text-foreground/60');
  });

  it('uses visible signed color for ordinary session moves', () => {
    expect(heatStyle(0.39).backgroundImage).toContain('var(--up) 10%');
    expect(heatStyle(-0.41).backgroundImage).toContain('var(--down) 10%');
    expect(heatText(0.39)).toBe('text-up');
    expect(heatText(-0.41)).toBe('text-down');
  });

  it('increases tint strength with absolute move magnitude', () => {
    expect(heatStyle(0.1).backgroundImage).toContain('8%');
    expect(heatStyle(2.1).backgroundImage).toContain('16%');
    expect(heatStyle(-0.1).backgroundImage).toContain('8%');
    expect(heatStyle(-4.1).backgroundImage).toContain('24%');
  });
});
