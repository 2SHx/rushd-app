# Codex brief — the 13 days to Sept 8

**Author:** orchestrator, 2026-08-26 · **Branch:** `fix/db-safety-and-continual-governance` (base `2a62640`)

## The only deadline that matters

The sealed confirmatory lane `halal-fast-momentum-cash-core@v1` opens **2026-09-08**. Its evidence is unbackfillable: a day the system does not observe is permanently absent from a ten-year window, and that window is the **only path to a promotable strategy** in this program.

Everything below is ranked by whether it moves that.

Current readiness — run `npm run preflight:forward` yourself before starting, do not trust this snapshot:

```
PASS  CRON_SECRET · halt state · membership capture · daily bars · Alpaca creds · account pin
FAIL  at least one enabled AUTO_PAPER strategy
FAIL  incubation owner user exists
```

**The failing two are OWNER decisions, not engineering.** Do not fix them by inventing data — see P0.

## P0 — Owner-only, blocks everything (NOT Codex work)

These are listed so you do not accidentally "fix" them:

1. **Authorise the strategy version by name.** QDR-8 requires the owner to name the version before it may run. An agent creating an AUTO_PAPER strategy row is fabricating authorisation.
2. **Restore or recreate the incubation owner user.** The 2026-08-22 test wipe deleted it; a manual Neon restore on 2026-08-26 did **not** bring it back — only `test-user-portfolio-id` exists. Recreating it means inventing an email, role and tier whose originals are only in a point-in-time branch.
3. **Set `DATABASE_URL` as a GitHub Actions repository secret.** `.env` is gitignored and never reaches Actions, so `.github/workflows/membership-archive.yml` currently fails every run.
4. **Declare the drawdown budget.** Must be sealed before the window opens; after is worthless.

If you finish everything below and P0 is still open, **stop and report** — do not work around it.

---

## P1 — Prove the unattended path actually trades *(highest-value Codex task)*

`runAutomatedStrategies` (`src/quant/automation/autoRun.ts:62`) currently finds zero AUTO_PAPER strategies and returns `{ran: 0, executed: 0}` — **success, having done nothing.** That is the same silent-no-op class as the two-symbol ingest roster and the POST-only cron routes, and on Sept 8 it would mean a ten-year window accruing nothing while looking healthy.

Build an end-to-end proof, against the **paper** account, that a scheduled trigger produces a real order and reconciled evidence:

- trigger → `runCommitteePass` → decision → `executeDecision` → order → reconciliation → persisted rows
- Use a dedicated test strategy and user you create and remove yourself. **Do not reuse or mutate `test-user-portfolio-id`**, and do not create anything that could be mistaken for the real incubation strategy.
- Prove the account pin refuses a mismatch: set `QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID` to a wrong value and show the refusal, then restore it.

**Never place a live order.** Paper only, pin enforced, `QUANT_SHADOW_PAPER_MUTATIONS` respected.

**Acceptance:** paste the actual persisted `Order`/`ShadowPaperOrder`/`Decision` rows produced by one unattended cycle. A green test asserting mocks is not the deliverable — the deliverable is evidence the real path works.

## P2 — QDR-23 reporting blocks

QDR-23 (`docs/QUANT_DESIGN.md`) ruled zakat an **investor** cost: gross returns stay the comparison figure, and every card additionally publishes a `ZAKAT` block. Read the record's "Minimum implementation surface" bullet — it specifies this precisely.

- `src/quant/backtest/metrics.ts`: add pure exported `zakatAnnualFactor(hawlDays = 354)`, `netOfZakatCagr`, `netOfZakatMultiple`. `computeMetrics` and `computePortfolioMetrics` outputs must stay **byte-identical**.
- `src/quant/backtest/reportCard.ts`: optional `zakatEvidence` / `purificationEvidence` on the assemble args plus two render blocks. `checklist` and `rejectionReasonCodes` **byte-identical**.
- **`portfolioEngine.ts` is FORBIDDEN.** No cost constant moves. QDR-23 records that `stableConfigHash` hashes only `manifest.config`, so an engine-constant change would leave all four sealed hashes byte-identical while silently changing what the sealed lane measures — a *silent* invalidation the seal cannot detect.

The declared constant is `ZAKAT_ANNUAL_FACTOR = 0.975^(365.2425/354) = 0.9742164`. The disclosure sentence is quoted verbatim in the record; use it exactly.

**Acceptance:** a rendered card showing both blocks with real numbers, plus proof that an existing card's checklist output is unchanged byte-for-byte.

## P3 — E0 diagnostic (only if P1 and P2 are done)

`halal-hysteretic-fast-momentum-core@v1` is preregistered (QDR-22) and implemented, with **one** authorised non-terminal diagnostic run. It measures whether the cost lever works: **DEAD if realised cost drag does not fall ≥1.20pp from 8.09%/yr.**

It cannot produce a terminal card — the QDR-14 fence blocks that for every alpha lane until PIT membership exists. Do not attempt one. Do not tune on the result.

---

## Standing rules

- **One DB writer.** Two incidents came from ignoring this. Migrations run alone.
- **Tests run against local Postgres** (`npm run db:local:up`, `.env.test`). The suite is **2069/2069 green in 66s** — keep it that way, and name any failure you cannot explain rather than absorbing it.
- **Verification is executed output**, not assertion. Three agent claims were checked this session and one was false.
- **Never fabricate authorisation, a benchmark, a bar, or a corrected performance figure.**

Report per task: `STATUS / CHANGES (file:lines) / DECISIONS / VERIFY (commands + actual output) / OPEN`.
