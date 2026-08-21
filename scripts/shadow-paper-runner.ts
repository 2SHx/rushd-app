// scripts/shadow-paper-runner.ts — M17/DR-11 bounded shadow-paper runner CLI.
//   npx tsx scripts/shadow-paper-runner.ts --book <bookId> --symbol <SYM> --side BUY|SELL \
//     --notional 50 --ref-price <price> --purpose PROBE_CANCEL|PROBE_FILL|FLATTEN [--live]
//
// THIN WRAPPER: all gating/persistence logic lives in
// src/quant/execution/shadowPaperRunner.ts#runShadowPaperProbe; this file only parses argv and
// prints the result. Defaults to --dry-run; the ONLY mode this dispatch exercises or authorizes.
// `--live` does NOT bypass the security-auditor gate (QUANT_SHADOW_PAPER_SECURITY_GATE=PASS) or
// any other gate inside runShadowPaperProbe — it only removes this CLI's own extra refusal below.
import { pathToFileURL } from 'node:url';
import { Prisma } from '@prisma/client';
import type { OrderSide } from '@prisma/client';
import { runShadowPaperProbe, type ShadowPaperProbeInput } from '../src/quant/execution/shadowPaperRunner';
import { selectShadowPaperBroker } from '../src/quant/execution/registry';
import { INCUBATION_BOOKS } from '../src/quant/automation/incubationBooks';

export class UsageError extends Error {}

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

export function parseShadowPaperArgs(args: string[], resolvedRefPrice?: Prisma.Decimal): ShadowPaperProbeInput {
  const bookId = arg(args, '--book');
  const symbol = arg(args, '--symbol');
  const side = arg(args, '--side');
  const notional = arg(args, '--notional');
  const rawRefPrice = arg(args, '--ref-price');
  const purpose = arg(args, '--purpose');
  if (!bookId || !symbol || !side || !notional || !rawRefPrice || !purpose) {
    throw new UsageError('Required: --book --symbol --side --notional --ref-price --purpose');
  }
  const book = INCUBATION_BOOKS.find((b) => b.bookId === bookId);
  if (!book) throw new UsageError(`--book must be one of the frozen QDR-8 charter ids: ${INCUBATION_BOOKS.map((b) => b.bookId).join(', ')}`);
  if (side !== 'BUY' && side !== 'SELL') throw new UsageError('--side must be BUY or SELL');
  if (purpose !== 'PROBE_CANCEL' && purpose !== 'PROBE_FILL' && purpose !== 'FLATTEN') {
    throw new UsageError('--purpose must be PROBE_CANCEL, PROBE_FILL, or FLATTEN');
  }
  let refPrice: Prisma.Decimal;
  if (resolvedRefPrice) {
    refPrice = resolvedRefPrice;
  } else if (rawRefPrice.toLowerCase() === 'live' || rawRefPrice.toLowerCase() === '<live>' || rawRefPrice.toLowerCase() === 'auto') {
    throw new UsageError('--ref-price live requires resolution via broker; specify a numeric price or run via CLI');
  } else {
    try {
      refPrice = new Prisma.Decimal(rawRefPrice);
      if (!refPrice.isFinite() || !refPrice.gt(0)) {
        throw new Error();
      }
    } catch {
      throw new UsageError('--ref-price must be a positive number or "live"');
    }
  }
  return {
    bookId,
    strategyVersion: book.paramsVersion,
    symbol,
    side: side as OrderSide,
    notionalUsd: new Prisma.Decimal(notional),
    refPrice,
    purpose,
    asOf: new Date(),
    // Only --dry-run=false unlocks anything past this CLI's own refusal below — the module-level
    // security-auditor + kill-switch gates still apply unconditionally either way.
    dryRun: !args.includes('--live'),
  };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const rawRefPrice = arg(rawArgs, '--ref-price');
  const symbol = arg(rawArgs, '--symbol');
  let resolvedRefPrice: Prisma.Decimal | undefined;

  if (rawRefPrice && (rawRefPrice.toLowerCase() === 'live' || rawRefPrice.toLowerCase() === '<live>' || rawRefPrice.toLowerCase() === 'auto')) {
    if (!symbol) throw new UsageError('Required: --symbol when using --ref-price live');
    const broker = selectShadowPaperBroker(process.env);
    resolvedRefPrice = await broker.getLatestQuote(symbol);
  }

  const input = parseShadowPaperArgs(rawArgs, resolvedRefPrice);
  if (!input.dryRun && process.env.QUANT_SHADOW_PAPER_SECURITY_GATE !== 'PASS') {
    // Belt-and-suspenders: refuse before even constructing the broker, matching this dispatch's
    // "transmit nothing" constraint. runShadowPaperProbe enforces the same gate independently.
    throw new UsageError('Refusing --live: QUANT_SHADOW_PAPER_SECURITY_GATE=PASS is not set (security-auditor gate pending).');
  }
  const result = await runShadowPaperProbe(input);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'GATE_BLOCKED' || result.status === 'PREFLIGHT_BLOCKED' || result.status === 'FAILED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    if (err instanceof UsageError) {
      console.error(err.message);
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  });
}
