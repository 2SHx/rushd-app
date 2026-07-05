# RUSHD Agent Orchestration Protocol

The main session is the **orchestrator**: it plans, dispatches, integrates, and never implements multi-file features inline. Subagents start with ZERO context — every dispatch must be self-contained. Subagents pay for their own exploration; the orchestrator pays for everything it loads. Spend accordingly.

## Dispatch template

Fill every slot; delete none. Keep the boilerplate byte-identical across dispatches (prompt-cache alignment) — only slot contents vary. Prepend `think hard` ONLY for design-heavy or multi-constraint dispatches (auth, migrations, architecture); routine dispatches run without it.

```
<task>
GOAL: {one sentence, testable}
</task>
<context>
FILES: {path:line-range — why each matters, e.g.
  src/services/engines.ts:9-29 — addXP, the function you must wire in}
DESIGN CONTRACT: {quote the 2–5 relevant lines from docs/SYSTEM_DESIGN.md
  verbatim — never write "see the design doc"; the agent must not re-read it whole}
STATE: {2–4 bullets: what exists, what is mocked, what was just changed}
</context>
<constraints>
SCOPE FENCE: {files/dirs the agent must NOT touch}
DECIDED: {decisions already made that the agent must not re-litigate}
</constraints>
<acceptance>
{checkable criteria + the exact commands to run:
 npm run lint · npx tsc --noEmit · npx vitest run · curl ...}
</acceptance>
Reply with your standard report format only.
```

## Report contract (what comes back)

Every agent replies in this exact shape — hard cap 25 lines, no file dumps:

```
STATUS: DONE | PARTIAL | BLOCKED
CHANGES: <file:lines — one line each>
DECISIONS: <lazy-dev rung reached; what was reused instead of written>
VERIFY: <commands run + actual output lines (evidence, not assertions)>
OPEN: <risks/unknowns, max 3 bullets>
```

## Routing table

| Work | Agent | Model |
|---|---|---|
| Codebase question / fact-finding | explorer | haiku |
| Pages, components, styling, charts, motion, a11y/perf | frontend-expert | sonnet |
| Prisma, API routes, engines, auth, deploy config | backend-expert | sonnet |
| LLM endpoints, structured outputs, MCP servers | ai-features-expert | sonnet |
| Arabic, RTL, translations, Sharia/AAOIFI content | i18n-fintech-expert | sonnet |
| Test authoring, vitest setup, CI workflow | test-engineer | sonnet |
| Post-implementation verification | qa-reviewer | opus |
| Security audit (auth/money/API-surface changes) | security-auditor | opus |
| Architecture decisions, SYSTEM_DESIGN.md | architect | opus |

## Rules

1. **Explorer before expert**: if you can't fill the FILES slot with path:line refs, spend haiku tokens first, not sonnet tokens.
2. **One goal per dispatch.** Two goals = two dispatches.
3. **Integrate from reports**, not by re-reading every changed file; spot-check only what a report flags as risky.
4. **Review chain**: implementation → qa-reviewer with the SAME acceptance block → (if the change touches auth, money movement, or the API surface) security-auditor. Sharia/Arabic-touching changes get an i18n-fintech-expert pass before qa-reviewer.
5. **Parallel dispatches** only for disjoint scope fences.
6. **Escape valves**: an agent BLOCKED after 3 attempts reports the exact failing output — do not re-dispatch the same prompt; fix the dispatch. After 2 failed correction rounds on one issue, write a better dispatch from scratch. Contradictions with SYSTEM_DESIGN.md route to the architect (amend the contract), never get resolved ad-hoc.
7. **Session hygiene**: `/clear` between unrelated tasks; cold-start from docs/JOURNAL.md + SYSTEM_DESIGN.md slices, not re-exploration.
8. **After each milestone**: append a JOURNAL.md entry (format in that file), commit, then start the next milestone.

## SDLC coverage map

requirements → user interview + architect · design → architect · implementation → frontend/backend/ai-features/i18n-fintech experts · test authoring + CI → test-engineer · verification → qa-reviewer · security → security-auditor + hooks · performance/a11y → frontend-expert + qa-reviewer checklist · deployment (render.yaml, env docs) → backend-expert · memory → JOURNAL.md. There is deliberately no devops agent — deploy/CI is split between backend-expert and test-engineer until scale justifies one.

## Stop-gate recipe (unattended milestone sessions only)

For long unattended runs, add this to `.claude/settings.json` hooks and remove it afterward — it blocks a turn from ending until the gate passes (harness auto-overrides after 8 consecutive blocks):

```json
"Stop": [{ "hooks": [{ "type": "command",
  "command": "cd \"$CLAUDE_PROJECT_DIR\" && npm run lint --silent && npx tsc --noEmit || { echo 'Stop-gate: lint/typecheck failing' >&2; exit 2; }" }] }]
```
