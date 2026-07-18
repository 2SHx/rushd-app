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

  it('omits unknown values instead of rendering an "Unavailable" placeholder', () => {
    // Honesty rule: absence over placeholder text — cards/rows with an unknown value
    // must not render, never fabricate a number or label it "Unavailable".
    expect(source).not.toContain('Unavailable');
    expect(source).toContain('{navValue !== null && effectiveCashCurrency && (');
    expect(source).toContain('{plData !== null && (');
    expect(source).toContain('{winRate !== null && (');
    expect(source).toContain('{hasPerformanceMetrics && (');
  });

  it('renders persisted XP in the level roadmap without a client-only reward mutation', () => {
    expect(source).not.toContain('handleClaimDailyXp');
    expect(source).not.toContain('useState(350)');
    expect(source).toContain('initialXP: number');
    expect(source).toContain('initialLevel: number');
    expect(source).toContain('showLevelModal');
    expect(source).toContain('setShowLevelModal(true)');
    expect(source).toContain('const nextLevelXP = 100 * Math.pow(level, 2)');
    expect(source).toContain('style={{ transform: `scaleX(${levelProgress / 100})`');
  });

  it('only substitutes demo transactions while isDemoActive — a real account with a genuinely empty ledger renders the honest noTransactions state, not fabricated rows', () => {
    expect(source).toContain("useState<any[]>(isDemoActive ? demoTransactions : (initialTransactions ?? []))");
    // the branch that would otherwise be unreachable when a real, empty ledger fell back to demo rows
    expect(source).toContain("txs.length === 0 ? (");
    expect(source).toContain("t('noTransactions')");
  });

  it('never pairs a demo-derived Zakat figure with the live pay-Zakat action', () => {
    expect(source).toContain('{!isDemoActive && (');
    expect(source).toContain('onClick={handlePayZakat}');
    // the live button must be declared inside the !isDemoActive guard, and the demo estimate
    // caption must exist as the honest alternative shown when isDemoActive is true
    const zakatCardStart = source.indexOf("t('zakatDue')");
    const guardIndex = source.indexOf('{!isDemoActive && (', zakatCardStart);
    const buttonIndex = source.indexOf('onClick={handlePayZakat}', zakatCardStart);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(buttonIndex).toBeGreaterThan(guardIndex);
    expect(source).toContain('Demo portfolio estimate — not payable');
  });

  it('reflows the KPI strip instead of leaving dead fixed-span columns when cards are omitted', () => {
    expect(source).not.toContain('xl:col-span-3');
    expect(source).not.toContain('xl:col-span-2');
    expect(source).toContain('xl:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]');
  });

  it('never shows a zero-height allocation-donut wrapper when the donut cannot render', () => {
    expect(source).toContain('{navValue !== null && (\n                  <div className="relative">');
  });
});
