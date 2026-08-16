# G11 completion — parallel plan across runners

Written 2026-08-09. Owner: main Claude session (orchestrator).

**Executable reality, checked not assumed:** `opencode` and `ollama` are installed;
`codex`, `gemini` and `claude` CLIs are **not**. `OPENROUTER_API_KEY` is set. So there are
exactly three lanes: in-session Claude subagents, `opencode`→OpenRouter free models via
`scripts/dispatch.mjs`, and Codex-the-app driven by a pasted brief. Do not route to a binary
that is not there and then assume the work ran.

---

## The one question that blocks the rest

`spusNport.ts` wiring cannot start until this is answered, because it decides whether the
2.75-year membership hole can close at all.

**Q. Of the 37 unique ISINs that failed the OpenFIGI name match, how many are held names that
belong to the halal universe?**

Why it blocks: a holding whose ISIN is present but unidentifiable must resolve
`MEMBERSHIP_UNKNOWN`, never `OUT` — marking it OUT fabricates an absence from the fund, which
is the exact survivor bias this whole thread exists to measure. If the answer is zero, the hole
closes for free. If it is not zero, those names need a curated, hash-pinned rename map.

**Not yet answered.** An earlier check reported "62 universe names unresolved", but that query
conflated two different things — *held but unidentifiable* (blocking) versus *simply not held
that quarter* (harmless, legitimately OUT). The distinction is the whole answer. Do not treat 62
as the number.

Owner: **quant-research-director**, in-session (read-only, needs judgement about what counts as
identified). Everything in Track A below is downstream of it.

---

## Track A — sequential, blocked on the question above

| # | Task | Owner | Notes |
|---|---|---|---|
| A1 | Answer the ISIN question above | quant-research-director (in-session) | Read-only |
| A2 | Curated rename map, if A1 ≠ 0 | data-engineer (in-session) | ≤37 entries, hash-pinned, each justified |
| A3 | Wire `spusNport.ts`: Form-25 lifecycle + crosswalk + the 10 filings, replacing the hard-coded `{delisted:false,suspended:false}` at `spusNport.ts:519` | quant-strategist (in-session) | The only remaining edit to that file |
| A4 | Manifest update: `oosFraction` 0.30→0.50, add `survivorshipCoverageWaiverAcknowledged`, restrict to the 161 coverage-complete symbols | quant-strategist (in-session) | DRAFT stays DRAFT; director seals |

## Track B — parallel, independent of Track A

| # | Task | Route | Command |
|---|---|---|---|
| B1 | Arabic for `DIVERSIFICATION_CAGR_DISCLOSURE_LINE` + `BETA_DSR_ANNOTATION` (owed since QDR-10/11) | i18n-fintech-expert, in-session | Sharia/Arabic must not go to a free model unreviewed — see Routing below |
| B2 | `portfolio.test.ts` — 4 DB-bound failures, pre-existing all session | `DISPATCH_RUNNER=opencode node scripts/dispatch.mjs test-engineer "..."` | Mechanical, well-specified, cheap |
| B3 | `scripts/fix-pit-fundamentals-fragments.ts` — fold into the main backfill or delete | opencode / qwen3-coder:free | Tidy-up, low risk |
| B4 | JOURNAL entry for the G11 arc | orchestrator | AGENTS.md rule 8 |

## Track C — review gates, must run on a different model than the implementer

| # | Task | Owner |
|---|---|---|
| C1 | QA across all of G11 (waiver + crosswalk + i18n + wiring) | qa-reviewer, in-session |
| C2 | Seal-fit audit of the updated manifest | quant-validation-auditor, in-session |
| C3 | Ratify QDR-14 (written by architect, never ratified) | quant-research-director, in-session |

---

## Routing rules — which competency goes where

**Keep in-session (Claude):** anything where being wrong is expensive and hard to detect —
quant gates, PIT integrity, seal decisions, Sharia and Arabic, and every review gate. Sharia/Arabic
in particular: a free model produced «تعليقات التداول» ("trading comments") for "trading
suspensions" in a mandatory disclosure this week; it took a specialist pass to catch, and it would
have shipped.

**Route to opencode/OpenRouter free:** bounded, mechanical, well-specified work with a clear
acceptance command — test fixes, cleanup, scaffolding. `scripts/models.map.json` already points
every agent at free models; per AGENTS.md the reviewer rows there are emergency overrides only,
because a review that shares the implementer's blind spots catches nothing.

**Codex (the app, via pasted brief):** self-contained tasks with disjoint file scopes. It has
already landed work this session (`07f8905`, `ec96486`). Give it a fence and an acceptance
command, never a shared file — it edited `runLab.ts` mid-flight once when it was fenced off.

**Never parallelise:** two agents on the same file. Every collision this session came from
overlapping scope, not from model quality.

---

## Standing caveat, unchanged

`halal-decorrelated-risk-parity-core@v1` is **predicted to terminate `REJECTED_DIVERSIFICATION`**
on the 30% Monte Carlo p95 drawdown breaker. Finishing G11 makes the verdict *measurable and
honest*; it does not make it favourable, and it does not move the return ceiling
(~0.75 Sharpe / low-to-mid-teens CAGR for NASDAQ-only halal equities). The machinery outlives
this lane — that is the reason to finish it.
