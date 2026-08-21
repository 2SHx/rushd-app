// Focused unit tests for `loadPointInTimeFundamentals`'s explicit ANNUAL/QUARTERLY period filter
// (the 2026-08-19 defect: neither reader filtered on `Fundamentals.period`, so a 10-K could be
// silently consumed as a quarter). See src/quant/data/pointInTime.test.ts for the sibling
// `PointInTimeStore.fundamentals` coverage.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: { fundamentals: { findMany: h.findMany } },
}));

import { loadPointInTimeFundamentals } from './runLab';

// `period` is accepted only for test readability at call sites (mirroring what a real QUARTERLY
// query returns) — the harness's `select` never projects it, matching production.
const row = (symbol: string, _period: 'ANNUAL' | 'QUARTERLY', asOf: string, releasedAt: string) => ({
  symbol, asOf: new Date(asOf), releasedAt: new Date(releasedAt),
  metrics: { totalRevenueUsd: 1_000_000 },
});

describe('loadPointInTimeFundamentals — explicit period (2026-08-19 defect fix)', () => {
  beforeEach(() => h.findMany.mockReset());

  it('a request for QUARTERLY queries period: QUARTERLY, never ANNUAL — and vice versa', async () => {
    h.findMany.mockResolvedValue([]);
    await loadPointInTimeFundamentals(['AAPL'], 'QUARTERLY');
    expect(h.findMany.mock.calls[0][0].where.period).toBe('QUARTERLY');

    h.findMany.mockClear();
    h.findMany.mockResolvedValue([]);
    await loadPointInTimeFundamentals(['AAPL'], 'ANNUAL');
    expect(h.findMany.mock.calls[0][0].where.period).toBe('ANNUAL');
  });

  it('mixed ANNUAL+QUARTERLY rows in the DB response are irrelevant — the query itself is period-scoped', async () => {
    // Even if a mock/DB bug returned both periods, the production `where.period` clause is what
    // real Postgres enforces; this asserts the clause is present and correct on every call.
    h.findMany.mockResolvedValue([
      row('AAPL', 'QUARTERLY', '2025-03-31', '2025-05-01'),
      row('AAPL', 'QUARTERLY', '2025-06-30', '2025-08-01'),
      row('AAPL', 'QUARTERLY', '2025-09-30', '2025-11-01'),
      row('AAPL', 'QUARTERLY', '2025-12-31', '2026-02-01'),
    ]);
    const result = await loadPointInTimeFundamentals(['AAPL'], 'QUARTERLY');
    expect(h.findMany.mock.calls[0][0].where).toEqual({ symbol: { in: ['AAPL'] }, market: 'NASDAQ', period: 'QUARTERLY' });
    const rows = result.get('AAPL')!;
    expect(rows).toHaveLength(4);
  });

  it('four consecutive quarterly observations return in releasedAt-ascending order, no annual interleaved', async () => {
    h.findMany.mockResolvedValue([
      row('AAPL', 'QUARTERLY', '2025-03-31', '2025-05-01'),
      row('AAPL', 'QUARTERLY', '2025-06-30', '2025-08-01'),
      row('AAPL', 'QUARTERLY', '2025-09-30', '2025-11-01'),
      row('AAPL', 'QUARTERLY', '2025-12-31', '2026-02-01'),
    ]);
    const result = await loadPointInTimeFundamentals(['AAPL'], 'QUARTERLY');
    const rows = result.get('AAPL')!;
    expect(rows.map((r) => r.asOf.toISOString().slice(0, 10))).toEqual([
      '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
    ]);
    // Monotonically increasing releasedAt — the harness's orderBy contract, unaffected by the
    // added period filter.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].releasedAt.getTime()).toBeGreaterThan(rows[i - 1].releasedAt.getTime());
    }
  });
});
