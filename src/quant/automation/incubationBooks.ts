import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Market, Strategy } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { allocateTournamentCapital, type AllocationResult, type AllocatorModeInput } from '../allocation/allocator';
import {
  simulateStrategyBook,
  type StrategyBookDailyPoint,
  type StrategyBookFill,
  type StrategyBookSeries,
} from '../backtest/portfolioEngine';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { buildShariaRunSnapshot } from '../backtest/shariaSnapshot';
import { evaluateShariaGate, gateAllowsAction } from '../gates/sharia';
import { executeDecision } from '../execution/executeDecision';
import { InternalSimBroker } from '../execution/internalSim';
import { NASDAQ_HALAL_UNIVERSE } from '../strategies/bollingerMrLong';
import { DUAL_MOMENTUM_UNIVERSE, dualMomentumRotationBookPolicy } from '../strategies/dualMomentumRotation';
import { STRATEGY_SETUP_CATALOG } from '../strategies/catalog';
import { tsMomentumV3BookPolicy } from '../strategies/tsMomentumHalalBasketV3';
import type { StrategySetup } from '../strategies/types';
import { assertAutomationActive } from './autoRun';
import { isHalted } from './control';

const D = Prisma.Decimal;
const ZERO = new D(0);
const INCUBATION_SEED = 42;
const INCUBATION_START = new Date('2026-07-19T00:00:00.000Z');
const HISTORY_START = new Date('2018-01-02T00:00:00.000Z');
const DAILY_BREAKER = new D('-0.03');
const DRAWDOWN_BREAKER = 0.30;
const TRACKING_ERROR_LIMIT = 0.20;
const CLAIM_LEASE_MS = 15 * 60 * 1000;
export const INTERNAL_SIM_BANKROLL = new D(1_000_000);

export const INCUBATION_LABEL = 'unpromoted forward test — paper only';

export interface IncubationBook {
  bookId: string;
  setupId: keyof typeof STRATEGY_SETUP_CATALOG;
  paramsVersion: string;
  universe: readonly string[];
  validation: { deflatedSharpe: number; maxDrawdown: number };
}

/** Exact QDR-8 charter. These versions and evidence priors are frozen; B1 never retunes them. */
export const INCUBATION_BOOKS: readonly IncubationBook[] = Object.freeze([
  {
    bookId: 'ts-momentum-halal-basket-v3', setupId: 'ts-momentum-halal-basket-v3', paramsVersion: 'v3',
    universe: NASDAQ_HALAL_UNIVERSE, validation: { deflatedSharpe: 0.3751, maxDrawdown: 0.29628 },
  },
  {
    bookId: 'bollinger-mr-long-v2', setupId: 'bollinger-mr-long-v2', paramsVersion: 'v2',
    universe: NASDAQ_HALAL_UNIVERSE, validation: { deflatedSharpe: 0.931, maxDrawdown: 0.0984 },
  },
  {
    bookId: 'ts-momentum-halal-basket-v2', setupId: 'ts-momentum-halal-basket-v2', paramsVersion: 'v2',
    universe: NASDAQ_HALAL_UNIVERSE, validation: { deflatedSharpe: 0.894, maxDrawdown: 0.2944 },
  },
  {
    bookId: 'dual-momentum-rotation', setupId: 'dual-momentum-rotation', paramsVersion: 'v1',
    universe: DUAL_MOMENTUM_UNIVERSE, validation: { deflatedSharpe: 0.7012, maxDrawdown: 0.173578 },
  },
]);

const INCUBATION_SYMBOLS = Object.freeze(Array.from(new Set(INCUBATION_BOOKS.flatMap(book => [...book.universe]))));

export interface IncubationEvaluation {
  nav: Prisma.Decimal;
  dailyPnl: Prisma.Decimal;
  drawdown: Prisma.Decimal;
  trackingError: Prisma.Decimal;
  benched: boolean;
  requiresRevalidation: boolean;
}

export interface IncubationOrder {
  fill: StrategyBookFill;
  label: typeof INCUBATION_LABEL;
}

export interface IncubationSimulation {
  orders: IncubationOrder[];
  daily: readonly StrategyBookDailyPoint[];
  /** Full-history fills (not day-filtered): needed to reconstruct a frozen-entries day's
   * exit-only ledger point on replay, not just today's (security gate 2026-07-19 MED). */
  fills: readonly StrategyBookFill[];
}

export interface IncubationDependencies {
  halted(): Promise<boolean>;
  availableCash(ownerUserId: string): Promise<Prisma.Decimal>;
  latestAsOf(now: Date): Promise<Date | null>;
  evaluation(bookId: string, asOf: Date): Promise<IncubationEvaluation | null>;
  shariaState(book: IncubationBook, asOf: Date): Promise<AllocatorModeInput['shariaState']>;
  persistAllocation(asOf: Date, result: AllocationResult, cash: Prisma.Decimal): Promise<Record<string, string>>;
  claim(bookId: string, asOf: Date, claimedAt: Date): Promise<Date | null>;
  releaseClaim(bookId: string, asOf: Date, lease: Date): Promise<void>;
  simulate(book: IncubationBook, cash: Prisma.Decimal, asOf: Date): Promise<IncubationSimulation>;
  /** QDR-8 clarified 2026-07-19d: the −3%/day breaker halts NEW ENTRIES only. When today's
   * fresh allocation is zeroed by a breach/bench, this recovers the book's last committed
   * capital so the replay can still surface exit fills for any open position. */
  priorBookCash(bookId: string, asOf: Date): Promise<Prisma.Decimal>;
  /** Round-trips the entriesFrozen flag persisted alongside the daily allocation (security gate
   * 2026-07-19 round 2, MED) so verifyLedger can reproduce a frozen day identically on replay. */
  wasEntriesFrozen(bookId: string, asOf: Date): Promise<boolean>;
  verifyLedger(book: IncubationBook, ownerUserId: string, simulation: IncubationSimulation, asOf: Date): Promise<void>;
  persistLedger(book: IncubationBook, ownerUserId: string, simulation: IncubationSimulation, asOf: Date): Promise<void>;
  execute(book: IncubationBook, ownerUserId: string, order: IncubationOrder): Promise<boolean>;
}

export interface IncubationRunResult {
  processed: boolean;
  asOf: string | null;
  claimed: number;
  executed: number;
  label: typeof INCUBATION_LABEL;
  allocations: Record<string, string>;
  reason?: string;
  /** One failing book must not starve the others (security gate 2026-07-19 MED#3): keyed by bookId. */
  errors?: Record<string, string>;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function dayStart(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function completeUniverseAsOf(
  requiredSymbols: readonly string[],
  rows: readonly { symbol: string; _max: { ts: Date | null } }[],
): Date | null {
  const latest = new Map(rows.map(row => [row.symbol, row._max.ts]));
  if (requiredSymbols.some(symbol => !latest.get(symbol))) return null;
  return requiredSymbols.reduce<Date | null>((minimum, symbol) => {
    const ts = latest.get(symbol)!;
    return !minimum || ts < minimum ? ts : minimum;
  }, null);
}

export function assertIncubationOwner(owner: { role: string; tier: string } | null): void {
  if (!owner) throw new Error('QUANT_INCUBATION_OWNER_USER_ID does not identify a user');
  if (owner.role !== 'PARENT' || owner.tier !== 'ULTRA') {
    throw new Error('Internal-sim incubation requires a PARENT owner with ULTRA access');
  }
}

function ledgerPositions(point: StrategyBookDailyPoint): Record<string, {
  qty: string; costBasis: string; price: string; entryTs: string; entrySignalTs: string;
}> {
  return Object.fromEntries(point.positions.map(position => [position.symbol, {
    qty: position.qty.toString(), costBasis: position.entryPrice.toString(), price: position.price.toString(),
    entryTs: position.entryTs.toISOString(), entrySignalTs: position.entrySignalTs.toISOString(),
  }]));
}

function persistedLedgerMatches(
  snapshot: { cashVirtual: Prisma.Decimal; nav: Prisma.Decimal; positions: unknown },
  point: StrategyBookDailyPoint,
): boolean {
  if (!snapshot.cashVirtual.eq(point.cash) || !snapshot.nav.eq(point.nav)) return false;
  const expected = ledgerPositions(point);
  const actual = snapshot.positions as Record<string, Record<string, unknown>> | null;
  if (!actual || Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([symbol, position]) => (
    actual[symbol]
    && Object.entries(position).every(([key, value]) => actual[symbol][key] === value)
  ));
}

function pointForDay(simulation: IncubationSimulation, asOf: Date): StrategyBookDailyPoint | null {
  const target = dayStart(asOf).getTime();
  return simulation.daily.find(point => dayStart(point.ts).getTime() === target) ?? null;
}

/**
 * QDR-8 clarified 2026-07-19d (security gate MED, 2026-07-19): the daily/breach breaker halts
 * NEW ENTRIES only. Post-filtering executed orders is not enough — the persisted book-of-record
 * (NAV/cash/positions) must also agree that no new position was opened. Given a day's full fills,
 * this reconstructs that day's ledger point from only the allowed (SELL) fills, or freezes at
 * yesterday's close if none of that day's fills were exits, so ledger, NAV, and audit records
 * never disagree — and so a historically frozen day can be reproduced identically on replay
 * (security gate 2026-07-19 round 2, MED).
 */
function frozenPointForDay(
  simulation: IncubationSimulation,
  day: Date,
): { orders: IncubationOrder[]; point: StrategyBookDailyPoint | null } {
  const target = dayStart(day).getTime();
  const allowedFills = simulation.fills.filter(fill => (
    dayStart(fill.ts).getTime() === target && fill.action === 'SELL'
  ));
  const orders: IncubationOrder[] = allowedFills.map(fill => ({ fill, label: INCUBATION_LABEL }));
  const priorPoint = simulation.daily.filter(p => dayStart(p.ts).getTime() < target).at(-1) ?? null;
  const lastAllowed = allowedFills.at(-1);
  let point: StrategyBookDailyPoint | null;
  if (lastAllowed) {
    const { cashAfter, positionsValueAfter, navAfter, positionsAfter } = lastAllowed;
    // Recomputed (not carried) — LOW fix (security gate 2026-07-19 round 2): a stale
    // pre-freeze peakNav/drawdown would silently misreport risk on a frozen day.
    const peakNav = priorPoint && priorPoint.peakNav.gte(navAfter) ? priorPoint.peakNav : navAfter;
    point = {
      ts: dayStart(day), cash: cashAfter, positionsValue: positionsValueAfter, nav: navAfter,
      peakNav, drawdown: peakNav.gt(0) ? peakNav.minus(navAfter).div(peakNav) : ZERO,
      realizedVolAnnual: null, grossExposureScalar: 1, positions: positionsAfter,
    };
  } else if (priorPoint) {
    const peakNav = priorPoint.peakNav.gte(priorPoint.nav) ? priorPoint.peakNav : priorPoint.nav;
    point = {
      ...priorPoint, ts: dayStart(day), peakNav,
      drawdown: peakNav.gt(0) ? peakNav.minus(priorPoint.nav).div(peakNav) : ZERO,
    };
  } else {
    point = null;
  }
  return { orders, point };
}

function freezeEntries(
  simulation: IncubationSimulation,
  asOf: Date,
): { orders: IncubationOrder[]; simulation: IncubationSimulation } {
  const target = dayStart(asOf).getTime();
  const { orders, point } = frozenPointForDay(simulation, asOf);
  const daily = [
    ...simulation.daily.filter(p => dayStart(p.ts).getTime() !== target),
    ...(point ? [point] : []),
  ].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  return { orders, simulation: { orders, daily, fills: simulation.fills } };
}

function validatedAllocationMap(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted incubation allocation is invalid');
  }
  const allocations = Object.fromEntries(INCUBATION_BOOKS.map(book => {
    const weight = value[book.bookId];
    if (typeof weight !== 'string') throw new Error(`Persisted allocation missing ${book.bookId}`);
    const decimal = new D(weight);
    if (decimal.lt(0) || decimal.gt('0.4')) throw new Error(`Persisted allocation breaches cap for ${book.bookId}`);
    return [book.bookId, decimal.toString()];
  }));
  const total = Object.values(allocations).reduce((sum, weight) => sum.plus(weight), ZERO);
  if (total.gt(1)) throw new Error('Persisted incubation allocation exceeds bankroll');
  return allocations;
}

function dailyBreakerHit(evaluation: IncubationEvaluation | null): boolean {
  if (!evaluation) return false;
  const priorNav = evaluation.nav.minus(evaluation.dailyPnl);
  return priorNav.gt(0) && evaluation.dailyPnl.div(priorNav).lte(DAILY_BREAKER);
}

function allocatorMode(
  book: IncubationBook,
  evaluation: IncubationEvaluation | null,
  shariaState: AllocatorModeInput['shariaState'],
): AllocatorModeInput {
  const breaker = dailyBreakerHit(evaluation);
  const benched = breaker || evaluation?.benched || evaluation?.requiresRevalidation;
  return {
    modeId: book.bookId,
    validationStatus: 'REJECTED',
    incubationAuthorized: true,
    evidenceCardComplete: true,
    shariaState,
    implausible: false,
    validation: book.validation,
    live: {
      days: evaluation ? 1 : 0,
      deflatedSharpe: 0,
      maxDrawdown: Number(evaluation?.drawdown ?? ZERO),
      currentDrawdown: benched ? DRAWDOWN_BREAKER : Number(evaluation?.drawdown ?? ZERO),
      drawdownBreaker: DRAWDOWN_BREAKER,
      trackingError: Number(evaluation?.trackingError ?? ZERO),
      trackingErrorLimit: TRACKING_ERROR_LIMIT,
    },
  };
}

function policyFor(book: IncubationBook, params: unknown) {
  if (book.setupId === 'ts-momentum-halal-basket-v3') return tsMomentumV3BookPolicy(params as never);
  if (book.setupId === 'dual-momentum-rotation') return dualMomentumRotationBookPolicy();
  return undefined;
}

function limitsFor(book: IncubationBook) {
  return book.setupId === 'dual-momentum-rotation'
    ? { ...DEFAULT_BT_LIMITS, maxOpenPositions: 1 }
    : DEFAULT_BT_LIMITS;
}

async function loadSeries(book: IncubationBook, asOf: Date): Promise<StrategyBookSeries[]> {
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol: { in: [...book.universe] }, market: 'NASDAQ', interval: 'DAY',
      source: { in: ['YAHOO', 'ALPACA'] }, ts: { gte: HISTORY_START, lte: asOf },
    },
    orderBy: [{ symbol: 'asc' }, { ts: 'asc' }],
  });
  const grouped = new Map<string, StrategyBookSeries['bars'][number][]>();
  for (const row of rows) {
    const bars = grouped.get(row.symbol) ?? [];
    bars.push({
      ts: row.ts, open: row.open, high: row.high, low: row.low,
      close: row.close, volume: row.volume, source: row.source,
    });
    grouped.set(row.symbol, bars);
  }
  return Array.from(grouped.entries()).map(([symbol, bars]) => ({ symbol, market: 'NASDAQ' as Market, bars }));
}

/** The production decision seam: the exact shared-book engine, warm history, empty live book at inception. */
export async function simulateIncubationBook(
  book: IncubationBook,
  startingCash: Prisma.Decimal,
  asOf: Date,
): Promise<IncubationSimulation> {
  if (!startingCash.gt(0)) return { orders: [], daily: [], fills: [] };
  const setup = STRATEGY_SETUP_CATALOG[book.setupId] as StrategySetup<unknown>;
  const params = setup.defaultParams;
  const series = await loadSeries(book, asOf);
  if (!series.length) return { orders: [], daily: [], fills: [] };
  const replayScope = {};
  setup.prepareUniverse?.({
    symbols: series.map(item => item.symbol), replayScope,
    closesBySymbol: new Map(series.map(item => [item.symbol, item.bars.map(bar => ({ ts: bar.ts, close: Number(bar.close) }))])),
    dailyBarsBySymbol: new Map(series.map(item => [item.symbol, item.bars.map(bar => ({
      ts: bar.ts, close: Number(bar.close), volume: Number(bar.volume),
    }))])),
  });
  const result = simulateStrategyBook({
    setup, params, series, replayScope, startingCash, tradeFrom: INCUBATION_START,
    limits: limitsFor(book), policy: policyFor(book, params),
  });
  const activeDay = dayStart(asOf).getTime();
  const orders: IncubationOrder[] = result.fills
    .filter(fill => dayStart(fill.ts).getTime() === activeDay)
    .map(fill => ({ fill, label: INCUBATION_LABEL }));
  return { orders, daily: result.daily, fills: result.fills };
}

export async function ensureStrategy(book: IncubationBook, ownerUserId: string): Promise<Strategy> {
  const name = `INCUBATION:${book.bookId}`;
  const existing = await prisma.strategy.findFirst({ where: { ownerUserId, name } });
  if (existing) {
    if (existing.autonomyTier === 'INCUBATION_PAPER') return existing;
    // Backfill (security gate 2026-07-19 HIGH): migrate a pre-hardening AUTO_PAPER incubation
    // row to INCUBATION_PAPER in place instead of creating a duplicate strategy for this book.
    return prisma.strategy.update({ where: { id: existing.id }, data: { autonomyTier: 'INCUBATION_PAPER' } });
  }
  return prisma.strategy.create({
    data: {
      ownerUserId, name, market: 'NASDAQ', autonomyTier: 'INCUBATION_PAPER', enabled: true,
      config: { setupId: book.setupId, paramsVersion: book.paramsVersion, label: INCUBATION_LABEL },
    },
  });
}

async function executeIncubationOrder(
  book: IncubationBook,
  ownerUserId: string,
  order: IncubationOrder,
): Promise<boolean> {
  const gate = await evaluateShariaGate(order.fill.symbol, 'NASDAQ');
  if (!gateAllowsAction(gate, order.fill.action)) {
    throw new Error(`Incubation Sharia gate blocked ${order.fill.action} ${order.fill.symbol}`);
  }
  const strategy = await ensureStrategy(book, ownerUserId);
  const decisionId = [
    'incubation', book.bookId, order.fill.ts.toISOString(), order.fill.symbol, order.fill.action,
  ].join(':');
  const decisionData = {
    strategyId: strategy.id, userId: ownerUserId, symbol: order.fill.symbol, market: 'NASDAQ' as const,
    asOf: order.fill.signalTs, proposedAction: order.fill.action, proposedQty: order.fill.qty,
    finalAction: order.fill.action, finalQty: order.fill.qty, shariaGate: gate,
    riskAdjustments: { source: 'simulateStrategyBook', adjustments: order.fill.envelope.adjustments, label: order.label },
    debateTranscript: { deterministic: true, zeroLlm: true, bookId: book.bookId, label: order.label },
    temperature: ZERO, seed: INCUBATION_SEED, gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    mode: 'INCUBATION_PAPER' as const, status: 'APPROVED' as const, costCents: 0,
  };
  const decision = await prisma.decision.upsert({
    where: { id: decisionId },
    create: {
      id: decisionId,
      ...decisionData,
    },
    update: {},
  });
  const result = await executeDecision(decision.id, ownerUserId, {
    beforeSubmit: assertAutomationActive,
    broker: new InternalSimBroker(),
    refPrice: order.fill.refPrice,
    isolatedPaperBook: true,
  });
  return result.status !== 'ALREADY_EXECUTED';
}

export const defaultDependencies: IncubationDependencies = {
  halted: () => isHalted(),
  async priorBookCash(bookId, asOf) {
    const prior = await prisma.allocationDecision.findFirst({
      where: { asOf: { lt: dayStart(asOf) } },
      orderBy: { asOf: 'desc' },
      select: { inputs: true },
    });
    const rawInputs = z.object({ bookCash: z.record(z.string()).optional() })
      .safeParse(prior?.inputs);
    const raw = rawInputs.success ? rawInputs.data.bookCash?.[bookId] : undefined;
    if (typeof raw !== 'string') return ZERO;
    let parsed: Prisma.Decimal;
    try {
      parsed = new D(raw);
    } catch {
      return ZERO;
    }
    if (!parsed.isFinite() || parsed.isNaN() || parsed.lt(0) || parsed.gt(INTERNAL_SIM_BANKROLL)) return ZERO;
    return parsed;
  },
  async availableCash(ownerUserId) {
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { role: true, tier: true } });
    assertIncubationOwner(owner);
    return INTERNAL_SIM_BANKROLL;
  },
  async latestAsOf(now) {
    const rows = await prisma.marketBar.groupBy({
      by: ['symbol'],
      where: {
        symbol: { in: [...INCUBATION_SYMBOLS] }, market: 'NASDAQ', interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] }, ts: { lte: now },
      },
      _max: { ts: true },
    });
    return completeUniverseAsOf(INCUBATION_SYMBOLS, rows);
  },
  async evaluation(bookId, asOf) {
    return prisma.bookEvaluation.findFirst({
      where: { bookId, asOf: { lte: dayStart(asOf) } }, orderBy: { asOf: 'desc' },
      select: { nav: true, dailyPnl: true, drawdown: true, trackingError: true, benched: true, requiresRevalidation: true },
    });
  },
  async shariaState(book, asOf) {
    return (await buildShariaRunSnapshot(book.universe, 'NASDAQ', { asOf })).state;
  },
  async persistAllocation(asOf, result, cash) {
    const bookCash = Object.fromEntries(Object.entries(result.allocations).map(([bookId, weight]) => [
      bookId, cash.mul(weight).toString(),
    ]));
    const data = {
      asOf: dayStart(asOf), windowDays: result.priorWeightDays, seed: result.seed,
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      inputs: { label: INCUBATION_LABEL, availableCash: cash.toString(), bookCash },
      scores: Object.fromEntries(result.modes.map(mode => [mode.modeId, mode.score])),
      allocations: result.allocations,
      benched: result.modes.filter(mode => mode.allocation === '0').map(mode => mode.modeId),
      reason: result.reason,
    };
    const persisted = await prisma.allocationDecision.upsert({
      where: { asOf: dayStart(asOf) }, create: data, update: {}, select: { allocations: true },
    });
    return validatedAllocationMap(persisted.allocations);
  },
  async claim(bookId, asOf, claimedAt) {
    const key = `incubation:${asOf.toISOString().slice(0, 10)}:${bookId}`;
    const create = async () => prisma.autoRunClaim.create({ data: { key }, select: { createdAt: true } });
    try {
      return (await create()).createdAt;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const staleBefore = new Date(claimedAt.getTime() - CLAIM_LEASE_MS);
    const recovered = await prisma.autoRunClaim.deleteMany({ where: { key, createdAt: { lt: staleBefore } } });
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
      where: { key: `incubation:${asOf.toISOString().slice(0, 10)}:${bookId}`, createdAt: lease },
    });
  },
  simulate: simulateIncubationBook,
  async wasEntriesFrozen(bookId, asOf) {
    const row = await prisma.allocationDecision.findFirst({
      where: { asOf: dayStart(asOf) }, select: { benched: true },
    });
    // `benched` already carries every bookId whose fresh allocation was zeroed that day
    // (security gate 2026-07-19 round 2, MED): this IS the entriesFrozen flag, round-tripped
    // through the existing AllocationDecision record rather than a duplicate column.
    return Boolean(row?.benched.includes(bookId));
  },
  async verifyLedger(book, ownerUserId, simulation, asOf) {
    const strategy = await ensureStrategy(book, ownerUserId);
    const activeDay = dayStart(asOf).getTime();
    const rawExpectedPrior = [...simulation.daily]
      .filter(point => dayStart(point.ts).getTime() < activeDay)
      .at(-1) ?? null;
    if (!rawExpectedPrior) return;
    const priorWasFrozen = await defaultDependencies.wasEntriesFrozen(book.bookId, rawExpectedPrior.ts);
    // A historically frozen day cannot be reproduced by a raw replay (which re-simulates the
    // suppressed entries): reconstruct it in the same exit-only mode it was persisted in
    // (security gate 2026-07-19 round 2, MED) instead of comparing against the raw point.
    const expectedPrior = priorWasFrozen
      ? frozenPointForDay(simulation, rawExpectedPrior.ts).point
      : rawExpectedPrior;
    if (!expectedPrior) return;
    const prior = await prisma.portfolioSnapshot.findFirst({
      where: { strategyId: strategy.id, asOf: { lt: dayStart(asOf) } },
      orderBy: { asOf: 'desc' },
      select: { asOf: true, cashVirtual: true, nav: true, positions: true },
    });
    if (
      !prior
      || dayStart(prior.asOf).getTime() !== dayStart(expectedPrior.ts).getTime()
      || !persistedLedgerMatches(prior, expectedPrior)
    ) {
      throw new Error(`Incubation ledger replay drift for ${book.bookId}; explicit reallocation/revalidation required`);
    }
  },
  async persistLedger(book, ownerUserId, simulation, asOf) {
    const point = pointForDay(simulation, asOf);
    if (!point) throw new Error(`Incubation simulation has no close ledger for ${book.bookId}`);
    const strategy = await ensureStrategy(book, ownerUserId);
    const snapshotId = `incubation:${strategy.id}:${dayStart(asOf).toISOString().slice(0, 10)}`;
    await prisma.portfolioSnapshot.upsert({
      where: { id: snapshotId },
      create: {
        id: snapshotId,
        strategyId: strategy.id, userId: ownerUserId, asOf: dayStart(asOf),
        cashVirtual: point.cash, currency: 'USD', positions: ledgerPositions(point), nav: point.nav,
      },
      update: {
        cashVirtual: point.cash, positions: ledgerPositions(point), nav: point.nav,
      },
    });
  },
  execute: executeIncubationOrder,
};

/** One bounded signed-cron pass over the exact four QDR-8 books; no worker, queue, or LLM. */
export async function runDailyIncubationBooks(
  now: Date = new Date(),
  overrides: Partial<IncubationDependencies> = {},
): Promise<IncubationRunResult> {
  const deps = { ...defaultDependencies, ...overrides };
  if (await deps.halted()) {
    return { processed: false, asOf: null, claimed: 0, executed: 0, label: INCUBATION_LABEL, allocations: {}, reason: 'halted' };
  }
  const ownerUserId = process.env.QUANT_INCUBATION_OWNER_USER_ID;
  if (!ownerUserId) {
    return { processed: false, asOf: null, claimed: 0, executed: 0, label: INCUBATION_LABEL, allocations: {}, reason: 'owner_not_configured' };
  }
  const asOf = await deps.latestAsOf(now);
  if (!asOf || asOf < INCUBATION_START) {
    return { processed: false, asOf: asOf?.toISOString() ?? null, claimed: 0, executed: 0, label: INCUBATION_LABEL, allocations: {}, reason: 'no_incubation_market_day' };
  }
  const rawCash = await deps.availableCash(ownerUserId);
  const cash = rawCash.gt(0) ? rawCash : ZERO;
  const states = await Promise.all(INCUBATION_BOOKS.map(async book => {
    const [evaluation, shariaState] = await Promise.all([
      deps.evaluation(book.bookId, asOf), deps.shariaState(book, asOf),
    ]);
    return { book, evaluation, shariaState };
  }));
  const allocation = allocateTournamentCapital({
    seed: INCUBATION_SEED,
    modes: states.map(({ book, evaluation, shariaState }) => allocatorMode(book, evaluation, shariaState)),
  });
  const allocations = await deps.persistAllocation(asOf, allocation, cash);

  let claimed = 0;
  let executed = 0;
  const errors: Record<string, string> = {};
  for (const { book } of states) {
    const lease = await deps.claim(book.bookId, asOf, now);
    if (!lease) continue;
    claimed += 1;
    try {
      // QDR-8 clarified 2026-07-19d: the −3%/day breaker/bench halts NEW ENTRIES only.
      // A zeroed fresh allocation must not also freeze exits of an already-open position.
      const freshBookCash = cash.mul(allocations[book.bookId] ?? '0');
      const entriesAllowed = freshBookCash.gt(0);
      const bookCash = entriesAllowed ? freshBookCash : await deps.priorBookCash(book.bookId, asOf);
      if (!bookCash.gt(0)) continue;
      const rawSimulation = await deps.simulate(book, bookCash, asOf);
      await deps.verifyLedger(book, ownerUserId, rawSimulation, asOf);
      // MED (security gate 2026-07-19): when entries are frozen, the book of record itself
      // (persisted ledger) must reflect exit-only outcomes — not just which orders execute.
      const { orders, simulation } = entriesAllowed
        ? { orders: rawSimulation.orders, simulation: rawSimulation }
        : freezeEntries(rawSimulation, asOf);
      for (const order of orders) {
        if (await deps.halted()) {
          await deps.releaseClaim(book.bookId, asOf, lease);
          claimed -= 1;
          return {
            processed: claimed > 0, asOf: asOf.toISOString(), claimed, executed,
            label: INCUBATION_LABEL, allocations, reason: 'halted',
            ...(Object.keys(errors).length ? { errors } : {}),
          };
        }
        if (await deps.execute(book, ownerUserId, order)) executed += 1;
      }
      await deps.persistLedger(book, ownerUserId, simulation, asOf);
    } catch (error) {
      // Per-book failure containment (security gate 2026-07-19 MED#3): release this book's
      // claim/lease so it can retry next pass, record the error, and let the remaining books
      // in this pass run to completion instead of aborting the whole batch.
      await deps.releaseClaim(book.bookId, asOf, lease);
      claimed -= 1;
      errors[book.bookId] = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    processed: claimed > 0, asOf: asOf.toISOString(), claimed, executed,
    label: INCUBATION_LABEL, allocations,
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}
