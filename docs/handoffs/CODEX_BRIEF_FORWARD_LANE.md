# Codex brief — the Sept 8 forward lane (runs in parallel with survivorship round 2)

**Author:** orchestrator, 2026-08-25 · **Branch:** `fix/db-safety-and-continual-governance` (base `ab64478`)

## Why this is urgent

The sealed confirmatory lane `halal-fast-momentum-cash-core@v1` opens **2026-09-08 — 16 days away — and nothing is scheduled to run it.**

`vercel.json` contains exactly `{"framework": "nextjs"}`. No crons. Six cron routes exist (`quant-ingest`, `quant-run`, `quant-incubation`, `quant-incubation-evaluate`, `quant-intraday`, `distribute`) and **not one of them is scheduled.**

**Why this cannot wait:** forward evidence is unbackfillable. A day the system does not observe is a day permanently absent from the record, and the sealed lane's whole value is that its observations begin strictly after the seal. Every day of delay is a day subtracted from a 10-year window you cannot re-create.

## The strategic point

The survivorship problem you are measuring in round 2 is a **historical backtest** problem. The forward lane observes the universe live, so it has no dead-stock gap by construction. **This lane is immune to that blocker**, which is why it proceeds in parallel and does not wait on the data-purchase decision.

## Parallelism and the database rule

This runs **alongside** `CODEX_BRIEF_SURVIVORSHIP_ROUND2.md`. Scope fences are disjoint.

⚠️ **One DB writer, ever.** Round 2 is read-only. This brief contains **one** migration (Task 3). Run that migration when nothing else is touching Prisma, and never run `prisma migrate dev` concurrently with any other task. A concurrent migration once destroyed 255,000 bars in this repo. If both briefs are in flight, land Task 3's migration alone and announce it.

---

## Task 1 — Make the cron routes reachable *(blocker; do this first)*

**Every cron route is `POST`-only. Vercel cron issues `GET`.** Scheduling them as they stand yields `405` on every invocation — a scheduler that appears configured and silently never runs. Verified: `grep "export async function"` returns only `POST` for all four quant routes.

Reconcile it. Preferred: add a `GET` handler that delegates to the identical handler body and the identical `CRON_SECRET` check — no second code path, no relaxed auth. Vercel supplies `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

**Never add an unauthenticated route.** These endpoints move money and place orders. A cron route without the secret check is a public trade trigger.

**Acceptance:** a `GET` with a valid bearer token succeeds; a `GET` with a wrong token returns 401; a `GET` with no token returns 401; the `POST` path still behaves identically. Show the four actual status codes.

## Task 2 — Schedule the crons

Add the `crons` array to `vercel.json`. Schedule at minimum `quant-ingest` daily after US market close, and `quant-run` on the cadence the sealed lane's manifest requires — **read that manifest, do not guess the cadence.**

Vercel cron times are **UTC**. US market close shifts with daylight saving, so state in a comment which UTC time you chose and what it means in both EST and EDT. Getting this wrong means ingesting before the close and recording a partial session as final.

Note Vercel's plan limits on cron frequency and function duration; if a job cannot finish inside the limit, say so rather than scheduling something that will time out mid-write.

**Acceptance:** `vercel.json` validates; each schedule stated in UTC with its EST/EDT meaning; the manifest's required cadence quoted verbatim in the PR description.

## Task 3 — Capture universe membership forward, daily *(the permanent fix)*

Round 2 exists because historical membership is missing and may be unbuyable for 2018–2020. **From today forward that problem is entirely avoidable, and only if capture starts now.**

Add a table storing, per day: the eligible halal universe as resolved at that moment, each symbol's inclusion, the screen inputs that decided it, `capturedAt` (server time — the PIT key), and a content hash.

This is a **write-only ledger**: rows are never updated or deleted, because a mutable membership record is worth nothing as point-in-time evidence.

**Do not reuse `MarketBar`'s identity model.** It is symbol-keyed and cannot distinguish a reused ticker across two different companies — you established this yourself. Key on a stable identity and record the ticker as an attribute.

Wire it into `quant-ingest` so it runs with the daily job.

**Acceptance:** one day's capture produces rows; re-running the same day is idempotent and does not duplicate; `capturedAt` is server-assigned and never client-supplied; the table has no update or delete path.

## Task 4 — Prove the runner works unattended

`docs/JOURNAL.md` records that `AUTO_PAPER` cannot currently run unattended and that M17 (durable shadow-paper runner, caps, reconciliation) is the open operational priority.

Prove the full unattended path end to end **against the paper account**: scheduled trigger → decision → order → reconciliation → persisted evidence. Report the actual artifacts produced.

**Never place a live order.** Paper only. `QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID` pins the account; verify the pin is enforced and report what happens when it mismatches.

**Acceptance:** one full unattended cycle, evidence quoted from real output; the account pin proven to refuse a mismatch.

---

## Order

1 → 2 → 4 are sequential; **3 is independent and can be done at any point** (subject to the migration rule).

Task 1 is the blocker: without it, Task 2 configures a scheduler that silently 405s.

## `<never>`

- Never add an unauthenticated cron route, or a `GET` path with weaker auth than the `POST`.
- Never place a live order. Paper only, account pin enforced.
- Never update or delete a membership row. Append-only or it is not evidence.
- Never run a migration while another task holds the database.
- Never guess the sealed lane's cadence — read its manifest.
- Never key membership on ticker alone.
- Never touch the sealed manifest, any gate, threshold, breaker, or reason code.

## Scope fence

Touch only: `vercel.json`, `src/app/api/cron/**`, the new membership table plus its migration and ingestion wiring, and tests for the above.

Do not touch: `scripts/measure-survivorship-coverage.ts` or the survivorship memo (round 2 owns those), `pointInTimeMembership.ts`, any strategy file, any SEALED or CODIFIED manifest.

Report per task: `STATUS / CHANGES (file:lines) / DECISIONS / VERIFY (commands + actual output) / OPEN`.
