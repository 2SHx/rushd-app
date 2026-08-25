# Scheduled jobs

`vercel.json` is JSON and cannot carry comments, so the reasoning lives here. Change one and change the other.

## Schedules

| Path | Cron (UTC) | EDT (Mar–Nov) | EST (Nov–Mar) | Why |
|---|---|---|---|---|
| `/api/cron/quant-ingest` | `0 23 * * 1-5` | 19:00 | 18:00 | Daily bars, weekdays only |
| `/api/cron/quant-run` | `30 23 * * 1-5` | 19:30 | 18:30 | 30 min after ingest |
| `/api/cron/quant-incubation` | `0 0 * * 2-6` | 20:00 prev day | 19:00 prev day | After the run settles |

## Why 23:00 UTC

**Vercel cron schedules are UTC and do not shift with daylight saving. The US market close does.**

US equities close 16:00 ET, which is 20:00 UTC under EDT and 21:00 UTC under EST. Running at 23:00 UTC clears the close by 3 hours in summer and 2 hours in winter, so the same fixed UTC time is safely after the close year-round.

Getting this wrong is not a missed job — it is a **partial session recorded as final**, which then becomes point-in-time evidence that a decision was made on a full day's data when it was not.

`1-5` is Mon–Fri in UTC terms. The incubation job runs `2-6` because 00:00 UTC belongs to the *next* UTC day relative to the run it follows.

## Why daily, not weekly

The sealed lane `halal-fast-momentum-cash-core@v1` inherits the frozen `halal-fast-momentum-core@v1` engine, which is **daily cadence with ISO-week-end decisions**: `targetWeight` returns `null` on every non-week-end bar, and the retain/selection test evaluates only at week ends.

So decisions land weekly, but the engine consumes daily bars to compute them. Weekly ingestion would starve it.

**The manifest does not specify a cron cadence** — scheduling is operational, not a sealed parameter. This cadence is derived from the engine's own behaviour, not read out of the manifest. If that reading is wrong, the manifest is not the place to fix it.

## Verb

Vercel Cron issues **GET**. Every quant cron route originally exported `POST` only, so scheduling them would have returned `405` on every invocation — a scheduler that looks configured in the dashboard and silently never runs.

All four now export both verbs through the same auth check (`src/lib/cronAuth.ts`). `src/lib/cronAuth.test.ts` pins that: if a route loses its `GET` export, scheduling it becomes a no-op again and nothing else would notice.

## Auth

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set in the project environment. **Set it before deploying these schedules** — the routes fail closed with `500` when it is missing, so an unconfigured deployment refuses every caller rather than treating an absent secret as "no auth required". These endpoints place orders.

## Plan limits — verify before relying on this

Vercel's Hobby tier restricts both the number of cron jobs and their frequency, and function execution has a duration cap. Three daily jobs is deliberately modest, but **confirm the account's tier allows all three and that each job finishes inside the duration limit.** A job killed mid-write is worse than one that never ran.

## Known gap — `quant-ingest` defaults are not the halal universe

`DEFAULT_SYMBOLS` in `src/app/api/cron/quant-ingest/route.ts` is `NASDAQ: ['MSFT','NVDA']` plus a TASI list. Scheduled with no body, the job therefore ingests **two** NASDAQ symbols, not the ~216-name halal universe the engine trades — and TASI, which is explicitly out of scope for this program.

This is left unchanged deliberately: choosing the ingest universe is a design decision on a money-adjacent path, not a mechanical fix. **It must be resolved before these schedules carry the forward lane**, or the lane will run on two symbols' worth of data.

`/api/cron/quant-intraday` is intentionally unscheduled: the intraday family was measured and closed (six strategies, ~2,040 trades, all negative).
