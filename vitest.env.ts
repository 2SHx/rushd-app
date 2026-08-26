// Loaded BEFORE vitest.setup.ts so `.env.test` is in process.env before anything imports the
// Prisma singleton — that singleton reads DATABASE_URL at module load, so a later assignment would
// be ignored and the suite would silently run against production again.
//
// This file must import nothing from `src/`. Adding an import that transitively pulls in
// `@/lib/prisma` would re-create exactly the ordering bug it exists to prevent.
import { existsSync, readFileSync } from 'node:fs';

const envTestPath = new URL('./.env.test', import.meta.url);

if (existsSync(envTestPath)) {
  for (const line of readFileSync(envTestPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    // .env.test WINS over an inherited shell value: the whole point is that a developer with
    // production credentials exported cannot accidentally aim the suite at production.
    process.env[key] = value;
  }
} else {
  // Loud, not silent. Without .env.test the suite falls back to .env — which points at
  // NEON_BRANCH=production, where a test run once deleted every User row.
  console.warn(
    '\n  .env.test not found — tests will use .env (production). '
    + 'Run `npm run db:local:up` first.\n',
  );
}
