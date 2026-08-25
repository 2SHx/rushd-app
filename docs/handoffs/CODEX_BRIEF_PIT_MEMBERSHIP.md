# Codex brief — point-in-time universe membership (unblocks every terminal card)

**Author:** orchestrator, 2026-08-25 · **Branch:** `fix/db-safety-and-continual-governance` (base `c60e494`)

## Why this exists

No alpha strategy in this repo can produce a terminal card. Not one.

`runLab.ts:1529` calls the QDR-14 survivorship fence like this:

```ts
assertTerminalPointInTimeMembership({ setupId, terminal: runMode === 'TERMINAL' });
```

It never passes `coverage`. And `coverage` is documented as *"Omitted until ingestion supplies genuine historical snapshot coverage."* So for every one of the 18 ids in `PIT_MEMBERSHIP_REQUIRED_SETUP_IDS`, a TERMINAL run throws `HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING` before touching prices. The existing sealed `halal-fast-momentum-core` card predates the fence.

This is a **data-layer gap, not a research gap**. Seven preregistered lanes are waiting on it. Until it closes, every experiment yields diagnostics only.

**The fence is correct and must not be weakened.** Do not add a waiver path, do not relax `assertPointInTimeMembershipCoverage`, do not pass a synthetic `coverage` to make the throw stop. The whole point is that a backtest must not silently select from names that only exist in the data because they survived.

## What already exists — reuse, do not rebuild

| Asset | Where | State |
|---|---|---|
| Form 25 (delisting) fetch from `data.sec.gov` | `src/quant/data/pitDelistingFetch.ts:53` `fetchForm25History(symbol, cik)` | Works, free, no key |
| Form 25 parse + confirmation | `pitDelistingLifecycle.ts:138,153,199` — `isConfirmedNasdaqCommonStockDelisting`, `parseForm25Document`, `deriveForm25EffectiveDate` | Works |
| The consumer contract | `src/quant/universe/pointInTimeMembership.ts:1-135` | Pure, complete, fully typed. **Do not edit.** |
| PIT fundamentals with filing dates | `Fundamentals` table, 12,212 rows, `filed` column; `sharesOutstanding` on 11,929 | Ingested |
| Daily bars | `MarketBar`, 529,718 rows / 221 symbols, `source=YAHOO`, 0 future-dated, 0 dupes | Ingested |
| Dollar-volume sleeve selection | `selectDollarVolumeSleeve(entries, { asOf, maxNames })` used at `runLab.ts:1701` | Works, already PIT |

**Nothing persists any of it.** There is no `MembershipSnapshot`, no lifecycle table, and `SymbolSnapshot` (0 rows) is unrelated intraday gapper data.

## The contract you must satisfy

`assertPointInTimeMembershipCoverage` (read `pointInTimeMembership.ts:1-135` in full before writing code) requires, per decision date:

- Exactly one snapshot whose `[effectiveFrom, effectiveTo)` covers it — **no gaps, no overlaps**
- `availableAt <= decision` — a snapshot built from data published later is refused
- `lifecycleCoverage.delisted === true` — **never waivable, by anyone, for any product class**
- Every symbol in `requiredSymbols` classified `IN` or `OUT`; `UNKNOWN` fails
- Every `IN` member carrying `shariaEvidence` with a `VERIFIED_COMPLIANT` verdict and `availableAt <= decision`

`survivorshipWaiver` only ever covers the `suspended` half, and only for `productClass: 'DIVERSIFICATION'`. The halal alpha lanes are `ALPHA`. **It is not available to you.**

---

## Task A — Persist the delisting lifecycle

**Goal:** a table answering "was symbol S listed on date D?" from SEC filings, not from whether we happen to hold bars.

Add a Prisma model (suggested `SymbolLifecycle`): `symbol`, `market`, `cik`, `state` (`ACTIVE|SUSPENDED|DELISTED|UNKNOWN`), `effectiveAt`, `filingDate`, `accessionNo`, `sourceUrl`, `evidenceHash`, `@@unique([symbol, market, effectiveAt])`.

Backfill with the existing `fetchForm25History` + `loadTickerToCik` over the full historical symbol domain.

**`filingDate` is the PIT key, not `effectiveAt`.** A delisting is knowable when the Form 25 is filed. `availableAt` downstream derives from `filingDate`.

⚠️ **DB rule, non-negotiable:** this repo shares ONE database and `.env` points at `NEON_BRANCH=production`. Run migrations alone — no other process touching Prisma. A concurrent `prisma migrate dev` once wiped 255k bars. A test suite run once deleted every `User` row.

**Acceptance:** row count; ≥1 confirmed delisting spot-checked against its real SEC URL; a symbol with no Form 25 stored as `ACTIVE`, never `UNKNOWN`-by-omission; zero rows whose `filingDate` is in the future relative to `effectiveAt` ingestion time.

---

## Task B — PIT Sharia evidence from fundamentals

**Goal:** a defensible `VERIFIED_COMPLIANT|NON_COMPLIANT` verdict for a symbol *as known at date D*.

**Do NOT reuse the live gate.** `src/quant/gates/sharia.ts` screens with a 135-day freshness window against a live screener. Applying today's verdict to a 2018 decision is look-ahead of the worst kind — it encodes knowledge that did not exist.

Compute AAOIFI 30/30/5 from `Fundamentals` rows visible at D (`filed <= D`), with market cap as `sharesOutstanding × PIT close`:
- interest-bearing debt / market cap < 30%
- cash + interest-bearing securities / market cap < 30%
- non-compliant income / total revenue < 5%

Persist verdict + inputs + `filed` + a content hash. `availableAt = filed`.

**Authority stack is AAOIFI + Al-Rajhi + S&P Shariah only.** The Egyptian Fatwa Authority is excluded by owner decision — do not introduce it.

**Acceptance:** verdicts reproducible from stored inputs alone; a symbol whose ratios cross the threshold mid-history flips verdict at the correct `filed` date; zero verdicts derived from a row filed after its own decision date.

---

## Task C — Assemble and persist membership snapshots

**Goal:** immutable snapshots satisfying the contract above.

Add a model pair (`UniverseMembershipSnapshot` + `UniverseMembershipRecord`) mirroring `PointInTimeUniverseSnapshot` / `PointInTimeMembershipRecord` exactly.

For each formation date across 2018-01-02 → 2026-07-17: resolve the eligible domain from Task A, run `selectDollarVolumeSleeve` at that `asOf`, mark selected `IN` and the rest `OUT`, attach Task B evidence to every `IN`, set `lifecycleCoverage.delisted = true` **only if** Task A genuinely covers the window, and make intervals contiguous and non-overlapping.

`hash` must cover the snapshot's content so it cannot be swapped post hoc.

**Acceptance:** `assertPointInTimeMembershipCoverage` passes on real persisted data for the full window; deliberately dropping one record produces `MEMBERSHIP_COVERAGE_MISSING`; a one-day interval gap produces `EFFECTIVE_INTERVAL_GAP`; a snapshot with `availableAt` after a decision produces `SNAPSHOT_UNAVAILABLE_AT_DECISION`. **Assert on the real failure codes, not on generic throws.**

---

## Task D — Wire it into runLab

Load snapshots and pass real `coverage` at `runLab.ts:1529`. Changed lines should be few.

**Acceptance:** a TERMINAL run of `halal-fast-momentum-core` no longer throws `HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING`; with the snapshot table emptied it throws again (proving the fence still bites); `npx tsc --noEmit` and `npm run lint` clean; full suite no worse than baseline — currently **7 failures, all DB-latency in `portfolio.test.ts` and `quant-eval.test.ts`**. Name any new failure and prove whether it is pre-existing.

---

## The pivotal risk — read before starting

**Form 25 tells you *who* delisted. It does not give you their prices.**

`MarketBar` holds 221 symbols that exist *today*. A 2019 sleeve reconstructed from it is survivor-biased no matter how correct the membership plumbing is, because names that died between 2019 and now were never ingested. Tasks A–D can all pass and the backtest can still quietly select only from survivors.

So there is a **Task A′**: ingest daily bars for delisted symbols across the window. Yahoo coverage for delisted tickers is unreliable and ticker reuse is a real hazard — a symbol can be reassigned to a different company after a delisting, so key on CIK, never on ticker alone.

**If A′ proves infeasible, say so and stop.** Do not fabricate bars, do not forward-fill a dead name, and do not set `lifecycleCoverage.delisted = true` on a domain that only contains survivors — that would convert an honest refusal into a false certification, which is worse than the current block. An honest "delisted price history is unavailable from free sources, here is what it would cost" is a **successful** outcome of this brief.

## Order and scope

A′ → A → B → C → D. B is independent of A/A′ and can run in parallel.

**Do not touch:** `pointInTimeMembership.ts` (the pure contract), any gate/threshold/breaker/reason code, `halalFastMomentumCore.ts`, `metrics.ts`, `monteCarlo.ts`, `portfolioEngine.ts`, or any SEALED/CODIFIED manifest.

Report per task: `STATUS / CHANGES (file:lines) / DECISIONS / VERIFY (commands + actual output) / OPEN`.
