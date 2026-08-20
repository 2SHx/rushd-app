// src/app/api/trade/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { Prisma } from '@prisma/client';

const requireSession = vi.fn();
const fetchMarketData = vi.fn();

// Prisma mock methods
const jarFindUnique = vi.fn();
const jarUpdate = vi.fn();
const portfolioUpsert = vi.fn();
const portfolioFindUnique = vi.fn();
const portfolioDelete = vi.fn();
const portfolioUpdate = vi.fn();
const transactionCreate = vi.fn();
const claimCreate = vi.fn();
const claimDelete = vi.fn();

const prismaMock = {
  savingsJar: {
    findUnique: (...args: any[]) => jarFindUnique(...args),
    update: (...args: any[]) => jarUpdate(...args),
  },
  portfolioItem: {
    upsert: (...args: any[]) => portfolioUpsert(...args),
    findUnique: (...args: any[]) => portfolioFindUnique(...args),
    delete: (...args: any[]) => portfolioDelete(...args),
    update: (...args: any[]) => portfolioUpdate(...args),
  },
  transaction: {
    create: (...args: any[]) => transactionCreate(...args),
  },
  autoRunClaim: {
    create: (...args: any[]) => claimCreate(...args),
    delete: (...args: any[]) => claimDelete(...args),
  },
};

const NASDAQ_TIERS = new Set(['PREMIUM', 'ULTRA']);

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  can: (session: { tier?: string } | null | undefined, capability: string) =>
    capability === 'trading:nasdaq' ? !!session?.tier && NASDAQ_TIERS.has(session.tier) : true,
}));

vi.mock('@/services/marketData', () => ({
  fetchMarketData: (...args: any[]) => fetchMarketData(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (cb: any) => cb(prismaMock),
  },
}));

beforeEach(() => {
  requireSession.mockReset();
  fetchMarketData.mockReset();
  jarFindUnique.mockReset();
  jarUpdate.mockReset();
  portfolioUpsert.mockReset();
  portfolioFindUnique.mockReset();
  portfolioDelete.mockReset();
  portfolioUpdate.mockReset();
  transactionCreate.mockReset();
  claimCreate.mockReset();
  claimDelete.mockReset();
  claimCreate.mockResolvedValue({ key: 'money-user-user_1' });
  claimDelete.mockResolvedValue({ key: 'money-user-user_1' });
});

describe('POST /api/trade', () => {
  it('returns 401 if unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: '2222.SR', market: 'TASI', action: 'BUY', shares: 10 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('blocks buying non-compliant assets', async () => {
    requireSession.mockResolvedValue({ id: 'user_1', tier: 'PREMIUM' });
    fetchMarketData.mockResolvedValue({
      symbol: 'TSLA',
      market: 'NASDAQ',
      price: 220.5,
      isShariaCompliant: false,
    });

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TSLA', market: 'NASDAQ', action: 'BUY', shares: 5 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('non_compliant_asset');
  });

  it('blocks a BUY order when isShariaCompliant is null (UNSCREENED/UNKNOWN) — never inflated to compliant', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    fetchMarketData.mockResolvedValue({
      symbol: '1234.SR',
      market: 'TASI',
      price: 50,
      isShariaCompliant: null,
    });

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: '1234.SR', market: 'TASI', action: 'BUY', shares: 5 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('non_compliant_asset');
  });

  it('executes compliant BUY order successfully', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    fetchMarketData.mockResolvedValue({
      symbol: '2222.SR',
      market: 'TASI',
      price: 26.1,
      isShariaCompliant: true,
    });

    jarFindUnique.mockResolvedValue({
      userId: 'user_1',
      balance: new Prisma.Decimal('1000.00'),
      currency: 'SAR',
    });
    jarUpdate.mockResolvedValue({
      balance: new Prisma.Decimal('739.00'),
    });
    portfolioUpsert.mockResolvedValue({
      shares: new Prisma.Decimal('10.00'),
    });
    transactionCreate.mockResolvedValue({});

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: '2222.SR', market: 'TASI', action: 'BUY', shares: 10 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.balance).toBe('739.00');
    expect(data.sharesOwned).toBe('10.00');

    expect(jarUpdate).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      data: { balance: { decrement: new Prisma.Decimal('261') } },
    });
    expect(portfolioUpsert).toHaveBeenCalled();
    expect(transactionCreate).toHaveBeenCalled();
  });

  it('rejects BUY order on insufficient balance', async () => {
    requireSession.mockResolvedValue({ id: 'user_1', tier: 'PREMIUM' });
    fetchMarketData.mockResolvedValue({
      symbol: 'NVDA',
      market: 'NASDAQ',
      price: 194.83,
      isShariaCompliant: true,
    });

    jarFindUnique.mockResolvedValue({
      userId: 'user_1',
      balance: new Prisma.Decimal('10.00'),
      currency: 'SAR',
    });

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'NVDA', market: 'NASDAQ', action: 'BUY', shares: 5 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('insufficient_balance');
  });

  it('executes SELL order successfully', async () => {
    requireSession.mockResolvedValue({ id: 'user_1', tier: 'PREMIUM' });
    fetchMarketData.mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      price: 175.25,
      isShariaCompliant: true,
    });

    jarFindUnique.mockResolvedValue({
      userId: 'user_1',
      balance: new Prisma.Decimal('100.00'),
      currency: 'SAR',
    });
    jarUpdate.mockResolvedValue({
      balance: new Prisma.Decimal('450.50'),
    });
    portfolioFindUnique.mockResolvedValue({
      shares: new Prisma.Decimal('5.00'),
    });
    portfolioUpdate.mockResolvedValue({
      shares: new Prisma.Decimal('3.00'),
    });
    transactionCreate.mockResolvedValue({});

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'NASDAQ', action: 'SELL', shares: 2 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.balance).toBe('450.50');
    expect(data.sharesOwned).toBe('3.00');
  });

  it('blocks a BASIC-tier user from a NASDAQ trade — no order placed', async () => {
    requireSession.mockResolvedValue({ id: 'user_1', tier: 'BASIC' });
    fetchMarketData.mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      price: 175.25,
      isShariaCompliant: true,
    });

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'NASDAQ', action: 'BUY', shares: 1 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('tier_gate');
    expect(fetchMarketData).not.toHaveBeenCalled();
    expect(jarUpdate).not.toHaveBeenCalled();
    expect(portfolioUpsert).not.toHaveBeenCalled();
    expect(transactionCreate).not.toHaveBeenCalled();
  });

  it('permits a PREMIUM-tier user to place a NASDAQ trade', async () => {
    requireSession.mockResolvedValue({ id: 'user_1', tier: 'PREMIUM' });
    fetchMarketData.mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      price: 175.25,
      isShariaCompliant: true,
    });
    jarFindUnique.mockResolvedValue({
      userId: 'user_1',
      balance: new Prisma.Decimal('1000.00'),
      currency: 'USD',
    });
    jarUpdate.mockResolvedValue({ balance: new Prisma.Decimal('824.75') });
    portfolioUpsert.mockResolvedValue({ shares: new Prisma.Decimal('1.00') });
    transactionCreate.mockResolvedValue({});

    const req = new Request('http://localhost/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'NASDAQ', action: 'BUY', shares: 1 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
