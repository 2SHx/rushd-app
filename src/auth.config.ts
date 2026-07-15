// src/auth.config.ts
// Edge-safe slice of the Auth.js config (DR-1). No prisma/bcryptjs imports —
// `src/middleware.ts` runs this on the edge runtime just to decode the JWT
// session, never to look up credentials. `src/auth.ts` spreads this object
// and adds the Credentials provider, which does need prisma + bcryptjs.
import type { NextAuthConfig, DefaultSession } from 'next-auth';
import type { SessionUser } from '@/lib/auth-credentials';
import type { Role, Tier } from '@prisma/client';

declare module 'next-auth' {
  interface User extends SessionUser {}
  interface Session {
    user: SessionUser & DefaultSession['user'];
  }
}

// DEV-ONLY fallback so `npm run dev` works before AUTH_SECRET is provisioned.
// Set the AUTH_SECRET environment variable for anything beyond local dev.
// Positive gate: the fallback is used ONLY when NODE_ENV is explicitly
// "development" — any other value, INCLUDING NODE_ENV being unset, requires
// a real AUTH_SECRET and throws at module load otherwise.
const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-secret-do-not-use-outside-local-dev';

// Set only when the NEXT_PHASE build branch below resolves the fallback. The session callback
// throws if a request is ever served under it — `next build`'s page-data collection imports this
// module but never runs callbacks, so a keyless build stays green while a runtime process that
// leaked NEXT_PHASE=phase-production-build (security gate, MED) can never mint a session with the
// public fallback secret. AUTH_SECRET is mandatory in production deployments.
let buildPhaseFallbackActive = false;

function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'development') {
    console.warn('[auth] AUTH_SECRET is not set — using an insecure dev-only fallback secret.');
    return DEV_ONLY_FALLBACK_SECRET;
  }
  // `next build`'s "Collecting page data" step imports every route module
  // (including this one, transitively) purely to read static exports — no
  // request is ever served from that pass. Next sets NEXT_PHASE to this
  // exact value for that step only (never for `next start`), so gating on
  // it lets a keyless build succeed without weakening the real runtime
  // guard below.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    buildPhaseFallbackActive = true;
    return DEV_ONLY_FALLBACK_SECRET;
  }
  throw new Error(
    'AUTH_SECRET must be set (the insecure dev-only fallback only applies when NODE_ENV="development"). Set the AUTH_SECRET environment variable.'
  );
}

export const authConfig = {
  secret: resolveAuthSecret(),
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as SessionUser;
        token.userId = u.id;
        token.role = u.role;
        token.tier = u.tier;
        token.parentId = u.parentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (buildPhaseFallbackActive) {
        throw new Error('[auth] AUTH_SECRET must be set — the build-phase fallback secret must never serve requests.');
      }
      session.user = {
        ...session.user,
        id: token.userId as string,
        role: token.role as Role,
        tier: token.tier as Tier,
        parentId: (token.parentId as string | null) ?? null,
      };
      return session;
    },
  },
} satisfies NextAuthConfig;
