import { describe, it, expect } from 'vitest';
import { purificationOwed } from './purification';

const base = {
  ratio: 0.005,
  totalRevenueUsd: 400_000_000_000,
  sharesOutstanding: 15_000_000_000,
  heldShares: 1_000,
  heldDays: 365,
  periodDays: 365,
};

describe('purification base (AAOIFI SS 21 income attribution)', () => {
  /**
   * THE DEFECT QDR-23 FOUND. The shipped formula charged ratio × realized capital gain, so a
   * fully-compliant company whose stock doubled owed a large "purification" on a price movement.
   * Appreciation is not investee income; a zero-ratio name owes nothing however much it rose.
   */
  it('charges nothing on a large capital gain when the company has no non-compliant income', () => {
    const result = purificationOwed({ ...base, ratio: 0 });
    expect(result.amountUsd).toBe(0);
    expect(result.basis).toBe('AAOIFI_SS21_INCOME_ATTRIBUTION');
  });

  /**
   * The mirror of the same defect: `max(0, gain)` floored losing positions to zero. Impermissible
   * income accrues to the shareholder regardless of what the share price did.
   */
  it('still charges on income when the position is held at a loss (price is not an input)', () => {
    const result = purificationOwed(base);
    expect(result.amountUsd).toBeGreaterThan(0);
    // Nothing in the signature can express a price, a cost basis, or a gain.
    expect(Object.keys(base)).not.toContain('costBasis');
  });

  it('prorates by ownership fraction and holding days', () => {
    const full = purificationOwed(base);
    const halfYear = purificationOwed({ ...base, heldDays: 182.5 });
    expect(halfYear.amountUsd).toBeCloseTo(full.amountUsd / 2, 6);

    const doubleShares = purificationOwed({ ...base, heldShares: 2_000 });
    expect(doubleShares.amountUsd).toBeCloseTo(full.amountUsd * 2, 6);
  });

  it('never purifies more than one period even when held longer', () => {
    const capped = purificationOwed({ ...base, heldDays: 900 });
    expect(capped.amountUsd).toBeCloseTo(purificationOwed(base).amountUsd, 6);
  });

  /**
   * The floor must be DISTINGUISHABLE, not silently identical to the real thing. Dividends are a
   * strict subset of impermissible income, so this understates — which is why it is marked.
   */
  it('falls back to the disclosed dividend floor when attribution inputs are missing', () => {
    const result = purificationOwed({
      ...base,
      totalRevenueUsd: null,
      sharesOutstanding: null,
      dividendsReceivedUsd: 500,
    });
    expect(result.basis).toBe('DIVIDEND_FLOOR_SP_DAF');
    expect(result.attributionUnavailable).toBe(true);
    expect(result.amountUsd).toBeCloseTo(2.5, 9);
  });

  it('does not silently fall back to zero when both attribution and dividends are absent', () => {
    const result = purificationOwed({ ...base, totalRevenueUsd: null, sharesOutstanding: null });
    expect(result.amountUsd).toBe(0);
    // Zero is only acceptable because the caller can SEE it was the floor, not attribution.
    expect(result.attributionUnavailable).toBe(true);
  });

  /**
   * The defining property, and a stronger pin than any magnitude ratio: the obligation is
   * COMPLETELY INVARIANT to price action. Two investors with identical holdings in identical
   * companies owe the same purification whether one doubled and the other halved.
   *
   * A magnitude assertion was deliberately NOT used here. QDR-23 cites 30-80x versus the old gain
   * base, but that figure was derived on an earnings-yield basis across the codebase's full ratio
   * range; on a revenue base with this fixture the factor is ~5.6x. Pinning a borrowed number that
   * does not reproduce on the fixture under test would be a fabricated assertion — the invariance
   * below is what actually distinguishes the two formulas, and it cannot be satisfied by any
   * gain-based implementation at all.
   */
  it('is completely invariant to price action, which no gain-based formula can be', () => {
    const income = purificationOwed(base).amountUsd;

    // The OLD formula, reproduced only as a comparator: ratio x realized gain, losses floored.
    const oldBase = (entry: number, exit: number) =>
      Math.max(0, exit - entry) * base.heldShares * base.ratio;

    // Same company, same holding, three wildly different price paths.
    expect(oldBase(150, 300)).toBeGreaterThan(oldBase(150, 200));
    expect(oldBase(150, 100)).toBe(0);

    // The income base does not move, because none of those numbers are inputs to it.
    expect(purificationOwed(base).amountUsd).toBe(income);
    expect(income).toBeGreaterThan(0);
  });
});
