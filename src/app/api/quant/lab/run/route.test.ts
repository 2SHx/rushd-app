import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  requireUltraTier: vi.fn(),
  runLab: vi.fn(),
  backtestRuns: new Map<string, any>(),
  claims: new Set<string>(),
  seq: { n: 0 },
}));

vi.mock('@/lib/authz', () => ({ requireUltraTier: () => h.requireUltraTier() }));
vi.mock('@/quant/backtest/runLab', () => ({ runLab: (...args: any[]) => h.runLab(...args) }));
vi.mock('@/quant/strategies/catalog', () => ({
  STRATEGY_SETUP_CATALOG: { 'bollinger-mr-long-v2': {} },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    autoRunClaim: {
      create: async ({ data }: { data: { key: string } }) => {
        if (h.claims.has(data.key)) {
          throw new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5' });
        }
        h.claims.add(data.key);
        return { key: data.key };
      },
      delete: async ({ where }: { where: { key: string } }) => {
        h.claims.delete(where.key);
        return { key: where.key };
      },
    },
    backtestRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.seq.n += 1;
        const id = crypto.randomUUID();
        const row = { id, createdAt: new Date(), ...data };
        h.backtestRuns.set(id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...h.backtestRuns.get(where.id), ...data };
        h.backtestRuns.set(where.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => h.backtestRuns.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { strategyId: string; createdAt: { gt: Date } } }) => {
        const rows = Array.from(h.backtestRuns.values());
        const hit = rows.find((row) => row.strategyId === where.strategyId && row.createdAt > where.createdAt.gt);
        return hit ? { id: hit.id } : null;
      },
    },
  },
}));

import { GET, POST } from './route';

function req(body: unknown) {
  return new Request('http://x/api/quant/lab/run', { method: 'POST', body: JSON.stringify(body) });
}

function getReq(id: string) {
  return new Request(`http://x/api/quant/lab/run?id=${id}`);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const baseCard = {
  full: {}, oos: {}, distribution: {}, bootstrap: {}, permutation: {},
  checklist: {}, rejectionReasonCodes: [], acceptanceMeaning: 'AUTO_PAPER_ADMISSION_ONLY', riskOfRuinLimit: 0.05,
  implausible: false, gitSha: 'abc123',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.backtestRuns.clear();
  h.claims.clear();
  h.seq.n = 0;
  h.requireUltraTier.mockResolvedValue({ id: 'user-1', role: 'PARENT', tier: 'ULTRA' });
});

describe('POST /api/quant/lab/run', () => {
  it('returns 401 unauthenticated', async () => {
    h.requireUltraTier.mockRejectedValue({ response: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) });
    const res = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-ULTRA session', async () => {
    h.requireUltraTier.mockRejectedValue({ response: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) });
    const res = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y' }));
    expect(res.status).toBe(403);
  });

  it('rejects a custom basket with more than 20 symbols', async () => {
    const symbols = Array.from({ length: 21 }, (_, i) => `S${i}`);
    const res = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y', universe: 'custom', symbols }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects universe=wide with a non-1Y period', async () => {
    const res = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL', universe: 'wide' }));
    expect(res.status).toBe(400);
  });

  it('rejects universe=wide with period=FULL specifically', async () => {
    const res = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL', universe: 'wide' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects an unknown setup id', async () => {
    const res = await POST(req({ setup: 'not-a-real-setup', period: '1Y' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown_setup');
  });

  it('409s a second concurrent run for the same user', async () => {
    h.runLab.mockImplementation(() => new Promise(() => {})); // never resolves — keeps the claim held
    const first = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y' }));
    expect(first.status).toBe(202);

    const second = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y' }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('run_in_progress');
  });

  it('happy path: PENDING → DONE with the card payload, evidenceView true for a non-FULL run', async () => {
    h.runLab.mockResolvedValue({
      card: { ...baseCard, status: 'REJECTED' },
      outFile: null, backtestRunId: null, diagnostic: false,
      symbols: ['AAPL'], universeTag: 'custom:1-symbols', periodPreset: '1Y',
      from: '2025-07-10', to: '2026-07-10',
    });

    const started = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y', universe: 'custom', symbols: ['AAPL'] }));
    expect(started.status).toBe(202);
    const startedBody = await started.json();
    expect(startedBody.status).toBe('PENDING');
    expect(startedBody.evidenceView).toBe(true);

    await flush();

    const polled = await GET(getReq(startedBody.id));
    expect(polled.status).toBe(200);
    const polledBody = await polled.json();
    expect(polledBody.status).toBe('DONE');
    expect(polledBody.evidenceView).toBe(true);
    expect(polledBody.card.gitSha).toBe('abc123');
  });

  it('anti-snooping: a non-FULL run can never report status ACCEPTED', async () => {
    h.runLab.mockResolvedValue({
      card: { ...baseCard, status: 'ACCEPTED' },
      outFile: null, backtestRunId: null, diagnostic: false,
      symbols: ['AAPL'], universeTag: 'custom:1-symbols', periodPreset: '1Y',
      from: '2025-07-10', to: '2026-07-10',
    });

    const started = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y', universe: 'custom', symbols: ['AAPL'] }));
    const { id } = await started.json();
    await flush();

    const polled = await GET(getReq(id));
    const body = await polled.json();
    expect(body.responseStatus).toBe('REJECTED');
  });

  it('a failed run reports FAILED with a sanitized message and frees the claim', async () => {
    h.runLab.mockRejectedValue(new Error('boom: internal stack trace details'));

    const started = await POST(req({ setup: 'bollinger-mr-long-v2', period: '1Y' }));
    const { id } = await started.json();
    await flush();

    const polled = await GET(getReq(id));
    const body = await polled.json();
    expect(body.status).toBe('FAILED');
    expect(body.error).toBe('boom: internal stack trace details');

    // Claim was released — a new run for the same user is now accepted.
    h.runLab.mockResolvedValue({
      card: { ...baseCard, status: 'REJECTED' },
      outFile: null, backtestRunId: null, diagnostic: false,
      symbols: ['AAPL'], universeTag: 'halal', periodPreset: 'FULL', from: '2018-01-02', to: '2026-07-10',
    });
    const again = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL' }));
    expect(again.status).toBe(202);
  });

  it('a stale run (server died mid-run) reports FAILED_STALE AND frees the claim', async () => {
    // Simulate the restart scenario directly: a RUNNING row older than STALE_MS whose claim
    // was never freed because the detached promise died with the process.
    const staleId = crypto.randomUUID();
    h.backtestRuns.set(staleId, {
      id: staleId,
      strategyId: 'lab:user-1',
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
      metrics: { lab: { status: 'RUNNING', ownerUserId: 'user-1', evidenceView: false, request: { setup: 'bollinger-mr-long-v2', period: 'FULL' } } },
    });
    h.claims.add('lab-active:user-1');

    const polled = await GET(getReq(staleId));
    expect(polled.status).toBe(200);
    expect((await polled.json()).status).toBe('FAILED_STALE');

    // The claim is freed on read — the user is not permanently 409-locked.
    h.runLab.mockResolvedValue({
      card: { ...baseCard, status: 'REJECTED' },
      outFile: null, backtestRunId: null, diagnostic: false,
      symbols: ['AAPL'], universeTag: 'halal', periodPreset: 'FULL', from: '2018-01-02', to: '2026-07-10',
    });
    const again = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL' }));
    expect(again.status).toBe(202);
  });

  it('polling an old stale run does NOT free the claim while a newer run is active', async () => {
    const staleId = crypto.randomUUID();
    h.backtestRuns.set(staleId, {
      id: staleId,
      strategyId: 'lab:user-1',
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
      metrics: { lab: { status: 'RUNNING', ownerUserId: 'user-1', evidenceView: false, request: { setup: 'bollinger-mr-long-v2', period: 'FULL' } } },
    });

    // A newer run currently holds the claim.
    h.runLab.mockImplementation(() => new Promise(() => {}));
    const active = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL' }));
    expect(active.status).toBe(202);

    const polled = await GET(getReq(staleId));
    expect((await polled.json()).status).toBe('FAILED_STALE');

    // The active run's claim survived — a concurrent start is still refused.
    const second = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL' }));
    expect(second.status).toBe(409);
  });

  it('a GET for another user\'s run id returns 404', async () => {
    h.runLab.mockResolvedValue({
      card: { ...baseCard, status: 'REJECTED' },
      outFile: null, backtestRunId: null, diagnostic: false,
      symbols: ['AAPL'], universeTag: 'halal', periodPreset: 'FULL', from: '2018-01-02', to: '2026-07-10',
    });
    const started = await POST(req({ setup: 'bollinger-mr-long-v2', period: 'FULL' }));
    const { id } = await started.json();

    h.requireUltraTier.mockResolvedValue({ id: 'user-2', role: 'PARENT', tier: 'ULTRA' });
    const res = await GET(getReq(id));
    expect(res.status).toBe(404);
  });
});
