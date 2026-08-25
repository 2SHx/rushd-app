# Codex brief — survivorship measurement, round 2 (unblocking my own constraints)

**Author:** orchestrator, 2026-08-25 · **Branch:** `fix/db-safety-and-continual-governance` (base `9b79714`)

## Why this exists

Round 1 returned DEFER with M1–M3 all `unavailable, not zero`. That was the correct call **on the constraints I gave you**, and the refusal to publish a corrected statistic was right.

But two of the three blockers were caused by my brief, not by the evidence:

| Round-1 blocker | Cause | Status |
|---|---|---|
| `M1_MARKET_BAR_DATE_INVENTORY_NOT_COMMITTED` | I wrote "no DB write" and "no network"; you reasonably read that as committed-artifacts-only | **My error.** A read-only query was always allowed |
| `M2_CONFIRMED_DELISTING_LIFECYCLE_NOT_COMMITTED` | I wrote "runs with no network", which ruled out the free keyless SEC fetch that resolves exactly this | **My error.** Capture is authorised below |
| `M2_63_TRADING_DAY_WINDOW_INTERVAL_CENSORED` | Quarterly holdings with a ~2-month report lag cannot locate a removal inside a 63-day window | **Real and structural.** Mitigated, never eliminated |

This round lifts the two artificial limits and asks you to state the third honestly rather than solve it.

## Standing rules, unchanged

- **Read the database; never write to it.** No migration, no insert, no update, no snapshot persisted. One writer holds this DB and it is not you.
- **Never publish a corrected CAGR, Sharpe, or drawdown.** This measures exposure, not performance. Round 1 honoured this; keep honouring it.
- **Never set `lifecycleCoverage.delisted = true`**, never edit `pointInTimeMembership.ts`, never touch a gate, threshold, breaker, reason code, or any SEALED/CODIFIED manifest.
- **Never persist delisted bars.** `MarketBar` is symbol-keyed and would silently merge a reused ticker across two different companies. That schema fix is not in this task.

---

## R1 — Finish M1 with a read-only inventory

`MarketBar` holds 529,718 rows across 221 symbols. Query it directly.

For each of the 25 formation dates, `availableMembers` = identified members having ≥1 `MarketBar` row **at or before that date** — not "the symbol exists in the table today". Emit coverage per date plus the missing-symbol list.

A flat 100% coverage means the query is wrong. Treat it as a bug.

Reads are slow here (~330ms per round trip, 2.9–5.4s cold). Fetch in one query, not per symbol. `npm run db:warm` before starting.

## R2 — Capture Form 25 and classify the 107

`pitDelistingFetch.ts:53` `fetchForm25History(symbol, cik)` and `loadTickerToCik` already work against `data.sec.gov`: free, keyless, no account. `pitDelistingLifecycle.ts:138,153,199` already parse and confirm.

Capture Form 25 for all 107 permanent removals and **byte-pin the responses as immutable fixtures**, exactly as `scripts/capture-spus-nport.ts` does for N-PORT. Once pinned, the measurement re-runs offline and reproducibly.

Classify each removal into: `CONFIRMED_DELISTING` (Form 25 filed and confirmed), `NO_FORM_25` (still listed — an index or screen removal, not a survivorship event), or `UNRESOLVED` (CIK or filing ambiguous). **Keep the three counts separate. Never merge them.**

Respect SEC rate limits and keep the existing `User-Agent`. If SEC is unreachable, stop and report — do not substitute another source.

## R3 — M2 within the censoring, stated honestly

For each `CONFIRMED_DELISTING`, Form 25 gives an exact effective date and N-PORT gives presence at the preceding snapshot. That yields a **bounded** answer, not an exact one:

- **Lower bound:** delistings whose effective date falls within 63 trading days of a snapshot where the name was present — the engine demonstrably could have ranked it.
- **Upper bound:** all confirmed delistings whose last-present snapshot precedes the delisting.

State the censoring in one line beside the numbers: *quarterly holdings with a ~2-month report lag cannot place a removal inside an exact 63-trading-day window; these bounds are the best this evidence supports.*

Do not close that gap by interpolation, and do not assume a name held its position between snapshots.

## R4 — The window finding *(state it plainly; it may matter more than M1–M3)*

Captured coverage runs **2020-07-28 → 2026-07-29**. The backtest window is **2018-01-02 → 2026-07-17**. SPUS's true inception is **2019-12-18**.

So roughly 30% of the backtest window has no membership evidence and **cannot** have any from SPUS N-PORT — the fund did not exist.

Report, as a first-class finding:
- the exact number of engine formation dates in the backtest window that fall before the first captured snapshot;
- whether any other halal ETF's N-PORT could cover 2018–2020 (HLAL launched mid-2019; check, do not assume), and state plainly if nothing covers 2018–2019;
- the earliest date from which a PIT-correct membership series is achievable at all.

**Do not recommend shortening the backtest window.** That is a QDR decision for the research director. Give the dates and the consequence; stop there.

## Deliverable

Update `docs/quant-experiments/survivorship-coverage-measurement.md` in place, preserving its structure and its exposure-only discipline. Lead with the decision:

> M1 coverage ranged X%–Y% across N dates. Of 107 permanent removals, C were confirmed delistings, R had no Form 25, U unresolved. Delisting-adjacent opportunities: between L and U events. A PIT-correct membership series is achievable only from DATE. **Recommendation: buy / do not buy, because …**

If the honest answer is still DEFER, say so — but it must now rest on measured counts, not on absent inputs.

## Acceptance

1. `npx tsc --noEmit` exits 0; `npm run lint` clean.
2. After capture, the measurement re-runs **fully offline** and two cold renders produce an identical SHA-256, as round 1 achieved.
3. Every number reproducible by one named command, with actual output lines reported.
4. Captured Form 25 fixtures committed as immutable artifacts alongside the memo.
5. Suite no worse than baseline: **7–8 failures, all DB-latency in `portfolio.test.ts` and `quant-eval.test.ts`**. Name any new failure and prove whether it is pre-existing.

## Scope fence

Touch only: `scripts/measure-survivorship-coverage.ts`, a new capture script under `scripts/`, the Form 25 fixture directory, `src/quant/universe/survivorshipCoverageMeasurement.test.ts`, and the memo.

**Timebox: one working session.** If Form 25 resolves fewer than half the 107, that is itself the finding — report the resolution rate and stop.

Report: `STATUS / CHANGES (file:lines) / DECISIONS / VERIFY (commands + actual output) / OPEN`.
