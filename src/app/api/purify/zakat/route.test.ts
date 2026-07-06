// src/app/api/purify/zakat/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { Prisma } from '@prisma/client';

const requireSession = vi.fn();
const fetchMarketData = vi.fn();

const jarFindUnique = vi.fn();
const jarUpdate = vi.fn();
const portfolioFindMany = vi.fn();
const transactionCreate = vi.fn();

const prismaMock = {
  savingsJar: {
    findUnique: (...args: any[]) => jarFindUnique(...args),
    update: (...args: any[]) => jarUpdate(...args),
  },
  portfolioItem: {
    findMany: (...args: any[]) => portfolioFindMany(...args),
  },
  transaction: {
    create: (...args: any[]) => transactionCreate(...args),
  }
};

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

vi.mock('@/services/marketData', () => ({
  fetchMarketData: (...args: any[]) => fetchMarketData(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    savingsJar: {
      findUnique: (...args: any[]) => jarFindUnique(...args),
    },
    portfolioItem: {
      findMany: (...args: any[]) => portfolioFindMany(...args),
    },
    $transaction: (cb: any) => cb(prismaMock),
  },
}));

beforeEach(() => {
  requireSession.mockReset();
  fetchMarketData.mockReset();
  jarFindUnique.mockReset();
  jarUpdate.mockReset();
  portfolioFindMany.mockReset();
  transactionCreate.mockReset();
});

describe('POST /api/purify/zakat', () => {
  it('returns 401 if unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const req = new Request('http://localhost/api/purify/zakat', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calculates Zakat correctly (2.5% of Cash + Halal Stock value)', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    
    // Cash: 10,000 SAR
    jarFindUnique.mockResolvedValue({
      userId: 'user_1',
      balance: new Prisma.Decimal('10000.00'),
      currency: 'SAR',
    });

    // Portfolio: 10 shares of NVDA (compliant, price 100) + 10 shares of TSLA (non-compliant, price 200)
    portfolioFindMany.mockResolvedValue([
      { symbol: 'NVDA', shares: new Prisma.Decimal('10.00'), market: 'NASDAQ' },
      { symbol: 'TSLA', shares: new Prisma.Decimal('10.00'), market: 'NASDAQ' }
    ]);

    fetchMarketData.mockImplementation(async (symbol) => {
      if (symbol === 'NVDA') {
        return { price: 100, isShariaCompliant: true };
      } else {
        return { price: 200, isShariaCompliant: false }; // Non-compliant stocks are excluded from zakatable valuation
      }
    });

    // Updated jar balance after Zakat
    // Zakatable wealth = 10,000 (cash) + 1,000 (10 NVDA shares * 100 price) = 11,000 SAR
    // Zakat due = 11,000 * 0.025 = 275 SAR
    // New Cash balance = 10,000 - 275 = 9,725 SAR
    jarUpdate.mockResolvedValue({
      balance: new Prisma.Decimal('9725.00'),
    });
    transactionCreate.mockResolvedValue({});

    const req = new Request('http://localhost/api/purify/zakat', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.amountPaid).toBe('275.00');
    expect(data.balance).toBe('9725.00');

    expect(jarUpdate).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      data: { balance: { decrement: new Prisma.Decimal('275') } },
    });
  });
});
