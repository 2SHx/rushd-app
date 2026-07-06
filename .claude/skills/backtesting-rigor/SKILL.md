---
name: backtesting-rigor
description: How to backtest and validate a trading strategy honestly — no look-ahead, walk-forward, out-of-sample reserve, deflated Sharpe, realistic fills, overfitting defense. Use when building the backtest harness, the Pattern/Analog agent, any strategy evaluation, or reviewing quant results. The crown-jewel skill: >90% of academic strategies fail live because these rules were skipped.
---

# Backtesting Rigor

A backtest that isn't rigorous is worse than none — it manufactures false confidence. These are non-negotiable for Rushd Quant. See [[quant-strategy]] for the signals being tested and [[risk-management]] for sizing.

## No look-ahead bias (the cardinal sin)
- Every decision at time *t* may use ONLY data available at *t*. Enforce with `PointInTimeContext`: it exposes bars/fundamentals/news with `asOf <= t`, and it is the ONLY way an analyst reads history. An analyst that reaches around it is a bug.
- Fundamentals and news carry a **release/effective timestamp**, not the period they describe — Q3 earnings are unknown until the filing date. Index by availability, not by report date.
- Corporate actions: use split/dividend-adjusted series consistently; never mix adjusted prices with unadjusted volume.
- **Regression test the guard:** a "look-ahead injection" test that feeds a future bar into a decision MUST make the backtest fail. Q2's exit criterion is exactly this.

## Train / out-of-sample / walk-forward
- Reserve **≥20–30% of history as out-of-sample (OOS)**, untouched during strategy development. If you looked at it while tuning, it's not OOS anymore.
- **Walk-forward is the gold standard:** optimize on an in-sample window, test on the next untouched window, roll forward. A strategy must prove itself repeatedly across regimes, not in one lucky slice.
- Prefer a parameter **"profit plateau"** (a broad region of parameters that all work) over a single sharp peak — a sharp peak is almost always curve-fit noise.

## Multiple-testing & the deflated Sharpe
- Every strategy variant you try is a coin flip at the max; testing many inflates the best Sharpe by selection. Report the **Deflated Sharpe Ratio** (adjusts for the number of trials + non-normal returns), not the raw one.
- **Auto-flag implausible results:** a Sharpe > ~3 on a short window is a red flag, not a triumph (TradingAgents published 5–8 over one quarter and the authors themselves called them anomalies). Surface a warning; do not ship the strategy on it.
- Minimum sample: **≥100–200 trades** for any statistical claim (1000+ ideal). The Pattern/Analog agent (#4) needs ≥100–200 occurrences of a pattern before it's a live signal, else it's "educational — not validated."

## Fill realism (no free money)
- Model **transaction cost + slippage + liquidity/ADV caps** on every fill. A microcap "mcap 1M + volume spike" pattern implies you cannot fill size without moving the price — cap position at a fraction of ADV.
- Include the spread, not just the last trade; assume you cross it. Latency/next-bar execution for anything not a limit order.
- **Survivorship bias:** include delisted/suspended names in the historical universe where feasible; if the data source lacks them, document the bias explicitly.

## Reproducibility
- Backtests must be deterministic and re-runnable: seed everything, version the strategy + its parameters, and persist a `BacktestRun` with config + metrics + equity curve. Two runs of the same config must match to the cent.
- For the LLM Portfolio Manager (non-deterministic), backtest a **deterministic policy-surrogate** and spot-check that the live temperature-0 PM agrees — never claim a backtested return for a live LLM sizer.

## Metrics to report (always together)
CAGR · Deflated Sharpe · max drawdown · Calmar · hit-rate · avg win/loss · turnover · exposure. A return number without drawdown and trade count is marketing, not evidence.
