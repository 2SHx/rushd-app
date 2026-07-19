import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computePortfolioMetrics } from '../backtest/metrics';
import {
  INCUBATION_BOOKS,
  INCUBATION_LABEL,
  assertIncubationOwner,
  completeUniverseAsOf,
} from './incubationBooks';
import { isHalted } from './control';

const D = Prisma.Decimal;
const ZERO = new D(0);
const DRAWDOWN_BREAKER = new D('0.30');
const TRACKING_ERROR_LIMIT = 0.20;
const CLAIM_LEASE_MS = 15 * 60 * 1000;

export interface NightlyBookEvaluation {
  snapshotId: string;
  benchmarkNavSpy: Prisma.Decimal;
  benchmarkNavSpus: Prisma.Decimal;
  nav: Prisma.Decimal;
  dailyPnl: Prisma.Decimal;
  drawdown: Prisma.Decimal;
  trackingError: Prisma.Decimal;
  benchFlags: string[];
  benched: boolean;
  requiresRevalidation: boolean;
}

export interface IncubationEvaluationDependencies {
  halted(): Promise<boolean>;
  owner(ownerUserId: string): Promise<{ role: string; tier: string } | null>;
  latestAsOf(now: Date): Promise<Date | null>;
  pendingAsOf(bookId: string, ownerUserId: string, watermark: Date): Promise<Date[]>;
  claim(bookId: string, asOf: Date, claimedAt: Date): Promise<Date | null>;
  releaseClaim(bookId: string, asOf: Date, lease: Date): Promise<void>;
  evaluate(bookId: string, ownerUserId: string, asOf: Date): Promise<NightlyBookEvaluation | null>;
  persist(bookId: string, asOf: Date, evaluation: NightlyBookEvaluation): Promise<void>;
}

export interface IncubationEvaluationRunResult {
  processed: boolean;
  asOf: string | null;
  claimed: number;
  evaluated: number;
  benched: string[];
  label: typeof INCUBATION_LABEL;
  reason?: string;
}

type SnapshotMark = {
  id: string;
  asOf: Date;
  nav: Prisma.Decimal;
  benchmarkNavSpy: Prisma.Decimal;
  benchmarkNavSpus: Prisma.Decimal;
};

function dayStart(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function metricsFromMarks(marks: readonly SnapshotMark[]): { dailyPnl: Prisma.Decimal; drawdown: Prisma.Decimal; trackingError: Prisma.Decimal } {
  const current = marks.at(-1);
  if (!current) throw new Error('Incubation evaluation requires a snapshot');
  const previous = marks.at(-2);
  const peak = marks.reduce((highest, mark) => mark.nav.gt(highest) ? mark.nav : highest, current.nav);
  const drawdown = peak.gt(0) ? peak.minus(current.nav).div(peak) : ZERO;
  const trackingError = new D(computePortfolioMetrics(marks.map(mark => ({
    ts: mark.asOf,
    equity: mark.nav.toNumber(),
    cash: 0,
    spy: mark.benchmarkNavSpy.toNumber(),
    spus: mark.benchmarkNavSpus.toNumber(),
  }))).trackingErrorVsSpus);
  return { dailyPnl: previous ? current.nav.minus(previous.nav) : ZERO, drawdown, trackingError };
}

async function closeOnDay(symbol: 'SPY' | 'SPUS', asOf: Date): Promise<Prisma.Decimal> {
  const start = dayStart(asOf);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const bar = await prisma.marketBar.findFirst({
    where: {
      symbol, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] },
      ts: { gte: start, lt: end },
    },
    orderBy: { ts: 'desc' }, select: { close: true },
  });
  if (!bar?.close.isPositive()) throw new Error(`Missing real ${symbol} close for incubation evaluation`);
  return bar.close;
}

async function evaluateBook(bookId: string, ownerUserId: string, asOf: Date): Promise<NightlyBookEvaluation | null> {
  const strategy = await prisma.strategy.findFirst({
    where: { ownerUserId, name: `INCUBATION:${bookId}`, autonomyTier: 'INCUBATION_PAPER' }, select: { id: true },
  });
  if (!strategy) return null;
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { strategyId: strategy.id, asOf: { lte: dayStart(asOf) } },
    orderBy: { asOf: 'asc' },
    select: { id: true, asOf: true, nav: true, benchmarkNavSpy: true, benchmarkNavSpus: true },
  });
  const current = snapshots.at(-1);
  if (!current || dayStart(current.asOf).getTime() !== dayStart(asOf).getTime()) return null;

  const first = snapshots[0];
  const [firstSpy, firstSpus, currentSpy, currentSpus, prior] = await Promise.all([
    closeOnDay('SPY', first.asOf), closeOnDay('SPUS', first.asOf),
    closeOnDay('SPY', asOf), closeOnDay('SPUS', asOf),
    prisma.bookEvaluation.findFirst({
      where: { bookId, asOf: { lt: dayStart(asOf) } }, orderBy: { asOf: 'desc' },
      select: { benched: true, requiresRevalidation: true },
    }),
  ]);
  const benchmarkNavSpy = first.nav.mul(currentSpy).div(firstSpy);
  const benchmarkNavSpus = first.nav.mul(currentSpus).div(firstSpus);
  const marks: SnapshotMark[] = snapshots.map(snapshot => (
    snapshot.id === current.id ? { ...snapshot, benchmarkNavSpy, benchmarkNavSpus } : snapshot
  ));
  const { dailyPnl, drawdown, trackingError } = metricsFromMarks(marks);
  const benchFlags = [
    ...(drawdown.gte(DRAWDOWN_BREAKER) ? ['DRAWDOWN_BREAKER'] : []),
    ...(trackingError.gt(TRACKING_ERROR_LIMIT) ? ['TRACKING_ERROR_BREACH'] : []),
  ];
  const requiresRevalidation = Boolean(prior?.requiresRevalidation || benchFlags.includes('TRACKING_ERROR_BREACH'));
  return {
    snapshotId: current.id, benchmarkNavSpy, benchmarkNavSpus, nav: current.nav,
    dailyPnl, drawdown, trackingError, benchFlags,
    benched: Boolean(prior?.benched || benchFlags.length > 0),
    requiresRevalidation,
  };
}

export const defaultDependencies: IncubationEvaluationDependencies = {
  halted: () => isHalted(),
  owner: ownerUserId => prisma.user.findUnique({ where: { id: ownerUserId }, select: { role: true, tier: true } }),
  async latestAsOf(now) {
    const rows = await prisma.marketBar.groupBy({
      by: ['symbol'],
      where: {
        symbol: { in: ['SPY', 'SPUS'] }, market: 'NASDAQ', interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] }, ts: { lte: now },
      },
      _max: { ts: true },
    });
    return completeUniverseAsOf(['SPY', 'SPUS'], rows);
  },
  async pendingAsOf(bookId, ownerUserId, watermark) {
    const strategy = await prisma.strategy.findFirst({
      where: { ownerUserId, name: `INCUBATION:${bookId}`, autonomyTier: 'INCUBATION_PAPER' }, select: { id: true },
    });
    if (!strategy) return [];
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { strategyId: strategy.id, asOf: { lte: dayStart(watermark) } },
      orderBy: { asOf: 'asc' }, select: { asOf: true },
    });
    if (!snapshots.length) return [];
    const dates = snapshots.map(snapshot => dayStart(snapshot.asOf));
    const existing = await prisma.bookEvaluation.findMany({
      where: { bookId, asOf: { in: dates } }, select: { asOf: true },
    });
    const marked = new Set(existing.map(item => dayStart(item.asOf).getTime()));
    return dates.filter(asOf => !marked.has(asOf.getTime()));
  },
  async claim(bookId, asOf, claimedAt) {
    const key = `incubation-evaluation:${asOf.toISOString().slice(0, 10)}:${bookId}`;
    const create = async () => prisma.autoRunClaim.create({ data: { key }, select: { createdAt: true } });
    try {
      return (await create()).createdAt;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const recovered = await prisma.autoRunClaim.deleteMany({
      where: { key, createdAt: { lt: new Date(claimedAt.getTime() - CLAIM_LEASE_MS) } },
    });
    if (recovered.count !== 1) return null;
    try {
      return (await create()).createdAt;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },
  async releaseClaim(bookId, asOf, lease) {
    await prisma.autoRunClaim.deleteMany({
      where: { key: `incubation-evaluation:${asOf.toISOString().slice(0, 10)}:${bookId}`, createdAt: lease },
    });
  },
  evaluate: evaluateBook,
  async persist(bookId, asOf, evaluation) {
    await prisma.$transaction([
      prisma.portfolioSnapshot.update({
        where: { id: evaluation.snapshotId },
        data: { benchmarkNavSpy: evaluation.benchmarkNavSpy, benchmarkNavSpus: evaluation.benchmarkNavSpus },
      }),
      prisma.bookEvaluation.upsert({
        where: { bookId_asOf: { bookId, asOf: dayStart(asOf) } },
        create: {
          bookId, asOf: dayStart(asOf), nav: evaluation.nav, dailyPnl: evaluation.dailyPnl,
          drawdown: evaluation.drawdown, trackingError: evaluation.trackingError,
          benchFlags: evaluation.benchFlags, benched: evaluation.benched,
          requiresRevalidation: evaluation.requiresRevalidation,
        },
        update: {
          nav: evaluation.nav, dailyPnl: evaluation.dailyPnl, drawdown: evaluation.drawdown,
          trackingError: evaluation.trackingError, benchFlags: evaluation.benchFlags,
          benched: evaluation.benched, requiresRevalidation: evaluation.requiresRevalidation,
        },
      }),
    ]);
  },
};

/** One signed after-close pass; it marks the B1 ledger and persists auto-bench state for the next entry pass. */
export async function runNightlyIncubationEvaluation(
  now: Date = new Date(),
  overrides: Partial<IncubationEvaluationDependencies> = {},
): Promise<IncubationEvaluationRunResult> {
  const deps = { ...defaultDependencies, ...overrides };
  if (await deps.halted()) {
    return { processed: false, asOf: null, claimed: 0, evaluated: 0, benched: [], label: INCUBATION_LABEL, reason: 'halted' };
  }
  const ownerUserId = process.env.QUANT_INCUBATION_OWNER_USER_ID;
  if (!ownerUserId) {
    return { processed: false, asOf: null, claimed: 0, evaluated: 0, benched: [], label: INCUBATION_LABEL, reason: 'owner_not_configured' };
  }
  const owner = await deps.owner(ownerUserId);
  assertIncubationOwner(owner);
  const asOf = await deps.latestAsOf(now);
  if (!asOf) {
    return { processed: false, asOf: null, claimed: 0, evaluated: 0, benched: [], label: INCUBATION_LABEL, reason: 'no_market_day' };
  }

  let claimed = 0;
  let evaluated = 0;
  const benched: string[] = [];
  for (const book of INCUBATION_BOOKS) {
    const pending = await deps.pendingAsOf(book.bookId, ownerUserId, asOf);
    for (const pendingAsOf of pending) {
      const lease = await deps.claim(book.bookId, pendingAsOf, now);
      if (!lease) continue;
      claimed += 1;
      try {
        const evaluation = await deps.evaluate(book.bookId, ownerUserId, pendingAsOf);
        if (!evaluation) {
          await deps.releaseClaim(book.bookId, pendingAsOf, lease);
          claimed -= 1;
          continue;
        }
        await deps.persist(book.bookId, pendingAsOf, evaluation);
        evaluated += 1;
        if (evaluation.benched && !benched.includes(book.bookId)) benched.push(book.bookId);
      } catch (error) {
        await deps.releaseClaim(book.bookId, pendingAsOf, lease);
        throw error;
      }
    }
  }
  return { processed: claimed > 0, asOf: asOf.toISOString(), claimed, evaluated, benched, label: INCUBATION_LABEL };
}
