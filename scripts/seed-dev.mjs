#!/usr/bin/env node
// scripts/seed-dev.mjs — idempotent dev seed: one parent + one child.
//
// Standalone maintenance script invoked via plain `node`, outside the
// src/ module graph that src/lib/prisma.ts's singleton serves (no path
// aliasing, no hot-reload). It instantiates its own short-lived
// PrismaClient and disconnects on exit — the usual, accepted exception
// for one-shot Prisma seed scripts.
//
// Dev credentials (local-only, never printed by this script):
//   parent: test@rushd.dev / DevParent123!
//   child:  familyCode DEVFAM, username kiddo, PIN 1234
process.loadEnvFile?.();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PARENT_EMAIL = 'test@rushd.dev';
const PARENT_PASSWORD = 'DevParent123!';
const FAMILY_CODE = 'DEVFAM'; // 6 chars, generator alphabet (A-Z2-9)
const CHILD_USERNAME = 'kiddo';
const CHILD_PIN = '1234';
const BCRYPT_COST = 12;

async function main() {
  const passwordHash = await bcrypt.hash(PARENT_PASSWORD, BCRYPT_COST);
  const parent = await prisma.user.upsert({
    where: { email: PARENT_EMAIL },
    update: { passwordHash, familyCode: FAMILY_CODE },
    create: {
      email: PARENT_EMAIL,
      name: 'Dev Parent',
      role: 'PARENT',
      tier: 'BASIC',
      passwordHash,
      familyCode: FAMILY_CODE,
    },
  });

  const pinHash = await bcrypt.hash(CHILD_PIN, BCRYPT_COST);
  const child = await prisma.user.upsert({
    where: { parentId_username: { parentId: parent.id, username: CHILD_USERNAME } },
    update: { passwordHash: pinHash, failedLoginCount: 0, lockedUntil: null },
    create: {
      name: 'Dev Child',
      role: 'CHILD',
      tier: 'BASIC',
      passwordHash: pinHash,
      username: CHILD_USERNAME,
      parentId: parent.id,
    },
  });

  console.log(`Seeded parent: email=${parent.email} id=${parent.id} familyCode=${parent.familyCode}`);
  console.log(`Seeded child:  username=${child.username} id=${child.id} parentId=${child.parentId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
