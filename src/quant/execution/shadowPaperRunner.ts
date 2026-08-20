// Rushd Quant — M17/DR-11 bounded shadow-paper runner (QUANT_DESIGN.md M17, QDR-8
// operational-mirror amendment, 2026-08-16). Builds and durably records ONE bounded probe
// order against the exact Alpaca paper host for a frozen QDR-8 charter version — but this
// module transmits NOTHING unless every gate below passes AND dryRun=false AND the
// security-auditor gate flag is set. As of this dispatch, the security-auditor gate is not
// set anywhere in this repo/environment, so step 12 (the only network-mutating line in this
// file) is unreachable in practice.
//
// Layering note: this imports INCUBATION_BOOKS (read-only) from ../automation/incubationBooks
// rather than duplicating the frozen charter list, so there is exactly one source of truth for
// "which four QDR-8 versions" — duplicating it here would risk silent drift from the charter.
//
// Gate order an order must pass before transmission (each step throws/returns a blocked result
// and writes nothing further on failure):
//   1. Charter check       — bookId is one of the four frozen QDR-8 INCUBATION_BOOKS versions.
//   2. Universe check      — symbol belongs to that book's declared universe (NASDAQ, long-only).
//   3. Kill switch (start) — isHalted(), fail-closed on a DB error (never mistaken for "not halted").
//   4. Sharia STRICT gate  — evaluateShariaGate(..., 'strict'); a BUY on a non-VERIFIED_COMPLIANT
//                             name is refused (SELL/HOLD always pass, per gateAllowsAction).
//   5. Broker construction — selectShadowPaperBroker(): mutation flag, exact paper host, real keys.
//   6. Read-only preflight snapshot — one live GET of account/positions/open-orders.
//   6a. Account identity   — snapshot.account.id must equal the env-declared
//                             QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID, checked independently of (6b)
//                             below — a clean-but-WRONG account must never pass on cleanliness
//                             alone. An absent expected-id env var refuses outright (fails closed).
//   6b. Preflight evaluate — evaluateAlpacaPaperPreflight(): ACTIVE/USD/not-blocked, no unreconciled
//                             positions or shorts, no open orders, cash >= run cap.
//   6c. Short guard         — a SELL is refused unless verifiedHeldQty(), read from the broker's OWN
//                             preflight position snapshot above (never a caller argument), shows a
//                             genuinely held long qty for the symbol; fails closed on ambiguous data.
//   7. Per-order cash cap  — order notional (qty * caller's --ref-price) <= USD 100, read from
//                             account.cash only — never buying_power (grep-provable: this file
//                             never reads a `buyingPower`/`buying_power` field). Preflight (6b)
//                             already proved account.cash >= the USD 500 run cap, so a single
//                             <=100 order can never exceed available cash by construction. The
//                             requested qty is also re-checked against 6c's verified held qty here.
//   7a. Fresh-quote cap check — (7) is self-referential (qty was itself derived from --ref-price);
//                             re-price the SAME qty against a live quote and re-check the cap, so a
//                             stale/fat-fingered --ref-price cannot smuggle an over-cap order past (7).
//   7c. Limit price          — bound the fill price around the fresh quote (BUY: +0.5% ceiling,
//                             SELL: -0.5% floor) instead of a bare market order; re-check the cash
//                             cap against this worst-case price too.
//   7b. Run cash cap        — this run's already-REALIZED (filled) notional plus this order's
//                             request <= USD 500 gross per run, computed and enforced inside a
//                             Postgres row-locked transaction on the run (see step 8) so concurrent
//                             invocations of the SAME run cannot each pass against a stale total.
//   8. Durable claim        — idempotent ShadowPaperRun insert (unique key) followed by a row-locked
//                             ShadowPaperOrder insert (unique key); a retried/duplicated or
//                             concurrent attempt resolves to the SAME rows, never new/duplicate ones.
//   9. dryRun flag          — when true (the only mode this dispatch exercises), stop here and
//                             report exactly what WOULD be sent. A preview needs no security
//                             sign-off, because it structurally cannot transmit either way.
//  10. Kill switch (pre-submit) — isHalted() re-checked immediately before any submit.
//  11. Security gate        — QUANT_SHADOW_PAPER_SECURITY_GATE==='PASS' (the still-pending
//                             security-auditor sign-off); refuses even when dryRun=false.
//  12. broker.submitOrder   — the sole transmission point in this file. The run is marked SUBMITTED
//                             the instant the broker accepts (money has moved); reconciliation is
//                             attempted next, and a reconciliation failure moves the run to FAILED
//                             (with the broker ref preserved in evidence) rather than leaving it
//                             stuck at STARTED with no recoverable trail.
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Market, OrderSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { evaluateShariaGate, gateAllowsAction } from '../gates/sharia';
import { INCUBATION_BOOKS } from '../automation/incubationBooks';
import { isHalted } from '../automation/control';
import { selectShadowPaperBroker } from './registry';
import { validateOrderFill, type OrderResult } from './broker';
import {
  evaluateAlpacaPaperPreflight,
  ALPACA_PAPER_BASE_URL,
  // eslint-disable-next-line import/extensions
} from '../../../scripts/paper-preflight.mjs';

const D = Prisma.Decimal;
export const ORDER_CAP_USD = new D(100);
export const RUN_CAP_USD = new D(500);

export class ShadowPaperBlocked extends Error {
  constructor(
    public readonly gate: string,
    message: string,
  ) {
    super(message);
    this.name = 'ShadowPaperBlocked';
  }
}

export interface ShadowPaperProbeInput {
  bookId: string;
  strategyVersion: string;
  symbol: string;
  side: OrderSide;
  notionalUsd: Prisma.Decimal;
  refPrice: Prisma.Decimal;
  purpose: 'PROBE_CANCEL' | 'PROBE_FILL' | 'FLATTEN';
  asOf: Date;
  decisionId?: string;
  /** Only `true` is exercised by this dispatch. `false` still requires the pending security gate. */
  dryRun: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface ShadowPaperWouldSend {
  symbol: string;
  side: OrderSide;
  qty: string;
  type: 'limit';
  limitPrice: string;
  timeInForce: 'day';
  clientOrderId: string;
}

export interface ShadowPaperProbeResult {
  status: 'PREFLIGHT_BLOCKED' | 'GATE_BLOCKED' | 'DRY_RUN' | 'SUBMITTED' | 'FAILED';
  blocker?: string;
  runId?: string;
  orderId?: string;
  wouldSend?: ShadowPaperWouldSend;
}

/** Stable SHA-256 client-order id over (bookId, strategyVersion, asOf, decisionId, purpose). */
export function shadowClientOrderId(input: {
  bookId: string;
  strategyVersion: string;
  asOf: Date;
  decisionId: string;
  purpose: string;
}): string {
  const material = [input.bookId, input.strategyVersion, input.asOf.toISOString(), input.decisionId, input.purpose].join('|');
  return `rushd-shadow-${createHash('sha256').update(material).digest('hex')}`;
}

/** One-way, non-secret account fingerprint — never the raw account id/number/credentials. */
export function accountFingerprint(accountRawId: string): string {
  return `acct_${createHash('sha256').update(accountRawId).digest('hex').slice(0, 32)}`;
}

/**
 * The broker's OWN reported held LONG quantity for `symbol`, read from the raw preflight
 * position snapshot — never from anything the caller supplies. This is the sole source of truth
 * a SELL is checked against (see step 6c). Fails closed (throws) on anything ambiguous or
 * malformed rather than guessing, because a wrong answer here is a naked short: zero/no matching
 * row is NOT an error (it just means "nothing held", returned as 0), but a duplicate row, a
 * non-long side, or an unparseable/negative qty all refuse outright.
 */
export function verifiedHeldQty(positions: unknown[], symbol: string): Prisma.Decimal {
  const rows = (positions as Record<string, unknown>[]).filter((p) => String(p?.symbol ?? '') === symbol);
  if (rows.length === 0) return new D(0);
  if (rows.length > 1) throw new Error(`ambiguous broker position data for ${symbol}: ${rows.length} rows`);
  const [row] = rows;
  const side = String(row?.side ?? '').toLowerCase();
  if (side !== 'long') throw new Error(`unexpected non-long broker position side for ${symbol}: ${side || 'unknown'}`);
  let qty: Prisma.Decimal;
  try {
    qty = new D(String(row?.qty ?? ''));
  } catch {
    throw new Error(`unparseable broker qty for ${symbol}`);
  }
  if (!qty.isFinite() || qty.isNegative()) throw new Error(`invalid broker qty for ${symbol}`);
  return qty;
}

async function killSwitchEngaged(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    return await isHalted(env as Record<string, string | undefined>);
  } catch {
    // Fail closed: a DB-unreachable control row must never be mistaken for "not halted".
    return true;
  }
}

/**
 * Reconcile a broker-reported fill back to its durable ShadowPaperOrder by clientOrderId.
 * An "orphan" — a broker order id we have no ShadowPaperOrder row for — is never assumed ours:
 * it throws instead of guessing, so the caller cannot silently cancel/flatten a position it does
 * not have a durable claim on. A human resolves an orphan; this function only detects one.
 */
export async function reconcileShadowPaperOrder(clientOrderId: string, fill: OrderResult): Promise<void> {
  const order = await prisma.shadowPaperOrder.findUnique({ where: { clientOrderId } });
  if (!order) {
    throw new ShadowPaperBlocked(
      'orphan_broker_order',
      `Broker order ${fill.brokerRef} (clientOrderId ${clientOrderId}) has no matching ShadowPaperOrder row`,
    );
  }
  validateOrderFill(fill, order.qty);
  await prisma.shadowPaperOrder.update({
    where: { clientOrderId },
    data: { brokerRef: fill.brokerRef, filledQty: fill.filledQty, avgFillPrice: fill.avgFillPrice, status: fill.status },
  });
}

export async function runShadowPaperProbe(input: ShadowPaperProbeInput): Promise<ShadowPaperProbeResult> {
  const env = input.env ?? process.env;

  // 1. Charter check — only the four frozen QDR-8 versions may ever reach a broker call.
  const book = INCUBATION_BOOKS.find((b) => b.bookId === input.bookId);
  if (!book) return { status: 'GATE_BLOCKED', blocker: 'not_a_charter_book' };

  // 2. Universe / long-only check.
  if (!book.universe.includes(input.symbol)) {
    return { status: 'GATE_BLOCKED', blocker: 'symbol_outside_book_universe' };
  }

  // 3. Kill switch, checked at run start.
  if (await killSwitchEngaged(env)) return { status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged' };

  // 4. Sharia STRICT gate.
  const shariaGate = await evaluateShariaGate(input.symbol, 'NASDAQ' as Market, undefined, 'strict');
  if (!gateAllowsAction(shariaGate, input.side === 'BUY' ? 'BUY' : 'SELL')) {
    return { status: 'GATE_BLOCKED', blocker: `sharia_veto:${shariaGate.reason}` };
  }

  // 5. Broker construction — mutation flag, exact host, real keys, all-or-nothing.
  let broker;
  try {
    broker = selectShadowPaperBroker(env);
  } catch (e) {
    return { status: 'GATE_BLOCKED', blocker: `broker_construction:${(e as Error).message}` };
  }

  // 6. Read-only preflight snapshot against the live account.
  const snapshot = await broker.getPreflightSnapshot();
  const actualAccountId = String((snapshot.account as Record<string, unknown>).id ?? '');

  // 6a. Account identity — independent of (6b)'s dirty-state checks below: a legacy/wrong account
  // that happens to be clean must never pass on cleanliness alone. Fails closed when the allowlist
  // env var itself is absent (an unset expected-id is never treated as "any account is fine").
  const expectedAccountId = env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID;
  if (!expectedAccountId) {
    return { status: 'GATE_BLOCKED', blocker: 'expected_account_id_not_configured' };
  }
  if (actualAccountId !== expectedAccountId) {
    return { status: 'GATE_BLOCKED', blocker: 'account_identity_mismatch' };
  }

  // 6b. Dirty-state preflight.
  const preflight = evaluateAlpacaPaperPreflight({
    baseUrl: ALPACA_PAPER_BASE_URL,
    account: snapshot.account,
    positions: snapshot.positions,
    openOrders: snapshot.openOrders,
    runCap: RUN_CAP_USD.toString(),
  });
  if (!preflight.ready) return { status: 'PREFLIGHT_BLOCKED', blocker: preflight.blockers.join(',') };

  // 6c. Short guard (CRITICAL finding) — a SELL is refused unless the broker's OWN position
  // snapshot (fetched at step 6 above, never an argument the caller supplies) shows a genuinely
  // held long qty for this symbol. This is independent of (6b)'s blanket dirty-state block, so it
  // stays correct even if that check's scope ever changes — defense in depth, not a duplicate.
  // Fails closed: any ambiguous/malformed broker position data refuses rather than guessing.
  let heldQty: Prisma.Decimal | null = null;
  if (input.side === 'SELL') {
    try {
      heldQty = verifiedHeldQty(snapshot.positions as unknown[], input.symbol);
    } catch (e) {
      return { status: 'GATE_BLOCKED', blocker: `held_qty_unverifiable:${(e as Error).message}` };
    }
    if (!heldQty.gt(0)) {
      return { status: 'GATE_BLOCKED', blocker: 'sell_without_held_position' };
    }
  }

  // 7. Per-order cash cap — cash only, never buying_power (this file never reads `buyingPower`/
  // `buying_power`; grep-provable). Note: preflight above already required
  // account.cash >= RUN_CAP_USD, and every order sized here is <= ORDER_CAP_USD <= RUN_CAP_USD,
  // so a single order can never exceed available account cash by construction.
  const qty = input.notionalUsd.div(input.refPrice).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
  const orderNotional = qty.mul(input.refPrice);
  if (orderNotional.gt(ORDER_CAP_USD)) return { status: 'GATE_BLOCKED', blocker: 'order_exceeds_cash_cap' };

  // 6c (continued) — the requested qty itself must not exceed the verified held qty above.
  if (input.side === 'SELL' && qty.gt(heldQty as Prisma.Decimal)) {
    return { status: 'GATE_BLOCKED', blocker: 'sell_exceeds_held_position' };
  }

  // 7a. Fresh-quote verification — (7) is self-referential (qty was derived FROM --ref-price), so
  // a stale/fat-fingered --ref-price far below the real price still passes it while the REAL fill
  // notional would not. Re-price the SAME qty against a live quote and re-check the cap; refuse
  // before any durable claim or transmission if it would now exceed it.
  let freshQuote: Prisma.Decimal;
  try {
    freshQuote = await broker.getLatestQuote(input.symbol);
  } catch (e) {
    return { status: 'GATE_BLOCKED', blocker: `fresh_quote_unavailable:${(e as Error).message}` };
  }
  if (qty.mul(freshQuote).gt(ORDER_CAP_USD)) {
    return { status: 'GATE_BLOCKED', blocker: 'order_exceeds_cash_cap_at_fresh_quote' };
  }

  // 7c. Limit price (MED finding) — bound the fill price around the fresh quote just fetched
  // instead of submitting a bare market order. BUY may pay at most 0.5% above the fresh quote;
  // SELL must receive at least 0.5% below it (symmetric with InternalSimBroker's own limitPrice
  // enforcement in internalSim.ts, and the 0.5% BUY band matches the security re-review's
  // recommended freshQuote*1.005). Re-check the cap against this worst-case price: it can exceed
  // (7a)'s fresh-quote check on a BUY, since limitPrice > freshQuote there.
  const limitPrice = input.side === 'BUY' ? freshQuote.mul('1.005') : freshQuote.mul('0.995');
  if (qty.mul(limitPrice).gt(ORDER_CAP_USD)) {
    return { status: 'GATE_BLOCKED', blocker: 'order_exceeds_cash_cap_at_limit_price' };
  }

  const decisionId = input.decisionId ?? `${input.bookId}:${input.asOf.toISOString()}:${input.purpose}`;
  const clientOrderId = shadowClientOrderId({
    bookId: input.bookId, strategyVersion: input.strategyVersion, asOf: input.asOf, decisionId, purpose: input.purpose,
  });
  const fingerprint = accountFingerprint(actualAccountId || decisionId);

  // 8. Durable, idempotent run claim — insert-or-reuse on its unique key.
  const runKey = {
    bookId_strategyVersion_asOf_adapter: {
      bookId: input.bookId, strategyVersion: input.strategyVersion, asOf: input.asOf, adapter: 'ALPACA_PAPER' as const,
    },
  };
  let run = await prisma.shadowPaperRun.findUnique({ where: runKey });
  if (!run) {
    try {
      run = await prisma.shadowPaperRun.create({
        data: {
          bookId: input.bookId,
          strategyVersion: input.strategyVersion,
          asOf: input.asOf,
          adapter: 'ALPACA_PAPER',
          accountFingerprint: fingerprint,
          preflight: preflight as unknown as Prisma.InputJsonValue,
          status: 'STARTED',
          requestedNotional: orderNotional,
          evidence: {} as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      run = await prisma.shadowPaperRun.findUnique({ where: runKey });
      if (!run) throw new ShadowPaperBlocked('run_claim_lost', 'ShadowPaperRun claim could not be recovered');
    }
  }

  // 7b/8. Cumulative USD 500 gross-per-run cash cap PLUS the order claim, atomically: a Postgres
  // row lock (`SELECT ... FOR UPDATE`) on this run's own row serializes concurrent invocations of
  // the SAME run, so two concurrent processes can never both read a stale (pre-write) REALIZED
  // total and jointly clear the cap — the second one always observes the first's committed order.
  let order: Awaited<ReturnType<typeof prisma.shadowPaperOrder.findUnique>>;
  try {
    order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ShadowPaperRun" WHERE id = ${run!.id} FOR UPDATE`;

      const alreadyClaimed = await tx.shadowPaperOrder.findUnique({ where: { clientOrderId } });
      if (alreadyClaimed) return alreadyClaimed;

      // Sums this run's already-REALIZED (filled) notional (qty * the broker's own avgFillPrice;
      // still cash, never buying_power) plus this new order's request. A pending/unfilled prior
      // order contributes $0 — its own request was already checked against this ceiling when created.
      const priorOrders = await tx.shadowPaperOrder.findMany({ where: { runId: run!.id } });
      const priorSpend = priorOrders.reduce((sum: Prisma.Decimal, o) => sum.plus(o.qty.mul(o.avgFillPrice)), new D(0));
      if (priorSpend.plus(orderNotional).gt(RUN_CAP_USD)) {
        throw new ShadowPaperBlocked('run_exceeds_cash_cap', 'Cumulative run spend would exceed the USD 500 run cap');
      }

      return tx.shadowPaperOrder.create({
        data: { runId: run!.id, decisionId, clientOrderId, symbol: input.symbol, side: input.side, qty, purpose: input.purpose },
      });
    });
  } catch (e) {
    if (e instanceof ShadowPaperBlocked && e.gate === 'run_exceeds_cash_cap') {
      return { status: 'GATE_BLOCKED', blocker: 'run_exceeds_cash_cap', runId: run.id };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      order = await prisma.shadowPaperOrder.findUnique({ where: { clientOrderId } });
      if (!order) throw new ShadowPaperBlocked('order_claim_lost', 'ShadowPaperOrder claim could not be recovered');
    } else {
      throw e;
    }
  }

  const wouldSend: ShadowPaperWouldSend = {
    symbol: input.symbol, side: input.side, qty: qty.toString(), type: 'limit', limitPrice: limitPrice.toString(), timeInForce: 'day', clientOrderId,
  };

  // Already durably terminal (a prior attempt already submitted/filled/closed this exact
  // client-order id): never re-submit — this IS the idempotency guarantee at the transmit edge.
  if (order.brokerRef || order.status === 'FILLED' || order.status === 'CANCELLED' || order.status === 'REJECTED') {
    return { status: 'SUBMITTED', runId: run.id, orderId: order.id, wouldSend };
  }

  // 9. Dry-run stop — the only mode this dispatch exercises. A preview never needs the still-
  // pending security-auditor sign-off (it cannot transmit regardless), so it stops here, before
  // gates 10/11 below, which exist ONLY to protect the literal network call in gate 12.
  if (input.dryRun) {
    await prisma.shadowPaperRun.update({
      where: { id: run.id },
      data: { status: 'DRY_RUN', finishedAt: new Date(), evidence: { wouldSend } as unknown as Prisma.InputJsonValue },
    });
    return { status: 'DRY_RUN', runId: run.id, orderId: order.id, wouldSend };
  }

  // 10. Kill switch, re-checked immediately before every submit.
  if (await killSwitchEngaged(env)) {
    await prisma.shadowPaperRun.update({ where: { id: run.id }, data: { status: 'GATE_BLOCKED', finishedAt: new Date() } });
    return { status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged_pre_submit', runId: run.id, orderId: order.id, wouldSend };
  }

  // 11. Security-auditor gate — still pending as of this dispatch; refuses even with dryRun=false.
  if (env.QUANT_SHADOW_PAPER_SECURITY_GATE !== 'PASS') {
    await prisma.shadowPaperRun.update({ where: { id: run.id }, data: { status: 'GATE_BLOCKED', finishedAt: new Date() } });
    return { status: 'GATE_BLOCKED', blocker: 'security_gate_not_passed', runId: run.id, orderId: order.id, wouldSend };
  }

  // 12. The sole transmission point in this file. The instant the broker accepts, money has
  // moved — record that durably BEFORE attempting reconciliation, so a reconciliation failure
  // below can never strand the run at STARTED: it always lands on either SUBMITTED (success) or a
  // distinctly-flagged FAILED with the broker ref preserved for manual recovery (never silence).
  const fill = await broker.submitOrder({
    symbol: input.symbol, market: 'NASDAQ' as Market, side: input.side, qty, refPrice: input.refPrice, limitPrice, clientOrderId,
  });
  await prisma.shadowPaperRun.update({ where: { id: run.id }, data: { status: 'SUBMITTED', finishedAt: new Date() } });
  try {
    await reconcileShadowPaperOrder(clientOrderId, fill);
  } catch (e) {
    await prisma.shadowPaperRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        evidence: {
          wouldSend,
          reconciliationError: (e as Error).message,
          brokerRef: fill.brokerRef,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      status: 'FAILED', blocker: `post_accept_reconciliation_failed:${(e as Error).message}`, runId: run.id, orderId: order.id, wouldSend,
    };
  }
  return { status: 'SUBMITTED', runId: run.id, orderId: order.id, wouldSend };
}
