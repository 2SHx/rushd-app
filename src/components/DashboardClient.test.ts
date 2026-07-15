import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./DashboardClient.tsx', import.meta.url), 'utf8');

describe('DashboardClient visual contract', () => {
  it('uses the institutional token system instead of the legacy dark/neon skin', () => {
    for (const legacyToken of [
      'text-neonBlue',
      'bg-black',
      'border-white',
      'text-gray-',
      'text-indigo-',
      'bg-gradient-',
    ]) {
      expect(source).not.toContain(legacyToken);
    }
  });

  it('does not claim that automated investing is active', () => {
    expect(source).not.toContain('AI AUTOPILOT ACTIVE');
    expect(source).toContain("t('portfolioPaperBadge')");
  });

  it('hydrates allocation labels as one deterministic SVG text node', () => {
    expect(source).toContain('<title>{`${pos.symbol}: ${((pos.weight ?? 0) * 100).toFixed(1)}%`}</title>');
  });

  it('exposes selected timeframes and contains keyboard focus inside the success dialog', () => {
    expect(source).toContain('aria-pressed={plTimeframe === tf}');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("if (event.key === 'Escape') setZakatPaidSuccess(false)");
    expect(source).toContain("if (event.key === 'Tab') event.preventDefault()");
    expect(source).toContain('autoFocus');
  });
});
