#!/usr/bin/env node
// scripts/set-incubation-owner.mjs — idempotent maintenance: promote the seeded dev
// parent (test@rushd.dev) to ULTRA so it can own the QDR-8 incubation books
// (assertIncubationOwner requires PARENT+ULTRA and fails closed on anything else).
//
// Same standalone-PrismaClient pattern as scripts/seed-dev.mjs. Run: node scripts/set-incubation-owner.mjs
process.loadEnvFile?.();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OWNER_EMAIL = 'test@rushd.dev';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!user) {
    console.error(`Owner ${OWNER_EMAIL} not found — run scripts/seed-dev.mjs first.`);
    process.exit(1);
  }
  if (user.role !== 'PARENT') {
    console.error(`${OWNER_EMAIL} has role ${user.role}; refusing — owner must be a PARENT.`);
    process.exit(1);
  }
  const updated =
    user.tier === 'ULTRA'
      ? user
      : await prisma.user.update({ where: { id: user.id }, data: { tier: 'ULTRA' } });
  console.log(`Incubation owner ready: id=${updated.id} role=${updated.role} tier=${updated.tier}`);
  console.log(`Set QUANT_INCUBATION_OWNER_USER_ID=${updated.id}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
