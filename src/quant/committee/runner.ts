// Rushd Quant — committee runner (QUANT_DESIGN.md §2.5, §4). One committee pass for a
// symbol: load the point-in-time context, derive portfolio + market state from the DB
// (never from the caller), collect the analyst signals, run the Portfolio Manager inside
// the deterministic envelope, and persist an auditable Decision + its AnalystSignalRecords
// in one transaction. It does NOT execute an order — that is executeDecision, after approval.
import { Prisma } from '@prisma/client';
import type { Market, DecisionMode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadPointInTimeContext } from '../data/pointInTime';
import { collectSignals } from './collect';
import { evaluateShariaGate } from '../gates/sharia';
import { runPortfolioManager } from './pm';
import type { PortfolioState, MarketState, RiskLimits } from '../risk/envelope';

const D = Prisma.Decimal;

const DEFAULT_LIMITS: RiskLimits = {
  maxNameWeight: 0.1,
  maxGrossExposure: 1.0,
  maxOpenPositions: 20,
  maxRiskPct: 0.02,
  volTargetPct: 0.01,
  liquidityAdvFraction: 0.05,
  drawdownHaltPct: 0.25,
};
const DEFAULT_CASH = new D(100_000);
const PATTERN_WINDOW_DAYS = 1200; // Pattern analyst needs ~1040 trading days

export interface RunPassInput {
  userId: string;
  symbol: string;
  market: Market;
  strategyId?: string;
  mode?: DecisionMode;
  asOf?: Date;
  limits?: RiskLimits;
  startingCashVirtual?: Prisma.Decimal;
}

const num = (x: Prisma.Decimal): number => Number(x.toString());

function atr(bars: { high: Prisma.Decimal; low: Prisma.Decimal; close: Prisma.Decimal }[], period = 14): Prisma.Decimal {
  if (bars.length < 2) return new D(0);
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = num(bars[i].high);
    const l = num(bars[i].low);
    const pc = num(bars[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const window = trs.slice(-period);
  const avg = window.reduce((s, v) => s + v, 0) / window.length;
  return new D(avg.toFixed(6));
}

function avgVolume(bars: { volume: Prisma.Decimal }[], n = 20): Prisma.Decimal {
  if (bars.length === 0) return new D(0);
  const w = bars.slice(-n);
  const avg = w.reduce((s, b) => s + num(b.volume), 0) / w.length;
  return new D(avg.toFixed(4));
}

/** Run a committee pass and persist the Decision (status PROPOSED) + its signals. */
export async function runCommitteePass(inp: RunPassInput): Promise<{ decisionId: string; finalAction: string }> {
  const asOf = inp.asOf ?? new Date();
  const limits = inp.limits ?? DEFAULT_LIMITS;
  const ctx = await loadPointInTimeContext({
    symbol: inp.symbol,
    market: inp.market,
    asOf,
    maxLookbackDays: PATTERN_WINDOW_DAYS,
  });

  // Portfolio state — derived from the DB, never from the caller. Virtual cash is the
  // authoritative User.cashVirtual (debited/credited by executeDecision), so equity does
  // not double-count spent cash.
  const [items, user, snap] = await Promise.all([
    prisma.portfolioItem.findMany({ where: { userId: inp.userId } }),
    prisma.user.findUnique({ where: { id: inp.userId } }),
    prisma.portfolioSnapshot.findFirst({ where: { userId: inp.userId }, orderBy: { asOf: 'desc' } }),
  ]);
  const cash = user?.cashVirtual ?? inp.startingCashVirtual ?? DEFAULT_CASH;

  // Latest close per held symbol in one query (distinct on symbol/market).
  const symbols = items.map((i) => i.symbol);
  const priceRows = symbols.length
    ? await prisma.marketBar.findMany({
        where: { symbol: { in: symbols }, market: inp.market },
        orderBy: { ts: 'desc' },
        distinct: ['symbol', 'market'],
      })
    : [];
  const priceMap = new Map(priceRows.map((r) => [r.symbol, r.close as Prisma.Decimal]));

  const positions = items.map((i) => ({
    symbol: i.symbol,
    qty: i.shares as Prisma.Decimal,
    price: priceMap.get(i.symbol) ?? new D(0),
  }));
  let equity = cash;
  for (const p of positions) equity = equity.plus(p.qty.mul(p.price));
  const peakEquity = snap?.nav && snap.nav.gt(equity) ? (snap.nav as Prisma.Decimal) : equity;
  const portfolio: PortfolioState = { equity, cash, positions, peakEquity };

  // Market state for the traded symbol from the PIT bars.
  const bars = ctx.bars(PATTERN_WINDOW_DAYS);
  const price = bars.length ? (bars[bars.length - 1].close as Prisma.Decimal) : new D(0);
  const a = atr(bars);
  const market: MarketState = {
    symbol: inp.symbol,
    price,
    atr: a,
    adv: avgVolume(bars),
    stopPrice: price.minus(a.mul(2)),
  };

  // Every Decision this runner persists is executable — either auto-executed (AUTO_PAPER)
  // or human-approved and then executed via /api/quant/execute (HUMAN_APPROVE). So the
  // Sharia gate here is ALWAYS strict, unconditionally on `mode`: a new DecisionMode that
  // forgets to branch here still gets the safe (strict) verdict, since there is no branch
  // to forget. Pure analysis/backtest paths that never persist a Decision (e.g.
  // backtest/engine.ts) call collectSignals directly and keep its permissive default.
  const result = await collectSignals(ctx, {
    gate: (symbol, market) => evaluateShariaGate(symbol, market, undefined, 'strict'),
  });
  const seed = Math.floor(asOf.getTime() / 1000);
  const pm = await runPortfolioManager({ result, portfolio, market, limits, killSwitch: false, seed });

  const gitSha = process.env.GIT_SHA ?? 'unknown';
  const decisionId = await prisma.$transaction(async (tx) => {
    const decision = await tx.decision.create({
      data: {
        strategyId: inp.strategyId ?? null,
        userId: inp.userId,
        symbol: inp.symbol,
        market: inp.market,
        asOf,
        proposedAction: pm.proposedAction,
        proposedQty: pm.proposedQty,
        finalAction: pm.finalAction,
        finalQty: pm.finalQty,
        shariaGate: result.shariaGate as unknown as Prisma.InputJsonValue,
        riskAdjustments: pm.adjustments as unknown as Prisma.InputJsonValue,
        debateTranscript: pm.debate as unknown as Prisma.InputJsonValue,
        pmModelId: pm.pmModelId ?? null,
        temperature: new D(0),
        seed,
        gitSha,
        mode: inp.mode ?? 'HUMAN_APPROVE',
        costCents: pm.costCents,
      },
    });
    if (result.signals.length) {
      await tx.analystSignalRecord.createMany({
        data: result.signals.map((s) => ({
          decisionId: decision.id,
          agent: s.agent,
          symbol: s.symbol,
          stance: s.stance,
          conviction: new D(s.conviction),
          horizonDays: s.horizonDays,
          rationaleEn: s.rationaleEn,
          rationaleAr: s.rationaleAr,
          evidence: s.evidence as unknown as Prisma.InputJsonValue,
          determinism: s.determinism,
          modelId: s.modelId ?? null,
          failureMode: s.failureMode,
          costCents: s.costCents,
        })),
      });
    }
    return decision.id;
  });

  return { decisionId, finalAction: pm.finalAction };
}
