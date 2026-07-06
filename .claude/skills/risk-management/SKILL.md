---
name: risk-management
description: The deterministic risk envelope for Rushd Quant — position sizing, exposure/concentration caps, stop-loss, drawdown circuit-breaker, and the automation kill-switch. Use when building the Risk Manager, the Portfolio Manager's constraint layer, or the auto-trading cron. These are hard rules the LLM cannot cross.
---

# Risk Management (the deterministic envelope)

The Portfolio Manager LLM decides inside a box drawn by deterministic code. This skill is that box. It runs **identically in live and backtest** and the LLM can never override it — that is what makes an LLM-driven sizer safe. Pairs with [[agent-committee]] (the hierarchy) and [[sharia-quant]] (the compliance veto that sits beside these caps).

## Sizing (never let the LLM free-size)
- The LLM proposes a size; the Risk Manager **clamps** it to the smaller of: a fixed fraction of equity, a **volatility-target** size (size ∝ target-vol / ATR, so risk per trade is roughly constant), and a **liquidity cap** (≤ a fraction of ADV — you cannot fill more without moving price).
- Per-trade risk budget: cap the loss-to-stop at a small % of equity (e.g. ≤1–2%). Size = risk-budget / (entry − stop).

## Exposure & concentration caps
- Max single-name weight, max sector weight, max gross/net exposure, max number of open positions. A proposal that breaches any cap is reduced or rejected — deterministically, before execution.
- Correlation awareness: treat highly-correlated names as one exposure bucket so "diversified" isn't an illusion.

## Stops & the drawdown circuit-breaker
- Every position carries a stop (ATR-based or level-based); stops are enforced by code, not LLM discretion.
- **Portfolio drawdown breaker:** if equity draws down past a threshold (e.g. peak-to-trough %), the engine halts new entries and de-risks — tested in Q6 (tripping it must stop trading).

## The kill-switch (automation safety)
- A single flag/DB row halts ALL automated execution immediately, checked at the top of every cron pass and before every order. Manual, instant, no LLM in the path.
- Automated runs also enforce: max orders per pass, max notional per pass, per-instance idempotency, and a global rate limit. An automation pass that hits any limit stops and reports, never "tries harder."

## Live vs backtest parity
The exact same clamp/cap/stop/breaker functions run in the backtester and in production — if they differ, backtested risk is a lie. Pure functions over `(proposal, portfolioState, marketState) => clampedDecision | reject`, no wall-clock, no randomness (so [[backtesting-rigor]] can replay them).

## Anti-patterns
- Never let the LLM emit a final size that skips the clamp — the LLM's number is always a *proposal*.
- Never size off a single point estimate of price without volatility/liquidity context.
- Never disable the breaker or kill-switch "temporarily" in code — they are load-bearing safety, especially before any real-money (CMA-gated) path.
- Real money changes the bar: sizing/exposure/KYC limits tighten and require the licensing gate ([[sharia-quant]] + docs/QUANT_DESIGN.md regulatory section).
