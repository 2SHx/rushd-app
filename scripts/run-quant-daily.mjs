#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const STEPS = [
  '/api/cron/quant-ingest',
  '/api/cron/quant-incubation',
  '/api/cron/quant-incubation-evaluate',
];
export const RUSHD_PRODUCTION_ORIGIN = 'https://rushd-app.onrender.com';

function productionOrigin(value, allowedOrigin) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new Error('RUSHD_APP_URL must be a secret-free HTTPS origin');
  }
  if (url.origin !== allowedOrigin) {
    throw new Error('RUSHD_APP_URL is not the pinned production origin');
  }
  return url.origin;
}

/** One low-cost after-close scheduler: ingest, simulate frozen books, then evaluate them. */
export async function runQuantDaily({
  baseUrl,
  secret,
  fetchImpl = fetch,
  allowedOrigin = RUSHD_PRODUCTION_ORIGIN,
}) {
  if (!secret) throw new Error('CRON_SECRET is required');
  const origin = productionOrigin(baseUrl, allowedOrigin);
  const results = [];
  for (const path of STEPS) {
    const response = await fetchImpl(`${origin}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Quant daily step failed: ${path} HTTP ${response.status}`);
    results.push({ path, status: response.status });
  }
  return results;
}

async function main() {
  const results = await runQuantDaily({
    baseUrl: process.env.RUSHD_APP_URL,
    secret: process.env.CRON_SECRET,
  });
  for (const result of results) console.log(`✓ ${result.path} HTTP ${result.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : 'Quant daily run failed'}`);
    process.exit(1);
  });
}
