// POST /api/quant/lab/run — start a bounded QDR-6 strategy validation run on stored real bars
// (ZERO LLM calls, seed always 42). GET .../run?id= polls status/result.
//
// Auth: requireUltraTier. Concurrency: one active run per user, enforced by an insert-race claim
// on the EXISTING AutoRunClaim table (key=`lab-active:<userId>`) — mirrors the automated-run
// pattern (QUANT_DESIGN §7): the loser's insert throws P2002 ⇒ 409. No new Prisma model.
//
// Status tracking (QDR-5 §5, no worker/queue): BacktestRun IS the status source. A run starts as a
// PENDING row (strategyId=`lab:<userId>` — reuses the existing @@index([strategyId, createdAt]) for
// per-user lookups), the route then fires a detached ("void", unawaited) promise that flips it to
// DONE/FAILED. Tradeoff (documented, accepted): if the server process dies mid-run, that promise
// dies with it and the row is stuck PENDING/RUNNING forever — so GET treats a PENDING/RUNNING row
// older than STALE_MS as FAILED_STALE on read, which also frees the user's claim to run again.
//
// Bounds (QDR-5, binding): custom universe ≤ 20 symbols; universe=wide only with period=1Y; seed is
// always 42 and is never accepted from the caller. This API is evidence-view only. Terminal FULL is
// fail-closed here and must use the sealed manifest lifecycle CLI, so the API cannot mint a second
// terminal claim or accept a client-supplied filesystem manifest path.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireUltraTier } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { STRATEGY_SETUP_CATALOG } from '@/quant/strategies/catalog';
import { runLab, type RunLabOptions } from '@/quant/backtest/runLab';

const MAX_CUSTOM_SYMBOLS = 20;
const STALE_MS = 30 * 60 * 1000; // 30 minutes — a wide-universe 1Y stream can legitimately run >15m

function claimKeyFor(userId: string): string {
  return `lab-active:${userId}`;
}

function ownerStrategyId(userId: string): string {
  return `lab:${userId}`;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const BodySchema = z
  .object({
    setup: z.string().min(1).max(64),
    period: z.enum(['FULL', '3Y', '2Y', '1Y']),
    universe: z.enum(['halal', 'wide', 'custom']).optional(),
    symbols: z.array(z.string().min(1).max(12)).max(MAX_CUSTOM_SYMBOLS).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.universe === 'wide' && body.period !== '1Y') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'universe=wide requires period=1Y (also bounds period=FULL to halal|custom)',
        path: ['universe'],
      });
    }
    if (body.universe === 'custom' && (!body.symbols || body.symbols.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'universe=custom requires symbols', path: ['symbols'] });
    }
    if (body.universe !== 'custom' && body.symbols && body.symbols.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'symbols is only valid with universe=custom', path: ['symbols'] });
    }
  });

type LabRequest = z.infer<typeof BodySchema>;

interface LabMetricsMarker {
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  ownerUserId: string;
  evidenceView: boolean;
  request: LabRequest;
  responseStatus?: string;
  error?: string;
}

function sanitizedErrorMessage(err: unknown): string {
  // Never leak stack traces / internals to a persisted, user-pollable row.
  return err instanceof Error ? err.message.slice(0, 500) : 'internal_error';
}

/** Detached run: resolves the pipeline and flips the BacktestRun row to a terminal state. */
async function executeLabRun(runId: string, userId: string, request: LabRequest): Promise<void> {
  const evidenceView = request.period !== 'FULL';
  try {
    await prisma.backtestRun.update({
      where: { id: runId },
      data: {
        metrics: {
          lab: { status: 'RUNNING', ownerUserId: userId, evidenceView, request } satisfies LabMetricsMarker,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const options: RunLabOptions = {
      setup: request.setup,
      period: request.period,
      universe: request.universe,
      symbols: request.symbols ?? null,
      seed: 42,
      writeResultsFile: false,
      persistRun: false,
    };
    const result = await runLab(options);

    // Anti-snooping: an evidence-view (non-FULL) run can never be reported ACCEPTED by this route.
    const responseStatus = evidenceView && result.card.status === 'ACCEPTED' ? 'REJECTED' : result.card.status;

    await prisma.backtestRun.update({
      where: { id: runId },
      data: {
        symbol: result.symbols.length > 40
          ? `${result.universeTag}(${result.symbols.length})`
          : (result.symbols.join(',') || 'NONE'),
        fromDate: new Date(`${result.from}T00:00:00.000Z`),
        toDate: new Date(`${result.to}T23:59:59.999Z`),
        implausible: result.card.implausible,
        gitSha: result.card.gitSha,
        metrics: {
          ...result.card,
          lab: {
            status: 'DONE', ownerUserId: userId, evidenceView, request, responseStatus,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    await prisma.backtestRun.update({
      where: { id: runId },
      data: {
        metrics: {
          lab: {
            status: 'FAILED', ownerUserId: userId, evidenceView, request,
            error: sanitizedErrorMessage(err),
          } satisfies LabMetricsMarker,
        } as unknown as Prisma.InputJsonValue,
      },
    }).catch((updateErr) => console.error('quant lab: failed to persist FAILED status', updateErr));
  } finally {
    await prisma.autoRunClaim.delete({ where: { key: claimKeyFor(userId) } }).catch(() => {});
  }
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
      return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
    }
    const request = parsed.data;
    if (!(request.setup in STRATEGY_SETUP_CATALOG)) {
      return NextResponse.json({ error: 'unknown_setup' }, { status: 400 });
    }
    if (request.period === 'FULL') {
      return NextResponse.json({
        error: 'terminal_full_requires_sealed_cli',
        requiredAction: 'quant_experiment_full',
      }, { status: 409 });
    }

    try {
      await prisma.autoRunClaim.create({ data: { key: claimKeyFor(user.id) } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: 'run_in_progress' }, { status: 409 });
      }
      throw err;
    }

    const evidenceView = true; // FULL returned above; every API-created row is non-terminal evidence.
    let run;
    try {
      run = await prisma.backtestRun.create({
        data: {
          strategyId: ownerStrategyId(user.id),
          symbol: request.symbols?.join(',') || request.universe || 'halal',
          market: 'NASDAQ',
          fromDate: new Date(0),
          toDate: new Date(0),
          oosFraction: new Prisma.Decimal(0.3),
          metrics: {
            lab: { status: 'PENDING', ownerUserId: user.id, evidenceView, request } satisfies LabMetricsMarker,
          } as unknown as Prisma.InputJsonValue,
          implausible: false,
          pmSurrogateId: 'quant-lab-api',
          seed: 42,
        },
      });
    } catch (err) {
      // Never leave an orphaned claim if row creation fails.
      await prisma.autoRunClaim.delete({ where: { key: claimKeyFor(user.id) } }).catch(() => {});
      throw err;
    }

    // QDR-5: no worker/queue. Fire-and-forget in-process; see module doc for the restart tradeoff.
    void executeLabRun(run.id, user.id, request);

    return NextResponse.json({ id: run.id, status: 'PENDING', evidenceView }, { status: 202 });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('quant lab run failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

const IdSchema = z.string().uuid();

export async function GET(req: Request) {
  try {
    const user = await requireUltraTier();

    const id = new URL(req.url).searchParams.get('id');
    const parsedId = IdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const run = await prisma.backtestRun.findUnique({ where: { id: parsedId.data } });
    // Ownership boundary: a lab run belongs to exactly the user who started it.
    if (!run || run.strategyId !== ownerStrategyId(user.id)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const metrics = run.metrics as unknown as { lab: LabMetricsMarker } & Record<string, unknown>;
    const marker = metrics.lab;
    let status: string = marker?.status ?? 'UNKNOWN';
    if ((status === 'PENDING' || status === 'RUNNING') && Date.now() - run.createdAt.getTime() > STALE_MS) {
      status = 'FAILED_STALE';
      // The detached promise died with the server (module doc, line 11): free the user's claim so
      // they can start a new run — but only if no newer run exists, so polling an old stale row
      // can never release the claim held by a currently-active run.
      const newer = await prisma.backtestRun.findFirst({
        where: { strategyId: run.strategyId, createdAt: { gt: run.createdAt } },
        select: { id: true },
      });
      if (!newer) {
        await prisma.autoRunClaim.delete({ where: { key: claimKeyFor(user.id) } }).catch(() => {});
      }
    }

    const evidenceView = marker?.evidenceView ?? null;
    if (status === 'DONE') {
      const { lab: _lab, ...card } = metrics;
      return NextResponse.json({ id: run.id, status, evidenceView, responseStatus: marker.responseStatus, card });
    }
    if (status === 'FAILED' || status === 'FAILED_STALE') {
      return NextResponse.json({ id: run.id, status, evidenceView, error: marker?.error ?? null });
    }
    return NextResponse.json({ id: run.id, status, evidenceView });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('quant lab status failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
