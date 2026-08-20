import { describe, expect, it, vi } from 'vitest';
import { runQuantDaily } from '../../../scripts/run-quant-daily.mjs';

describe('low-cost daily quant scheduler', () => {
  it('calls ingest, incubation, evaluation, and the AUTO_PAPER run in order with the signed POST contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(runQuantDaily({
      baseUrl: 'https://rushd.test/',
      secret: 'cron-secret',
      fetchImpl: fetchMock,
      allowedOrigin: 'https://rushd.test',
    })).resolves.toEqual([
      { path: '/api/cron/quant-ingest', status: 200 },
      { path: '/api/cron/quant-incubation', status: 200 },
      { path: '/api/cron/quant-incubation-evaluate', status: 200 },
      { path: '/api/cron/quant-run', status: 200 },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://rushd.test/api/cron/quant-ingest',
      'https://rushd.test/api/cron/quant-incubation',
      'https://rushd.test/api/cron/quant-incubation-evaluate',
      'https://rushd.test/api/cron/quant-run',
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer cron-secret' },
    });
  });

  it('stops at the first failed step', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));

    await expect(runQuantDaily({
      baseUrl: 'https://rushd.test',
      secret: 'cron-secret',
      fetchImpl: fetchMock,
      allowedOrigin: 'https://rushd.test',
    })).rejects.toThrow('quant-incubation HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects missing secrets and non-HTTPS or credential-bearing targets', async () => {
    await expect(runQuantDaily({ baseUrl: 'http://rushd.test', secret: 'x', fetchImpl: vi.fn() }))
      .rejects.toThrow('secret-free HTTPS origin');
    await expect(runQuantDaily({ baseUrl: 'https://user:pass@rushd.test', secret: 'x', fetchImpl: vi.fn() }))
      .rejects.toThrow('secret-free HTTPS origin');
    await expect(runQuantDaily({ baseUrl: 'https://rushd.test/proxy', secret: 'x', fetchImpl: vi.fn() }))
      .rejects.toThrow('secret-free HTTPS origin');
    await expect(runQuantDaily({ baseUrl: 'https://rushd.test', secret: '', fetchImpl: vi.fn() }))
      .rejects.toThrow('CRON_SECRET is required');
  });

  it('never sends the cron secret to an unpinned HTTPS origin', async () => {
    const fetchMock = vi.fn();
    await expect(runQuantDaily({
      baseUrl: 'https://attacker.example',
      secret: 'sentinel-cron-secret',
      fetchImpl: fetchMock,
    })).rejects.toThrow('not the pinned production origin');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
