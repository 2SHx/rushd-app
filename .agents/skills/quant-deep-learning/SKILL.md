---
name: quant-deep-learning
description: Build and audit deterministic Python neural models for RUSHD Quant. Use when proposing, implementing, training, comparing, or validating deep-learning signals, feature/label datasets, model artifacts, Python-to-TypeScript inference contracts, or ML walk-forward experiments intended to improve a trading strategy.
---

# Quant Deep Learning

Treat a neural model as one governed alpha hypothesis, never as an architecture search. Use this
skill with `quant-experiment-governance`, `backtesting-rigor`, `risk-management`, and
`sharia-quant`.

## Workflow

1. Establish the evidence boundary from `docs/STRATEGY_LAB.md` and `docs/JOURNAL.md`. Count every
   architecture, feature set, seed, loss, and hyperparameter variant as a trial. Map unresolved data
   and compliance decisions as blockers before model work.
2. Dispatch a read-only research director. Freeze one causal hypothesis, feature availability,
   label horizon, architecture, training parameters, nine-member plateau, predicted directions,
   and falsification criteria before implementation.
3. Audit the dataset before training. Require immutable raw hashes, permanent security identity,
   provider availability timestamps, corporate actions, lifecycle, point-in-time membership, and
   independent Sharia evidence. A REAL_PIT dataset must match an expected lineage root issued by an
   external trusted materializer; a well-formed caller-supplied hash is not trust. Stop if
   current-sleeve survivors substitute for history.
4. Keep Python offline. It may build features, train, and emit hash-pinned identity-free scores.
   TypeScript alone owns Sharia vetoes, liquidity eligibility, sizing, fills, exposure limits,
   drawdown breakers, persistence, and execution. Do not add a Python runtime service.
5. Fit winsorization/scaling on training folds only. Split by decision date, purge every sample
   whose label overlaps validation, and embargo by at least the maximum label horizon. Never
   random-split panel rows. The training interface must validate purge and embargo itself rather
   than trusting arbitrary index arrays.
6. Force deterministic CPU execution: pin Python and direct dependencies, set every seed, enable
   deterministic algorithms, use fixed batch order, and hash config, features, scaler, weights,
   predictions, and runtime versions. Bind every artifact to the sealed experiment config hash and
   the split hash computed from the rows actually trained.
7. Test before inspecting performance: future-bar injection, post-decision availability, unknown
   lifecycle/Sharia, MOCK data, current-sleeve injection, split overlap, scaler leakage, seed replay,
   forged lineage roots, artifact tampering, inference parity, and cost/fill parity must fail closed.
8. Compare against a zero predictor, linear/ridge baseline, the frozen deterministic strategy, and
   SPUS on identical decision dates. A neural model earns complexity only through incremental net
   forward evidence after costs.
9. Permit at most one non-terminal synthetic/wiring diagnostic. Run a terminal experiment only
   after independent `READY_TO_RUN`; report CAGR with OOS DSR, MC-p95 drawdown, trades, turnover,
   exposure, plateau, and verdict.

The delivery unit is one vertical proof: trusted materializer evidence → validated dataset → verified
fold → trained model → sealed artifact → identity-free score accepted by TypeScript. Stop at the
first missing blocker. The workflow is done only when a fresh reviewer can reproduce every arrow.

## Hard stops

- Do not train or score real history with incomplete membership, lifecycle, adjustment, or Sharia
  lineage.
- Do not tune after viewing an outer holdout or forward-paper result.
- Do not let the network choose compliance, leverage, shorting, final weights, or execution.
- Do not promote when Sharpe is implausible, the plateau is spiky, DSR ignores prior trials, model
  hashes differ, or a simpler baseline is not beaten net of costs.

## RUSHD implementation contract

Place offline Python research code under `quant_ml/` and pin direct dependencies in
`requirements-quant-ml.txt`. Keep synthetic tests network-free. Reuse the TypeScript backtest and
report-card path for financial evaluation; never create a second performance calculator whose fill,
cost, or risk semantics can drift.
