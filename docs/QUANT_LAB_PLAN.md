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
| G2 StrategySetup framework + Tier-1 catalog | quant-strategist | ⏳ PENDING | `src/quant/strategies/` — `StrategySetup` interface (id, versioned params, screen/entry/exit, PIT-only, emits AnalystSignal-compatible output); then one dispatch per ledger CANDIDATE (gapper-orb first) |
| G3 intraday backtest + MC + CLI | quant-strategist | ⏳ PENDING | minute-bar engine variant (spread-crossing fills, vol-scaled slippage, participation cap, LULD halt windows, decide-on-bar/fill-next-bar), `src/quant/backtest/monteCarlo.ts` (bootstrap, maxDD percentiles, risk-of-ruin, entry-jitter permutation, fractional-Kelly clamped by envelope), validation report card, **`npm run backtest -- --setup <id> --from <date> --to <date> [--symbols ...]`** persisting BacktestRun + `results/<setup>-<range>.json` |
| QA gates over G1–G3 | qa-reviewer | ⏳ PENDING | same acceptance blocks as implementers; different model than implementer |
| **PAUSE — report card to user** | — | ⏳ | present measured distribution incl. P(day≥5%), MC drawdown percentiles. STOP HERE. |
| G4 automation wiring (paper) | backend-expert + security-auditor | 🔒 POST-PAUSE | premarket+intraday signed-cron passes, −3% daily circuit breaker, envelope caps; NOTE: Alpaca paper acct shows negative cash (−$82.8k, margin used by old paper trades) — envelope must limit by CASH not buying power |
| G4b TradingView webhooks + deep links | backend-expert + security-auditor | 🔒 POST-PAUSE | HMAC-signed `/api/quant/webhooks/tradingview` → same Sharia gate/envelope pipeline; dark until secret set |
| G5 strategy UI on /quant | frontend-expert + design-reviewer + i18n | 🔒 POST-PAUSE | screener table, paper P&L, MC fan, report card — all labeled simulated/paper, en+ar |
| G6a RL lane (PPO baseline) / G6b linear cross-sectional factor | quant-strategist + architect | 🔒 POST-PAUSE | identical gates; Python sidecar only via QDR-3 architect decision |

## Continuation protocol (for ANY AI picking this up)

1. Read this file, `docs/JOURNAL.md` (top entries), `docs/QUANT_DESIGN.md` QDR-6 + §9b,
   `docs/STRATEGY_LAB.md`. Do NOT re-explore the codebase.
2. Check the status table + `git log --oneline -10` to find the frontier. If G1 landed uncommitted
   WIP, run its acceptance block (below) before building on it.
3. Dispatch per `docs/AGENTS.md` template — never freehand. One goal per dispatch. Strategy Lab loop:
   pick next CANDIDATE row in the ledger → codify (G2 framework) → run G3 harness → write report
   card → update ledger row (VALIDATED/PARKED/REJECTED with evidence) → next row.
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
