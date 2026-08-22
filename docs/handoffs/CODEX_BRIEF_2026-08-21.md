# Codex brief — 2026-08-21

Four independent tasks. Disjoint file scopes. Do them in any order, or in parallel — but **one at a time if a task touches the database.**

You start with zero context. Everything you need is below.

---

## READ THIS FIRST — the one thing that must never break

`docs/quant-experiments/halal-fast-momentum-cash-core-v1.json` is a **SEALED** experiment manifest.

- sha256 `829d1e8b128eac6b2b0376157884c38e9835e23c7b03b1d14466507a97c03487`
- `configHash 115a6b6f471156014cf63deb33dfbceb0929e1fbae951b212691c63dca8188b6`
- Its forward evidence window opens **2026-09-08** and closes **2036-06-24**.

**Never** run it, inspect it, edit it, reference it in code, or create a database row for it. Any backtest of that setup id — full, diagnostic, or a 1-year check — permanently destroys a 9.7-year evidence window that cannot be recreated. Verify its sha256 is unchanged before you finish any task.

The same applies to every other file under `docs/quant-experiments/`: read them, never edit them.

---

## Repo facts you will need

- Next.js 14 App Router · TypeScript 5 · Prisma 5 + PostgreSQL (Neon) · vitest
- `npx tsc --noEmit` — typecheck · `npm run lint` · `npx vitest run`
- **Known-unrelated test failures — do not fix, do not attribute to your work:** `src/quant/backtest/quant-eval.test.ts` (30s timeout) and `src/continual-harness.test.ts` / `src/continual-benchmark.test.ts` (4 failures). Baseline is **1,962 passing / 5 failing**.
- Database currently holds: `MarketBar` 520,206 rows / 216 symbols (2016-08→2026-08, all `source=YAHOO`), `Fundamentals` 12,212 rows (3,819 ANNUAL / 8,393 QUARTERLY).
- **NEVER run `prisma migrate dev`, `migrate reset`, or `db push`.** On 2026-08-19 one such command rolled back six migrations and wiped 255,000 market bars mid-session. If the schema looks wrong, STOP and report — do not repair it.
- Everything works with no API keys set. Market data is Yahoo + SEC EDGAR + Alpaca, all keyless. The strategy lane calls no LLM.

---

## TASK A — Reconcile the tail baseline  *(blocking; do this first if you do only one)*

**Problem.** Three different p95 max-drawdown figures exist for the same equity curve:

| Source | Value |
|---|---|
| `results/halal-fast-momentum-core-2018-01-02-2026-07-17-c1_verified_60.json` → `bootstrap.maxDrawdown.p95` | **0.6840** |
| The engine's own moving-block-20 bootstrap, measured on that curve | **66.55%** |
| An independent moving-block-20 implementation | **64.5%** |

Six preregistered experiments state their falsification thresholds against **68.40%**. If that number is wrong, six results become undefendable.

**What to do.** Determine which figure is correct and why the others differ. The likely cause is resampling method — the stored figure may be IID (`blockLength: 1`) while the engine now uses moving-block-20 — but **verify it, do not assume it.**

**Files.** `src/quant/backtest/monteCarlo.ts` (`bootstrapTradeOutcomes`), `src/quant/backtest/runLab.ts` (where it is called), the results artifact above.

**Acceptance.**
1. State which number is authoritative and why, with the code path that produces each.
2. Reproduce all three from the same curve, showing the parameters that generate each.
3. State whether the stored artifact figure is IID or moving-block, from evidence in the artifact or the code — not inference.
4. Report whether the 68.40% used in six manifests is correct, and if not, what each threshold should become — **as a recommendation only. Do not edit any manifest.**
5. `npx tsc --noEmit` clean.

**Do not touch.** Any manifest. Any file under `src/quant/strategies/`. `metrics.ts`.

---

## TASK B — Decompose the turnover

**Problem.** The engine turns over **27× per year**, costing **8.09% of book annually** at 15 bps/side. It holds 5 names on a 63-day signal, yet roughly three positions change every week. That looks like churn at the rank-5 boundary, not genuine signal change — but nobody has measured the split.

**What to do.** From `MarketBar` (NASDAQ, daily, 2018-01-02 → 2026-07-17), reconstruct the engine's weekly selection and decompose its turnover:

- Rank the top-60 by 21-session dollar volume, then rank by 63-day momentum skipping the last 2 sessions, positive-absolute filter, take top 5. This mirrors `src/quant/strategies/halalFastMomentumCore.ts` — read it, don't guess.
- For each weekly rebalance, classify every name that left the book: did it fall to rank 6–8, or below rank 8?
- Count names that exit and **re-enter within 2, 3, or 4 weeks** — that is the churn a hysteresis band would eliminate.

**Report.** What fraction of exits fall in the 6–8 band; the re-entry rate at each window; and how much annual turnover a "buy at rank ≤5, hold until rank >8" rule would remove.

**Acceptance.** Actual numbers over the full window, the script you used, and a one-paragraph statement of how much of the 8.09% annual cost hysteresis could plausibly recover.

**Do not.** Edit any strategy file. Run any backtest through `runLab`. Preregister anything — this is measurement that informs a preregistration someone else will write.

---

## TASK C — Market cap for the AAOIFI screener

**Problem.** `computeAaoifiScreen` requires a market capitalisation to apply the 30/30/5 screen. `marketCapUsd` is present in **0 of 120 sampled `Fundamentals` rows**, across both ANNUAL and QUARTERLY. As it stands the screener **can never return `compliant: true`** from that table. It is dead on arrival and nobody will notice until it is wired.

**What to do.** Source market cap from a free, keyless source with point-in-time integrity, and make it available to the screener.

- Shares outstanding is available from SEC EDGAR companyfacts (`dei:EntityCommonStockSharesOutstanding`), which the repo already fetches — see `src/quant/data/pitFundamentalsFetch.ts`.
- Market cap = shares outstanding × price, and prices are already in `MarketBar`.
- **Point-in-time discipline is mandatory:** the SEC `filed` date gates visibility, never `asOf`. A filing describes a period that ended before anyone could read it. Follow the existing pattern in `src/quant/data/pitFundamentalsBackfill.ts`, which already handles this and rejects year-to-date figures masquerading as quarters.

**Acceptance.**
1. Coverage achieved: rows and symbols now carrying shares outstanding.
2. Proof of no look-ahead — the pipeline has an existing verification; run it and report the violation count. It must be 0.
3. A worked example: one symbol, one date, shares × price = market cap, with the filing date that made it visible.
4. `Fundamentals` row count unchanged at 12,212 unless you deliberately add rows — if you add, say exactly how many and why.
5. `npx tsc --noEmit` clean; `npm run lint` clean; `npx vitest run` at the baseline above.

**Do not.** Create or run a migration. Touch `src/quant/strategies/`, `src/quant/backtest/`, or `src/quant/execution/`.

---

## TASK D — Close the stale subscription-tier window

**Problem.** `src/lib/auth.config.ts:59-68` writes the user's `tier` into the JWT at sign-in only (`if (user) {...}`). It is never re-derived per request. **A cancelled or downgraded subscription keeps its paid capabilities until the user next logs out and back in.** Signed tokens mean it is not self-mintable, but it is a real revenue leak.

Two related defects were already fixed (a cross-user write on children's academy progress, and a NASDAQ trading route with no tier check at all) — see commit `5fdb7f4`. This is the one deferred from that work.

**Why it was deferred.** `auth.config.ts` is deliberately edge-safe — it imports no Prisma, because `src/middleware.ts` runs it on the edge runtime. A fix therefore needs either an edge-safe re-check or a TTL-based refetch in `src/auth.ts`'s jwt callback.

**Acceptance.**
1. State the mechanism and why it is edge-safe.
2. A test proving a downgraded tier loses its capabilities **without** requiring re-login.
3. A test proving the fix does not break the edge runtime — `src/middleware.ts` must still work.
4. State the staleness window your design leaves (a TTL refetch leaves one; say how long).
5. `npx tsc --noEmit` clean; `npm run lint` clean; `npx vitest run` at the baseline.

**Do not.** Weaken any authorization check. Touch `src/quant/`.

---

## Global rules

1. **No `prisma migrate dev` / `migrate reset` / `db push`.** Ever.
2. **No backtests.** Not full, not diagnostic, not a 1-year check.
3. **Never edit a file under `docs/quant-experiments/`.**
4. Verify the sealed manifest's sha256 is unchanged before finishing any task.
5. If a fix appears to require touching a fenced file, **stop and report** rather than widening scope.
6. Report actual command output, not assertions. "Tests pass" is not evidence; the counts are.
7. If you cannot determine something, say so. An honest gap is worth more than a confident guess.
