import { beforeEach, describe, expect, it, vi } from 'vitest';

const runNightlyIncubationEvaluation = vi.fn();
vi.mock('@/quant/automation/incubationEvaluation', () => ({
  runNightlyIncubationEvaluation: (...args: unknown[]) => runNightlyIncubationEvaluation(...args),
}));

import { POST } from './route';

function request(token?: string) {
  return new Request('http://rushd.test/api/cron/quant-incubation-evaluate', {
    method: 'POST', headers: token ? { Authorization: token } : {},
  });
}

describe('POST /api/cron/quant-incubation-evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
  });

  it('rejects unsigned evaluation before any database work', async () => {
    expect((await POST(request())).status).toBe(401);
    expect(runNightlyIncubationEvaluation).not.toHaveBeenCalled();
  });

  it('runs one signed after-close evaluation pass', async () => {
    runNightlyIncubationEvaluation.mockResolvedValue({ processed: true, evaluated: 4, benched: [] });
    expect((await POST(request('Bearer secret'))).status).toBe(200);
    expect(runNightlyIncubationEvaluation).toHaveBeenCalledTimes(1);
  });
});
