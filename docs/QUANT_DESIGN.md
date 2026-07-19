# Rushd Quant — Design Sub-Contract

Binding sub-contract under `docs/SYSTEM_DESIGN.md` (see parent DR-10, DR-11). Agents receive 2–5 line quotes as their DESIGN CONTRACT; every sentence here is load-bearing. This document governs the `src/quant/` module only; where it is silent, the parent contract governs and is not overridden. Decisions are final unless a Decision Record's "Revisit when" trigger fires. No contradiction with `prisma/schema.prisma` as it exists today is permitted — all new models live in §4 and are tagged to a Q-milestone.

**Inherited invariants (non-negotiable, from the parent contract):**
- **Mock-first, all milestones.** The entire committee, broker, and data spine run with zero external API keys (mock model, mock bars, `InternalSimBroker`). An exit criterion that only passes with keys is invalid. This holds through Q7 — there is no milestone at which mock mode is retired; live keys only *swap* an adapter (parent DR-4).
- **Money is `Decimal`.** Every money/quantity field is `Decimal @db.Decimal(18,4)` (money) or `Decimal @db.Decimal(18,6)` (shares/qty); no JS float arithmetic on money (parent DR-2).
- **Authz boundary.** Every quant read/write is scoped by the `src/lib/authz.ts` guard: a user sees only their own strategies, decisions, and portfolios; PARENT additionally sees their children's (parent DR-9 / §8).
- **Arabic-first.** Every user-facing rationale/label lands in `messages/en.json` + `messages/ar.json` key-identical; Arabic is Modern Standard Arabic, financial-literacy register (parent DR-6).
- **Not real money / not advice.** All execution is virtual play-money; global disclaimers apply to every quant surface.

---

## 1. Context & goals

**Product.** "Rushd Quant" is a committee of eight AI analyst agents that researches, debates, decides, and executes *simulated* trades on TASI and NASDAQ, shipped as an extractable `src/quant/` module inside the RUSHD monolith. It serves two purposes at once: (a) a **decision engine** that runs paper-money portfolios inside a deterministic risk-and-Sharia envelope; (b) the **flagship learning surface** — the learner watches the committee reason, watches the bull/bear debate, and watches the Sharia agent veto.

**Personas.**
- **Primary — self-directed learner, 18–40.** Owns an adult account (real email + password, existing PARENT credential shape or a future SELF role; v1 uses PARENT). Runs the committee on symbols, reviews decisions, approves or automates paper trades. This is the persona the committee UI (§10, Q7) is designed for.
- **Secondary — CHILD (~8–17), read-only watcher.** A child watches the committee as a tutor (rationale + debate + veto), earning XP through `addXP`; a child never approves or automates an order. Enforced by the authz guard, not UI branching.
- **Secondary — PARENT supervisor.** Gates a child's access to the committee by tier and sees the child's paper portfolio.

**Markets.** TASI is the quality bar (numeric symbols `2222`=Aramco/`1120`=Al Rajhi, SAR pegged 3.75/USD, trades **Sunday–Thursday** ~10:00–15:00 AST — never hardcode Mon–Fri). NASDAQ is secondary (alphabetic symbols, USD). Cadence is **daily bars** (end-of-day), not intraday.

**Market asymmetry.** NASDAQ gets real data + real paper-order execution + news through Alpaca. TASI gets real data (via a TASI vendor) but **internal-simulated execution** — no Gulf paper-broker exists to hit. A single `BrokerAdapter` interface (§5) abstracts both, so the committee code is broker-agnostic.

**Paper-first.** All execution is virtual: NASDAQ through the Alpaca **Paper** Trading API (real order lifecycle on virtual money), TASI through `InternalSimBroker`. Because Alpaca paper and live share one API, paper→live is a keys + base-URL swap that is **hard-gated** dark until CMA licensing (QDR-2). No real funds move in any Q-track milestone.

**Tier gating.** HUMAN_APPROVE mode is available to PREMIUM+; AUTO_PAPER (committee auto-executes paper orders) is ULTRA-only; AUTO_REAL is dark for everyone (QDR-2, §7). Gating is enforced in the authz helper, server-side.

**What "done" means for the Q-track (through Q7).**
1. A point-in-time (PIT) data spine (`MarketBar`/`Fundamentals`/`NewsItem`) is populated from Alpaca + a TASI vendor, mock-first.
2. The 8-agent committee runs a full pass on a symbol and persists every `AnalystSignal`, the debate transcript, and the final `Decision` for audit and replay.
3. The Sharia agent's hard veto and the Risk Manager's caps are enforced **deterministically and identically live vs backtest**.
4. Paper orders execute through `BrokerAdapter`; positions, virtual cash, and cost-basis are tracked per strategy.
5. A backtest engine runs walk-forward with out-of-sample holdout and Deflated-Sharpe validation, using a **deterministic PM policy-surrogate**.
6. A bilingual committee-reasoning UI shows the eight agents, the debate, and the veto.
7. Every one of the above works with **zero API keys**.

**Non-goals (Q-track).** Real brokerage / live money (QDR-2, dark), options/derivatives/leverage, intraday or high-frequency trading, Python/ML rewrites (QDR-3), multi-user fund pooling, tax-lot accounting beyond average cost-basis.

---

## 2. Committee architecture

### 2.1 The `AnalystSignal` contract

The seven analyst agents emit one shape; the PM consumes seven of them plus the debate. Every field is auditable and persisted (`AnalystSignalRecord`, §4).

```ts
type AgentKind =
  | 'QUANT_CORE' | 'NEWS_CATALYST' | 'TECHNICAL' | 'PATTERN_ANALOG'
  | 'SHARIA' | 'FUNDAMENTAL' | 'RESEARCH' | 'PORTFOLIO_MANAGER';

type Stance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface Evidence {           // one auditable feature or citation
  kind: 'feature' | 'citation' | 'ratio' | 'headline' | 'analog';
  ref: string;                 // e.g. 'RSI(14)', 'filing:2222/Q1-2026', 'doc:momentum-92'
  value: string;               // stringified so it survives JSON persistence
}

interface AnalystSignal {
  agent: AgentKind;
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  asOf: Date;                  // the PIT cutoff the signal was computed at
  stance: Stance;
  conviction: number;          // 0..1
  horizonDays: number;         // intended holding horizon
  rationaleEn: string;
  rationaleAr: string;         // Arabic-first (parent DR-6); MSA, non-empty
  evidence: Evidence[];        // never empty for a non-abstaining signal
  determinism: 'deterministic' | 'llm';   // reproducibility class
  modelId?: string;            // set iff determinism === 'llm'
  failureMode: 'ok' | 'degraded' | 'abstain';
  costCents: number;           // LLM spend (0 for deterministic agents)
}
```

### 2.2 The `Analyst` interface and the `PointInTimeContext` (no look-ahead)

```ts
interface Analyst {
  agent: AgentKind;
  run(ctx: PointInTimeContext): Promise<AnalystSignal>;
}

interface PointInTimeContext {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  asOf: Date;                                   // HARD cutoff; nothing after asOf is visible
  bars(lookbackDays: number): MarketBar[];      // bars with ts <= asOf only
  fundamentals(): Fundamentals | null;          // latest filing with filedAt <= asOf
  news(sinceDays: number): NewsItem[];          // publishedAt in (asOf - since, asOf]
  shariaVerdict(): ShariaVerdict;               // screening as-of asOf
  portfolio(): PortfolioSnapshot;               // holdings + virtual cash at asOf
}
```

`PointInTimeContext` is the **only** data door. An agent must never call `marketData.ts`, a live fetch, or the DB directly — it reads exclusively through `ctx`. In a backtest, `asOf` sweeps historical dates; live, `asOf = now`. Because every filter (`ts`/`filedAt`/`publishedAt <= asOf`) is applied inside `ctx`, the same agent code is **byte-identical** between live and backtest — this is the no-look-ahead guarantee (§6).

### 2.3 The eight agent contracts

| # | Agent | Kind | Inputs (via `ctx`) | Output | Failure mode |
|---|---|---|---|---|---|
| 1 | **Quant Core** | deterministic TS | `bars(252)` | Composite factor score → `AnalystSignal`. Features: 12-1 momentum, realized volatility, mean-reversion z-score, MA(50/200) trend, volume trend. | `<60` bars → `abstain`. |
| 2 | **News/Catalyst** | LLM (cheap, temp 0) + feed | `news(7)`, `bars(5)` | LLM classifies catalyst type + sentiment + materiality → stance = sign(sentiment)·materiality. | No news → `NEUTRAL`, conviction 0. LLM error / no key → mock signal, `degraded`. |
| 3 | **Technical/Chart** | deterministic TS | `bars(120)` | RSI(14), MACD, Bollinger position, support/resistance, deterministic candlestick-pattern set → stance. | `<30` bars → `abstain`. |
| 4 | **Pattern/Analog** | data-mining TS (strictly validated) | full history via `ctx.bars` | kNN over normalized recent-return shape → forward-return distribution of historical analogs → stance + validity flag. | `< MIN_ANALOGS` (default 100) → `abstain`; **never fabricates**. Analog windows must not overlap the current lookback (leakage guard). |
| 5 | **Sharia** | deterministic TS — **HARD VETO** | `shariaVerdict()`, `fundamentals()` | AAOIFI two-stage screen (sector; interest-debt <30% mcap, interest-securities <30% mcap, non-compliant income <5%) → `ShariaGate { compliant, reason }`. **Not** a graded opinion — an absolute gate evaluated in the envelope (§2.5), not in the debate. | Screener unavailable → **fail-closed**: treat as non-compliant (veto any BUY/increase; SELL/HOLD allowed). Never fail-open. |
| 6 | **Fundamental** | LLM (cheap, temp 0) + structured | `fundamentals()`, `bars(252)` | Runs investor-persona lenses — **Sharia value-investor lens** (low leverage, real assets, purification), **Gulf/TASI persona** (dividend + local-sector context), growth, quality/margin — each scored via `generateObject`+zod; composite stance with per-lens breakdown in `evidence`. | No fundamentals → `abstain`. LLM error / no key → mock, `degraded`. |
| 7 | **Research/Literature** | LLM (temp 0) + RAG | `symbol`, sector, curated corpus (retrieval) | Retrieves relevant strategy/finance literature, grounds a stance with `citation` evidence refs. | Empty retrieval → `NEUTRAL`, conviction 0. Retrieval/LLM error → `abstain`. Ships Q4. |
| 8 | **Portfolio Manager** | LLM (**strong**, temp 0) — **decides** | the 7 signals + debate transcript + `portfolio()` + `RiskEnvelope` | Chooses `action` (BUY/SELL/HOLD) + `targetQty` via `generateObject`+zod. **The only agent that decides.** Emits a `ProposedDecision`, then passes through the deterministic envelope (§2.5). | LLM error / no key → deterministic fallback = **HOLD** (do nothing). |

### 2.4 The bull/bear debate (TradingAgents pattern)

Before the PM decides, two LLM debaters argue **bull** vs **bear** using the seven analyst signals as evidence, for `DEBATE_ROUNDS` (default 2, hard-capped at 3), temperature 0. The transcript is an input to the PM and is persisted verbatim on `Decision.debateTranscript`. The debate is **advisory** — it shapes the PM's reasoning but can never move the deterministic envelope. Debaters use the cheap model for rounds 1..n-1 and the strong model for the final round.

### 2.5 The decision hierarchy — "LLM decides inside a deterministic envelope it cannot cross"

The PM (an LLM at temp 0) chooses **action + size**; two deterministic gates bound it (the virattt/ai-hedge-fund hierarchy). The final decision is `clamp(envelope, PM proposal)`:

1. **Sharia gate (agent 5) — absolute veto.** If the symbol is non-compliant, any BUY or position-increase is rejected and forced to HOLD or SELL-to-flat. Deterministic; identical live vs backtest.
2. **Risk Manager — deterministic caps.** Clamps or rejects the PM's size against: max % NAV per symbol, sector + market exposure caps, gross-exposure cap, per-trade stop distance × size, a portfolio drawdown breaker (halt new BUYs beyond −X% peak-to-trough), and the kill-switch (§7). Not an LLM.
3. **Final `Decision`** persists full lineage: the seven `AnalystSignalRecord`s, the debate transcript, the PM's raw proposal, every envelope adjustment, and the final action — so the decision is replayable and auditable (§6).

```
7 analysts ──▶ bull/bear debate ──▶ PM (LLM, temp 0) proposes {action, qty}
                                          │
                              ┌───────────▼───────────┐
                              │  DETERMINISTIC ENVELOPE│
                              │  Sharia gate (veto)    │  ← identical live & backtest
                              │  Risk Manager (clamp)  │
                              └───────────┬───────────┘
                                          ▼
                              final Decision → Order (BrokerAdapter)
```

### 2.6 Model tiering and LLM-call budget

Runtime LLMs are explicit opt-in: only `QUANT_LLM_API_KEY` activates them; generic app/OpenAI keys never do. News uses a cheap free-tier model; Fundamental, Research, the bilateral debate, and PM use a stronger free-tier model. One structured debate call returns both Bull and Bear cases, so a full live pass is capped structurally at five primary calls (News + Fundamental + Research + bilateral debate + PM). A second free-model attempt is disabled by default and requires `QUANT_LLM_RETRY=true`. With no Quant key, all five stages use deterministic/local fallbacks; the PM reuses the versioned backtest surrogate proposal before the unchanged risk envelope and Sharia veto.

### 2.7 Execution model — no worker, no queue (QDR-5)

RUSHD is stateless on Render; there is no background worker or queue. A committee pass is therefore triggered exactly two ways, mirroring parent DR-8: (a) a **synchronous authenticated user action** (`POST /api/quant/run`, single symbol, returns the `Decision`); (b) a **signed cron batch pass** (`POST /api/quant/cron/run`, a universe, daily after close, idempotent per day). No `setInterval`, no BullMQ, no second service.

---

## 3. Prior art & learnings

- **TradingAgents (arXiv 2412.20138).** Adopted: the bull/bear debate round (§2.4) and deep/quick model tiering (§2.6). Designed-against caveats: its reported Sharpe of 5–8 is implausibly high — the hallmark of look-ahead, small-sample, or survivorship contamination, so we enforce the PIT context (§2.2), Deflated Sharpe, and an auto-flag on any Sharpe > 3 (§6); its agents are non-deterministic, so we pin temperature 0, persist every decision, and back-test with a policy-surrogate (QDR-4); it was never run live, matching our paper-first + CMA gate (QDR-2).
- **virattt/ai-hedge-fund.** Adopted: the PM-decides-inside-a-risk-constraint-hierarchy (§2.5) and investor-persona lenses (agent 6). Designed-against caveat: it is explicitly educational-only with no return validation — our walk-forward + Deflated-Sharpe science (§6) is the addition that makes any "validated" claim defensible.
- **Backtest-overfitting literature (Bailey & López de Prado; walk-forward analysis).** Adopted wholesale as Q2 guardrails: walk-forward windows, a contiguous out-of-sample holdout, the **Deflated Sharpe Ratio** correcting for the number of trials, a minimum backtest length / trade count, and a profit-plateau (parameter-robustness) check before any strategy is marked "validated" (§6).

---

## 4. Data model (new Prisma models — DESIGN, tagged to a Q-migration)

Every model below is **additive**; nothing here alters an existing model or contradicts the current schema. Existing `Market` and `Currency` enums are reused. A paper fill writes both an `Order` row (rich lifecycle) and, for parent audit-trail continuity, a `Transaction` of type `TRADE` (existing enum value) whose `description` carries the human-readable `side/qty/price` — so the money audit trail stays single-sourced. All money/qty are `Decimal`.

**New models.**

| Model | Milestone | Key fields (all money/qty `Decimal`) | Constraints |
|---|---|---|---|
| `MarketBar` | Q0 | `symbol`, `market`, `ts DateTime`, `open/high/low/close Decimal(18,6)`, `volume Decimal(18,2)`, `source`, `adjusted Boolean` | `@@unique([symbol, market, ts])`, `@@index([symbol, market, ts])` — the PIT time-series spine (fills the "no historical persistence" gap). |
| `Fundamentals` | Q3 | `symbol`, `market`, `fiscalPeriod`, `filedAt DateTime` (**PIT key**), `revenue/netIncome/totalDebt/marketCap/interestIncome Decimal(18,4)`, `ratios Json`, `source` | `@@unique([symbol, fiscalPeriod])`, `@@index([symbol, filedAt])`. |
| `NewsItem` | Q3 | `symbol String?`, `market`, `publishedAt DateTime`, `headline`, `url`, `source`, `sentiment Decimal?`, `catalystType String?` | `@@index([symbol, publishedAt])`. |
| `ResearchDoc` | Q4 | `title`, `sourceRef`, `text`, `embedding Float[]` (non-money vector), `tags String[]` | `@@index([tags])`. In-Postgres corpus for RAG (§9 Q4) — no external vector DB. |
| `Strategy` | Q1 | `ownerUserId`, `name`, `market`, `config Json`, `autonomyTier AutonomyTier`, `enabled Boolean`, `createdAt` | FK `ownerUserId → User.id` `onDelete: Cascade`; `@@index([ownerUserId])`. |
| `Decision` | Q1 | `strategyId String?`, `userId`, `symbol`, `market`, `asOf DateTime`, `proposedAction`, `proposedQty Decimal(18,6)`, `finalAction`, `finalQty Decimal(18,6)`, `shariaGate Json`, `riskAdjustments Json`, `debateTranscript Json`, `pmModelId`, `temperature Decimal`, `seed Int`, `gitSha`, `mode DecisionMode`, `status DecisionStatus`, `costCents Int`, `createdAt` | FK `userId → User.id` `onDelete: Cascade`; `@@index([userId, createdAt])`. The audit root. |
| `AnalystSignalRecord` | Q1 | `decisionId`, `agent AgentKind`, `symbol`, `stance Stance`, `conviction Decimal`, `horizonDays Int`, `rationaleEn`, `rationaleAr`, `evidence Json`, `determinism`, `modelId String?`, `failureMode`, `costCents Int` | FK `decisionId → Decision.id` `onDelete: Cascade`; `@@index([decisionId])`. |
| `Order` | Q1 | `decisionId`, `brokerRef String?`, `symbol`, `market`, `side OrderSide`, `qty Decimal(18,6)`, `limitPrice Decimal(18,6)?`, `filledQty Decimal(18,6)`, `avgFillPrice Decimal(18,6)`, `status OrderStatus`, `broker BrokerKind`, `createdAt` | FK `decisionId → Decision.id`; `@@unique([decisionId])` (one order per decision — idempotency, §9 Q6); `@@index([status])`. |
| `PortfolioSnapshot` | Q1 | `strategyId`, `userId`, `asOf DateTime`, `cashVirtual Decimal(18,4)`, `currency Currency`, `positions Json` (symbol→`{qty, costBasis}`), `nav Decimal(18,4)` | `@@index([strategyId, asOf])`. Virtual cash + average cost-basis. |
| `BacktestRun` | Q2 | `strategyId`, `fromDate`, `toDate`, `oosFraction Decimal`, `metrics Json` (sharpe, deflatedSharpe, maxDD, trades, winRate), `implausible Boolean`, `pmSurrogateId`, `seed Int`, `gitSha`, `createdAt` | `@@index([strategyId, createdAt])`. Reproducibility record. |
| `QuantControl` | Q6 | `id (singleton)`, `halted Boolean @default(false)`, `reason String?`, `updatedAt` | The DB half of the kill-switch (§7). |

**New enums (additive).** `AutonomyTier { HUMAN_APPROVE, AUTO_PAPER, AUTO_REAL }`, `DecisionMode { HUMAN_APPROVE, AUTO_PAPER, AUTO_REAL }`, `DecisionStatus { PROPOSED, APPROVED, REJECTED, EXECUTED, VETOED }`, `OrderSide { BUY, SELL }`, `OrderStatus { NEW, PARTIAL, FILLED, CANCELLED, REJECTED }`, `BrokerKind { ALPACA_PAPER, INTERNAL_SIM }`, `AgentKind`, `Stance`. `TransactionType` is **not** modified — paper fills reuse the existing `TRADE` value.

---

## 5. External integrations

**Alpaca-anchored provider table.** All behind env keys; mock fallback preserved on every row (parent DR-4 policy).

| Provider | Domain | Env key | Market | No-key fallback |
|---|---|---|---|---|
| Alpaca Market Data | OHLCV daily bars, 6+ yrs | `ALPACA_API_KEY` | NASDAQ | seeded mock-bar generator |
| Alpaca Paper Trading | order lifecycle on virtual money | `ALPACA_API_KEY` (paper base URL) | NASDAQ | `InternalSimBroker` |
| Alpaca News | headlines → `NewsItem` | `ALPACA_API_KEY` | NASDAQ | mock `NewsItem` set |
| TASI data vendor (one adapter, one key) | TASI OHLCV | `TASI_DATA_KEY` | TASI | Yahoo `.SR` path, then mock |
| Zoya | AAOIFI screen | `ZOYA_API_KEY` | both | `MockScreener` (parent DR-4) |
| Fundamentals vendor (one adapter) | filings → `Fundamentals` | `FUNDAMENTALS_KEY` | both | mock `Fundamentals` |
| LLM (Qwen/Gemini) | agents + debate + PM | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | both | mock committee objects |

The TASI-data and fundamentals **vendor choices are deferred** (QOQ-1, QOQ-2); the design reserves one adapter slot + one env key each, so the choice is swap-only. All bar/news/fundamental fetches populate the PIT models (§4) via the signed ingest cron (§9 Q0), never live inside a committee pass — the committee reads the DB spine through `ctx`, keeping backtest and live on one path.

**The `BrokerAdapter` interface.**

```ts
interface BrokerAdapter {
  kind: 'ALPACA_PAPER' | 'INTERNAL_SIM';
  submitOrder(o: OrderRequest): Promise<OrderResult>;   // real lifecycle: NEW→PARTIAL→FILLED
  getOrder(ref: string): Promise<OrderResult>;
  cancelOrder(ref: string): Promise<void>;
  getPositions(): Promise<Position[]>;
  getCash(): Promise<Decimal>;
}
```

Two implementations, selected by a registry on `market` + key presence, defaulting to `InternalSimBroker`:
- **`AlpacaPaperBroker`** (NASDAQ) — real REST order lifecycle against the Alpaca paper base URL, virtual money.
- **`InternalSimBroker`** (TASI, and all no-key mode) — fills against the **next bar's open** with the commission/slippage/liquidity model of §6. Never fills same-bar-close (no look-ahead).

**The paper→live gate.** `AlpacaPaperBroker` and a future `AlpacaLiveBroker` are **one class parameterized by base URL** (`paper-api.alpaca.markets` vs `api.alpaca.markets`). Going live requires all three of: (a) the base-URL env change, (b) `QUANT_LIVE_EXECUTION=1`, and (c) a stored CMA-license record. All live code lives under `src/quant/execution/` behind a single `assertLiveExecutionAllowed()` guard that **throws unless all three are present**. Dark by default in every environment (QDR-2).

---

## 6. Quant integrity guardrails

- **No look-ahead.** `PointInTimeContext` (§2.2) is the only data door; `asOf` is a hard cutoff; `ts`/`filedAt`/`publishedAt` are all filtered `<= asOf`; deterministic agents are byte-identical live vs backtest. `InternalSimBroker` fills next-bar-open, never same-bar-close.
- **Overfitting defense.** Walk-forward windows; a contiguous out-of-sample holdout of **≥20–30%** of the period, always the last slice; a minimum of **100–200 trades** before a strategy is marked "validated"; the **Deflated Sharpe Ratio** computed against the number of trials; a **profit-plateau** check (metrics stable under ±parameter perturbation); and an **auto-flag** on any `BacktestRun` with Sharpe > 3 (`implausible = true`) that **blocks auto-promotion** to an enabled strategy. The Pattern/Analog agent additionally requires `>= MIN_ANALOGS` or it abstains.
- **Fill realism.** `InternalSimBroker` applies commission (bps), slippage (bps scaled by realized volatility / half-spread), and a **liquidity cap** — an order exceeding `MAX_BAR_VOLUME_PCT` of the bar's volume fills partially. Alpaca paper provides real fills.
- **Survivorship.** The `MarketBar` spine retains delisted symbols; a backtest universe is the **as-of** constituent set, never today's survivors.
- **Risk management (deterministic, in the envelope §2.5).** Position cap (% NAV/symbol), sector + market exposure caps, gross-exposure cap, per-trade stop (max loss %), a **portfolio drawdown breaker** (halt new BUYs beyond −X% peak-to-trough), and a **kill-switch** (§7).
- **Reproducibility.** Every `Decision` persists `pmModelId`, `temperature (0)`, `seed`, `gitSha`, `asOf`, and the full input signal set → replay reproduces the deterministic envelope exactly. Backtests use a deterministic **policy-surrogate** for the PM (QDR-4) and spot-check that the live LLM agrees; `BacktestRun` records `seed` + `gitSha`.
- **Mock-first invariant.** The committee, broker, and spine run end-to-end with zero keys (mock model, mock bars, `InternalSimBroker`). Inherited from the parent contract; holds through Q7.
- **Monte Carlo gate (deterministic lane).** The intraday strategy lane adds Monte Carlo validation as a promotion gate co-equal with Deflated Sharpe and extends the implausible flag to any claimed daily return ≥3σ of validated history — see QDR-6.

---

## 7. Autonomy tiers, kill-switch, regulatory gate

**Autonomy tiers (`Decision.mode`).**
- **HUMAN_APPROVE** (PREMIUM+, default for everyone) — the committee proposes; a human clicks approve; then the order submits.
- **AUTO_PAPER** (ULTRA only) — the committee auto-submits **paper** orders inside the envelope, no click; the user is notified and can review the next pass. Gated in the authz helper by tier, server-side.
- **AUTO_REAL** (dark) — auto-submits **real** orders. Requires `QUANT_LIVE_EXECUTION=1` + a CMA-license record + per-user KYC. Off in every environment until CMA licensing (QDR-2). No UI path exists in the Q-track.

**Kill-switch.** `submitOrder` checks, **before any broker call**, both `QUANT_KILL_SWITCH` (env) and `QuantControl.halted` (DB, §4). Either set → the submission is rejected deterministically. The drawdown breaker (§6) flips `QuantControl.halted` for a runaway strategy automatically.

**Regulatory gate.** Paper-only simulation needs no securities license (virtual money, matching the parent's play-money SAMA posture, DR-9). Live execution needs a **CMA license + KYC**, is isolated in `src/quant/execution/` behind `assertLiveExecutionAllowed()`, and is dark by default. This is the new DR-11 boundary in the parent contract.

---

## 8. Decision records

### QDR-1: The PM (LLM, temp 0) decides action and size inside a deterministic Sharia + risk envelope it cannot cross
Decision: the Portfolio-Manager LLM chooses BUY/SELL/HOLD + target size at temperature 0, and the final decision is `clamp(envelope, proposal)` where the Sharia agent is an absolute deterministic veto and a deterministic Risk Manager clamps size/exposure/drawdown — the LLM can never exceed either.
Options: rules-only decisions (deterministic but no adaptive reasoning, defeats the "committee" product) / LLM-only decisions (non-reproducible, un-auditable, cannot guarantee Sharia compliance or risk caps) / LLM-decides-inside-deterministic-envelope (virattt hierarchy — adaptive reasoning bounded by hard, replayable gates).
Rationale: the product needs an LLM's judgment as the flagship learning surface, but Sharia compliance and risk limits are non-negotiable and must be identical live vs backtest — only a deterministic envelope delivers both, and it makes every decision replayable.
Consequences: the Sharia gate and Risk Manager are pure TS (no LLM), evaluated after the PM; the PM's raw proposal and every clamp are persisted on `Decision`; a non-compliant symbol can only ever HOLD or SELL-to-flat.
Revisit when: a Sharia board approves a graded (non-binary) compliance treatment, or risk caps need per-user personalization beyond static config.

### QDR-2: Paper-first execution through a `BrokerAdapter`; real execution is dark and gated behind CMA licensing
Decision: all execution is virtual — Alpaca Paper for NASDAQ, `InternalSimBroker` for TASI — behind one `BrokerAdapter`; the live broker is one base-URL swap away but stays dark behind `assertLiveExecutionAllowed()` (flag + CMA license + KYC), isolated in `src/quant/execution/`.
Options: build real execution now (needs a CMA license, KYC/AML, and PSP rails RUSHD does not have) / paper-only with no live path (throws away the paper→live design symmetry Alpaca gives us) / paper-first behind an adapter with a dark, hard-gated live path (legal today, one-swap-later, testable end-to-end with mocks).
Rationale: Alpaca's paper and live APIs are identical, so a `BrokerAdapter` lets us build and validate the entire order lifecycle on virtual money now and flip to live only when licensed — with no rewrite. TASI has no paper broker, so `InternalSimBroker` is required regardless.
Consequences: the whole committee is exercisable with zero keys; a single guard function is the entire legal blast radius for going live; TASI and NASDAQ share one execution interface despite the market asymmetry.
Revisit when: a CMA license is obtained and a real-deposit pilot is approved — then `AlpacaLiveBroker` + KYC + DB-session revocation (parent OQ-5) land together.

### QDR-3: TypeScript-first, extractable `src/quant/` module; Python only if ML outgrows TS
Decision: build the entire committee in TypeScript under a self-contained `src/quant/` directory with a clean seam (the `Analyst`/`BrokerAdapter`/`PointInTimeContext` interfaces), and defer any Python/ML rewrite until modeling demonstrably outgrows TS.
Options: Python service now (a second runtime + IPC + deploy target for signals that are today deterministic indicators and LLM calls — infra RUSHD's scale cannot justify) / TS embedded across the app with no module boundary (un-extractable, couples quant to UI) / TS-first in an isolated `src/quant/` module (one language, one deploy, extractable later at a defined seam).
Rationale: the current agents are deterministic indicators plus OpenAI-compatible LLM calls — all first-class in TS and already in the stack (`ai`+`zod`); a separate Python service adds a queue, an API, and a deploy for zero present benefit (lazy-dev rung: reuse the monolith). The module boundary makes a future extraction a lift-and-shift, not a rewrite.
Consequences: no new runtime or deploy target in the Q-track; heavy numeric/ML work (if it arrives) is confined behind the `Analyst` interface and can be reimplemented per-agent in Python without touching the committee wiring.
Revisit when: an agent needs training/inference libraries with no viable TS equivalent (e.g. gradient-boosted models on large panels) — extract that agent alone behind its interface.

### QDR-4: Backtests use a deterministic PM policy-surrogate with live-LLM spot-checks; Sharia veto and risk caps are identical live vs backtest
Decision: the backtest engine replaces the live PM LLM with a **deterministic policy-surrogate** (a rules function distilled from PM behavior) so a run is fully reproducible, and periodically spot-checks that the live PM agrees on sampled dates; the Sharia gate and Risk Manager are the same deterministic code in both paths.
Options: call the live LLM at every backtest step (non-deterministic, un-reproducible, and thousands of paid calls per run) / cache LLM outputs per date (brittle, invalidated by any prompt change, still non-deterministic on cache miss) / deterministic policy-surrogate + spot-check (reproducible, cheap, and the deterministic gates already run identically).
Rationale: a backtest whose result changes between runs is worthless for validation (this is exactly the TradingAgents non-determinism caveat, §3); the surrogate makes metrics reproducible under `seed`+`gitSha`, while spot-checks keep it honest to the live PM. The gates that actually matter for compliance and risk are deterministic in both paths by construction.
Consequences: the surrogate must be maintained alongside PM-prompt changes (spot-check divergence flags drift); `BacktestRun` records `seed`+`gitSha` for exact replay; live and backtest can differ only in the PM's graded proposal, never in Sharia or risk outcomes.
Revisit when: spot-check agreement between surrogate and live PM falls below a set threshold, forcing a surrogate re-fit.

### QDR-5: The committee runs as synchronous user actions and signed-cron batch passes — no worker, no queue
Decision: trigger committee passes only two ways — a synchronous authenticated `POST /api/quant/run` (single symbol) and a signed, per-day-idempotent `POST /api/quant/cron/run` (universe batch, after close) — reusing parent DR-8's Render-cron pattern; add no worker, queue, or second service.
Options: in-process scheduler (`setInterval` dies with the stateless request lifecycle on Render) / a worker + queue (BullMQ/Redis — new infra for a daily batch) / synchronous route + Render cron → signed internal route (reuses what we already deploy).
Rationale: a daily batch over a bounded universe plus on-demand single-symbol runs needs neither a queue nor a second runtime; the parent already runs Render cron against a signed route, so we extend it. Order submission must be **idempotent and atomic** — the batch wraps each symbol's decide-and-submit in a `prisma.$transaction` and relies on `Order.@@unique([decisionId])`, explicitly avoiding the non-atomic per-row race present in the Mudarabah cron.
Consequences: no retry infrastructure — a missed batch is caught by the next day's idempotent pass; long universes must fit inside the route's execution budget (chunk if needed, still no queue); per-instance in-memory limiters are advisory, DB idempotency is authoritative.
Revisit when: the universe grows past what one request can process within the platform timeout, or intraday cadence is required — then introduce one worker + a lightweight queue (couples with parent DR-8's trigger).

### QDR-6: Deterministic intraday strategy lane (gapper momentum) with Monte Carlo validation as a first-class gate
Decision: add an **LLM-free strategy lane** to `src/quant/` — versioned, deterministic `StrategySetup` rules (screen/entry/exit, PIT-only) that emit `AnalystSignal`-compatible output into the **unchanged** downstream envelope + Sharia gate — starting with a small-cap **gapper momentum** setup, **NASDAQ-only first**, **long-only cash** (no short, no margin — Sharia). It runs on a new 1-minute intraday spine: `IntradayBar` (1-min bars incl. premarket) + `SymbolSnapshot` (mcap, float?, premarket %, cumulative volume), PIT-safe through the `pointInTime.ts` patterns (§2.2). Screener parameters are a **versioned config, never hardcoded**; v1 defaults: `mcapMin=10e6`, `mcapMax=400e6`, `premarketMovePct>=5`, `dayMovePct>=5`, `minCumVolume=10e6` shares. Data comes in three tiers: **bundled fixtures of captured real market data** (real downloaded bars snapshotted into the repo for keyless/CI determinism — **synthetic/generated bars are prohibited** in this lane's data and validation numbers) → **Alpaca free-key historical backfill** (resumable, 90-day initial then incremental) → **Yahoo keyless short-history** (always labeled as short-history). The intraday snapshot path **bypasses the 12h universe cache**; the 24h Sharia verdict cache stays. **Monte Carlo validation is a promotion gate co-equal with Deflated Sharpe** (§6).
Options: extend the LLM committee to intraday cadence (impossible under the 5-call FREE_MODE budget §2.6, non-reproducible per-minute, and QDR-5 forbids the worker it would need) / a standalone gapper script outside `src/quant/` (no PIT guarantee, bypasses the envelope and Sharia gate, unauditable) / a deterministic `StrategySetup` lane inside the module, reusing `AnalystSignal` + envelope, with Monte Carlo promotion gates (reproducible, Sharia-gated, zero LLM calls, extensible to a setup catalog).
Rationale: intraday cadence rules out LLM calls entirely, and deterministic rules are the only replayable, budget-free path; emitting `AnalystSignal`-compatible output means the Sharia veto and risk clamps are byte-identical live vs backtest with no new gate code (QDR-1, QDR-4). Gapper-style strategies produce few, fat-tailed trades where a single realized equity curve overfits notoriously — bootstrap and permutation tests measure the *distribution* of outcomes, which is the only honest basis for promotion or user-facing claims.
Consequences:
- **MC gate** (`monteCarlo.ts`): trade-outcome bootstrap (equity-curve distribution, maxDD percentiles, risk-of-ruin), an entry-jitter permutation test, and fractional-Kelly sizing **clamped by the envelope**.
- **Promotion checklist (all required):** walk-forward + ≥20–30% OOS holdout + ≥100–200 trades + Deflated Sharpe + profit plateau (§6) **and** MC maxDD p95 within the envelope's drawdown breaker.
- **Portfolio-valid validation seam:** any strategy claiming basket-vol, shared-cash, gross-exposure, drawdown, or position-count control MUST run through one deterministic, DB-free, monolith-internal daily strategy-book engine. The engine iterates date-major, owns one shared cash/NAV/positions state per strategy version, passes those real positions to `applyEnvelope`, and emits the true daily NAV/drawdown series. Same-day entry priority is canonical symbol ascending order, frozen before OOS and never selected from results. Legacy independent per-symbol simulation and pooled-exit reporting remain byte-stable for reproducibility, but they cannot validate portfolio-level controls and are used only when the CLI explicitly stays on the legacy route.
- **Honest-expectations policy:** the deliverable is the **measured daily-return distribution**, incl. `P(day ≥ +5%)` and `P(day ≤ −5%)`; no promised returns anywhere in copy; the §6 implausible flag **extends to any claimed daily return ≥3σ of validated history**.
- **Automation:** AUTO_PAPER only (ULTRA, §7), via **premarket + intraday signed-cron passes** — QDR-5's cron pattern over a bounded screener universe, still no worker and no queue. On pass error, a surrogate-trade fallback is acceptable for AUTO_PAPER but **MUST revert to fail-safe HOLD as a precondition of any future AUTO_REAL enablement** (QDR-2 gate).
- §1's intraday non-goal is **narrowed, not removed**: no intraday LLM committee and no HFT; deterministic minute-bar setups are in scope via this lane only. New additive models `IntradayBar`/`SymbolSnapshot` follow §4's rules and are tagged to G1 (§9b).
Revisit when: TASI intraday data becomes viable (extend the lane, same rules), a proposed setup requires shorting (out absent a Sharia-board ruling), or the MC and Deflated-Sharpe gates persistently disagree on promotions — then re-weight the gate composition.

### QDR-7: Competing books — multi-mode capital-allocation tournament (paper)
Decision: run every ACCEPTED strategy mode as a **competing team** — binding user directive, verbatim: *"the modes will act like different teams, that compete to achive its own goal while shria complince ofcurse"* [sic] — where each mode runs an **isolated virtual book** (its own virtual NAV, positions, and P&L) in the **AUTO_PAPER lane only (ULTRA, §7)**, and tournament capital is divided by a **deterministic, seeded capital allocator** that runs as a step **inside the existing signed cron passes** (QDR-5 — no worker, no queue, no second service). Entry to the league is **only** via QDR-6's promotion gates (walk-forward + OOS holdout + Deflated Sharpe + **Monte Carlo validation as a promotion gate co-equal with Deflated Sharpe** + profit plateau); the binding lifecycle is `CANDIDATE → CODIFIED → VALIDATING → ACCEPTED | REJECTED`, and the roster lives in `docs/STRATEGY_LAB.md`. The allocator re-scores **monthly** on a **rolling ~63-trading-day live-paper window blended with validation-card priors** (the mode's `BacktestRun` card metrics) via **shrinkage**, so a small live N can never swamp accepted evidence; the score is **deflated-Sharpe-style with an explicit drawdown penalty**. Hard caps: **no mode may hold >40% of tournament capital**; **bench = 0% is allowed**; a **drawdown-breaker breach benches the mode immediately, mid-cycle**, without waiting for the monthly re-score. The tournament is **paper-only**; AUTO_REAL is unchanged and stays dark behind QDR-2's CMA gate.
Options: one merged book for all modes (no per-mode attribution — one mode's drawdown masks another's edge, and "compete to achieve its own goal" is unmeasurable) / static equal-weight split (ignores live evidence entirely; no competition, just co-existence) / an ML meta-allocator or a separate allocator service (non-reproducible scoring, and a second service/queue that QDR-5 forbids at this scale) / a deterministic seeded shrinkage allocator over isolated virtual books inside the existing cron passes (replayable, evidence-weighted, zero new infra — chosen).
Rationale: isolated books are the only honest basis for attribution — each team pursues its own declared goal and is scored on its own realized paper P&L; the shrinkage blend toward validation-card priors is the same honesty posture as §6 and QDR-6 (small live samples are noisy, validated evidence anchors the score); a seeded deterministic allocator keeps every allocation replayable under §6's reproducibility rule; and the whole mechanism reuses what exists — the AUTO_PAPER lane, `AutoRunClaim` idempotency, the `QuantControl` kill-switch, the `Decimal` risk envelope, the pre-envelope Sharia hard veto, `PurificationEntry`, and `BacktestRun` cards — so the tournament costs one additive model and one cron step (lazy-dev: use what exists).
Consequences:
- **Validation finalization is binary and version-scoped.** `CANDIDATE`, `CODIFIED`, and `VALIDATING` are the only nonterminal validation states. Every completed or abandoned validation run ends as exactly **ACCEPTED** or **REJECTED**; `INSUFFICIENT_TRADES`, `PARKED`, and `FAILED_PROMOTION` are never terminal statuses. **ACCEPTED means admission of that exact strategy/parameter version to the AUTO_PAPER league only**; it is neither a profit promise nor permission for AUTO_REAL. **REJECTED applies to that exact version/test run**, not the hypothesis forever; a revised version re-enters at `CANDIDATE` and must pass every gate on fresh evidence. Only ACCEPTED versions receive a book or allocation.
- **A terminal evidence card is mandatory.** Finalization is invalid until `docs/STRATEGY_LAB.md` records: strategy id + parameter version; ACCEPTED/REJECTED; ordered rejection reason codes (empty only for ACCEPTED); tested period, cadence, universe, data feed and data-quality/PIT caveats; explicit in-sample and OOS results; total and OOS trade counts; CAGR or cadence-appropriate return, Deflated Sharpe, max drawdown, Calmar, hit rate, average win/loss or expectancy, turnover and exposure (use `n/a — not persisted` rather than inventing); MC p95 max drawdown, `P(day≥+5%)`, `P(day≤−5%)`, risk of ruin and permutation p-value; profit-plateau and implausibility flags; Sharia compliance state + instrument charter; and reproducibility identifiers (strategy/params version, seed, git SHA, `BacktestRun` id and result path). IS and OOS numbers must never be blended. A return without drawdown and trade count is not a result card.
- **Rejection reason codes are deterministic and cumulative.** Record every triggered code in this fixed order: `INSUFFICIENT_SAMPLE` (trade count below the versioned minimum; default statistical floor 100), `OOS_FAILURE` (the versioned OOS gate fails, including non-positive OOS return/CAGR or expectancy), `DSR_FAILURE` (the Deflated-Sharpe promotion gate is false), `DRAWDOWN_RISK_FAILURE` (MC p95 max drawdown exceeds the envelope breaker or risk of ruin exceeds its versioned limit), `IMPLAUSIBLE_RESULT` (§6/QDR-6 flag is true), `NO_PROFIT_PLATEAU_OVERFIT` (profit-plateau gate is false), `SHARIA_NON_COMPLIANT` (charter or PIT verdict forbids the instrument), `SHARIA_UNVERIFIABLE` (compliance cannot be verified for executable entry), `DATA_QUALITY_PIT_FAILURE` (required real/PIT data is missing, contaminated, or look-ahead/survivorship integrity fails), and `REPRODUCIBILITY_FAILURE` (seed/version/git SHA/run artifact missing or deterministic replay differs). Unscreened research may be measured, but it is execution-blocked and cannot be ACCEPTED; the evidence card must say `UNSCREENED` and carry `SHARIA_UNVERIFIABLE`. A Sharia hard-veto result carries `NON_COMPLIANT` and `SHARIA_NON_COMPLIANT`.
- **Sharia is the league constitution, not a per-team policy.** Every team's every signal passes the existing **per-signal Sharia hard veto ahead of the risk envelope** — no mode can trade around it. Each mode additionally declares a **per-mode instrument charter** (its permitted instrument/universe class, versioned in its config). Contested instruments remain `CANDIDATE — WAITING_SHARIA_REVIEW`: no validation finalization, trading, or score contribution until fiqh adjudication. **Sharia-unscreened universes may be evaluated only as execution-blocked research per parent DR-5** (e.g. until screened via Zoya); they cannot be ACCEPTED or join AUTO_PAPER. **Purification is computed per book** through `PurificationEntry`, so each team's purification obligation is separately auditable.
- **Discipline bounds.** Each mode carries a **live-vs-backtest tracking-error bound**; a breach triggers **immediate auto-bench + mandatory re-validation** through the QDR-6 gates before re-entry. Any mode whose latest run carries the §6/QDR-6 **implausible flag is disqualified from allocation** until the flag is cleared by a clean validated run.
- **Auditable allocation persistence.** New additive model **`AllocationDecision`**: `asOf DateTime`, `windowDays Int` (default 63), `seed Int`, `gitSha`, `inputs Json` (per-mode live-window metrics + validation-card priors + shrinkage weights), `scores Json`, `allocations Json` (mode → weight, Decimal-string), `benched String[]`, `reason String?`, `createdAt`; `@@unique([asOf])` gives monthly idempotency. Follows §4's rules (additive, `Decimal` money math, no existing model altered) and is tagged to roadmap row **G7 (§9b)**.
- **No new infra.** The allocator runs inside the existing signed cron passes (QDR-5); `AutoRunClaim` idempotency and `QuantControl.halted` apply unchanged; all book NAV/weight math is `Decimal`.
- **Shared within a mode, isolated across modes.** A multi-symbol mode uses QDR-6's shared-cash daily strategy-book engine for its own holdings and NAV; no cash, position, or P&L crosses into another mode's isolated book.
- **UI.** The league table is post-pause **G5 scope** (the `/quant` strategy tab), with every figure labeled **simulated/paper** under §6's honest-expectations policy — standings, not promised returns.
Revisit when: a CMA license opens QDR-2's gate (a real-capital allocation policy must be designed separately before any tournament output ever feeds AUTO_REAL); the validated-mode count pushes the monthly re-score past one cron pass's execution budget (chunk per QDR-5 before any worker/queue discussion); or a fiqh adjudication resolves the parked-instrument set in a way that changes the charter model.

### QDR-8: Paper INCUBATION tier — authorized near-misses forward-test daily in isolated capped books; the daily target is a measured readout, never a promise
Decision: create a **paper-only INCUBATION tier** below ACCEPTED — binding user directive 2026-07-19 — in which a strategy version whose **QDR-7 terminal evidence card shows a positive OOS return/CAGR** may, **only with explicit per-version user authorization**, trade **daily paper now** in an **isolated, capped incubation book**, labeled on every surface **"unpromoted forward test — paper only"**. Charter members (user-authorized 2026-07-19): `ts-momentum-halal-basket-v3`, `bollinger-mr-long-v2`, `ts-momentum-halal-basket-v2`, `dual-momentum-rotation` (exact ledger versions in `docs/STRATEGY_LAB.md`; their REJECTED cards stand unedited). This **supersedes, for the INCUBATION tier only**: QDR-7's "Only ACCEPTED versions receive a book or allocation", the plan's "Only ACCEPTED joins the AUTO_PAPER league", and R3-6's "Only after ≥1 ACCEPTED team" gate — the original texts remain in force for the **ACCEPTED league**, and INCUBATION is never displayed as league membership. **Capital source — amended 2026-07-19b (binding user directive; supersedes this record's original "Alpaca paper account is user-reset to $1,000,000" text):** the reset is unavailable — verified live: account cash **−$82,800.08**, buying power **$0**, zero buys possible; the account is unusable as a wallet. The **$1,000,000 bankroll lives in the internal paper-sim book ledgers** (`InternalSimBroker`, the existing keyless path in `src/quant/execution/`): Decimal-exact, marked from real persisted bars, fills through the existing cost/slippage model — still paper trading, and the ≥$1,000,000 capital goal is met with no reset. Alpaca demotes to **data-only** (bars/ingest, verified working; the account wallet is never touched). The envelope limits by **cash, never buying power** — applied to the virtual book cash. Optional, explicitly gated, and never a B1 dependency: a one-time **legacy-liquidation pass** (sell all legacy Alpaca positions to flat) may later restore usable Alpaca cash for an execution-realism mirror; it requires explicit user authorization plus a security-auditor gate. AUTO_REAL is untouched and stays dark behind QDR-2.
Options: keep waiting for a first ACCEPTED team (all ~14 validated versions are terminal REJECTED, so G4 automation stays dark indefinitely and the 63-day live-paper window QDR-7's allocator scores can never begin to exist) / relax the QDR-6 promotion gates so a near-miss becomes ACCEPTED (destroys the honesty posture the gates exist to protect) / a labeled sub-ACCEPTED forward-test tier with isolated capped books, objective admission, and explicit user authorization (accrues exactly the live-paper evidence the gates weight most, at zero real-money risk, without diluting ACCEPTED — chosen).
Rationale: QDR-7 has a bootstrap deadlock — the allocator scores a rolling live-paper window that cannot accrue while zero teams are ACCEPTED; forward paper trading is the highest-integrity out-of-sample test available (look-ahead is impossible on data that does not yet exist), so incubation generates the evidence class the promotion gates trust most at zero data cost; and the positive-OOS admission bar plus named per-version user authorization keeps entry objective and user-controlled rather than a gate relaxation.
Consequences:
- **Admission rule (both required, nothing auto-admits).** (a) A complete QDR-7 terminal evidence card with positive OOS return/CAGR; (b) explicit user authorization naming the exact strategy/params version. REJECTED remains the version's terminal *validation* status; INCUBATION is a forward-test state layered on top, never a card edit.
- **Books and caps — QDR-7 mechanics reused verbatim.** Each incubation team runs an isolated virtual book. Capital comes from the existing deterministic seeded allocator (rolling ~63-trading-day live-paper window shrunk toward validation-card priors, deflated-Sharpe-style score with drawdown penalty) over the **$1,000,000 internal-sim virtual bankroll** (amended 2026-07-19b). Hard caps: **≤40% per book**, bench = 0% allowed; **drawdown-breaker breach ⇒ immediate mid-cycle bench**; **live-vs-card tracking-error breach ⇒ auto-bench + mandatory re-validation**; a **−3%/day per-book circuit breaker** halts that book's new entries; the kill-switch (`QuantControl.halted` + env) is checked before **every** submission.
- **Promotion path v2.** ≥63 incubation live-paper **book-days** of persisted nightly evaluations may be **combined with the version's single FULL-run terminal card** to argue ACCEPTED: the QDR-6/QDR-7 gates are re-evaluated once on the combined evidence, producing a new terminal card. The FULL backtest still runs **exactly once per version** — incubation evidence supplements it, never replaces or re-runs it. A failed combined evaluation re-benches the book; there is no second FULL run.
- **Daily-target readout policy (honest framing, binding).** The user's $1,000/day goal appears in product and docs **only** as a measured readout: trailing realized **$/day run-rate** and the **capital-needed** figure implied by the measured daily-return distribution. No promised returns, no extrapolated or fabricated curves anywhere; the §6/QDR-6 implausibility flags apply to incubation results identically.
- **Token/compute economy (binding).** **No whole-market runs, ever.** Research and validation universes are capped at the **25-name research sleeve** or the **verified halal universe top ~100 by dollar-volume**. Every version runs short first (`--period 1Y` or `--diagnostic`); its FULL terminal run happens **exactly once**. Raw results live on disk (`results/*.json` + DB); chat carries ≤25-line cards only.
- **Sharia data tiers (zero-cost, fail-closed).** The verified halal universe is built from: **Tier-1** published SPUS/HLAL fund holdings (index-provider AAOIFI screening) → **Tier-2** RUSHD's own AAOIFI screener over already-ingested SEC XBRL fundamentals (§2.3 agent-5 thresholds) → **Tier-3** optional Zoya key. **No scraping of other apps.** The **i18n-fintech-expert gate decides which tier(s) qualify as `VERIFIED_COMPLIANT`**; anything unverified is fail-closed execution-blocked (QDR-7's UNSCREENED rule unchanged). Every verified name carries a **per-name purification ratio (نسبة التطهير)** *(amended 2026-07-19c per i18n-fintech gate: Tier-1 names carry **fund-level purification only** — funds publish no per-name ratios — recorded with reason code `FUND_LEVEL_PURIFICATION_ONLY` and surfaced explicitly in UI, never blank or 0%; per-name ratios are a **Tier-2/Tier-3 property**)*; Tier-1 must be labeled **"index-provider Sharia-screened (S&P methodology)"**, never "AAOIFI-compliant"; a name that loses verification drops out of the universe and its open position is sold to flat on the next pass.
Revisit when: the first version reaches ACCEPTED via promotion path v2 (decide whether INCUBATION persists as a permanent farm tier or pauses admissions); or 126 incubation book-days elapse with every book benched or at negative cumulative P&L (incubation has then falsified the near-miss set and closes pending new positive-OOS candidates); or the Sharia gate changes which tier is `VERIFIED_COMPLIANT` (universe rebuild + position flatten per the drop-out rule).

---

## 9. Roadmap Q0–Q7

Owners are exactly one of: frontend-expert, backend-expert, ai-features-expert, i18n-fintech-expert, test-engineer. Every exit criterion is a command, a visible behavior, or a reviewable artifact. **Every milestone keeps zero-key mock mode working** — a `-quant` suite runs green with no API keys set.

### Q0: Data spine + Alpaca anchor
Goal: a point-in-time bar spine exists and is populated from Alpaca (NASDAQ) + the TASI vendor, mock-first.
| Work item | Owner | Exit criterion |
|---|---|---|
| `MarketBar` model + migration (`@@unique([symbol,market,ts])`, index) | backend-expert | `npx prisma migrate dev` applies; `npx prisma validate` clean; table has the unique constraint |
| Alpaca bars adapter (6-yr OHLCV) behind `ALPACA_API_KEY`, mock-bar fallback | backend-expert | with a fake `ALPACA_API_KEY`, NASDAQ bars land in `MarketBar`; unset → mock generator populates (test) |
| TASI bars adapter behind `TASI_DATA_KEY`, Yahoo `.SR` / mock fallback | backend-expert | symbol `2222` loads bars; no key → mock (test) |
| Signed ingest cron `POST /api/quant/cron/ingest` (populate spine after close) | backend-expert | 200 + rows with `Bearer CRON_SECRET`; 401 without |
| PIT bar-query tests (`asOf` cutoff excludes future bars) | test-engineer | `npx vitest run quant-bars` green; asserts `bars(asOf)` returns no `ts > asOf` |

### Q1: Committee skeleton + paper execution
Goal: a committee pass runs, persists its audit trail, and a paper order fills.
| Work item | Owner | Exit criterion |
|---|---|---|
| `Analyst` + `AnalystSignal` + `PointInTimeContext` in `src/quant/` | backend-expert | `npx tsc --noEmit` clean; unit test: `ctx.bars()` returns only `ts <= asOf` |
| `Decision`/`AnalystSignalRecord`/`Order`/`PortfolioSnapshot`/`Strategy` models + migration | backend-expert | `npx prisma migrate dev` applies; money/qty fields are `Decimal`; `Order` has `@@unique([decisionId])` |
| `BrokerAdapter` + `InternalSimBroker` (next-bar-open fill + cost/slippage) | backend-expert | test: a paper BUY fills and updates `PortfolioSnapshot` cash + costBasis |
| Two deterministic agents (Quant Core, Technical) + mock PM stub + envelope wiring | ai-features-expert | test: a pass persists ≥2 `AnalystSignalRecord` + 1 `Decision` |
| Synchronous `POST /api/quant/run` (authed, single symbol) | backend-expert | authed POST returns a `Decision` JSON; unauth → 401 |
| Committee-pass persistence tests | test-engineer | `npx vitest run quant-committee` green |

### Q2: Backtest engine + Pattern/Analog + validation
Goal: reproducible backtests with overfitting defenses; the analog agent is strictly validated.
| Work item | Owner | Exit criterion |
|---|---|---|
| Deterministic backtest loop over `MarketBar` sweeping `asOf`, policy-surrogate PM | ai-features-expert | a run on mock bars writes a `BacktestRun` row with populated `metrics` |
| Pattern/Analog agent (kNN analog, `MIN_ANALOGS`, leakage guard, abstain) | ai-features-expert | test: agent abstains below `MIN_ANALOGS`; no analog overlaps the lookback |
| Walk-forward + OOS split + Deflated Sharpe + implausible-Sharpe auto-flag | backend-expert | test: a run with Sharpe > 3 sets `implausible = true`; `deflatedSharpe` populated |
| Fill realism (commission + slippage + liquidity cap) in `InternalSimBroker` | backend-expert | test: an order above `MAX_BAR_VOLUME_PCT` fills partially |
| Validation/guardrail tests | test-engineer | `npx vitest run quant-backtest` green |

### Q3: Sharia hard-veto + News + Fundamental
Goal: the deterministic envelope is complete; two LLM analysts join, mock-first.
| Work item | Owner | Exit criterion |
|---|---|---|
| Sharia gate agent (deterministic, fail-closed) + veto wiring | backend-expert | test: a non-compliant symbol turns a BUY into `status: VETOED`; screener-down also vetoes (fail-closed) |
| Risk Manager (deterministic caps: position/exposure/drawdown/kill-switch) | backend-expert | test: a PM proposal above the position cap is clamped; kill-switch rejects submit before broker |
| News/Catalyst agent (LLM cheap model, mock fallback) + `NewsItem` model | ai-features-expert | no key → mock signal; test: `NewsItem` filtered to `publishedAt <= asOf` |
| Fundamental agent (LLM structured, persona lenses incl. Sharia value + Gulf/TASI) + `Fundamentals` model | ai-features-expert | test: schema-valid signal carries per-lens scores in `evidence`; no key → mock |
| Bilingual rationale + "not advice" disclaimer on committee output | i18n-fintech-expert | `rationaleAr` non-empty MSA; disclaimer keys present in both `messages/*.json` |
| Veto + risk + agent tests | test-engineer | `npx vitest run quant-veto` green |

### Q4: Research/Literature RAG
Goal: a grounded, cited research agent over a curated corpus, no external vector DB.
| Work item | Owner | Exit criterion |
|---|---|---|
| `ResearchDoc` model + in-Postgres corpus ingestion (embeddings as `Float[]`) | ai-features-expert | `npx prisma migrate dev` applies; a seed corpus loads rows with embeddings |
| Research agent (LLM + in-process cosine retrieval, citation evidence) | ai-features-expert | test: agent returns `citation` evidence refs; empty retrieval → `NEUTRAL` conviction 0 |
| Mock-embeddings path for zero-key mode | ai-features-expert | with no key, retrieval returns deterministic top-k (test) |
| RAG grounding/citation tests | test-engineer | `npx vitest run quant-rag` green; asserts every non-abstaining signal has ≥1 citation |

### Q5: PM + bull/bear debate
Goal: the strong-model PM decides after a capped debate, within budget.
| Work item | Owner | Exit criterion |
|---|---|---|
| PM agent (strong model, temp 0) proposes action + size inside the envelope | ai-features-expert | test: the PM output is clamped by the envelope; `Decision.temperature = 0` recorded |
| Bull/bear debate round (N capped, transcript persisted) feeding the PM | ai-features-expert | test: `Decision.debateTranscript` has ≥1 round |
| LLM call-budget + model-tier config (cheap analysts / strong PM/final round) | backend-expert | test: a pass exceeding `MAX_LLM_CALLS_PER_PASS` abstains remaining LLM agents |
| PM determinism / surrogate-vs-live spot-check harness | test-engineer | `npx vitest run quant-pm` green; the surrogate yields identical output across two runs on one seed |

### Q6: Automation + autonomy tiers + kill-switch
Goal: the batch pass runs unattended within the autonomy tiers, idempotently and atomically.
| Work item | Owner | Exit criterion |
|---|---|---|
| Signed cron batch pass `POST /api/quant/cron/run` over a universe (after close) | backend-expert | 200 + `Decision`s with `Bearer CRON_SECRET`; 401 without; a second same-day run is a no-op |
| Autonomy tiers (HUMAN_APPROVE default; AUTO_PAPER ULTRA-gated) + approval flow | backend-expert | test: AUTO_PAPER executes without a click for ULTRA; PREMIUM requires approve; CHILD is read-only (403 on submit) |
| Idempotent + atomic order submission (`$transaction` + `Order.@@unique([decisionId])`) | backend-expert | test: a concurrent double-run creates exactly one `Order` |
| Kill-switch (env + `QuantControl.halted`) + drawdown breaker halt submission | backend-expert | test: kill-switch set → `submitOrder` rejected before any broker call |
| Automation/autonomy tests | test-engineer | `npx vitest run quant-auto` green |

### Q7: Committee UI + evals
Goal: the bilingual committee-reasoning surface ships and the eval gate guards it.
| Work item | Owner | Exit criterion |
|---|---|---|
| Committee-reasoning UI: 8-agent panel + debate + veto + final `Decision`, RTL | frontend-expert | `/[locale]/quant` renders all agents' signals, the debate, and the final action; RTL uses logical props |
| Autonomy/approval + kill-switch controls in UI (tier-gated) | frontend-expert | ULTRA sees an AUTO_PAPER toggle; approve executes an order; a PREMIUM user cannot see AUTO_PAPER |
| Arabic committee copy + disclaimers, key-identical JSON | i18n-fintech-expert | `messages/en.json` / `messages/ar.json` keys match (script); MSA copy, no banned transliterated jargon |
| Committee eval golden set (schema-valid signals, veto honored, budget capped) | test-engineer | `npx vitest run quant-eval` green asserting all three properties |
| Backtest reproducibility eval (seed + gitSha replay = identical metrics) | test-engineer | test: replaying a `BacktestRun` yields an identical `deflatedSharpe` |

---

## 9b. Strategy-lab roadmap G1–G5

Binding roadmap for the QDR-6 lane. Same rules as §9: exactly one owner per item, checkable exits, and **zero-key mode green at every milestone** — the keyless path is the bundled-fixtures tier, which is **captured real market data** (real downloaded bars snapshotted into the repo), never synthetic/generated bars; the app-wide mock-first invariant (§6) is unchanged outside this lane. The setup ledger is `docs/STRATEGY_LAB.md` (binding lifecycle: `CANDIDATE → CODIFIED → VALIDATING → ACCEPTED | REJECTED`; only ACCEPTED enters AUTO_PAPER). New additive models land in the G1 migration per §4's rules: `IntradayBar` (`symbol`, `market`, `ts`, OHLCV `Decimal`, `session`, `@@unique([symbol, market, ts])`) and `SymbolSnapshot` (`symbol`, `market`, `asOf`, `mcap`, `float?`, `premarketMovePct`, `cumVolume`, `@@unique([symbol, market, asOf])`).

| Milestone | Work item | Owner | Exit criterion |
|---|---|---|---|
| G1 | Intraday data spine: `IntradayBar` + `SymbolSnapshot` models/migration + three-tier ingest (bundled captured-real-data fixtures → resumable Alpaca backfill, 90-day-then-incremental → labeled Yahoo short-history), snapshot path bypassing the 12h universe cache | backend-expert | keyless captured-real-data fixtures load into both models; a look-ahead injection test on minute bars **fails the run** (`npx vitest run quant-intraday`) |
| G2 | `StrategySetup` framework (versioned screen/entry/exit config, PIT-only, `AnalystSignal`-compatible output) + setup catalog seeded with gapper-ORB | quant-strategist | gapper-ORB setup unit-tested green; `docs/STRATEGY_LAB.md` has a CODIFIED row for it |
| G3 | Intraday backtest loop + `monteCarlo.ts` (bootstrap, entry-jitter permutation, Kelly clamp) + strategy report card + `npm run backtest` CLI | quant-strategist | seeded MC determinism test: same seed ⇒ identical distribution output |
| G3e | Shared-cash daily strategy-book prerequisite for portfolio-level validation: deterministic date-major `src/quant/backtest/portfolioEngine.ts`, one cash/NAV/positions state, canonical-symbol same-day entry priority frozen before OOS, true daily NAV/drawdown output; retain the legacy independent route unchanged | quant-strategist | `npx vitest run src/quant/backtest/portfolioEngine.test.ts --no-file-parallelism` proves shared-cash conservation after every fill; real concurrent positions reach `applyEnvelope`; stable-symbol tie-break replay; ≤6 simultaneous holdings when configured; future-bar injection fails the run; identical inputs replay identical daily NAV/drawdown; every input source is non-MOCK; and legacy independent setup artifacts remain byte-identical unless explicitly routed to the shared engine |
| G4 | AUTO_PAPER wiring (premarket + intraday signed-cron passes, QDR-5 pattern) + `POST /api/quant/strategies/gapper` | backend-expert | test: a −3% daily drawdown breaker flips `QuantControl.halted` |
| G5 | `/quant` strategy tab: report card + measured daily-return distribution (incl. `P(day≥+5%)` / `P(day≤−5%)`), bilingual/RTL | frontend-expert | tab renders all four states (loading/empty/error/populated); every figure carries a simulated/paper label |
| G7 (post-pause) | QDR-7 tournament capital allocator: isolated virtual book per ACCEPTED mode; `AllocationDecision` model + migration; deterministic seeded monthly re-score (rolling ~63-trading-day live-paper window shrunk toward validation-card priors, deflated-Sharpe-style score with drawdown penalty); 40% per-mode cap, bench=0% allowed, immediate mid-cycle drawdown bench, tracking-error auto-bench; runs as a step inside the existing signed cron passes (QDR-5) | backend-expert | seeded determinism test: same seed + same inputs ⇒ identical `AllocationDecision.allocations`; test: a REJECTED or missing-evidence-card mode receives no book/allocation; test: a drawdown-breaker breach benches the mode mid-cycle; a second same-month allocator run is a no-op (`npx vitest run quant-tournament`) |

G3e is an amendment to the existing QDR-6/QDR-7 consequences, not a new QDR: it makes their already-binding PIT, envelope, daily-NAV, and isolated-book requirements executable without changing the decision. Portfolio-level candidates sequence G3 → G3e → validation; R3-1 is the first required consumer. G7 remains post-pause QDR-7 scope and sequences after the post-pause modes E/F (G6a/G6b, tracked in the `docs/STRATEGY_LAB.md` ledger); its league-table surface ships as a post-pause extension of G5's tab, labeled simulated/paper throughout.

---

## 10. Learning tie-in (brief)

The committee is the **flagship tutor**: the Q7 reasoning UI lets a learner watch eight agents reason, watch the bull/bear debate, and watch the Sharia agent veto — each `AnalystSignal` already carries `rationaleAr`/`rationaleEn` and `evidence`, so the explanation is native, not bolted on. XP for watching/quizzing on a committee pass routes through the existing `addXP` (parent invariant — the sole XP writer). Curriculum attaches per agent: Quant Core → factor investing; Technical → technical analysis; Fundamental → valuation + the persona lenses; Sharia → AAOIFI screening; Risk Manager → position sizing and drawdown; PM/debate → portfolio construction. The mapping to CFA-X / CME-X modules and the XP/quiz wiring is **deferred to the learning track** and is not part of the Q-track exit criteria.

The binding learning-simulation contract is parent DR-14 / M10 in `docs/SYSTEM_DESIGN.md`: one exact team/setup version, 5–8 knowledge + policy questions, a sealed bounded policy, and deterministic same-context replay against that team, SPUS, and price-only SPY. It is a learning surface, not a promotion backtest: rewards measure mastery effort rather than P&L, and it cannot trigger the gated terminal evidence period.

---

## 11. Open questions (each with its deciding trigger)

- **QOQ-1 — TASI data vendor (SAHMK vs Twelve Data vs EODHD).** Trigger: a data-license budget is approved **and** one vendor is verified to provide ≥6 years of daily OHLCV keyed on TASI numeric symbols. The single `TASI_DATA_KEY` adapter slot (§5) makes the choice swap-only.
- **QOQ-2 — Fundamentals vendor (Financial Datasets vs Alpha Vantage vs Finnhub).** Trigger: a coverage check confirms TASI fundamentals **with a point-in-time `filedAt`** (required by `PointInTimeContext`). Until then, the mock `Fundamentals` path is authoritative.
- **QOQ-3 — RAG corpus (curated finance-literature set + license).** Trigger: Q4 start with corpus licensing cleared. Until then, `ResearchDoc` carries a small internal seed corpus and the mock-embeddings path (§9 Q4) is authoritative.
- **QOQ-4 — Strong PM model (Qwen-strong vs Gemini-Pro).** Trigger: the Q7 committee-eval score on decision quality falls below the bar for the default `OPENAI_MODEL_STRONG`; base-URL/model-id swap only (couples with parent OQ-6).
