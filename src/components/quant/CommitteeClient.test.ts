import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CommitteeClient.tsx', import.meta.url), 'utf8');

describe('CommitteeClient safety boundary', () => {
  it('keeps committee results from mutating client portfolio state', () => {
    const forbiddenNames = [
      'execute' + 'AutopilotTrade',
      'TICK' + 'ERS',
      'set' + 'Cash',
      'set' + 'Nav',
      'set' + 'Positions',
      'set' + 'Snapshots',
      'set' + 'Trades',
      'set' + 'Purification',
      'set' + 'Metrics',
    ];

    for (const name of forbiddenNames) {
      expect(source).not.toContain(name);
    }
    expect(source).not.toMatch(/\|\|\s*120(?:\.0)?/);
    expect(source).not.toMatch(/const\s+qty\s*=/);
    expect(source).not.toContain('Math.random(');
  });

  it('starts visualization playback off and requests a pass only from the manual control', () => {
    const handlerStart = source.indexOf('async function runPass()');

    expect(source).toContain("const [simPlay, setSimPlay] = useState(false);");
    expect(handlerStart).toBeGreaterThan(-1);
    expect(source.slice(0, handlerStart)).not.toContain('runPass(');
    expect(source.slice(handlerStart)).toContain('onClick={() => runPass()}');
  });

  it('never fabricates decisions or an outperforming NAV curve for empty DB state', () => {
    expect(source).not.toContain('generateMockSnapshots');
    expect(source).not.toContain('generateMockDecisions');
    expect(source).not.toContain('mock-dec-');
    expect(source).not.toContain('simulated compound growth');
    expect(source).not.toContain('DEFAULT_MOCK_NAV');
    expect(source).not.toContain('DEFAULT_MOCK_CASH');
    expect(source).not.toContain('DEFAULT_MOCK_POSITIONS');
    expect(source).not.toContain('DEFAULT_MOCK_SNAPSHOTS');
    expect(source).not.toContain('DEFAULT_MOCK_PURIFICATION');
  });

  it('keeps the selected workspace section in the URL and browser history', () => {
    expect(source).toContain("import { usePathname, useRouter } from 'next/navigation'");
    expect(source).toContain('router.push(');
    expect(source).toContain('?section=${tab}#quant-workspace');
    expect(source).toContain('setActiveTab(initialSection)');
  });

  it('localizes the portfolio analytics surface instead of shipping inline English UI', () => {
    expect(source).not.toContain('>AI Strategy<');
    expect(source).not.toContain('>US Equities<');
    expect(source).not.toContain('>Saudi Equities<');
    expect(source).not.toContain('>Portfolio Share<');
    expect(source).toContain("t('portfolioPerformanceNoSnapshots')");
  });

  it('keeps Alpaca paper results in the canonical Portfolio view', () => {
    expect(source).not.toContain('AlpacaPaperPortfolioView');
    expect(source).not.toContain('initialAlpacaPaper');
    expect(source).not.toContain("'alpaca'");
  });

  it('describes paper automation honestly and keeps history keyboard accessible', () => {
    expect(source).not.toContain('AUTOPILOT ACTIVE (24/7)');
    expect(source).not.toContain('24/7 Decisions History');
    expect(source).not.toContain('executes virtual portfolio trades 24/7 in real-time');
    expect(source).toContain("t('paperAutomationEnabledBody')");
    expect(source).toContain('onClick={() => loadPastDecision(dec)}');
    expect(source).toContain('focus-visible:ring-2 focus-visible:ring-accent');
  });
});
