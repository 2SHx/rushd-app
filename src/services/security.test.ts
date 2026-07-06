import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();

vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => auth(...args),
}));

import { validateChildCreationLimit, authorizeAccess, AuthzError } from '../lib/authz';
import { prisma } from '../lib/prisma';

const userCount = vi.fn();
const userFindUnique = vi.fn();

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      count: (...args: unknown[]) => userCount(...args),
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}));

beforeEach(() => {
  userCount.mockReset();
  userFindUnique.mockReset();
});

describe('Security Controls: Scoping & Tier Gating', () => {
  describe('validateChildCreationLimit', () => {
    it('allows child creation on BASIC tier if count is 0', async () => {
      userCount.mockResolvedValue(0);
      await expect(validateChildCreationLimit('p1', 'BASIC')).resolves.not.toThrow();
    });

    it('rejects child creation on BASIC tier if count is 1', async () => {
      userCount.mockResolvedValue(1);
      await expect(validateChildCreationLimit('p1', 'BASIC')).rejects.toThrow(AuthzError);
    });

    it('allows child creation on PREMIUM tier if count is 2', async () => {
      userCount.mockResolvedValue(2);
      await expect(validateChildCreationLimit('p1', 'PREMIUM')).resolves.not.toThrow();
    });

    it('rejects child creation on PREMIUM tier if count is 3', async () => {
      userCount.mockResolvedValue(3);
      await expect(validateChildCreationLimit('p1', 'PREMIUM')).rejects.toThrow(AuthzError);
    });

    it('allows child creation on ULTRA tier regardless of child count', async () => {
      userCount.mockResolvedValue(99);
      await expect(validateChildCreationLimit('p1', 'ULTRA')).resolves.not.toThrow();
    });
  });

  describe('authorizeAccess', () => {
    const parentSession = { id: 'parent_1', role: 'PARENT' as const, tier: 'BASIC' as const, parentId: null };
    const childSession = { id: 'child_1', role: 'CHILD' as const, tier: 'BASIC' as const, parentId: 'parent_1' };
    const foreignSession = { id: 'parent_2', role: 'PARENT' as const, tier: 'BASIC' as const, parentId: null };

    it('allows access to self', async () => {
      await expect(authorizeAccess(childSession, 'child_1')).resolves.not.toThrow();
    });

    it('allows access if parent accessing their own child', async () => {
      userFindUnique.mockResolvedValue({ parentId: 'parent_1' });
      await expect(authorizeAccess(parentSession, 'child_1')).resolves.not.toThrow();
    });

    it('rejects access if parent attempts to access child from another family', async () => {
      userFindUnique.mockResolvedValue({ parentId: 'parent_1' });
      await expect(authorizeAccess(foreignSession, 'child_1')).rejects.toThrow(AuthzError);
    });

    it('rejects access if child attempts to access sibling or other user', async () => {
      await expect(authorizeAccess(childSession, 'child_2')).rejects.toThrow(AuthzError);
    });
  });
});
