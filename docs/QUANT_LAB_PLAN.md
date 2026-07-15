# Quant Strategy Lab — Execution Plan & Continuation Brief

**Purpose of this file:** any session — Claude, Codex, or another AI — must be able to cold-start the
strategy-lab build from THIS file + `docs/JOURNAL.md` + `docs/QUANT_DESIGN.md` (QDR-6 + §9b) +
`docs/STRATEGY_LAB.md`, with zero re-exploration. Update the status table here at every milestone close.

## Mission (honest framing — do not drift)

Build AI automated trading to quant best practices. The user's target is 5–10% daily; **no promised
returns anywhere** — the deliverable is the **measured daily-return distribution** including
`P(day ≥ +5%)` and `P(day ≤ −5%)` from walk-forward + Monte Carlo validation on real historical data.
Sharpe > 3 or any claimed daily return ≥3σ of validated history ⇒ `implausible = true`, blocks
promotion (QUANT_DESIGN §6 + QDR-6). Research anchors live in `docs/STRATEGY_LAB.md` (best published
intraday ≈ 19.6%/yr Sharpe 1.33–2.4 — beating literature by 10× is a bug flag, not a win).

## Hard directives (user-issued, non-negotiable)

1. **"you are not allowed to mock, use any free or low cost data"** — NO synthetic/generated bars in
   the strategy lane. Keyless/CI tier = committed snapshots of REAL downloaded bars. Data tiers:
   captured-real fixtures → Alpaca free-key historical minute bars (IEX, resumable backfill) → Yahoo
   keyless short-history (labeled). Alpaca paper keys are set in `.env` and verified working.
2. **Cost as low as possible**: the strategy lane is LLM-free by design (deterministic rules +
   deterministic PM surrogate, QDR-4) ⇒ $0 recurring. The 5-call LLM committee (FREE_MODE) is a
   separate opt-in feature, outside this lane. The one place cost is NOT cut: review gates on money paths.
3. **Sharia**: long-only cash. No short, no margin, no futures/options. Short-side setups are
   educational-only (flagged). NASDAQ-only first (TASI has no premarket).
4. **AUTO_PAPER only.** AUTO_REAL stays dark behind the CMA gate (QDR-2). Precondition recorded: the
   error⇒surrogate-trade fallback MUST revert to fail-safe HOLD before any AUTO_REAL enablement.
5. Every milestone: zero-key mode stays green (`npx vitest run` with no API keys).

## Status DAG (update at every milestone close)

| Unit | Owner | Status | Deliverable |
|---|---|---|---|
| G-1 cost-optimization baseline | — | ✅ DONE | commit `91a00ba` (tsc/lint clean, 303 tests green) |
| G0 contract: QDR-6 + §9b | architect | ✅ DONE | `docs/QUANT_DESIGN.md` — QDR-6 (real-data-only fixtures explicit), §9b roadmap |
| G0b ledger | — | ✅ DONE | `docs/STRATEGY_LAB.md` — full setup catalog, statuses, research anchors |
| G1b research RAG | — | ✅ DONE | `scripts/seed-research-library.ts` ran: 8 docs in ResearchDoc (idempotent, re-runnable) |
| G1 intraday data spine | data-engineer | ✅ DONE | additive `IntradayBar`+`SymbolSnapshot` (Decimal OHLCV, @@unique per QDR-6), resumable Alpaca-IEX backfill, 10 captured-real symbol-days (3,598 bars; 667 KB; screening-complete gapper+controls with SEC-XBRL mcap), labeled Yahoo tier, signed cron, Eastern-session snapshots, direct PIT access + future-bar rejection test |
| G2 StrategySetup framework + Tier-1 catalog | quant-strategist | ✅ DONE | PIT-only `StrategySetup` contract + catalog; versioned gapper-ORB v1 screen/entry/exit emits deterministic `AnalystSignal`; captured-real SNDL default screen and AAPL breakout/stop tests; ledger CODIFIED, not validated |
| G3 intraday backtest + MC + CLI | quant-strategist | ✅ DONE | `intradayEngine.ts` (decide-on-close/fill-next-open, vol-scaled slippage, participation-cap partial fills, halt-gap no-fill, EOD flat, envelope-clamped), seeded `monteCarlo.ts` (bootstrap+jitter permutation+Kelly via applyEnvelope), `distribution.ts` P(day≥+5%)/P(day≤−5%)+3σ flag, `reportCard.ts`, `npm run backtest` CLI (BacktestRun + results/*.json, gitignored). 353 tests green. Fixture run terminal result: REJECTED (`INSUFFICIENT_SAMPLE`; IEX volume undercount fails 10M screen). Multi-symbol remains the byte-stable pooled-independent legacy route; it cannot evidence portfolio controls. |
| G3e shared-cash daily strategy book | quant-strategist | ✅ DONE | DB-free date-major `simulateStrategyBook`: Decimal shared cash/NAV/real positions, exits-before-entries plus canonical-symbol admission, unchanged `applyEnvelope` over live holdings, true daily NAV/drawdown, fail-closed real-source/PIT guards; explicit CLI `--engine shared`, legacy default unchanged; 12 focused / 616 full tests green |
| G3b historical snapshots | data-engineer | ✅ DONE | commit `b1cc65c`: 12,974 PIT checkpoint snapshots (20 symbols × 90d), 100% SEC-XBRL mcap coverage, idempotent. FINDING: zero symbol-days pass 10M cumVolume — IEX feed = few % of consolidated tape (real moves exist, e.g. HUT +25.46%); threshold needs measured feed-aware params |
| G3c IEX calibration + validation run | quant-strategist | ✅ DONE | commit `55a1021`: measured median IEX/consolidated volume ratio 3.28% → additive `v1-iex`; full 90-day/20-symbol run produced 0 trades; terminal result REJECTED (`INSUFFICIENT_SAMPLE`), with a new version/run allowed after G3d |
| G3d PIT micro-cap gapper universe | data-engineer | ✅ DONE | commit `0c181d6` + runs: 2,764-symbol NASDAQ universe, 394 PIT candidate gap days (mcap-at-date via SEC-XBRL, corporate-action screened), 110k candidate-day minute bars + 394/394 snapshots (100% mcap) |
| Team A genuine validation run | — | ✅ DONE | gapper-orb@v1-iex on 153 real micro-caps: 76 trades, hit 31.6%, −4.19%/trade, ruin 99.9% → **REJECTED (NEGATIVE_EXPECTANCY)**. Finding: long gap-continuation is the losing side; documented edge is short-side (Sharia-excluded). BacktestRun 270cabf5, gitSha 9db80b9 |
| Modes B/C/D daily validations | quant-strategist | ✅ DONE | all honestly REJECTED with terminal cards: B OOS collapse + MC p95 75% (a6f8d4b) · C OOS −45% + MC p95 81% + jitter p=0.108 (200bae4) · D 9 trades INSUFFICIENT_SAMPLE, Sharpe 5.05 auto-flagged IMPLAUSIBLE (9db80b9). Shared findings: full-cash-per-name sizing amplifies DD; daily deep-history backfill (backwards) is the unlock for v2s |
| QA gates over G1–G3 | qa-reviewer | ⏳ PENDING | same acceptance blocks as implementers; different model than implementer |
| **PAUSE — report card to user** | — | ⏳ | present measured distribution incl. P(day≥5%), MC drawdown percentiles. STOP HERE. |
| G4 automation wiring (paper) | backend-expert + security-auditor | 🔒 POST-PAUSE | premarket+intraday signed-cron passes, −3% daily circuit breaker, envelope caps; NOTE: Alpaca paper acct shows negative cash (−$82.8k, margin used by old paper trades) — envelope must limit by CASH not buying power |
| G4b TradingView webhooks + deep links | backend-expert + security-auditor | 🔒 POST-PAUSE | HMAC-signed `/api/quant/webhooks/tradingview` → same Sharia gate/envelope pipeline; dark until secret set |
| G5 strategy UI on /quant | frontend-expert + design-reviewer + i18n | ✅ REPORT-CARD UI DONE; PAPER P&L GATED | DB-backed `/quant/league`: accepted + rejected terminal teams, normalized model/SPY/SPUS history, OOS risk, promotion gates, exact persisted trade/P&L drill-down when available, and honest legacy states. Isolated paper-book P&L remains gated until an ACCEPTED team exists. |
| G6a RL lane (PPO baseline) / G6b linear cross-sectional factor | quant-strategist + architect | 🔒 POST-PAUSE | identical gates; Python sidecar only via QDR-3 architect decision |

## Multi-mode doctrine (user directive 2026-07-12: "we should have many modes, not restricted to the filter")

The goal is pursued by a BOOK of uncorrelated modes, each independently validated through the same
gates, never one filter: A intraday gapper momentum (needs G3d micro-cap universe — funnel proof:
16/20 backfilled symbols never enter the 10–400M mcap band; 0 joint screen passes in 90d) ·
B daily mean reversion (bollinger-mr-long, rsi-exhaustion-long — 6yr daily bars ALREADY in DB, validate first) ·
C trend following (ts-momentum-halal-basket + htf-trend-filter — data in DB) ·
D stat-arb long-leg (coint pairs — data in DB) · E cross-sectional factor (G6b) · F RL (G6a).
Evidence order: B/C/D now ($0, hundreds of trades), A after G3d ingestion, E/F post-pause.
Capital allocation across ACCEPTED modes = deterministic fractional-Kelly per terminal evidence card, envelope-clamped
(strategy-level committee). Modes B–D dispatches are SEQUENCED (shared STRATEGY_LAB.md ledger).

USER DIRECTIVE 2026-07-12 ("modes act like different teams that compete, Sharia-compliant"):
**Competing-books tournament (QDR-7, binding):** each ACCEPTED mode = an isolated
virtual book (own NAV/positions/P&L) in AUTO_PAPER; deterministic seeded allocator re-scores monthly
on rolling ~63d live-paper results blended with validation-card priors (shrinkage), deflated-Sharpe-style
score with drawdown penalty; caps (≤40%/mode, bench=0% allowed); IMMEDIATE bench on drawdown breach;
live-vs-backtest tracking-error breach ⇒ auto-bench + re-validate; implausible ⇒ disqualified; league
entry only via QDR-6 gates and a complete terminal evidence card. Sharia = league constitution
(per-signal veto + per-mode instrument charter; UNSCREENED research is execution-blocked and cannot be
ACCEPTED; purification per book). No worker/queue (QDR-5); paper-only
until the QDR-2 CMA gate ever opens; league-table UI = post-pause G5. Mode B may re-enter as v2 through gates.

## Team lifecycle and final-status contract

Every team follows `CANDIDATE → CODIFIED → VALIDATING → ACCEPTED | REJECTED`. Only ACCEPTED joins
the AUTO_PAPER league; ACCEPTED never means guaranteed profit or AUTO_REAL permission. Every completed
validation gets a terminal evidence card under QDR-7. Legacy `INSUFFICIENT_TRADES`, `PARKED`, and
`FAILED_PROMOTION` labels must resolve to the applicable QDR-7 reason code(s), never remain final statuses. A REJECTED decision binds
only that strategy version + run; a materially changed version starts again as CANDIDATE.

The card must show the measured IS and OOS results separately, trade counts, test period/universe/feed,
return or CAGR, DSR, maxDD + MC p95 maxDD, hit rate, average win/loss or expectancy,
turnover/exposure where available, both ±5% daily probabilities, risk of ruin, permutation p-value,
Sharia state, exact ordered rejection reason codes, and strategy/params version + seed + git SHA +
`BacktestRun`/result path. Missing values are labeled `n/a — not persisted`; they are never inferred.
The binding reason-code definitions and ordering live in QDR-7.

## Round 2 (USER-APPROVED 2026-07-12: "all, in order")

| R2 unit | Owner | Status | Deliverable |
|---|---|---|---|
| R2-1 deep-history backfill | data-engineer | ✅ | 6y real daily spine for 25-name research universe + 2y Alpaca-IEX minute spine for 11 liquid names; bounded Yahoo repair removed residual MOCK contamination |
| R2-2 stocks-in-play gapper v2 | quant-strategist | ✅ REJECTED | 468 trades; CAGR −45.70%, OOS −44.84%, MC p95 DD 81.41%, ruin 96.10%; terminal evidence in STRATEGY_LAB |
| R2-3 B v2 + C v2 (per-name sizing, regime gates) | quant-strategist | ✅ REJECTED | both structural fixes improved OOS/risk materially but neither cleared every gate; exact cards in STRATEGY_LAB; no post-hoc retuning |
| R2-4 Tier-1 setups ×4 | quant-strategist | 🔄 1/4 | vwap-reclaim v1 REJECTED (347 trades, CAGR −40.62%, ruin 100%); next: stop-hunt-reversal-long, then bagholder-bounce and time-of-day |
| R2-5 G4 automation + QDR-7 allocator + G4b TradingView + G5 league UI | backend-expert / frontend-expert + security & design gates | 🔄 G5 + ALLOCATOR CORE DONE | Visual league and deterministic allocator core are complete. G4 persistence/cron, isolated paper books, and webhooks remain correctly dark because zero teams are ACCEPTED. |

## Current delivery sequence — app completion, then model enhancement

1. **R3-1 momentum-v3 — DONE / REJECTED:** the true shared-book run passed its frozen 3×3 plateau but
   failed OOS DSR and book-day MC drawdown gates; unscreened Sharia state independently blocks execution.
   R3-2 dual-momentum rotation is DONE / REJECTED; next execute R3-3 turn-of-month without retuning R3-2.
2. **Frontend completion:** G5 report-card views and the shared Rushd/Alpaca portfolio dashboard are
   complete. Continue M9 responsive/accessibility consistency on the remaining non-auth surfaces,
   preserving the explicit 2D committee decision; add isolated paper-book P&L only after an ACCEPTED
   team exists. Every terminal state remains visible; rejection is never filtered out.
3. **Finish the frozen hypotheses:** validate R2-4 stop-hunt-reversal-long, bagholder-bounce and
   time-of-day in that pre-registered order. No tuning against already-viewed OOS results.
4. **Best next model class:** implement G6b monthly long-only cross-sectional linear factors before RL.
   It has greater diversification value than another intraday variant, is deterministic/explainable,
   and can use the same walk-forward, DSR, Monte Carlo, Sharia and risk gates.
5. **Committee enhancement:** calibrate strategy-team allocation weights only from isolated paper
   evidence after at least one ACCEPTED team exists. RL/G6a remains experimental and cannot weaken a
   deterministic Sharia veto, risk envelope, or AUTO_REAL gate.

## R3 — Codex continuation briefs (written 2026-07-14; execute in order, one unit per session/dispatch)

Shared rules for every unit: seed 42 · ≥25% OOS · net of costs · a-priori params (NO sweeps except the
plateau evaluator's fixed neighborhood) · <100 trades ⇒ INSUFFICIENT_SAMPLE · implausible flag binds ·
MOCK/source exclusion proof · terminal QDR-7 evidence card + ledger row + JOURNAL line + commit.
Acceptance commands: `npm run lint` · `npx tsc --noEmit` · `npx vitest run --no-file-parallelism` ·
`npm run backtest -- --setup <id> --from 2018-01-02 --to 2026-07-10 --seed 42`.

**R3-3 user gate (2026-07-14):** do not execute the 2018-01-02..2026-07-10 terminal evidence run
unless the user explicitly authorizes it. Short `--diagnostic` runs are non-terminal and must not persist.

| # | Unit | Spec (binding) |
|---|---|---|
| R3-0 / G3e | **shared-cash daily strategy book — ✅ DONE** | `simulateStrategyBook` is DB-free, deterministic and date-major with one Decimal cash/NAV/positions state; next-open exits precede entries, same-day admissions are canonical-symbol ascending, and unchanged `applyEnvelope` sees the real book. Focused gates prove fill/mark conservation, concurrent holdings, ≤6 cap, replay/tie stability, future/MOCK failure, non-negative cash, fill ordering and explicit legacy/shared routing. No dependency/schema/service/queue/API. |
| R3-1 | **momentum-v3 — ✅ DONE / REJECTED** | Final QA-safe shared-book replay (`d3d0071`, BacktestRun `f9e5f702-253b-4a9d-bdec-d89144038ecb`, seed 42): zero metric drift; 1,637 trades; full/OOS CAGR 5.74%/11.83%; DSR(9) 0.414/0.375; MC book-day p95 DD 49.91%; plateau PASS; max six holdings; 0 MOCK. Ordered reasons: `DSR_FAILURE`, `DRAWDOWN_RISK_FAILURE`, `SHARIA_UNVERIFIABLE`. Prior `f9d788b` evidence is retained but superseded; no AUTO_PAPER admission; next R3-2. |
| R3-2 | **dual-momentum-rotation — ✅ DONE / REJECTED** | Final episode-correct shared-book run (`0aef451`, BacktestRun `13a95084-5890-4d17-92f5-c01d913e2d5c`, seed 42): exact seven / 14,108 real bars / 0 MOCK / 2,141 NAV days; **11 independent closed episodes** (3 OOS) from 12 buys, versus 147 raw sells (136 trims + 11 full exits). Full/OOS CAGR 5.49%/13.85%, DSR(9) 0.737/0.701; MC book-day p95 DD 23.15%; post-fill gross≤25%, max one. Frozen 3×3 plateau FAIL on episode returns. Ordered reasons: `INSUFFICIENT_SAMPLE`, `DSR_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE`; no AUTO_PAPER. `abe70156…`, `7fc795e8…`, and pseudo-replicated `d3628d85…` are superseded, not evidence; next R3-3. |
| R3-3 | **tom-overlay — 🧪 CODIFIED / DIAGNOSTIC ONLY** | Source `c1420f5` + boundary/risk fix `8346472`: exact SPUS observed-session calendar, last-4+first-3, close decision/next-open fill, 25% continuous cap, max one, episode inference, frozen `{last 3,4,5}×{first 2,3,4}` plateau, standard book-day risk plus separate seeded monthly-block TOM evidence, and `--diagnostic` no-write mode. Short 2024-01-02..2026-07-10 diagnostic used 632 real bars / 0 MOCK and 30 episodes (9 OOS); CAGR −0.74% / −0.47%, DSR(9) 0.023 / 0.044, MC p95 DD 9.61%, plateau FAIL. These are non-terminal development observations, not a verdict. AAOIFI unscreened/execution blocked. Full terminal evidence awaits explicit user authorization. |
| R3-4 | **g6b-linear-factor — 🧪 CODIFIED / DIAGNOSTIC ONLY** | Source `f550c8e`: exact 25-name research universe; 50/50 percentile ranks on `close[t−21]/close[t−252]−1` and an honestly labeled trailing-21-session dollar-volume proxy (true turnover rate unavailable); top `ceil(25×25%)=7`, 1/7 target weights, monthly next-open reductions-before-additions, unchanged 15 bps/side costs and risk/ADV/cash envelope, per-run replay isolation, active-month inference, frozen `{231,252,273}×{0.4,0.5,0.6}` plateau. Short 2024-01-02..2026-07-10 diagnostic: 15,800 real bars / 0 MOCK, 18 independent active months (10 OOS; 133 fills / 63 raw closed-name executions), CAGR 11.39% / 15.24%, DSR(9) 0.303 / 0.195, MC p95 DD 42.17%, plateau FAIL. Non-terminal, no JSON/BacktestRun; clean-replay flag was false because unrelated pre-existing WIP remained in the worktree. AAOIFI-unscreened/execution-blocked; full 2018-01-02..2026-07-10 evidence remains unexecuted pending explicit user authorization. |
| R3-4b | **g6b-linear-factor-wide — 🧪 CODIFIED / AWAITING DEEP WIDE DATA** | A-priori v2 (`7d391ac`): v1 inputs unchanged, taken to any-equities breadth — rankable = ≥253 bars + close ≥$5 + 21d dollar-volume proxy ≥$21M; breadth floor 100 else cash; top decile capped at 50, 1/N; compact Float64Array state. 1Y wide evidence run (`9cce5a0`, run `e546f976`): 283,385 real bars / 4 MOCK excluded, 0 fills — correct by construction (253-bar warmup > 251-bar window; only 30 of 2,777 wide symbols had ≥253 bars). Deep wide backfill queued via `scripts/backfill-wide-daily.ts` (real Yahoo keyless, resumable, ~2,411 bars/symbol). Next after backfill: 2Y wide evidence run, then ONE FULL verdict run. |
| R3-5 | **allocator core — ✅ DONE** (QDR-7) | Pure DB-free allocator applies the 63-live-day validation-prior shrinkage blend, deflated-Sharpe-minus-drawdown score, deterministic seed-only tie ranking, proportional water-filling under the 40%/mode cap, and residual cash. ACCEPTED + complete-evidence + VERIFIED_COMPLIANT is fail-closed; drawdown breach benches immediately, TE breach requires revalidation, implausible evidence disqualifies, zero-score modes receive 0%, and an empty league holds 100% cash. Focused 8/8, lint/TypeScript clean; no schema, persistence, cron, broker, or auth wiring. |
| R3-6 | **G4 automation wiring + G4b TradingView + league expansion** | Only after ≥1 ACCEPTED team. Security-auditor gate MANDATORY (money path). Envelope limits by CASH not buying power (paper acct has margin debt −$82.8k). AllocationDecision model via generated migration |

## Strategy learning simulation — continuation briefs (approved 2026-07-15; one unit per session/dispatch)

Binding contract: `docs/SYSTEM_DESIGN.md` DR-14 + M10. This track is educational and does not alter
QDR-6 promotion evidence, team status, or allocator eligibility. Shared rules: no LLM-generated
executable logic; policy answers stay inside versioned reviewed bounds; knowledge answers never affect
returns; exact PIT/OOS/universe/cost/fill/Sharia/risk parity with the chosen team; first attempt sealed
before outcome reveal; retries are new labeled attempts; XP rewards mastery only; normalized-100 learner,
team, SPUS, and price-only SPY; short ≤6-month fixture first; never trigger 2018-01-02→2026-07-10.

| # | Unit | Spec (binding) |
|---|---|---|
| L0 | **contract + experience guardrails — ✅ DONE** | DR-14/M10 fixes question roles, policy bounds, sealing, replay parity, four-series comparison, immutable retries, process-first metrics, mastery rewards, anti-gambling rules, and the terminal-period prohibition. |
| L1 | **versioned curriculum + pure policy compiler — ✅ DONE** | `bollinger-mr-long-v2@v2`: seven bilingual scenarios span entry, exit, sizing, holding, and risk; two `KNOWLEDGE_CHECK`s carry correct answers/explanations and provably cannot change policy; five `POLICY_DECISION`s map through a closed enum table onto the setup's existing Zod-validated reviewed ranges. DB-free deterministic SHA-256 policy hash; educational-only tag; no replay/API/schema/UI. Focused 5/5. Next: L2 short deterministic learner replay. |
| L2 | **short deterministic learner replay — ✅ DONE** | DB-free adapter reuses `simulateSetupDaily`, the exact 25-name team universe, next-open fills/costs, unchanged risk envelope, frozen OOS boundary, and honest `UNSCREENED_EXECUTION_BLOCKED` Sharia state. A committed 7,290-row Yahoo fixture uses warm-up only before the common 2025-11-11→2026-02-11 interval; learner/team/SPUS/SPY return aligned normalized-100 series plus return/maxDD/annualized volatility/trades. Focused 4/4; no persistence, promotion verdict, or terminal-period command. Next: L3 sealed attempts + API. |
| L3 | **sealed attempt persistence + API — ✅ DONE** | Generated Prisma migration adds immutable, user-owned sealed attempts plus one-to-one replay results; POST authenticates and family-authorizes before compiling, creates the attempt before replay, resumes interrupted result writes idempotently, and appends numbered retries. GET is family-scoped and PATCH returns 409 for sealed rows. Nine API tests prove seal order, auth/IDOR defense, retry labels, idempotency/conflict handling, and zero money/order effects; security review PASS. Next: L4 mastery-loop UI. |
| L4 | **mastery-loop UI + comparison — ✅ DONE** | The Learning page now runs choose team → concept → retrieve → decide → seal → compare with immediate mechanism feedback and no P&L before sealing. A server-owned public curriculum DTO keeps executable bounds private; the result renders aligned learner/team/SPUS/price-only-SPY normalized lines, return/maxDD/annualized-volatility/trade details, and choice-to-mechanism explanations. Loading/error/empty/content states, keyboard focus, reduced motion, en/ar RTL, educational/not-advice and Sharia execution-blocked labels are present. Focused 10/10 plus lint/TypeScript clean; browser-verified desktop result and 390px Arabic RTL with zero warnings/errors. Next: L5 retrieval revisit + process-only XP. |
| L5 | **retrieval revisit + XP — ✅ DONE** | Every sealed replay now earns a fixed +20 completion reward, an immediate process-reflection can earn +15, and a persisted 24-hour spaced knowledge retrieval can earn +15. A unique per-attempt mastery ledger and serializable `addXP` transaction make retries exact-once; racing different responses return 409. The latest sealed attempt is resumable after reload, progress is en/ar RTL and mobile-ready, and the UI explicitly states that profit, loss, benchmark rank, streaks, and randomness cannot change XP. Focused 31/31 plus Prisma/lint/TypeScript clean; browser-verified 20→35/50 persistence and delayed recall in English/Arabic with zero warnings/errors. Strategy Learning L0–L5 is complete. |

**Parked with evidence (do NOT build):** PEAD long-only on liquid names — 2024 literature: 0.04–0.14%/mo
for liquid stocks (edge lives in illiquid + short side); Q4-2025 drift ≈ half historical. **Calibration
warning:** volatility-managed-portfolio ALPHA claims fail OOS (Cederburg et al.) and costs
(Barroso–Detzel) — vol targeting is a RISK layer here (R3-1), never an alpha claim.
**Chart fix (2026-07-14):** league benchmark chart emptied because real SPY/SPUS daily bars were swept
in the eval-universe cleanup (only MOCK strays remained; builder rightly refused them) — re-ingested
real Yahoo history + purged strays + re-ran both v2 daily cards to repopulate `comparison`. Stop-hunt's
card has no comparison (62-min re-run not worth it; UI falls back honestly). Rule for Codex: NEVER
delete benchmark symbols (SPY, SPUS, HLAL) from MarketBar during universe cleanups.

## R3-3 terminal authorization + R3-3.5 period presets (user directives 2026-07-14)

**R3-3:** the user authorized the terminal TOM run ("Continue the plan"). Orchestrator ran it via CLI
(full 2018–2026 + 3Y + 1Y views, seed 42, background queue3.sh). Codex: close the ledger row/card from
the persisted BacktestRun rows — do not re-run.

**R3-3.5 — period presets (NEW unit, user: "customize the period — Full 2018–2026, or 1/2/3 years"):**
- CLI: `--period FULL|3Y|2Y|1Y` resolving to date ranges anchored at the latest complete trading date
  in MarketBar (FULL = 2018-01-02→latest). Explicit `--from/--to` still wins. Tag every BacktestRun +
  results JSON with `periodPreset` (or `CUSTOM`).
- League UI: period selector (segmented control) on the team detail — renders the persisted card for
  the selected preset; missing preset = honest "not yet run" state, NEVER computed client-side.
- **Anti-period-snooping rule (binding, expert):** promotion/ACCEPTED verdicts bind ONLY to the FULL
  period. Shorter presets are EVIDENCE VIEWS: gates are evaluated and shown per-view, but a passing 1Y
  window can never promote a team (window-picking is data-snooping); short windows are labeled
  regime-specific and will usually be INSUFFICIENT_SAMPLE — that label is correct, not a bug.
- Runs per preset are seeded + persisted separately; ledger rows keep quoting FULL-period metrics.
- **Token/compute-economy rule (user directive 2026-07-14, binding):** during development and
  iteration, ALWAYS test on a SHORT period first (1Y preset or `--diagnostic` where available) —
  cheap, fast, catches wiring bugs; the expensive FULL-period run happens exactly ONCE per version,
  as the terminal verdict. Composes with anti-snooping: short runs are for correctness, never for
  verdicts; a version's card is decided only by its single FULL run.

## Continuation protocol (for ANY AI picking this up)

1. Read this file, `docs/JOURNAL.md` (top entries), `docs/QUANT_DESIGN.md` QDR-6 + §9b,
   `docs/STRATEGY_LAB.md`. Do NOT re-explore the codebase.
2. Check the status table + `git log --oneline -10` to find the frontier. If G1 landed uncommitted
   WIP, run its acceptance block (below) before building on it.
3. Dispatch per `docs/AGENTS.md` template — never freehand. One goal per dispatch. Strategy Lab loop:
   pick next CANDIDATE row in the ledger → codify (G2 framework) → run G3 harness → write report
   card → update ledger row (ACCEPTED/REJECTED with evidence) → next row.
4. Context discipline: raw bars/equity curves/MC distributions NEVER in chat — they live in DB +
   `results/*.json`; ledger carries headline metrics only; reports ≤25 lines; seeded determinism
   (seed + gitSha recorded per BacktestRun).
5. Close every milestone: JOURNAL entry (5-line format) + update this status table + commit.

## Acceptance block (identical for G1/G2/G3 implementers and QA)

```
npm run lint
npx tsc --noEmit
npx vitest run          # all green with NO API keys set (fixtures = real committed bars)
npx prisma validate     # G1 only: migration additive, @@unique constraints present
npm run backtest -- --setup gapper-orb --from 2025-01-02 --to 2025-06-30   # G3+: runs keyless on fixtures AND on Alpaca-backfilled bars, zero LLM calls
```
Integrity proofs (executed, not asserted): look-ahead injection on minute bars fails the run;
order > participation cap partially fills; −3% day halts entries; kill-switch blocks submission;
Sharia-UNSCREENED symbol never reaches execution.

## Environment facts

- Alpaca paper keys in `.env` — VERIFIED (account ACTIVE; data API reachable). Free IEX feed.
- Local Postgres up; `DATABASE_URL` set; ResearchDoc seeded (8 strategy-lab docs).
- `scripts/dispatch.mjs` routes are codex-CLI-first but the `codex` binary is NOT on this machine's
  PATH — use the native agent tool (Claude) or fix PATH before using dispatch.mjs.
- No test-data mocks in the strategy lane, ever (directive #1). App-wide mock-first invariant (§6)
  is unchanged OUTSIDE this lane.
