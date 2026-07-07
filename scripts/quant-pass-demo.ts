// Demo: run one committee pass on real (ingested) data and print each analyst's view.
//   npx tsx scripts/quant-pass-demo.ts [SYMBOL] [MARKET]
import { PrismaClient } from '@prisma/client';
import { runCommitteePass } from '../src/quant/committee/runner';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();
const symbol = process.argv[2] ?? 'MSFT';
const market = (process.argv[3] ?? 'NASDAQ') as 'TASI' | 'NASDAQ';

async function main() {
  let user = await prisma.user.findFirst({ where: { email: 'quant-demo@rushd.dev' } });
  if (!user) user = await prisma.user.create({ data: { email: 'quant-demo@rushd.dev', name: 'Quant Demo', role: 'PARENT' } });

  const res = await runCommitteePass({ userId: user.id, symbol, market });
  const dec = await prisma.decision.findUnique({ where: { id: res.decisionId }, include: { signals: true } });

  console.log(`\n=== Committee pass: ${symbol}/${market} ===`);
  console.log(`Portfolio Manager → ${res.finalAction}  (decision ${res.decisionId.slice(0, 8)})`);
  const gate = dec?.shariaGate as any;
  console.log(`Sharia gate → ${gate?.compliant ? 'COMPLIANT ✓' : 'NON-COMPLIANT ✗'}  (${gate?.reason ?? ''})`);
  console.log('Analyst signals:');
  for (const s of dec?.signals ?? []) {
    console.log(`  • ${s.agent.padEnd(16)} ${s.stance.padEnd(8)} conv=${Number(s.conviction).toFixed(2)} [${s.failureMode}]  ${s.rationaleEn.slice(0, 90)}`);
  }
}

main()
  .catch((e) => { console.error('✗', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
