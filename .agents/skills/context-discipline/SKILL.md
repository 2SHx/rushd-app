---
name: context-discipline
description: Context compression rules for exploring, searching, reading, investigating, or summarizing — keeps the attention budget on high-signal tokens. Use when researching the codebase, processing tool output, or writing reports back to an orchestrator.
---

# Context Discipline

Context is the scarcest resource. Performance degrades as the window fills; every token you load must earn its place. Target: the smallest set of high-signal tokens that lets the next step succeed.

## Reading (just-in-time retrieval)

- **Grep before read.** Locate symbols with search; only then read the surrounding lines.
- **Read line ranges, not files.** You almost never need a whole file — you need the function and its call sites.
- **Never re-read** a file already in your context, and never re-read your own edits to "check" them — run `npx tsc --noEmit` or the acceptance command instead; the error output is smaller and more truthful.
- **Use metadata as signal before content**: folder names, file names, naming conventions, and imports tell you where things live without opening them.
- Carry **lightweight identifiers** (path:line refs) through your reasoning, not pasted contents.

## Tool output (compress at the boundary)

- Distill every large tool result into structured facts the moment you receive it (symbol → location → one-line role). The raw dump must not survive into your next reasoning step.
- Pipe shell output through `head`, `grep`, `wc` — ask the command for the answer, not the transcript.

## Reports (the compression boundary between agents)

- Reports back to the orchestrator: **hard cap 25 lines**, structured (STATUS / CHANGES / DECISIONS / VERIFY / OPEN). A distilled report of ~300 tokens replaces the multi-thousand-token exploration that produced it — that is the entire point of being a subagent.
- Never paste file contents into a report unless the exact text is load-bearing (an error message, a contract line).
- Answer-first: the first line of any report answers the dispatch's GOAL.

## Cache alignment

- Keep prompt prefixes stable: don't reorder dispatch-template boilerplate, don't reword shared blocks per-dispatch — identical prefixes hit the provider cache; novel bytes go at the END of the prompt.

## Session hygiene (orchestrator)

- `/clear` between unrelated tasks; a kitchen-sink session degrades everything after it.
- After 2 failed corrections on the same issue: stop patching the conversation. Re-dispatch fresh with a better prompt that incorporates what you learned — a clean context with a sharper prompt beats a long context full of failed attempts.
- Integrate from subagent reports; spot-check only files a report flags as risky.
