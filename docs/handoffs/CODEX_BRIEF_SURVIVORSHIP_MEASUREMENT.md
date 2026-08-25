# Codex brief — measure the survivorship bias before buying any data

**Author:** orchestrator, 2026-08-25 · **Branch:** `fix/db-safety-and-continual-governance` (base `3e25556`)

## Why this exists

Your A′ probe established that delisted price history is reachable (Alpaca SIP returned ATVI 1,456 bars, TWTR 1,215) but not licensable for free, and that **320 historical symbols appear in captured N-PORT snapshots against 217 in today's fixture — 108 absent.**

The next decision is whether to pay for that data. **Do not answer it by buying the data.** Answer it by measuring what its absence is worth, using only artifacts already on disk.

**This task costs nothing:** no license, no API key, no network, no money, no migration, no DB write.

## What this task can and cannot produce

**Can:** a number describing how much of the true historical universe the backtests never saw, and how many chances the engine had to hold a name that later delisted.

**Cannot:** a corrected backtest, a corrected CAGR, or a corrected drawdown. Those need the bars. **Do not estimate a corrected return figure and do not publish one** — a made-up correction is worse than a disclosed gap, and would contaminate the record the way a fabricated benchmark line would.

The deliverable is a decision memo, not a strategy result.

## Why the tail is the target

Delisted names are failures, and momentum mostly does not buy slow decliners — so the *mean* return is less distorted here than in a buy-and-hold study.

But momentum **would** buy a name that ran hard and then collapsed. Those are precisely the names missing. So the bias concentrates in the **tail**, and the tail (MC book-day p95 = 66.55%) is already the binding constraint on promotion.

Frame every output around that. A finding that the mean is unaffected is not reassurance.

## What already exists — reuse, do not rebuild

| Asset | Where |
|---|---|
| Captured immutable N-PORT snapshots | `src/quant/universe/fixtures/sec-spus-nport/<accession>/` |
| Snapshot loader | `spusNport.ts:707` `loadCapturedSpusNportSnapshots()` |
| PIT-correct snapshot selection | `spusNport.ts:728` `latestAvailableSpusNportSnapshot()` |
| **Direct bridge to the membership contract** | `spusNport.ts:815` `toPointInTimeUniverseSnapshot()` |
| Filing references with report dates | `spusNport.ts:70` `SPUS_NPORT_FILINGS` |
| Sleeve selection used by the engine | `selectDollarVolumeSleeve(entries, { asOf, maxNames })`, `runLab.ts:1701` |
| Bars actually held | `MarketBar`, 529,718 rows / 221 symbols |

---

## M1 — Coverage time series

For every N-PORT snapshot, using `latestAvailableSpusNportSnapshot` so each date sees only what was filed by then:

- `trueMembers` — symbols the snapshot says were in the fund
- `availableMembers` — those with ≥1 `MarketBar` row on or before that date
- `coverage = |available| / |true|`

Output one row per snapshot date: date, accession, true count, available count, coverage, and the missing symbols.

**Expect coverage to degrade going backwards.** A flat 100% means the comparison is wrong — probably comparing against today's symbol list instead of bars existing *at that date*. Treat a suspiciously perfect result as a bug, not a finding.

## M2 — Delisting-adjacent opportunities *(the decisive statistic)*

This is the number the decision turns on.

A name that left the fund and never returned is a candidate failure. For each such symbol, ask: **was it in the universe during the 63 trading days before it disappeared** — the exact lookback the engine ranks on?

Count those events. Each is a chance the engine had to hold a name heading for delisting, and the backtest saw **zero** of them.

Report: total count, the symbols, their last-seen date, and their final N-PORT weight (a proxy for whether the name was large enough to clear the dollar-volume screen — the sleeve takes ~60 names, so a tail-weight holding was unlikely to be selectable and should be marked as such).

Separate confirmed delistings from ordinary index removals where you can: `pitDelistingLifecycle.ts` and `pitDelistingFetch.ts` already fetch and parse SEC Form 25, free and keyless. A name dropped for failing a Sharia screen is not a survivorship event. **If you cannot distinguish them, report both counts separately rather than merging them.**

## M3 — Bound the exposure

Weight by plausibility of selection rather than assuming uniform draw. The engine takes the top 5 by momentum from a ~60-name dollar-volume sleeve, so a name in the fund's bottom weight decile was probably never reachable.

Produce a **range, not a point estimate**: a lower bound counting only missing names plausibly inside the sleeve, and an upper bound counting all missing names. State the assumption behind each bound in one line.

If the honest answer is "the bounds are too wide to decide", **say that** — it is a valid and useful result.

## Deliverable

`docs/quant-experiments/survivorship-coverage-measurement.md`, plus the script that produced it under `scripts/`, committed together so the numbers are reproducible.

Lead with the decision, not the method:

> Of N formation dates, coverage ranged X%–Y%. K delisting-adjacent selection opportunities existed that the backtest could not see. The measured tail is therefore understated by at least K events. **Recommendation: buy / do not buy the licensed history, because …**

## Acceptance

1. `npx tsc --noEmit` exits 0; `npm run lint` clean.
2. The script runs with **no network and no API key**, and re-running it produces byte-identical output.
3. Every number in the memo is reproducible by one named command. Report the actual output lines, not a claim that it worked.
4. Full suite no worse than baseline — currently **7–8 failures, all DB-latency in `portfolio.test.ts` and `quant-eval.test.ts`**. Name any new failure and prove whether it is pre-existing.

## `<never>`

- Never publish an estimated corrected CAGR, Sharpe, or drawdown. This task measures exposure, not performance.
- Never write to the database, never run a migration, never persist a snapshot. Measurement only. One writer holds this DB and it is not you.
- Never set `lifecycleCoverage.delisted = true`, and never touch `pointInTimeMembership.ts` — the fence stays exactly as it is.
- Never fabricate a bar, forward-fill a dead name, or infer a price for a symbol you lack.
- Never merge index removals with confirmed delistings into one count.
- Never persist delisted bars: `MarketBar` is symbol-keyed, so a reused ticker would silently merge two different companies. That schema fix must land before any such ingest, and it is not in this task.

## Scope fence

Touch only: a new script under `scripts/`, its test, and the memo under `docs/quant-experiments/`.

Do not touch: `pointInTimeMembership.ts`, `spusNport.ts`, `runLab.ts`, any strategy file, any gate/threshold/breaker/reason code, any SEALED or CODIFIED manifest, `prisma/schema.prisma`.

**Timebox: one working session.** If M2 cannot be computed from the captured snapshots, report that and stop — an honest "the on-disk snapshots are too sparse to answer this" is a successful outcome and tells us the next step is more N-PORT capture, which is also free.

Report: `STATUS / CHANGES (file:lines) / DECISIONS / VERIFY (commands + actual output) / OPEN`.
