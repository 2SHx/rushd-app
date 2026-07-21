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
| G3f evidence governance + PIT audit | quant-validation-auditor + data-engineer | ✅ DONE | Independent audit removed the 2026-survivor sleeve cards from clean-frontier use; terminal runs for the 12 affected setups now fail closed pending historical membership/lifecycle/Sharia snapshots. Sealed manifests atomically cap each version at one diagnostic + one FULL, distinct agents own hypothesis/implementation/audit/run, DSR counts the 90-trial related family, and book-day MC uses a seeded 20-day moving-block bootstrap. Direct API FULL is blocked; only the sealed CLI may claim it. |
| QA gates over G1–G3 | qa-reviewer | ⏳ PENDING | same acceptance blocks as implementers; different model than implementer |
| **PAUSE — report card to user** | — | ⏳ | present measured distribution incl. P(day≥5%), MC drawdown percentiles. STOP HERE. |
| G4 automation wiring (paper) | backend-expert + security-auditor | 🔒 POST-PAUSE | premarket+intraday signed-cron passes, −3% daily circuit breaker, envelope caps; NOTE: Alpaca paper acct shows negative cash (−$82.8k, margin used by old paper trades) — envelope must limit by CASH not buying power. **Superseded for INCUBATION by QDR-8 (2026-07-19):** incubation-book daily automation proceeds NOW via R4 units B1/B2 below (cash-not-buying-power rule kept; account user-reset to $1,000,000 clears the margin debt); this row's ACCEPTED-league scope is otherwise unchanged. **Amended 2026-07-19b (see QDR-8 as amended): the account is NOT reset — cash −$82,800.08 / buying power $0 verified; capital is the $1,000,000 internal-sim virtual bankroll (`InternalSimBroker`); Alpaca is data-only** |
| G4b TradingView webhooks + deep links | backend-expert + security-auditor | 🔒 POST-PAUSE | HMAC-signed `/api/quant/webhooks/tradingview` → same Sharia gate/envelope pipeline; dark until secret set |
| G5 strategy UI on /quant | frontend-expert + design-reviewer + i18n | ✅ REPORT-CARD UI DONE; PAPER P&L GATED | DB-backed `/quant/league`: accepted + rejected terminal teams, normalized model/SPY/SPUS history, OOS risk, promotion gates, exact persisted trade/P&L drill-down when available, and honest legacy states. Isolated paper-book P&L remains gated until an ACCEPTED team exists. |
| G6a RL lane (PPO baseline) / G6b linear cross-sectional factor | quant-strategist + architect | 🔄 G6b DONE / REJECTED; G6a PARKED | G6b wide v2 FULL: 90 active months, OOS DSR 0.000, MC p95 DD 54.86%, plateau FAIL, UNSCREENED; exact card in STRATEGY_LAB. RL remains experimental and requires a separate QDR-3 decision. |
| R4-B1 daily incubation-book automation | backend-expert + security-auditor | ✅ DONE | Four authorized QDR-8 books run through `simulateStrategyBook` in one signed daily pass; generated `AllocationDecision` + `BookEvaluation`, persisted strategy-scoped $1M InternalSim ledgers, cash-only ≤40% allocator, expiring per-(day,book) claim leases, −3% breaker, fail-closed Sharia, DB/env pre-submit kill-switch, and paper-only label; focused B1 suite green. |
| R4-B2 nightly incubation evaluation | backend-expert + security-auditor | ✅ DONE | Signed after-close pass backfills every unmarked strategy-book snapshot through the real SPY/SPUS watermark, writes real benchmark marks plus `BookEvaluation` NAV/daily P&L/current peak-to-trough drawdown/tracking error, and persists drawdown/TE auto-bench + revalidation flags consumed by B1; token-matched claims make same-day reruns no-ops. |
| R4-E1 momentum v4 | quant-strategist | ✅ DONE / REJECTED | FULL `d00c79b` / `9fd3f2d5`: 1,693 records, CAGR 7.00% / OOS 13.11%, DSR 0.556 / 0.428, realized maxDD 18.31% but MC p95 DD 41.49%, plateau FAIL; C1 cleared the Sharia-verification failure. No retune/admission. |
| R4-E2 Bollinger MR v3 | quant-strategist | ✅ DONE / REJECTED | FULL `d4814b6` / `4b2d4085`: breadth delivered 625 trades and plateau PASS, but OOS DSR 0.388, MC p95 DD 58.45%, and ruin 5.50% rejected it; C1 cleared Sharia. No retune/admission. |
| R4-E3 multi-mode book v1 | quant-strategist | ✅ DONE / REJECTED | FULL `455d8ea` / `8aed13a7`: 428 trades, OOS CAGR 21.46%, DSR 0.729, plateau PASS, ruin 0.50%, but MC p95 DD 46.40%; C1 VERIFIED. No retune/admission. |

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
the AUTO_PAPER league; ACCEPTED never means guaranteed profit or AUTO_REAL permission.
**QDR-8 amendment (2026-07-19, supersedes "Only ACCEPTED joins the AUTO_PAPER league" for the
INCUBATION tier only — original text stands for the ACCEPTED league):** a REJECTED version whose
terminal card shows positive OOS return may, with explicit per-version user authorization, forward-test
daily in an isolated capped paper INCUBATION book labeled "unpromoted forward test — paper only";
≥63 incubation book-days may combine with the version's single FULL-run card for ACCEPTED
(promotion path v2). Full rules in `docs/QUANT_DESIGN.md` QDR-8; AUTO_REAL stays dark (QDR-2). Every completed
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

1. **R3 terminal sequence — DONE / REJECTED through R3-4b:** momentum-v3, dual-momentum rotation,
   turn-of-month, and the wide linear factor all have terminal cards. G6b-wide's FULL verdict is
   REJECTED on sample, OOS, DSR, drawdown, plateau, and Sharia-verification gates; never rescue it
   with the stronger 2Y evidence view or retune v2 against viewed OOS results.
2. **Frontend completion:** G5 report-card views and the shared Rushd/Alpaca portfolio dashboard are
   complete. Continue M9 responsive/accessibility consistency on the remaining non-auth surfaces,
   preserving the explicit 2D committee decision; add isolated paper-book P&L only after an ACCEPTED
   team exists. Every terminal state remains visible; rejection is never filtered out.
3. **Finish the remaining frozen hypotheses:** stop-hunt-reversal-long is terminal REJECTED; validate
   bagholder-bounce and then time-of-day in that pre-registered order. No tuning against viewed OOS.
4. **G6b model class — DONE / REJECTED:** the monthly long-only wide factor was deterministic and
   explainable but failed its single FULL verdict. RL/G6a stays experimental and cannot be used as a
   post-hoc rescue without its separate architecture decision and the identical promotion gates.
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
| R3-4b | **g6b-linear-factor-wide — ✅ DONE / REJECTED** | Final FULL `ff73b4f` / `fff3d286`, seed 42: 2,767 symbols; 4,481,246 resolved real bars / 2 MOCK excluded; 90 active book-months (31 OOS), 1,666 fills / 827 name exits; CAGR 5.71% / OOS 0.00%; DSR 0.374 / 0.000; MC p95 DD 54.86%; terminal plateau FAIL; `P(day≥+5%)=0.32%`, `P(day≤−5%)=0.32%`. Ordered reasons: `INSUFFICIENT_SAMPLE`, `OOS_FAILURE`, `DSR_FAILURE`, `DRAWDOWN_RISK_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE`. Exact card in STRATEGY_LAB; no AUTO_PAPER and no rerun/retune. |
| R3-5 | **allocator core — ✅ DONE** (QDR-7) | Pure DB-free allocator applies the 63-live-day validation-prior shrinkage blend, deflated-Sharpe-minus-drawdown score, deterministic seed-only tie ranking, proportional water-filling under the 40%/mode cap, and residual cash. ACCEPTED + complete-evidence + VERIFIED_COMPLIANT is fail-closed; drawdown breach benches immediately, TE breach requires revalidation, implausible evidence disqualifies, zero-score modes receive 0%, and an empty league holds 100% cash. Focused 8/8, lint/TypeScript clean; no schema, persistence, cron, broker, or auth wiring. |
| R3-6 | **G4 automation wiring + G4b TradingView + league expansion** | Only after ≥1 ACCEPTED team. Security-auditor gate MANDATORY (money path). Envelope limits by CASH not buying power (paper acct has margin debt −$82.8k). AllocationDecision model via generated migration. **Superseded for INCUBATION by QDR-8 (2026-07-19):** the "≥1 ACCEPTED team" gate no longer blocks INCUBATION-book automation (executed as R4 B1/B2, where the AllocationDecision migration now lands); it still binds ACCEPTED-league automation, G4b webhooks, and league expansion |

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
| L6 | **Mavericks learning bridge + exact-team evidence gate — ✅ DONE** | A shared capability registry marks only reviewed deterministic learning modules. League selection performs a lightweight auth-scoped completion check for the exact `setupId`; `bollinger-mr-long-v2` hides detailed evidence until its sealed comparison exists, deep-links into Learning, and returns to the same team. Unsupported teams show an honest module-validation state and retain labeled research evidence until their real replay ships—no substitute simulation. |
| L7 | **per-team curriculum + deterministic replay expansion — NEXT, one setup per unit** | Add one reviewed module per visible terminal league setup: 5–8 bilingual knowledge/policy questions, pure bounded compiler, frozen ≤6-month PIT replay through the exact strategy engine, and learner/team/SPUS/price-only-SPY comparison. Every module must independently pass future-bar, non-MOCK, cost/fill, risk, and Sharia-parity tests; never run the protected terminal evidence period. |
| L8 | **universal Mavericks learning gate — after L7 coverage** | Only after every visible league team has a reviewed module: hide all detailed metrics, historical comparisons, and trade ledgers until that exact setup has a sealed result. Cross-team completions and direct URL selection fail closed; standings remain a high-level discovery surface. |

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

## R4 — Incubation push briefs (2026-07-19; execute in order, one unit per session/dispatch)

Binding contract: `docs/QUANT_DESIGN.md` **QDR-8** (paper INCUBATION tier + daily-target readout
policy) on top of QDR-5/6/7. User decisions 2026-07-19 (binding, do not re-litigate): (1) the four
near-miss versions — `ts-momentum-halal-basket-v3`, `bollinger-mr-long-v2`,
`ts-momentum-halal-basket-v2`, `dual-momentum-rotation` (ledger rows + terminal cards in
`docs/STRATEGY_LAB.md`; params NEVER retuned for incubation) — trade daily paper NOW in isolated
capped INCUBATION books labeled **"unpromoted forward test — paper only"**; (2) *(amended
2026-07-19b — the originally written Alpaca user-reset is unavailable: account cash −$82,800.08 /
buying power $0 verified live)* the **$1,000,000 virtual bankroll lives in the internal paper-sim
book ledgers** (`InternalSimBroker`, the existing keyless path in `src/quant/execution/`),
Decimal-exact, marked from real persisted bars, fills through the existing cost/slippage model;
Alpaca is **data-only** (bars/ingest only; the account wallet is never touched); envelope still
limits by CASH — the virtual book cash — never buying power; the optional gated legacy-liquidation
mirror requires explicit user authorization + security-auditor gate and is never a B1 dependency;
(3) the verified halal universe is built this phase at **zero data cost**
(QDR-8 Sharia tiers; i18n-fintech-expert gate; fail-closed). AUTO_REAL stays dark (QDR-2). Honest
framing unchanged: **$1,000/day is ONLY ever a measured $/day run-rate + capital-needed readout** —
no promised returns anywhere.

Shared rules (every unit): reuse surface is `src/quant/automation/autoRun.ts` + `AutoRunClaim` +
`QuantControl` + `src/quant/execution/executeDecision.ts` + the DONE pure allocator
`src/quant/allocation/allocator.ts` (R3-5, unwired) — no worker/queue/second service (QDR-5) · zero
LLM calls in this lane · all money `Decimal` · zero-key `npx vitest run` stays green · token economy
(QDR-8): NO whole-market runs ever; universes capped at the 25-name research sleeve or the halal top
~100 by dollar-volume; short (`--period 1Y` / `--diagnostic`) first, FULL exactly ONCE per version;
raw results on disk (`results/*.json` + DB), ≤25-line cards in chat. E-units additionally: seed 42 ·
a-priori pre-registered params attacking the parent's ordered rejection codes · no tuning against
viewed OOS · terminal QDR-7 evidence card + `docs/STRATEGY_LAB.md` ledger row + JOURNAL line + commit.
Acceptance commands (all units): `npm run lint` · `npx tsc --noEmit` · `npx vitest run` (no API
keys). E-units add: `npm run backtest -- --setup <id> --period 1Y --seed 42` (diagnostic evidence
view; the single FULL run is the terminal verdict and follows only after the 1Y wiring check).

| # | Unit | Owner | Spec (binding) |
|---|---|---|---|
| B1 | **daily incubation-book automation** | backend-expert + **security-auditor gate MANDATORY** (money path) | Wire the four QDR-8 charter books into one daily signed-cron pass reusing `autoRun.ts` + `executeDecision.ts` (orders via `executeDecision` to **`InternalSimBroker`** — Alpaca is **data-only** and its account wallet is never touched; the optional gated legacy-liquidation mirror is explicitly OUT of B1 scope) — decisions come from the **same engine code path as `simulateStrategyBook`**, never a parallel reimplementation; zero LLM. Additive **generated** Prisma migration adds `AllocationDecision` (QDR-7 §4 shape, `@@unique([asOf])`) + `BookEvaluation` (per-(book, day) marks: NAV, daily P&L, drawdown, tracking error, bench flags; unique per (book, asOf)). Wire `src/quant/allocation/allocator.ts` to split the **$1,000,000 virtual bankroll** (isolated `Decimal` book ledgers in the internal sim) across books (≤40%/book, bench=0% allowed) and persist every split as an `AllocationDecision`. Envelope limits by **CASH, never buying power**; per-book **−3%/day breaker** halts that book's new entries; `QuantControl.halted` + `QUANT_KILL_SWITCH` checked **before every submission**; idempotency via per-**(day, book)** `AutoRunClaim` key. Every output labeled "unpromoted forward test — paper only". Tests: concurrent double-fire yields one claim per (day, book); breaker halts entries; kill-switch rejects pre-broker; cash-envelope proof; keyless suite green. |
| B2 | **nightly evaluation loop** | backend-expert | Second signed-cron pass after close: mark every incubation book from real persisted bars, write one `PortfolioSnapshot` + one `BookEvaluation` row per (book, day) — NAV, daily P&L, peak-to-trough drawdown, live-vs-card tracking error. A drawdown-breaker or TE-bound breach sets a persisted **auto-bench flag consumed by B1's next-morning pass** (benched book ⇒ 0% allocation, no new entries; TE breach additionally requires re-validation before un-bench — QDR-7 semantics). Idempotent per (day, book) via `AutoRunClaim`; no worker/queue. These rows ARE the ≥63 book-day evidence series for QDR-8 promotion path v2. Tests: same-day re-run is a no-op; injected breach ⇒ flag ⇒ next-run bench; keyless green. |
| C1 | **zero-cost verified halal universe** | backend-expert + **i18n-fintech-expert gate** | Build the verified universe from QDR-8's three tiers: **Tier-1** published SPUS/HLAL fund holdings (index-provider AAOIFI screening) → **Tier-2** own AAOIFI screener over already-ingested SEC XBRL fundamentals (interest-debt <30% mcap, interest-securities <30% mcap, non-compliant income <5%, sector screen) → **Tier-3** optional `ZOYA_API_KEY`. **No scraping other apps.** Persist per-name verification tier + **purification ratio (نسبة التطهير)** from non-compliant income share (additive migration if a model is needed). The i18n-fintech-expert gate DECIDES which tier(s) count as `VERIFIED_COMPLIANT` — **fail-closed**: unverified/lapsed names are execution-blocked, drop out of the universe, and open positions are sold to flat on the next pass. Deliver the top ~100-by-dollar-volume verified sleeve (E2's universe). Any user-facing strings land in en+ar key-identical. Tests: fail-closed drop-out + flatten; purification ratio persisted per name; keyless green on committed real-holdings snapshots (no synthetic data). |
| D1 | **daily profit cockpit** | frontend-expert + **design-reviewer + i18n parity gates** | Portfolio dashboard: measured **$/day vs the $1,000 target** shown ONLY as trailing realized run-rate + "capital needed at measured run-rate" (QDR-8 readout policy — never a projection or promise); per-incubation-book P&L + NAV lines vs **SPUS + SPY from real persisted bars only**. **REMOVE the simulated 30-day fallback curve**: `demoSnapshots` + `demoMetrics` in `src/components/DashboardClient.tsx` (~lines 165–193) — no fabricated series anywhere; missing data renders the honest empty state. All four states (loading/empty/error/populated); "unpromoted forward test — paper only" label on every book figure; en+ar key-identical; RTL logical props (ui-craft). Tests: source-scan proves no fabricated series; empty-data state renders; keyless green. |
| E1 | **ts-momentum-halal-basket-v4** | quant-strategist | Parent v3 REJECTED — ordered codes `DSR_FAILURE`, `DRAWDOWN_RISK_FAILURE`, `SHARIA_UNVERIFIABLE` (final run `d3d0071` / `f9e5f702-…`, card in STRATEGY_LAB). v4 pre-registers BEFORE any run: an **a-priori drawdown-responsive exposure governor** (book-drawdown-scaled de-risking to cash, parameters frozen a-priori) attacking `DRAWDOWN_RISK_FAILURE`, plus C1's verified universe/screening state attacking `SHARIA_UNVERIFIABLE`; v3's signal family otherwise unchanged. New CANDIDATE, never a retune. 1Y diagnostic first; ONE FULL terminal run; QDR-7 card + ledger + JOURNAL + commit; seed 42; no tuning against viewed OOS. |
| E2 | **bollinger-mr-long-v3** | quant-strategist | Parent v2 REJECTED — ordered codes `OOS_FAILURE`(walk-forward flag), `DSR_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE` (corrected card in STRATEGY_LAB). v3 attacks DSR + plateau via **breadth**: the same MR entry/exit family on **C1's halal universe capped at top ~100 by dollar-volume** (more independent names/trades ⇒ honest DSR; plateau over the frozen a-priori neighborhood). Depends on C1. Pre-registered a-priori; 1Y diagnostic first; ONE FULL terminal run; QDR-7 card + ledger + JOURNAL + commit; seed 42; no tuning against viewed OOS. |
| E3 | **multi-mode-book-v1** | quant-strategist | Pre-registered NEW candidate: one shared-cash book (`simulateStrategyBook` engine) combining the momentum + mean-reversion + dual-momentum sleeves via the pure allocator `src/quant/allocation/allocator.ts`, sleeve weights + rebalance rule frozen a-priori before any run. Attacks the parents' binding codes by construction: low-correlation combination targets `DSR_FAILURE` + `DRAWDOWN_RISK_FAILURE` (momentum/MR) and `INSUFFICIENT_SAMPLE` (dual-momentum's 11 episodes — the combined book trades more). 1Y diagnostic first; ONE FULL terminal run; QDR-7 card + ledger + JOURNAL + commit; seed 42; no tuning against viewed OOS. |
| E4 | **bagholder-bounce v1** | quant-strategist | ✅ DONE / REJECTED — FULL `cecc9d4` / `b98e0145`: 247,565 real Alpaca-IEX bars, 682 symbol-days, zero qualifying trades; `INSUFFICIENT_SAMPLE`, `OOS_FAILURE`, `DSR_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE`. No retune/admission. |
| E5 | **time-of-day v1** | quant-strategist | ✅ DONE / REJECTED — FULL `6fde71d` / `53430eca`: 262 trades, −0.23% mean/trade, OOS CAGR −30.28%, DSR 0.448, maxDD 50.51%, MC p95 DD 65.45%, ruin 47%; timing constraints did not rescue the lane. No retune/admission. |

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
