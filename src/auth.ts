// src/auth.ts
// DR-1: single Credentials provider, JWT-only sessions (no adapter, no DB
// session table). authorize() branches on input shape: {email,password} for
// PARENT, {familyCode,username,pin} for CHILD. The server never trusts
// client-sent role/tier — both come only from the DB row via authorize().
// Edge-safe base (secret/session/callbacks/type augmentation) lives in
// `src/auth.config.ts`; this file only adds the Credentials provider, which
// needs prisma + bcryptjs and therefore cannot run on the edge (middleware).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { authorizeParent, authorizeChild } from '@/lib/auth-credentials';
import { TokenBucket } from '@/services/marketData';

// Limit authentication attempts: max 10 bucket capacity, refills 1 per second
const authLimiter = new TokenBucket(10, 1);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize(raw) {
        // Enforce rate limiting on login attempts
        if (!authLimiter.tryAcquire()) {
          console.warn('[AUTH_AUDIT] Rate limit hit for login attempts.');
          return null;
        }

        const input = raw as Record<string, unknown>;
        
        const user = typeof input.email === 'string'
          ? await authorizeParent(input)
          : typeof input.familyCode === 'string'
            ? await authorizeChild(input)
            : null;

        // Structured Audit Logging
        if (user) {
          console.log(`[AUTH_AUDIT] SUCCESS: User login successful. ID: ${user.id}, Role: ${user.role}`);
        } else {
          const keys = Object.keys(input).filter(k => k !== 'password' && k !== 'pin');
          console.warn(`[AUTH_AUDIT] FAILURE: User login failed. Input attributes provided: ${keys.join(', ')}`);
        }

        return user;
      },
    }),
  ],
});
