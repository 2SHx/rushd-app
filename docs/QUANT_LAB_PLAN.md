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
| G3 intraday backtest + MC + CLI | quant-strategist | ✅ DONE | `intradayEngine.ts` (decide-on-close/fill-next-open, vol-scaled slippage, participation-cap partial fills, halt-gap no-fill, EOD flat, envelope-clamped), seeded `monteCarlo.ts` (bootstrap+jitter permutation+Kelly via applyEnvelope), `distribution.ts` P(day≥+5%)/P(day≤−5%)+3σ flag, `reportCard.ts`, `npm run backtest` CLI (BacktestRun + results/*.json, gitignored). 353 tests green. Fixture run terminal result: REJECTED (`INSUFFICIENT_SAMPLE`; IEX volume undercount fails 10M screen). Multi-symbol = pooled independent sims (shared-cash portfolio engine out of scope) |
| G3b historical snapshots | data-engineer | ✅ DONE | commit `b1cc65c`: 12,974 PIT checkpoint snapshots (20 symbols × 90d), 100% SEC-XBRL mcap coverage, idempotent. FINDING: zero symbol-days pass 10M cumVolume — IEX feed = few % of consolidated tape (real moves exist, e.g. HUT +25.46%); threshold needs measured feed-aware params |
| G3c IEX calibration + validation run | quant-strategist | ✅ DONE | commit `55a1021`: measured median IEX/consolidated volume ratio 3.28% → additive `v1-iex`; full 90-day/20-symbol run produced 0 trades; terminal result REJECTED (`INSUFFICIENT_SAMPLE`), with a new version/run allowed after G3d |
| G3d PIT micro-cap gapper universe | data-engineer | ✅ DONE | commit `0c181d6` + runs: 2,764-symbol NASDAQ universe, 394 PIT candidate gap days (mcap-at-date via SEC-XBRL, corporate-action screened), 110k candidate-day minute bars + 394/394 snapshots (100% mcap) |
| Team A genuine validation run | — | ✅ DONE | gapper-orb@v1-iex on 153 real micro-caps: 76 trades, hit 31.6%, −4.19%/trade, ruin 99.9% → **REJECTED (NEGATIVE_EXPECTANCY)**. Finding: long gap-continuation is the losing side; documented edge is short-side (Sharia-excluded). BacktestRun 270cabf5, gitSha 9db80b9 |
| Modes B/C/D daily validations | quant-strategist | ✅ DONE | all honestly REJECTED with terminal cards: B OOS collapse + MC p95 75% (a6f8d4b) · C OOS −45% + MC p95 81% + jitter p=0.108 (200bae4) · D 9 trades INSUFFICIENT_SAMPLE, Sharpe 5.05 auto-flagged IMPLAUSIBLE (9db80b9). Shared findings: full-cash-per-name sizing amplifies DD; daily deep-history backfill (backwards) is the unlock for v2s |
| QA gates over G1–G3 | qa-reviewer | ⏳ PENDING | same acceptance blocks as implementers; different model than implementer |
| **PAUSE — report card to user** | — | ⏳ | present measured distribution incl. P(day≥5%), MC drawdown percentiles. STOP HERE. |
| G4 automation wiring (paper) | backend-expert + security-auditor | 🔒 POST-PAUSE | premarket+intraday signed-cron passes, −3% daily circuit breaker, envelope caps; NOTE: Alpaca paper acct shows negative cash (−$82.8k, margin used by old paper trades) — envelope must limit by CASH not buying power |
| G4b TradingView webhooks + deep links | backend-expert + security-auditor | 🔒 POST-PAUSE | HMAC-signed `/api/quant/webhooks/tradingview` → same Sharia gate/envelope pipeline; dark until secret set |
| G5 strategy UI on /quant | frontend-expert + design-reviewer + i18n | 🔒 POST-PAUSE | screener table, paper P&L, MC fan, report card — all labeled simulated/paper, en+ar |
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
| R2-5 G4 automation + QDR-7 allocator + G4b TradingView + G5 league UI | backend-expert / frontend-expert + security & design gates | ⏳ | build after validations; automation activates only for ACCEPTED teams (may be zero — league renders honestly empty) |

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
