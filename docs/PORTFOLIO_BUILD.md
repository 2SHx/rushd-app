# Rushd Quant — Automated Halal Index-Beating Portfolio (Build Spec)

> **For the implementing model (Gemini / Antigravity) and any future session.** This is the
> **single active track**. Self-contained: read this + `docs/QUANT_DESIGN.md` (contract) +
> `docs/JOURNAL.md` (log). Build **P0→P7 in order**, **commit + JOURNAL per milestone** so any
> model resumes cold. Trust disk over journal claims; verify a file exists before citing it.
> Full plan of record: `/Users/mac/.claude/plans/use-this-app-to-valiant-taco.md`.

## The goal
**Automated agents that outperform the best indexes while investing ONLY in halal stocks.** Paper-first.

- **Scope:** US-first via **Alpaca** (real data + real paper execution + broadest halal universe).
- **Benchmarks (strictest bar — must satisfy BOTH):** beat a **Sharia-compliant index** on
  risk-adjusted return (information ratio, net of costs, out-of-sample) **AND** stay competitive with
  the **headline S&P 500**. Real tradable Alpaca ETFs: **SPUS / HLAL** (Sharia) + **SPY** (headline).
- **Dollar target = $1,000/day (stretch, honest):** dollars = capital × return; **halal forbids riba
  leverage**, so it's capital-bound (~$252k/yr ≈ 10%/yr on ~$2.5M, 25%/yr on ~$1M). Engineer the real
  thing — **alpha vs both benchmarks** — and surface a "$/day run-rate + capital-needed" readout.
  Never promise it.
- **Strategy style:** **diversified halal factor core** — 20–40 names, quality+momentum+value tilts,
  **monthly** rebalance, tight tracking error. Concentrated weekly satellite = **P7, only after P3
  proves OOS alpha**.

## Honest framing (non-negotiable)
Beating both a Sharia index AND the S&P net of costs OOS is genuinely hard (>90% of active strategies
fail live). The integrity gates below exist to prevent backtest theater. The deliverable is a **live
paper track record** as proof; real money stays behind the CMA/licensing gate.

## Cost minimization (HARD CONSTRAINT)
1. LLM analysts on the **free model matrix only** (`gpt-oss-20b:free` / `nemotron-3-super-120b:free`,
   capped tokens, temp 0 — see `src/quant/llm/models.ts`). No paid models.
2. **Deterministic-first:** optimizer, risk envelope, purification, benchmark math, cross-sectional
   scoring are **pure TS, zero LLM calls**. LLM only for PM narration + optional debate, **capped at a
   few calls per rebalance**, never per name.
3. **Batch + cache** universe screening and benchmark bars (12h TTL already built).
4. **Cheap cadence:** monthly core ⇒ ~12 LLM-touched passes/yr, not daily.

## The capability gap (why this is real work, verified in code)
The engine today is **single-symbol + absolute-return**; the goal needs **cross-sectional +
portfolio-vs-benchmark + halal-universe**:

| Need | Today |
|---|---|
| Portfolio allocation across a universe | `committee/pm.ts` decides ONE symbol |
| Beat-the-index measurement | `backtest/metrics.ts` = absolute CAGR/Sharpe/DD, **no alpha/IR/benchmark** |
| Halal *universe* to pick from | `gates/sharia.ts` is a per-name **veto**, not a maintained set |
| Benchmark data | none ingested |
| Cross-sectional backtest | `backtest/engine.ts` = "event-driven, **single-symbol**" |
| Automated rebalance to weights | `automation/autoRun.ts` = per-symbol, not to a portfolio target |
| Data breadth | ~2 symbols (MSFT/NVDA) — need the whole halal universe |

## Purification (التطهير) — halal-return integrity (first-class)
Compute the **purification amount (مبلغ التطهير)** owed to charity from profit, **per stock and per
trade**, aggregate an exact portfolio total.
- **Ratio (نسبة التطهير):** reuse `ShariaVerdict.ratios.nonCompliantIncomeToIncome` +
  `MarketData.purificationRatioBps` (real Zoya when keyed; AAOIFI estimate otherwise). Each
  halal-universe name carries its ratio.
- **Per trade:** on a realized-profit SELL (+ dividends), `amount = max(0, realizedProfit) × ratio`,
  computed inside the execution `$transaction`.
- **Ledger:** `Prisma.Decimal`, transactional, **audited** (`Transaction` row) — a new
  `PurificationEntry` model (or a `purificationAmount` column on `Transaction`) + a running portfolio
  total shown in P6.
- **Gate:** the scholarly basis (realized-gains vs dividends-only vs both) **defaults to profit-based**
  and MUST pass **i18n-fintech-expert** review (money-mechanics rule). Arabic labels: **نسبة التطهير**
  (ratio) · **مبلغ التطهير** (amount).

## Roadmap — build P0→P7 in order

- **P0 — Benchmarks + broad data** (owner: `data-engineer`). Ingest SPY + SPUS/HLAL series + daily
  bars for the halal universe; point-in-time benchmark NAV series. *Exit:* both benchmark curves
  queryable ≤-asof (no look-ahead test); keyless mock-safe.
- **P1 — Halal universe builder (+ purification ratios)** (owner: `backend-expert`; Sharia review:
  `i18n-fintech-expert`). Elevate `gates/sharia.ts` + `registry.getScreener()` to a **maintained US
  halal investable universe**, each name carrying its نسبة التطهير. *Exit:* fresh auditable halal set
  of N names with ratios; fail-closed on screener error; keyless mock-safe.
- **P2 — Cross-sectional scoring + portfolio construction** (owner: `quant-strategist`). Analysts
  score the universe → ranks → **deterministic optimizer → target weights vs benchmark**
  (exposure/concentration/turnover caps, Sharia-constrained). *Exit:* emit a target halal portfolio
  with weights + full contributor trace.
- **P3 — Benchmark-relative backtest (THE PROOF)** (owner: `quant-strategist`). Cross-sectional
  walk-forward backtester (cost+slippage+ADV) → **alpha, IR, tracking error, up/down capture vs BOTH
  benchmarks + deflated Sharpe + ≥20–30% OOS reserve**; look-ahead guard. *Exit:* OOS equity curve vs
  both indexes; a look-ahead-injection test **fails** the run. **"Beats the index" = IR>0 vs the
  Sharia index AND competitive vs SPY, out-of-sample.**
- **P4 — Rebalancer + paper execution (+ purification ledger)** (owner: `backend-expert`; gate:
  `security-auditor`). diff current→target weights → `Decision`s → `executeDecision` (Alpaca paper);
  write `PortfolioSnapshot` NAV; write per-trade مبلغ التطهير in the same transaction. *Exit:* a
  rebalance places real Alpaca paper orders, records NAV vs benchmark, and a realized-gain SELL writes
  a purification entry = profit × ratio; keyless path uses internal sim.
- **P5 — Automation loop** (owner: `backend-expert`; gate: `security-auditor`). Extend `autoRun` to a
  **portfolio rebalance on cadence** (monthly), race-safe `AutoRunClaim`, kill-switch + drawdown
  breaker. *Exit:* cron rebalances idempotently per period; tripping the breaker halts trading (test).
- **P6 — Performance-reporting UI** (owner: **Gemini**, per `docs/UI_BUILD_MARKETS.md` patterns).
  NAV vs both indexes, alpha/IR, **$/day run-rate vs $1,000/day** (+ capital-needed), running
  **مبلغ التطهير** total, holdings + per-name committee rationale. *Exit:* user watches the live paper
  halal portfolio track vs the indexes.
- **P7 — Satellite alpha sleeve (optional, gated)** (owner: `quant-strategist`). Concentrated weekly
  sleeve, **enabled only after P3 OOS alpha proven**; tier + risk-capped.

## Reuse (verified on disk — do NOT reinvent)
- `prisma/schema.prisma`: **`Strategy.config` (Json)** = portfolio config (universe, benchmarks,
  cadence, target holdings); **`PortfolioSnapshot`** = already the NAV time-series table (add benchmark
  NAV alongside); `Decision`/`Order` (`@@unique[decisionId]` idempotency); `QuantControl` (kill-switch).
- `src/quant/committee/runner.ts` `runCommitteePass({userId,symbol,market})` — score each name.
- `src/quant/execution/executeDecision.ts` `executeDecision(decisionId,userId)` — rebalance fills
  (transactional, Alpaca paper).
- `src/quant/backtest/{engine,metrics,pmSurrogate}.ts` — extend single-symbol → cross-sectional; add
  benchmark-relative metrics to `metrics.ts` (already has deflated Sharpe + normal CDF).
- `src/quant/gates/sharia.ts` + `registry.getScreener()` — elevate to universe builder.
- `src/quant/automation/autoRun.ts` — extend per-symbol → portfolio rebalance (keep `AutoRunClaim`).
- `src/services/marketData.ts` + `src/lib/stockUniverse.ts` — universe seeds here; SPY/SPUS/HLAL
  ingest via the same Alpaca path.

## Global gate (every milestone)
`npx tsc --noEmit && npm run lint && npx vitest run` green **with zero API keys** (mock-first). Every
money mutation transactional + `Transaction`-audited (`Prisma.Decimal`, never float). Execution +
automation milestones pass **security-auditor**; Sharia/purification/Arabic pass **i18n-fintech-expert**.

## Cold-start protocol
1. `docker start rushd-postgres`. 2. `node scripts/verify-alpaca.mjs`. 3. Read this + JOURNAL.
4. Pick the lowest un-done P-milestone. 5. Build on a disjoint fence, commit + JOURNAL, then next.
Parallel (disjoint fences): P0 ∥ quant-strategist drafts P2/P3 on seed data ∥ backend preps P1.
