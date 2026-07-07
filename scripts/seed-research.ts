import { PrismaClient } from '@prisma/client';
import { TICKERS } from '../src/lib/tickers';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding research documents for RAG analyst...');

  const docs = [
    {
      title: 'AAOIFI Sharia Investment Screening Standards (Standard No. 21)',
      sourceRef: 'AAOIFI Sharia Standards 2025',
      text: 'AAOIFI Standard No. 21 dictates that stocks are Sharia-compliant if their primary business activities are permissible, total interest-bearing debt does not exceed 30% or 33% of market capitalization, liquid assets do not exceed 30% of total assets, and interest income is purified and donated to charity.',
      tags: ['sharia', 'aaoifi', 'screening', 'compliance', 'purification']
    },
    {
      title: 'NVIDIA (NVDA) Market Dominance & AI GPU Outlook',
      sourceRef: 'Gartner Research 2026',
      text: 'NVIDIA remains the absolute leader in enterprise AI chips, commanding over 85% market share in graphics processing units (GPUs) for training large language models. The introduction of Blackwell architecture and high-bandwidth memory (HBM3e) integration has solidified margins and driven record enterprise datacenter revenues.',
      tags: ['nvda', 'nasdaq', 'ai', 'semiconductors', 'growth']
    },
    {
      title: 'Saudi Aramco (2222) Dividend Policy and Energy Outlook',
      sourceRef: 'Riyad Capital Energy Insights 2026',
      text: 'Saudi Aramco (2222.SR) operates with the world\'s lowest crude oil extraction production cost, estimated under $10 per barrel. Aramco\'s robust free cash flow supports its unique performance-linked and base dividend structures, appealing strongly to dividend-growth portfolios and local retail investors.',
      tags: ['2222.sr', 'tasi', 'energy', 'aramco', 'dividends']
    },
    {
      title: 'Saudi Al Rajhi Bank (1120) Islamic Banking Growth',
      sourceRef: 'Gulf Financial Review Q1 2026',
      text: 'Al Rajhi Bank (1120.SR) is the world\'s largest Islamic retail bank by total assets. Its business is 100% compliant with Sharia standards, characterized by Murabaha, Mudarabah, and Istisna agreements. Excellent asset quality and healthy net interest margins driven by Saudi mortgage expansion remain key catalysts.',
      tags: ['1120.sr', 'tasi', 'banking', 'alrajhi', 'islamic-finance']
    },
    {
      title: 'Apple Inc. (AAPL) Hardware Innovation & Services Growth',
      sourceRef: 'Morgan Stanley Research 2026',
      text: 'Apple Inc. (AAPL) continues to drive high-margin services revenue from the App Store, Apple Music, and iCloud subscriptions, balancing steady iPhone hardware cycles. Capital allocation remains best-in-class with significant share buybacks and a pristine balance sheet.',
      tags: ['aapl', 'nasdaq', 'hardware', 'consumer-electronics', 'services']
    },
    {
      title: 'Microsoft Corp. (MSFT) Cloud and AI Integration Services',
      sourceRef: 'Goldman Sachs Software Equity Q1 2026',
      text: 'Microsoft Azure continues to gain cloud market share, accelerated by its integration of OpenAI models and corporate copilots. Long-term commercial contracts provide stable, highly recurring enterprise subscription revenue streams.',
      tags: ['msft', 'nasdaq', 'cloud', 'software', 'ai']
    }
  ];

  // Ingest these documents
  for (const doc of docs) {
    // Generate simple embedding array
    const embedding = Array(1536).fill(0.0);
    
    // Normalize tags to lowercase
    const normalizedTags = doc.tags.map(t => t.toLowerCase());
    
    await prisma.researchDoc.create({
      data: {
        title: doc.title,
        sourceRef: doc.sourceRef,
        text: doc.text,
        tags: normalizedTags,
        embedding
      }
    });
    console.log(`Ingested research document: "${doc.title}"`);
  }

  console.log('RAG research documents seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
