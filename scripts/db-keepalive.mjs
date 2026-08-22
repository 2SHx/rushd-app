// Neon autosuspends the compute after a few minutes idle; the next query then pays a
// ~3s cold start (measured: 3656ms cold, 329ms warm — the warm figure is the TCP RTT
// floor to eu-west-2). This keeps the compute warm WHILE YOU WORK and lets it sleep
// otherwise, because a 24/7 ping would burn the free-tier compute-hour budget and
// suspend the project — a worse failure than the wait it fixes.
//
// Activity gate: ping only if a tracked repo file was modified in the last IDLE_MIN
// minutes. Editing counts as working; walking away lets it suspend on its own.
// Reads .env directly — no dotenv dependency (lazy-dev rung 1).
import { readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const IDLE_MIN = Number(process.env.KEEPALIVE_IDLE_MIN ?? 45);
const repo = new URL('..', import.meta.url).pathname;
const stamp = () => new Date().toISOString();

if (process.env.KEEPALIVE_FORCE !== '1') {
  const cutoff = Date.now() - IDLE_MIN * 60_000;
  let recent = false;
  try {
    const files = execSync('git ls-files -m -o --exclude-standard', { cwd: repo, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .slice(0, 400);
    recent = files.some((f) => {
      try {
        return statSync(`${repo}/${f}`).mtimeMs > cutoff;
      } catch {
        return false;
      }
    });
  } catch {
    recent = false;
  }
  if (!recent) {
    console.log(`${stamp()} keepalive idle (no edits in ${IDLE_MIN}m) — letting compute suspend`);
    process.exit(0);
  }
}

const env = Object.fromEntries(
  readFileSync(`${repo}/.env`, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) {
  console.error(`${stamp()} keepalive: no DATABASE_URL in .env`);
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const started = Date.now();
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log(`${stamp()} keepalive ok ${Date.now() - started}ms`);
} catch (err) {
  // A resume-in-progress reports as unreachable; the next tick catches it.
  console.error(`${stamp()} keepalive failed ${Date.now() - started}ms: ${err.message.split('\n').find((l) => l.trim()) ?? ''}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
