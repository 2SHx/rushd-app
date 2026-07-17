import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireParent = vi.fn();
const requireSession = vi.fn();
const authorizeAccess = vi.fn();
const validateChildCreationLimit = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pin'),
    hashSync: vi.fn().mockReturnValue('dummy-hash'),
  },
}));

vi.mock('@/lib/authz', () => ({
  requireParent: () => requireParent(),
  requireSession: () => requireSession(),
  authorizeAccess: (...args: unknown[]) => authorizeAccess(...args),
  validateChildCreationLimit: (...args: unknown[]) => validateChildCreationLimit(...args),
  AuthzError: class AuthzError extends Error {
    constructor(public readonly response: Response) {
      super('authz');
    }
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

import { PATCH, POST } from './route';

function request(method: 'POST' | 'PATCH', body: unknown) {
  return new Request('http://localhost/api/family/children', {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireParent.mockResolvedValue({ id: 'parent-1', role: 'PARENT', tier: 'PREMIUM' });
  requireSession.mockResolvedValue({ id: 'parent-1', role: 'PARENT', tier: 'PREMIUM' });
  authorizeAccess.mockResolvedValue(undefined);
  validateChildCreationLimit.mockResolvedValue(undefined);
});

describe('/api/family/children age segment settings', () => {
  it('persists a parent-selected age segment when creating a child', async () => {
    userCreate.mockResolvedValue({ id: 'child-1', username: 'learner1', ageSegment: 'TEENS' });

    const response = await POST(request('POST', {
      name: 'Learner',
      username: 'learner1',
      pin: '1234',
      ageSegment: 'TEENS',
    }));

    expect(response.status).toBe(201);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        name: 'Learner',
        username: 'learner1',
        passwordHash: 'hashed-pin',
        role: 'CHILD',
        parentId: 'parent-1',
        ageSegment: 'TEENS',
      },
    });
  });

  it('lets a parent edit only an authorized child age segment', async () => {
    userUpdate.mockResolvedValue({ id: 'child-1', ageSegment: 'KIDS' });

    const response = await PATCH(request('PATCH', { childId: 'child-1', ageSegment: 'KIDS' }));

    expect(response.status).toBe(200);
    expect(authorizeAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'parent-1' }),
      'child-1',
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { ageSegment: 'KIDS' },
    });
  });

  it('rejects a child attempting to edit their own age segment', async () => {
    requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', tier: 'BASIC' });

    const response = await PATCH(request('PATCH', { childId: 'child-1', ageSegment: 'TEENS' }));

    expect(response.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects ADULTS for a child account', async () => {
    const response = await PATCH(request('PATCH', { childId: 'child-1', ageSegment: 'ADULTS' }));

    expect(response.status).toBe(400);
    expect(authorizeAccess).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
