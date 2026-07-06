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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize(raw) {
        const input = raw as Record<string, unknown>;
        // Branch on shape before touching the DB; unmatched shapes never
        // reach a query. Failure paths are uniform ("invalid credentials")
        // regardless of which factor was wrong.
        if (typeof input.email === 'string') return authorizeParent(input);
        if (typeof input.familyCode === 'string') return authorizeChild(input);
        return null;
      },
    }),
  ],
});
