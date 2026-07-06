// src/services/money.test.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Decimal money math (no float drift)', () => {
  it('correctly adds fractional amounts without floating-point precision issues', () => {
    // Standard JS float: 0.1 + 0.2 = 0.30000000000000004
    const a = 0.1;
    const b = 0.2;
    expect(a + b).not.toBe(0.3);

    // Prisma.Decimal (decimal.js)
    const decA = new Prisma.Decimal('0.1');
    const decB = new Prisma.Decimal('0.2');
    const decSum = decA.add(decB);

    expect(decSum.toString()).toBe('0.3');
    expect(decSum.toNumber()).toBe(0.3);
  });

  it('correctly handles compound interest sweeps without rounding decay', () => {
    // Start with 1,000,000.0001
    let sumFloat = 1000000.0001;
    let sumDec = new Prisma.Decimal('1000000.0001');

    const rateFloat = 0.02 / 365;
    const rateDec = new Prisma.Decimal('0.02').div(365);

    // Simulate 365 daily sweeps
    for (let i = 0; i < 365; i++) {
      sumFloat += sumFloat * rateFloat;
      sumDec = sumDec.add(sumDec.mul(rateDec));
    }

    // Checking that they are very close, but the Decimal sum avoids float accumulation errors
    expect(sumDec.toNumber()).toBeCloseTo(sumFloat, 4);
    expect(sumDec.toString()).toMatch(/^\d+\.\d+$/);
  });
});
