---
name: quant-strategy
description: How to build deterministic, backtestable trading signals in TypeScript for Rushd Quant — technical indicators, factor/cross-sectional ranking, momentum/mean-reversion, and the AnalystSignal contract. Use when building the Quant Core (agent 1), Technical (agent 3), or any deterministic signal.
---

# Quant Strategy (deterministic signals)

The Quant Core and Technical agents are pure TypeScript — no LLM, fully deterministic, fully backtestable. Determinism is the point: it makes them the committee's trustworthy anchor and lets [[backtesting-rigor]] validate them honestly.

## The signal contract
Every analyst returns an `AnalystSignal` (see docs/QUANT_DESIGN.md): `{agent, symbol, market, stance: BUY|SELL|HOLD, conviction: 0..1, horizon, rationaleAr, rationaleEn, evidence[], complianceTag}`. Deterministic agents fill `rationale` from a template naming the exact indicator values in `evidence` — the learner sees *why* (e.g. "RSI 28 < 30 oversold; price > 200-day MA").

## Rules
- **Read history only through `PointInTimeContext`** — never fetch "latest" inside an analyst; you get bars/fundamentals as-of the decision time (no look-ahead, [[backtesting-rigor]]).
- **All math in `Prisma.Decimal`/decimal.js**, never JS `number`, for prices/returns/positions (float drift is a known project debt — guard like `src/services/money.test.ts`).
- **Pure functions**: `analyze(symbol, ctx) => AnalystSignal` with no side effects, no wall-clock reads, no randomness. Same input ⇒ same output, or it can't be backtested.
- **Parameters are explicit + versioned** (lookback windows, thresholds) — they belong to a `Strategy` record, not hardcoded, so walk-forward can vary them.

## Common building blocks (implement once, reuse)
- **Trend/momentum:** SMA/EMA, MA crossovers, ROC, 12-1 momentum, 52-week-high proximity.
- **Mean-reversion:** RSI, Bollinger %B, z-score of price vs moving average, distance from VWAP.
- **Volatility/risk:** ATR, realized vol, drawdown — used for sizing (see [[risk-management]]) and regime filters.
- **Volume/liquidity:** ADV, volume z-score, OBV — critical for the Pattern/Analog agent and for fill realism.
- **Cross-sectional (factor) ranking:** rank a universe by a factor (momentum, value, quality), long the top decile / short the bottom — market-relative, not absolute.

## Anti-patterns
- Never optimize a strategy against the whole history then report that return — that's the overfitting trap ([[backtesting-rigor]]).
- Never let an indicator silently repaint (use closed bars; a forming bar changes and creates look-ahead).
- Don't invent a new indicator when a standard one works — prefer well-understood, literature-backed signals (the Research agent #7 can cite them).
- Conviction is calibrated, not decorative: 0.9 must mean the signal is right ~90% historically, or downweight it.
