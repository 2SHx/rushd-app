import { beforeEach, describe, expect, it, vi } from 'vitest';

const runDailyIncubationBooks = vi.fn();
vi.mock('@/quant/automation/incubationBooks', () => ({
  runDailyIncubationBooks: (...args: unknown[]) => runDailyIncubationBooks(...args),
}));

import { POST } from './route';

function request(token?: string) {
  return new Request('http://rushd.test/api/cron/quant-incubation', {
    method: 'POST', headers: token ? { Authorization: token } : {},
  });
}

describe('POST /api/cron/quant-incubation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
  });

  it('rejects an unsigned request before orchestration', async () => {
    expect((await POST(request())).status).toBe(401);
    expect(runDailyIncubationBooks).not.toHaveBeenCalled();
  });

  it('runs the one daily pass with a valid signature', async () => {
    runDailyIncubationBooks.mockResolvedValue({ processed: true, claimed: 4, executed: 1 });
    const response = await POST(request('Bearer secret'));
    expect(response.status).toBe(200);
    expect(runDailyIncubationBooks).toHaveBeenCalledTimes(1);
  });
});
