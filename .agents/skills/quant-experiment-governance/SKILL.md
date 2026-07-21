---
name: quant-experiment-governance
description: Govern Rushd Quant strategy research from hypothesis through one terminal evidence card. Use when proposing, implementing, comparing, pre-registering, auditing, or running a new strategy/version; when asked to beat or improve a backtest; or before any FULL quant-lab run. Enforces separation of duties, frozen parameters, one terminal run, and honest OOS reporting.
---

# Quant Experiment Governance

Run one falsifiable experiment at a time. The objective is a better out-of-sample frontier, not a better-looking backtest.

## Required roles

Keep these roles separate:

1. `quant-research-director` owns the hypothesis and pre-registration. It never writes strategy code or runs a FULL backtest.
2. `quant-strategist` owns implementation, focused tests, and at most one explicitly non-terminal diagnostic.
3. `quant-validation-auditor` owns the pre-run freeze gate and post-run evidence audit. It never edits files or runs the terminal backtest.
4. The orchestrator alone executes the single approved FULL command and integrates the terminal card.

Never allow one agent to propose, implement, and validate the same candidate unchecked.

## Workflow

### 1. Establish the frontier

- Read the latest terminal cards in `docs/STRATEGY_LAB.md` and newest quant entries in `docs/JOURNAL.md`.
- Name the current Pareto points using OOS CAGR/return, OOS DSR, MC p95 max drawdown, trade count, and plateau status.
- Treat every prior tested variant as a multiple-testing trial. Do not reset the trial count because a new session started.
- Declare the evidence boundary. If the same OOS slice informed later hypotheses, label it iterative research evidence, never a fresh frontier; confirmation must come from a never-inspected outer holdout or forward paper data.

### 2. Pre-register one mechanism

Dispatch `quant-research-director` read-only. Require one causal hypothesis, one versioned mechanism, exact frozen parameters, a 3×3 plateau, predicted metric directions, and falsification criteria. Reject proposals that merely retune a tested file or change promotion thresholds.

The proposal must state why the information would have been available at each decision time and why the mechanism is distinct from prior trials.

### 3. Implement without seeing terminal results

Dispatch `quant-strategist` with the frozen contract. Reuse existing pure helpers and the captured-real verified universe. Add deterministic unit tests for parameter parsing, PIT behavior, selection/weight math, replay equality, and all plateau variants.

Permit at most one `--diagnostic` run for wiring/sample sufficiency. A diagnostic is non-terminal, may not persist a terminal card, and may not change frozen parameters. If it reveals a wiring defect, fix the defect; if it reveals an unattractive result, do not tune.

### 4. Freeze before FULL

Commit the candidate implementation and its `CANDIDATE` pre-registration before any terminal run. Then dispatch `quant-validation-auditor` read-only to verify:

- the quant runtime tree is clean and the commit identifies the exact code under test;
- setup id/version, parameters, universe, costs, seed, OOS fraction, FULL period, engine, and nine plateau trials are frozen in code and ledger;
- real-source/PIT guards, decide-close/fill-next-open, Sharia veto, ADV/slippage/cost, and deterministic replay tests pass;
- no terminal artifact/card already exists for this version;
- the exact FULL command is unambiguous.

Do not run FULL unless the auditor returns `READY_TO_RUN`.

### 5. Execute once

The orchestrator runs exactly the approved FULL command once. Do not retry for a disappointing result. A technical failure may be retried only when it produced no terminal evidence and the auditor confirms the failure was non-analytical.

### 6. Finalize evidence

Dispatch `quant-validation-auditor` again with the raw result artifact. Require verification of IS/OOS separation, total and OOS samples, DSR trial count, MC distribution, permutation result, plateau, Sharia/data state, reproducibility ids, and cumulative ordered rejection codes.

Record exactly `ACCEPTED` or `REJECTED` in `docs/STRATEGY_LAB.md`; append a five-line `docs/JOURNAL.md` entry; never weaken a gate to promote a result. Commit the terminal evidence separately from the pre-registration commit.

## Stop conditions

Stop and report instead of running when the candidate depends on unavailable TASI/history/fundamentals, uses terminal-date survivor membership or an unverified Sharia universe, lacks a clean pre-registration commit, leaks future data, reuses an inspected OOS slice as confirmation, changes after seeing OOS, or cannot produce a complete evidence card.

## Report contract

Report the outcome first: frontier improved or not. Always pair return with OOS DSR, MC p95 drawdown, trade count, plateau, and terminal verdict. Never describe a REJECTED version as validated, production-ready, or expected to repeat.
