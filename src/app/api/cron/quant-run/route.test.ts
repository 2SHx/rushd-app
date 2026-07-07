import { describe, it, expect, vi, beforeEach } from 'vitest';

const runAutomatedStrategies = vi.fn();

vi.mock('@/quant/automation/autoRun', () => ({
  runAutomatedStrategies: (...args: any[]) => runAutomatedStrategies(...args),
}));

import { POST } from './route';

function req(headers: Record<string, string> = {}) {
  return new Request('http://x', { method: 'POST', headers });
}

describe('POST /api/cron/quant-run', () => {
  beforeEach(() => {
    runAutomatedStrategies.mockReset();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('401 without Bearer token', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(runAutomatedStrategies).not.toHaveBeenCalled();
  });

  it('401 with wrong Bearer token', async () => {
    const res = await POST(req({ Authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('401 with a length-mismatched token (constant-time compare short-circuits on length, no throw)', async () => {
    const res = await POST(req({ Authorization: 'Bearer x' }));
    expect(res.status).toBe(401);
    expect(runAutomatedStrategies).not.toHaveBeenCalled();
  });

  it('500 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await POST(req({ Authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(500);
  });

  it('200 with correct Bearer token, returns the run result', async () => {
    runAutomatedStrategies.mockResolvedValue({ processed: true, ran: 2, executed: 1 });
    const res = await POST(req({ Authorization: 'Bearer test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: true, ran: 2, executed: 1 });
  });
});
