// Rushd Quant — automated committee run (QUANT_DESIGN.md §7). For each enabled AUTO_PAPER
// strategy, runs a committee pass per configured symbol and auto-executes BUY/SELL on paper.
// AUTO_REAL is NEVER auto-executed here (real money stays behind the separate live gate);
// HUMAN_APPROVE strategies are never picked up. Gated by the kill-switch, checked once up
// front and again before every single execution so a mid-run halt stops further trades.
//
// Idempotency (DR: racy daily guard): a single `findFirst` guard is not race-safe — two
// concurrent cron fires can both see "nothing ran yet" and both execute. Instead, every
// (UTC day, strategy, symbol) unit claims a unique AutoRunClaim row before running; the
// claim-loser (unique-constraint violation) skips that unit. This is race-safe AND resumable
// (each unit is independent, so a partial/timed-out run picks up remaining units next fire).
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runCommitteePass } from '../committee/runner';
import { executeDecision } from '../execution/executeDecision';
import { isHalted } from './control';

/** Cost/DoS caps (DR: unbounded strategies × symbols work). */
function configuredCap(name: string, fallback: number, ceiling: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, ceiling) : fallback;
}

export const MAX_STRATEGIES = configuredCap('AUTO_RUN_MAX_STRATEGIES', 1, 50);
export const MAX_SYMBOLS_PER_STRATEGY = configuredCap('AUTO_RUN_MAX_SYMBOLS', 5, 20);

const configSchema = z.object({
  symbols: z
    .array(z.string())
    .transform((symbols) => {
      if (symbols.length > MAX_SYMBOLS_PER_STRATEGY) {
        console.warn(
          `autoRun: strategy config declared ${symbols.length} symbols; capping to ${MAX_SYMBOLS_PER_STRATEGY}`,
        );
      }
      return symbols.slice(0, MAX_SYMBOLS_PER_STRATEGY);
    })
    .default([]),
});

export interface AutoRunResult {
  processed: boolean;
  ran: number;
  executed: number;
  reason?: string;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export async function assertAutomationActive(): Promise<void> {
  if (await isHalted()) throw new Error('quant_automation_halted');
}

/** Run all opt-in AUTO_PAPER strategies once. Idempotent per (UTC day, strategy, symbol). */
export async function runAutomatedStrategies(now: Date = new Date()): Promise<AutoRunResult> {
  if (await isHalted()) {
    return { processed: false, ran: 0, executed: 0, reason: 'halted' };
  }

  // Structural exclusion (QDR-8/security gate 2026-07-19): incubation strategies carry a
  // dedicated autonomyTier so isolation does not depend on config schema parse failures.
  const strategies = await prisma.strategy.findMany({
    where: { enabled: true, autonomyTier: 'AUTO_PAPER' },
    take: MAX_STRATEGIES,
  });

  const dayKey = utcDayKey(now);
  let ran = 0;
  let executed = 0;

  for (const strategy of strategies) {
    const parsedConfig = configSchema.safeParse(strategy.config);
    const symbols = parsedConfig.success ? parsedConfig.data.symbols : [];

    for (const symbol of symbols) {
      const claimKey = `${dayKey}:${strategy.id}:${symbol}`;
      try {
        await prisma.autoRunClaim.create({ data: { key: claimKey } });
      } catch (err) {
        if (isUniqueViolation(err)) continue; // already claimed (by this or a concurrent run) — skip
        throw err;
      }

      const { decisionId, finalAction } = await runCommitteePass({
        userId: strategy.ownerUserId,
        symbol,
        market: strategy.market,
        strategyId: strategy.id,
        mode: 'AUTO_PAPER',
      });
      ran += 1;

      if (finalAction === 'BUY' || finalAction === 'SELL') {
        if (await isHalted()) continue; // halt mid-run: stop further executions

        await prisma.decision.update({ where: { id: decisionId }, data: { status: 'APPROVED' } });
        await executeDecision(decisionId, strategy.ownerUserId, { beforeSubmit: assertAutomationActive });
        executed += 1;
      }
    }
  }

  return { processed: ran > 0, ran, executed };
}
