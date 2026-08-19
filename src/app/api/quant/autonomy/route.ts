import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AutonomyTier, Prisma } from '@prisma/client';
import { requireUltraTier } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { MAX_SYMBOLS_PER_STRATEGY } from '@/quant/automation/autoRun';

// DR (backend-expert, 2026-08-19): flipping autonomyTier alone used to leave config.symbols
// empty, so "enabling" AUTO_PAPER silently did nothing — autoRun.ts's `findMany` picked the
// strategy up but had zero symbols to run. `symbols` is optional here (so callers may still
// flip tiers back to HUMAN_APPROVE without resending config), but AUTO_PAPER is rejected
// outright unless at least one symbol is configured, new or pre-existing.
const BodySchema = z.object({
  autonomyTier: z.nativeEnum(AutonomyTier),
  symbols: z
    .array(z.string().trim().min(1).max(10))
    .max(MAX_SYMBOLS_PER_STRATEGY)
    .transform((arr) => Array.from(new Set(arr.map((s) => s.toUpperCase()))))
    .optional(),
});

/** Every surface trading under this route must be labelled: zero versions have ever been
 * ACCEPTED, so AUTO_PAPER/INCUBATION_PAPER activity is always an unpromoted forward test. */
const UNPROMOTED_LABEL = 'unpromoted forward test — paper only';

function symbolsOf(config: Prisma.JsonValue | null | undefined): string[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const symbols = (config as Prisma.JsonObject).symbols;
  return Array.isArray(symbols) ? symbols.filter((s): s is string => typeof s === 'string') : [];
}

export async function POST(req: Request) {
  try {
    const user = await requireUltraTier();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { autonomyTier, symbols } = parsed.data;

    const strategy = await prisma.strategy.findFirst({
      where: { ownerUserId: user.id }
    });

    const nextSymbols = symbols ?? symbolsOf(strategy?.config);
    if (autonomyTier === 'AUTO_PAPER' && nextSymbols.length === 0) {
      return NextResponse.json({ error: 'auto_paper_requires_symbols' }, { status: 400 });
    }
    const nextConfig: Prisma.JsonObject = symbols
      ? { ...(strategy && typeof strategy.config === 'object' && strategy.config && !Array.isArray(strategy.config) ? strategy.config as Prisma.JsonObject : {}), symbols: nextSymbols }
      : (strategy?.config as Prisma.JsonObject) ?? {};

    if (strategy) {
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { autonomyTier, config: nextConfig }
      });
    } else {
      await prisma.strategy.create({
        data: {
          ownerUserId: user.id,
          name: 'Core AI Strategy',
          market: 'NASDAQ',
          config: nextConfig,
          autonomyTier,
          enabled: true
        }
      });
    }

    return NextResponse.json({
      success: true,
      autonomyTier,
      symbols: nextSymbols,
      label: autonomyTier === 'HUMAN_APPROVE' ? undefined : UNPROMOTED_LABEL,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('Failed to update autonomy tier:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
