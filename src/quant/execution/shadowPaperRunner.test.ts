import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

const h = vi.hoisted(() => ({
  isHalted: vi.fn(),
  evaluateShariaGate: vi.fn(),
  selectShadowPaperBroker: vi.fn(),
  runFindUnique: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  orderFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
  orderCreate: vi.fn(),
  orderUpdate: vi.fn(),
  queryRaw: vi.fn(),
  getPreflightSnapshot: vi.fn(),
  getLatestQuote: vi.fn(),
  submitOrder: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const model = {
    shadowPaperRun: { findUnique: h.runFindUnique, create: h.runCreate, update: h.runUpdate },
    shadowPaperOrder: { findUnique: h.orderFindUnique, findMany: h.orderFindMany, create: h.orderCreate, update: h.orderUpdate },
    $queryRaw: h.queryRaw,
  };
  return {
    prisma: {
      ...model,
      // Test double for a real Postgres row-locked transaction: just invokes the callback with
      // the same mocked model, so existing assertions against h.orderCreate/h.orderFindMany etc.
      // still observe calls made inside the transaction.
      $transaction: (fn: (tx: typeof model) => unknown) => fn(model),
    },
  };
});
vi.mock('../automation/control', () => ({ isHalted: h.isHalted }));
vi.mock('../gates/sharia', () => ({
  evaluateShariaGate: h.evaluateShariaGate,
  gateAllowsAction: (gate: { compliant: boolean }, action: string) =>
    gate.compliant || action === 'SELL' || action === 'HOLD',
}));
vi.mock('../automation/incubationBooks', () => ({
  INCUBATION_BOOKS: [
    { bookId: 'ts-momentum-halal-basket-v3', setupId: 'ts-momentum-halal-basket-v3', paramsVersion: 'v3', universe: ['AAPL', 'MSFT'] },
  ],
}));
vi.mock('./registry', () => ({ selectShadowPaperBroker: h.selectShadowPaperBroker }));

import { runShadowPaperProbe, shadowClientOrderId, reconcileShadowPaperOrder, ShadowPaperBlocked, ORDER_CAP_USD, RUN_CAP_USD } from './shadowPaperRunner';

const CLEAN_ACCOUNT = { id: 'acct-raw-id', status: 'ACTIVE', currency: 'USD', cash: '100000', buying_power: '999999999', trading_blocked: false };

function baseInput(overrides: Partial<Parameters<typeof runShadowPaperProbe>[0]> = {}) {
  return {
    bookId: 'ts-momentum-halal-basket-v3',
    strategyVersion: 'v3',
    symbol: 'AAPL',
    side: 'BUY' as const,
    notionalUsd: new D(50),
    refPrice: new D(100),
    purpose: 'PROBE_FILL' as const,
    asOf: new Date('2026-08-19T00:00:00.000Z'),
    dryRun: true,
    // Matches CLEAN_ACCOUNT.id below by default, so tests targeting a LATER gate don't have to
    // restate the account-identity env var; the dedicated identity tests override it explicitly.
    env: { QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID: 'acct-raw-id' } as any,
    ...overrides,
  };
}

function mockBroker(overrides: Partial<{ account: unknown; positions: unknown[]; openOrders: unknown[] }> = {}) {
  const broker = {
    kind: 'ALPACA_PAPER',
    getPreflightSnapshot: h.getPreflightSnapshot,
    getLatestQuote: h.getLatestQuote,
    submitOrder: h.submitOrder,
  };
  h.getPreflightSnapshot.mockResolvedValue({
    account: CLEAN_ACCOUNT, positions: [], openOrders: [], ...overrides,
  });
  h.selectShadowPaperBroker.mockReturnValue(broker);
  return broker;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isHalted.mockResolvedValue(false);
  h.evaluateShariaGate.mockResolvedValue({ compliant: true, reason: 'aaoifi_screen_pass', standard: 'AAOIFI', source: 'zoya' });
  h.runFindUnique.mockResolvedValue(null);
  h.orderFindUnique.mockResolvedValue(null);
  h.orderFindMany.mockResolvedValue([]);
  h.queryRaw.mockResolvedValue([]);
  h.runCreate.mockResolvedValue({ id: 'run-1', status: 'STARTED' });
  h.orderCreate.mockResolvedValue({ id: 'order-1', status: 'NEW', brokerRef: null, qty: new D(0.5) });
  // Matches baseInput's refPrice of 100 by default; the fresh-quote-mismatch test overrides this.
  h.getLatestQuote.mockResolvedValue(new D(100));
  mockBroker();
});

describe('runShadowPaperProbe — gate ordering and blocking', () => {
  it('blocks a non-charter book before touching the DB or broker', async () => {
    const result = await runShadowPaperProbe(baseInput({ bookId: 'not-a-real-book' }));
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'not_a_charter_book' });
    expect(h.isHalted).not.toHaveBeenCalled();
    expect(h.selectShadowPaperBroker).not.toHaveBeenCalled();
  });

  it('blocks a symbol outside the charter book universe', async () => {
    const result = await runShadowPaperProbe(baseInput({ symbol: 'TSLA' }));
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'symbol_outside_book_universe' });
    expect(h.selectShadowPaperBroker).not.toHaveBeenCalled();
  });

  it('kill switch blocks before any broker construction, and fails closed when the control row is unreachable', async () => {
    h.isHalted.mockResolvedValue(true);
    let result = await runShadowPaperProbe(baseInput());
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged' });
    expect(h.selectShadowPaperBroker).not.toHaveBeenCalled();

    h.isHalted.mockRejectedValue(new Error('DB unreachable'));
    result = await runShadowPaperProbe(baseInput());
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged' });
  });

  it('vetoes a BUY on a non-VERIFIED_COMPLIANT symbol', async () => {
    h.evaluateShariaGate.mockResolvedValue({ compliant: false, reason: 'unverified_source_fail_closed', standard: 'AAOIFI', source: 'none' });
    const result = await runShadowPaperProbe(baseInput());
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'sharia_veto:unverified_source_fail_closed' });
    expect(h.selectShadowPaperBroker).not.toHaveBeenCalled();
  });

  it('surfaces a broker-construction gate failure without writing any row', async () => {
    h.selectShadowPaperBroker.mockImplementation(() => {
      throw new Error('ALPACA_PAPER mutations are disabled (set QUANT_SHADOW_PAPER_MUTATIONS=1)');
    });
    const result = await runShadowPaperProbe(baseInput());
    expect((result as any).blocker).toContain('broker_construction:');
    expect(h.runCreate).not.toHaveBeenCalled();
  });

  it('blocks on the read-only preflight (dirty legacy-shaped account) and never claims a run', async () => {
    mockBroker({ account: { ...CLEAN_ACCOUNT, cash: '-82800.08' }, positions: [{ symbol: 'X', side: 'short', qty: '-2' }] });
    const result = await runShadowPaperProbe(baseInput());
    expect(result.status).toBe('PREFLIGHT_BLOCKED');
    expect((result as any).blocker).toContain('NON_POSITIVE_CASH');
    expect(h.runCreate).not.toHaveBeenCalled();
  });

  it('rejects an order exceeding the USD 100 per-order cash cap, reading cash and never buying_power', async () => {
    const result = await runShadowPaperProbe(baseInput({ notionalUsd: new D(150) }));
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'order_exceeds_cash_cap' });
    expect(ORDER_CAP_USD.toString()).toBe('100');
    expect(RUN_CAP_USD.toString()).toBe('500');
  });

  it('rejects an order once prior REALIZED spend in the same run would push the cumulative total past the USD 500 run cap', async () => {
    h.runFindUnique.mockResolvedValue({ id: 'run-1', status: 'STARTED' });
    h.orderFindMany.mockResolvedValue([
      { qty: new D(4), avgFillPrice: new D(100) }, // $400 already filled in this run
    ]);
    const result = await runShadowPaperProbe(baseInput({ notionalUsd: new D(100) })); // + $100 = $500, still ok
    expect(result.status).toBe('DRY_RUN');
    const callsAfterAllowedOrder = h.orderCreate.mock.calls.length;

    h.orderFindMany.mockResolvedValue([
      { qty: new D(4.5), avgFillPrice: new D(100) }, // $450 already filled in this run
    ]);
    const blocked = await runShadowPaperProbe(baseInput({ notionalUsd: new D(100) })); // + $100 > $500
    expect(blocked).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'run_exceeds_cash_cap' });
    expect(h.orderCreate.mock.calls.length).toBe(callsAfterAllowedOrder);
  });

  it('dry-run stops immediately before transmission and reports exactly what WOULD be sent', async () => {
    const result = await runShadowPaperProbe(baseInput());
    expect(result.status).toBe('DRY_RUN');
    expect(result.wouldSend).toEqual({
      symbol: 'AAPL', side: 'BUY', qty: '0.5', type: 'market', timeInForce: 'day',
      clientOrderId: expect.stringMatching(/^rushd-shadow-[0-9a-f]{64}$/),
    });
    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.runCreate).toHaveBeenCalledTimes(1);
    expect(h.orderCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses live transmission when the security-auditor gate flag is absent, even with dryRun=false', async () => {
    const result = await runShadowPaperProbe(baseInput({ dryRun: false }));
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'security_gate_not_passed' });
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('re-checks the kill switch immediately before submit even when the security gate passes', async () => {
    h.isHalted.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await runShadowPaperProbe(baseInput({
      dryRun: false,
      env: { QUANT_SHADOW_PAPER_SECURITY_GATE: 'PASS', QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID: 'acct-raw-id' } as any,
    }));
    expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged_pre_submit' });
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('is idempotent: a duplicate attempt (unique-constraint race) resolves to the same run/order, never a second broker call', async () => {
    // First call: claim succeeds normally.
    await runShadowPaperProbe(baseInput());
    expect(h.runCreate).toHaveBeenCalledTimes(1);

    // Second attempt for the identical logical order: create() races and loses (P2002); the
    // findUnique fallback returns the row created by the first attempt.
    h.runFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'run-1', status: 'STARTED' });
    h.runCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    h.orderFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'order-1', status: 'NEW', brokerRef: null, qty: new D(0.5) });
    h.orderCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));

    const second = await runShadowPaperProbe(baseInput());
    expect(second.orderId).toBe('order-1');
    expect(second.runId).toBe('run-1');
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('never re-submits an order that already has a terminal status/brokerRef', async () => {
    h.orderFindUnique.mockResolvedValue({ id: 'order-1', status: 'FILLED', brokerRef: 'alpaca-order-9', qty: new D(0.5) });
    const result = await runShadowPaperProbe(baseInput({
      dryRun: false,
      env: { QUANT_SHADOW_PAPER_SECURITY_GATE: 'PASS', QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID: 'acct-raw-id' } as any,
    }));
    expect(result.status).toBe('SUBMITTED');
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  describe('account identity pin (HIGH finding)', () => {
    it('refuses a snapshot whose account.id differs from the expected id, before any order path is reached', async () => {
      mockBroker({ account: { ...CLEAN_ACCOUNT, id: 'acct-LEGACY-dirty' } });
      const result = await runShadowPaperProbe(baseInput());
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'account_identity_mismatch' });
      expect(h.runCreate).not.toHaveBeenCalled();
      expect(h.orderCreate).not.toHaveBeenCalled();
      expect(h.submitOrder).not.toHaveBeenCalled();
    });

    it('fails closed when the expected-account env var itself is absent — never treated as "any account is fine"', async () => {
      const result = await runShadowPaperProbe(baseInput({ env: {} as any }));
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'expected_account_id_not_configured' });
      expect(h.runCreate).not.toHaveBeenCalled();
    });

    it('is checked independently of preflight dirty-state: a WRONG account is refused even if it would also be dirty', async () => {
      mockBroker({ account: { ...CLEAN_ACCOUNT, id: 'acct-LEGACY-dirty', cash: '-82800.08' } });
      const result = await runShadowPaperProbe(baseInput());
      // Identity is checked before the dirty-state evaluation, so the blocker is the identity
      // mismatch, not an incidental preflight blocker like NON_POSITIVE_CASH.
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'account_identity_mismatch' });
    });
  });

  describe('fresh-quote cap verification (MED finding)', () => {
    it('refuses an order whose REAL notional (at a fresh quote) would exceed the cap, even though the supplied --ref-price passes', async () => {
      // Caller supplies a stale/fat-fingered --ref-price of $10 for $50 notional -> qty=5.
      // The real live quote is $100/share -> real notional = $500, far over the $100 cap.
      h.getLatestQuote.mockResolvedValue(new D(100));
      const result = await runShadowPaperProbe(baseInput({ notionalUsd: new D(50), refPrice: new D(10) }));
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'order_exceeds_cash_cap_at_fresh_quote' });
      expect(h.runCreate).not.toHaveBeenCalled();
      expect(h.submitOrder).not.toHaveBeenCalled();
    });

    it('refuses closed when the fresh quote itself is unavailable', async () => {
      h.getLatestQuote.mockRejectedValue(new Error('Alpaca getLatestQuote failed: 503'));
      const result = await runShadowPaperProbe(baseInput());
      expect((result as any).blocker).toContain('fresh_quote_unavailable:');
      expect(h.runCreate).not.toHaveBeenCalled();
    });
  });

  describe('kill switch regression guard', () => {
    it('still blocks at start and still fails closed on a DB error', async () => {
      h.isHalted.mockResolvedValue(true);
      let result = await runShadowPaperProbe(baseInput());
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged' });

      h.isHalted.mockRejectedValue(new Error('DB unreachable'));
      result = await runShadowPaperProbe(baseInput());
      expect(result).toMatchObject({ status: 'GATE_BLOCKED', blocker: 'kill_switch_engaged' });
      expect(h.selectShadowPaperBroker).not.toHaveBeenCalled();
    });
  });

  describe('post-accept reconciliation failure (LOW finding)', () => {
    it('leaves the run at a distinctly-flagged FAILED state — never stuck at STARTED — with the broker ref preserved for recovery', async () => {
      h.orderFindUnique.mockResolvedValue({ id: 'order-1', status: 'NEW', brokerRef: null, qty: new D(0.5) });
      // Broker reports an invalid fill (over-filled vs. the requested qty) -> validateOrderFill throws.
      h.submitOrder.mockResolvedValue({ brokerRef: 'alpaca-order-bad', status: 'FILLED', filledQty: new D(999), avgFillPrice: new D(100) });
      const result = await runShadowPaperProbe(baseInput({
        dryRun: false,
        env: { QUANT_SHADOW_PAPER_SECURITY_GATE: 'PASS', QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID: 'acct-raw-id' } as any,
      }));
      expect(result.status).toBe('FAILED');
      expect((result as any).blocker).toContain('post_accept_reconciliation_failed:');
      // First update durably records SUBMITTED (broker already accepted); second flips to FAILED
      // with the broker ref preserved — never left at STARTED, never silently swallowed.
      expect(h.runUpdate.mock.calls[0][0]).toMatchObject({ data: { status: 'SUBMITTED' } });
      const failedCall = h.runUpdate.mock.calls[1][0];
      expect(failedCall.data.status).toBe('FAILED');
      expect(failedCall.data.evidence.brokerRef).toBe('alpaca-order-bad');
      expect(failedCall.data.evidence.reconciliationError).toBeTruthy();
    });
  });

  describe('concurrent-run cap serialization (LOW finding)', () => {
    it('row-locks the run before reading prior spend and creating the order, so concurrent invocations of the same run serialize', async () => {
      await runShadowPaperProbe(baseInput());
      expect(h.queryRaw).toHaveBeenCalledTimes(1);
      const lockCallArgs = h.queryRaw.mock.calls[0];
      // Tagged-template call: first arg is the strings array containing the FOR UPDATE lock SQL.
      expect(lockCallArgs[0].join('')).toContain('FOR UPDATE');
    });
  });
});

describe('shadowClientOrderId', () => {
  it('is stable for identical inputs and changes with any input field', () => {
    const base = { bookId: 'b', strategyVersion: 'v1', asOf: new Date('2026-01-01'), decisionId: 'd', purpose: 'PROBE_FILL' };
    expect(shadowClientOrderId(base)).toBe(shadowClientOrderId({ ...base }));
    expect(shadowClientOrderId(base)).not.toBe(shadowClientOrderId({ ...base, purpose: 'FLATTEN' }));
  });
});

describe('reconcileShadowPaperOrder', () => {
  it('matches a fill back to its ShadowPaperOrder by clientOrderId and updates it', async () => {
    h.orderFindUnique.mockResolvedValue({ id: 'order-1', qty: new D(1), status: 'NEW' });
    await reconcileShadowPaperOrder('cid-1', { brokerRef: 'b-1', status: 'FILLED', filledQty: new D(1), avgFillPrice: new D(100) });
    expect(h.orderUpdate).toHaveBeenCalledWith({
      where: { clientOrderId: 'cid-1' },
      data: { brokerRef: 'b-1', filledQty: new D(1), avgFillPrice: new D(100), status: 'FILLED' },
    });
  });

  it('treats a broker order with no matching ShadowPaperOrder as an orphan and refuses to reconcile it', async () => {
    h.orderFindUnique.mockResolvedValue(null);
    await expect(
      reconcileShadowPaperOrder('cid-unknown', { brokerRef: 'b-2', status: 'FILLED', filledQty: new D(1), avgFillPrice: new D(100) }),
    ).rejects.toThrow(ShadowPaperBlocked);
    expect(h.orderUpdate).not.toHaveBeenCalled();
  });
});
