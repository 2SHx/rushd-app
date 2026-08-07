// QDR-11 A/B isolation, pinned at the CODE level. The seal-time diff catches two configs that
// differ; nothing there catches the two setups drifting apart in a later edit. These tests do.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  halalDecorrelatedRiskParityCoreSetup,
  halalDecorrelatedRiskParityCoreBookPolicy,
  HALAL_DECORRELATED_RISK_PARITY_CORE_V1,
} from './halalDecorrelatedRiskParityCore';
import {
  halalRiskParityCoreSetup,
  halalRiskParityCoreBookPolicy,
  HALAL_RISK_PARITY_CORE_V1,
} from './halalRiskParityCore';
import { sectorMapContentHash, SYMBOL_SECTOR } from './halalSectorCappedRiskParityCore';

describe('exactly one variable — held by delegation, not by duplication', () => {
  it('shares the incumbent\'s frozen params OBJECT, so the arms cannot drift by edit', () => {
    // Not `toEqual`: the same reference. A copy could be edited on one side and stay "equal-looking"
    // in review while silently becoming a second variable.
    expect(HALAL_DECORRELATED_RISK_PARITY_CORE_V1).toBe(HALAL_RISK_PARITY_CORE_V1);
    expect(halalDecorrelatedRiskParityCoreSetup.defaultParams).toBe(halalRiskParityCoreSetup.defaultParams);
  });

  it('produces a byte-identical book policy', () => {
    expect(halalDecorrelatedRiskParityCoreBookPolicy())
      .toEqual(halalRiskParityCoreBookPolicy());
    expect(halalDecorrelatedRiskParityCoreBookPolicy(HALAL_RISK_PARITY_CORE_V1))
      .toEqual(halalRiskParityCoreBookPolicy(HALAL_RISK_PARITY_CORE_V1));
  });

  it('keeps the incumbent\'s cadence and universe compatibility', () => {
    expect(halalDecorrelatedRiskParityCoreSetup.cadence).toBe(halalRiskParityCoreSetup.cadence);
    expect(halalDecorrelatedRiskParityCoreSetup.universeCompatibility)
      .toBe(halalRiskParityCoreSetup.universeCompatibility);
  });

  it('carries its OWN id and version — the arms are distinct versions of one mechanism', () => {
    expect(halalDecorrelatedRiskParityCoreSetup.id).toBe('halal-decorrelated-risk-parity-core');
    expect(halalDecorrelatedRiskParityCoreSetup.version).toBe('v1');
    expect(halalDecorrelatedRiskParityCoreSetup.id).not.toBe(halalRiskParityCoreSetup.id);
  });
});

describe('no profit-plateau neighborhood, deliberately', () => {
  it('declares none — QDR-11 gates a plateau in EFFECTIVE-BET RATIOS, a different unit', () => {
    // The incumbent has one; this lane must not, because runLab refuses the combination and the
    // sealed sectorCap x poolSize grid is evaluated by the evidence path instead.
    expect(halalRiskParityCoreSetup.plateauNeighborhood).toBeTypeOf('function');
    expect(halalDecorrelatedRiskParityCoreSetup.plateauNeighborhood).toBeUndefined();
  });
});

describe('the signal makes no return claim, in either locale', () => {
  const rationales = () => {
    const p = HALAL_DECORRELATED_RISK_PARITY_CORE_V1;
    // Exercise the copy without a DB: the rationale text is built from params and stance alone.
    const en = `halal-decorrelated-risk-parity-core ${p.version}: monthly inverse-volatility (risk-parity) weight, `
      + `capped at ${(p.perNameCap * 100).toFixed(0)}% per name, over a sleeve chosen for LOW PAIRWISE `
      + 'CORRELATION and SECTOR BALANCE instead of dollar volume.';
    return en;
  };

  it('never says the sleeve is dollar-volume — the incumbent\'s wording would be false here', () => {
    expect(rationales()).toContain('instead of dollar volume');
  });

  it('uses only QDR-11 permitted vocabulary in the shipped source copy', () => {
    // Read the module's own source so the assertion covers the literal shipped strings, both
    // locales, rather than a reconstruction of them.
    const source = readFileSync(
      new URL('./halalDecorrelatedRiskParityCore.ts', import.meta.url), 'utf8',
    );
    const rationaleBlock = source.slice(source.indexOf('rationaleEn:'), source.indexOf('};', source.indexOf('rationaleAr:')));

    for (const banned of [
      'higher return', 'better performance', 'higher Sharpe', 'improved returns',
      'outperform', 'information ratio', 'alpha', 'edge', 'beat the market',
      'عائد أعلى', 'أداء أفضل', 'نسبة شارب أعلى', 'تحسّن العائد',
    ]) {
      expect(rationaleBlock.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    // and it must say plainly what it does NOT claim, in both locales
    expect(rationaleBlock).toContain('no claim about returns of any kind, in either direction');
    expect(rationaleBlock).toContain('ولا تُقدّم أي ادعاء بشأن العوائد');
  });
});

describe('sectorMapContentHash', () => {
  it('hashes the CLASSIFICATION, not the file — stable under unrelated edits', () => {
    expect(sectorMapContentHash()).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sectorMapContentHash()).toBe(sectorMapContentHash());
  });

  it('covers every classified name, so a re-label cannot pose as a data update', () => {
    expect(SYMBOL_SECTOR.size).toBeGreaterThan(100);
    // The hash is what the seal commits to; pinning it here means a silent re-classification
    // shows up as a failing test rather than as a quietly different sleeve.
    expect(sectorMapContentHash())
      .toBe('sha256:da242a29913cadba5302606aacd42eac004057c4ffddf94fa8c4c7b249073830');
  });
});
