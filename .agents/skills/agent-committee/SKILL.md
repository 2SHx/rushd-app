---
name: agent-committee
description: How to build the multi-agent analyst committee for Rushd Quant — the AnalystSignal contract, bull/bear debate, the LLM-decides/rules-veto Portfolio Manager hierarchy, RAG for the research agent, model tiering, and reproducibility. Use when wiring analysts together, building the PM/debate, or the Research/Literature RAG agent.
---

# Agent Committee (multi-agent ensemble)

Rushd Quant is a committee of 8 analyst agents whose views a Portfolio Manager aggregates into one decision. Pattern validated by TradingAgents (UCLA+MIT) and virattt/ai-hedge-fund — borrow their structure, avoid their pitfalls (non-determinism, unvalidated backtests). LLM prompt craft: see [[prompt-engineering]]; gates: [[risk-management]] + [[sharia-quant]].

## The contract that makes them cooperate
Every analyst implements `analyze(symbol, ctx: PointInTimeContext) => AnalystSignal` and returns the same shape (stance/conviction/horizon/rationale ar+en/evidence/complianceTag). Heterogeneous agents (deterministic TS vs LLM vs RAG) are interchangeable because they all speak `AnalystSignal`. Persist every signal (`AnalystSignalRecord`) — it's the audit trail AND the learner-facing explanation.

## The decision hierarchy (LLM decides, rules veto)
1. All 8 analysts produce signals (the Sharia agent produces a **veto**, not a vote).
2. **Bull/Bear debate:** a strong-model optimist and skeptic each argue over the analyst signals for ≤N short rounds (TradingAgents pattern). Reduces single-analyst bias; the transcript is superb pedagogy.
3. **Portfolio Manager (LLM) decides action + size** — but only *inside a deterministic envelope it cannot cross*: the Sharia veto blocks haram names outright, and the Risk Manager clamps size/exposure/stop ([[risk-management]]). The LLM has full latitude within the envelope; it can never breach it. (This is virattt's "PM apex filtered through Risk Manager constraints.")
4. Persist a `Decision` with its full contributor set + debate transcript.

## Reproducibility (their documented weakness — "two runs differ")
- LLM calls at **temperature 0**, seeded where the provider supports it; log every call's inputs→prompt→output.
- A fundamentally LLM-driven sizer is not reproducibly backtestable, so **backtest a deterministic policy-surrogate** of the PM and spot-check the live PM agrees. Never publish a backtested return for the live LLM sizer.

## Model tiering (cost is real)
Routine analyst passes → a fast cheap model (e.g. Gemini Flash). PM reasoning + debate → a strong model (e.g. Opus). Cap total LLM calls per committee pass (TradingAgents spends 11+ LLM + 20+ tool calls per decision — that's the cost trap). Route per agent via `scripts/dispatch.mjs` / models.map.json. See [[working-method]].

## LLM analyst pattern (reuse, don't reinvent)
Follow `src/app/api/signals/route.ts`: `createOpenAI({OPENAI_API_KEY, OPENAI_BASE_URL})` → `generateObject({model, schema, system, prompt})`, a module-level `TokenBucket` returning 429 first, and a **deterministic mock fallback** that satisfies `AnalystSignal` when no key is set (mock-first is a project invariant — the whole committee must run keyless). User-controlled symbols are fenced as data, never instructions (injection-safe).

## Research/Literature agent (#7 — RAG)
- Corpus = curated quant + Islamic-finance sources; chunk, embed, retrieve top-k by the decision's context.
- It **informs** the PM's rationale with cited sources; it can **never override** the Sharia veto or a risk cap.
- Ground answers: every claim carries a citation to a retrieved chunk; no citation ⇒ don't assert. Degrades to a documented stub with no key.

## Anti-patterns
- Don't let the PM LLM compute the Sharia verdict or the risk cap — those are deterministic gates, computed in code, passed to the PM as hard constraints.
- Don't average stances naively; weight by calibrated conviction and agent track record, and let the debate surface disagreement rather than smoothing it away.
- Don't skip the mock fallback on any analyst — one keyless failure breaks the whole pass.
