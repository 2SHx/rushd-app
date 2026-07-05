---
name: prompt-engineering
description: Expert prompt-writing rules for any prompt in this project — agent system prompts, subagent dispatches, runtime LLM prompts (api/quiz, api/signals), MCP tool descriptions, zod schema descriptions. Use whenever writing or reviewing a prompt, system prompt, tool description, or agent definition.
---

# Prompt Engineering

Every prompt in this repo is production code: it has a contract, failure modes, and a reader (a model) whose attention is finite. Write accordingly.

## Altitude calibration (the master rule)

Prompts fail at two altitudes: too low (brittle hardcoded if/else logic that breaks on the first unanticipated input) and too high (vague guidance that falsely assumes shared context — "be helpful", "handle edge cases"). Aim between: **specific enough to guide behavior, flexible enough to leave the model strong heuristics.**

- Start with the minimal prompt that fully outlines expected behavior. Add instructions only in response to *observed* failures, never speculatively.
- Every instruction must be falsifiable. "Validate inputs with zod before use" — checkable. "Be careful with inputs" — noise; delete it.

## Structure

Segment with XML tags or markdown headers so the model can address sections: `<role>`, `<expertise>`, `<method>`, `<never>`, `<report>` for agents; `<task>`, `<context>`, `<constraints>`, `<acceptance>` for dispatches.

- **Role first, one sentence, load-bearing.** "You are RUSHD's senior backend engineer" changes behavior; "You are a helpful assistant" doesn't. Include explicit *non-goals* ("Not for UI work").
- **Output contract always.** Specify format, length cap, and what to omit. An agent without an output contract returns whatever it feels like — usually too much.
- **Negative space.** A short `<never>` list of the 4–6 *domain-specific* mistakes actually worth preventing beats twenty generic warnings. Each item must name a concrete act, not an attitude.

## Few-shot: when it pays

Examples are pictures worth a thousand words — but only curated ones. Use ONE diverse, canonical example when the desired output shape is hard to describe (e.g. a report format, a component split). Never stuff a laundry list of edge cases; the model pattern-matches to examples over instructions, so a bad or narrow example is worse than none.

## Structured-output prompts (generateObject + zod)

- Every zod field gets `.describe()` with units, enums, and language ("Arabic explanation, max 2 sentences, no financial advice"). The schema IS half the prompt.
- The system prompt must never contradict the schema. If the schema says `reasoningArabic`, the prompt must not say "respond in English".
- No "think step by step" on structured-output calls — the tokens have nowhere to go and degrade JSON adherence. Move reasoning to a dedicated `rationale` field if you need it.

## Tool descriptions (MCP / function calling)

A tool description is a prompt for a future agent deciding whether to call it. Verb_noun name; description states what it returns, units, enums, limits, and when NOT to use it ("mock data until ZOYA_API_KEY is set"). If two tools could plausibly serve the same request, merge or sharpen them — ambiguity for you is ambiguity for the model.

## Anti-patterns (delete on sight)

- Politeness padding ("please kindly ensure…") — tokens without behavior.
- Unfalsifiable instructions ("use best practices", "be thorough").
- Restating what the model already knows (what TypeScript is; what a PR is).
- Hedged commands ("consider using X") — either require X or stay silent.
- Duplicating the same rule in three places — it will drift; one canonical home + pointers.
- Thinking-mode incantations on routine tasks — "think hard" is a dial for genuinely multi-constraint problems, not a default.
