import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { quantControl: { upsert: (...args: any[]) => upsert(...args) } },
}));

import { isHalted, setHalt } from './control';

describe('control', () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it('isHalted returns true when the singleton row is halted', async () => {
    upsert.mockResolvedValue({ id: 'singleton', halted: true, reason: 'stop' });
    expect(await isHalted()).toBe(true);
  });

  it('isHalted returns false and self-heals (creates default) when missing', async () => {
    upsert.mockResolvedValue({ id: 'singleton', halted: false, reason: null });
    expect(await isHalted()).toBe(false);
    expect(upsert.mock.calls[0][0].create).toEqual({ id: 'singleton', halted: false });
  });

  it('setHalt upserts halted + reason', async () => {
    upsert.mockResolvedValue({});
    await setHalt(true, 'manual stop');
    expect(upsert.mock.calls[0][0].update).toEqual({ halted: true, reason: 'manual stop' });
  });
});
