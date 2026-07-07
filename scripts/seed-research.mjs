#!/usr/bin/env node
// scripts/seed-research.mjs — idempotent seed for the RESEARCH analyst's literature
// corpus (QUANT_DESIGN.md §2.3 #7, §4 Q4). A handful of quant/Islamic-finance docs
// covering the topics the analyst is expected to ground stances in: momentum, value
// investing, AAOIFI Sharia screening, Sukuk, and risk management.
//
// ResearchDoc has no unique constraint (embedding-based dedup is a future upgrade),
// so idempotency is done here via findFirst-by-sourceRef + update/create rather than
// a native prisma upsert — running this script twice never creates duplicate rows.
//
// Standalone maintenance script (see scripts/seed-dev.mjs for the same pattern):
// its own short-lived PrismaClient, outside the src/ module graph.
process.loadEnvFile?.();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DOCS = [
  {
    sourceRef: 'doc:momentum-92',
    title: 'Momentum Investing: A Survey',
    tags: ['momentum', 'technical', 'strategy'],
    text:
      'Momentum strategies buy assets that have recently outperformed and sell those that have recently ' +
      'underperformed, exploiting short-to-medium-term trend continuation (roughly 3-12 months). Risk: sharp ' +
      'momentum crashes during market reversals; position sizing and stop discipline are commonly used to manage it.',
  },
  {
    sourceRef: 'doc:value-investing-49',
    title: 'Value Investing: Margin of Safety',
    tags: ['value', 'fundamental', 'strategy'],
    text:
      'Value investing buys securities trading below estimated intrinsic value, favoring low P/E, low P/B and ' +
      'strong balance sheets, and relies on a margin of safety to absorb estimation error. Historically shows ' +
      'long-horizon outperformance with higher variance in the timing of mean reversion.',
  },
  {
    sourceRef: 'doc:aaoifi-screening-17',
    title: 'AAOIFI Shariah Screening Standards for Equities',
    tags: ['sharia', 'aaoifi', 'screening', 'compliance'],
    text:
      'AAOIFI screening excludes issuers whose primary business involves prohibited activities (alcohol, ' +
      'gambling, conventional interest-based finance, pork, adult entertainment) and applies financial ratio ' +
      'gates: interest-bearing debt, interest-bearing securities/cash, and impermissible income each capped ' +
      'relative to market capitalization or total assets, with any non-compliant income purified via donation.',
  },
  {
    sourceRef: 'doc:sukuk-basics-33',
    title: 'Sukuk: Structure and Risk Characteristics',
    tags: ['sukuk', 'sharia', 'fixed-income', 'strategy'],
    text:
      'Sukuk represent undivided beneficial ownership in underlying tangible assets, usufruct, or services, ' +
      'structured (e.g. Ijara, Murabaha, Musharaka) to generate Sharia-compliant returns without conventional ' +
      'interest. Investors bear asset performance and, in some structures, credit risk of the originator.',
  },
  {
    sourceRef: 'doc:risk-mgmt-01',
    title: 'Risk Management for Retail Investors',
    tags: ['risk-management', 'diversification', 'strategy'],
    text:
      'Position sizing, diversification across sectors and markets, and predefined exit rules reduce portfolio ' +
      'drawdowns and behavioral overexposure to any single thesis. Educational framing: no strategy eliminates ' +
      'loss risk; conviction should scale with the strength and independence of supporting evidence.',
  },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const doc of DOCS) {
    const existing = await prisma.researchDoc.findFirst({ where: { sourceRef: doc.sourceRef } });
    if (existing) {
      await prisma.researchDoc.update({ where: { id: existing.id }, data: doc });
      updated += 1;
    } else {
      await prisma.researchDoc.create({ data: doc });
      created += 1;
    }
  }
  console.log(`Seeded research corpus: created=${created} updated=${updated} total=${DOCS.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
