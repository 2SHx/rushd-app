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
});
