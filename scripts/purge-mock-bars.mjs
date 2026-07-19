#!/usr/bin/env node
// scripts/purge-mock-bars.mjs — idempotent maintenance: remove MOCK-source rows from
// MarketBar. The strategy lane is real-data-only (QDR-6 directive #1); MOCK bars are
// structurally excluded by the incubation/backtest queries but must not linger as strays
// (journal 2026-07-14: mock strays previously broke the league benchmark chart).
//
// Same standalone-PrismaClient pattern as scripts/seed-dev.mjs. Run: node scripts/purge-mock-bars.mjs
process.loadEnvFile?.();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.marketBar.count({ where: { source: 'MOCK' } });
  const { count } = await prisma.marketBar.deleteMany({ where: { source: 'MOCK' } });
  console.log(`MOCK MarketBar rows: ${before} found, ${count} deleted.`);
  const benchmarks = await prisma.marketBar.groupBy({
    by: ['symbol', 'source'],
    where: { symbol: { in: ['SPY', 'SPUS', 'HLAL'] } },
    _max: { ts: true },
  });
  console.log('Benchmark coverage after purge:', JSON.stringify(benchmarks));
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
