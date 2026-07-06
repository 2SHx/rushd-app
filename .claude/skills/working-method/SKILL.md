---
name: working-method
description: How to run a hard, multi-step task to completion — decompose it, dispatch self-contained units, verify with executed evidence, and decide what to do next. Use for any task big enough to need planning, parallel work, or a review gate. Model-agnostic: works on a strong orchestrator model (e.g. Opus 4.8) and a fast cheap model (e.g. Gemini 3.5 Flash) via scripts/dispatch.mjs + docs/MODELS.md.
---

# Working Method

A method for converging on hard tasks instead of thrashing. It has four moves — **decompose, dispatch, verify, decide** — and a budget discipline that keeps them cheap. It is model-agnostic: the same moves run whether the actor is a top-tier reasoner or a fast small model; only the *sizing* of units changes (see "Model tiering").

## 1. Decompose

- **One testable GOAL per unit.** If you can't write a command or an observation that proves the unit is done, it isn't scoped yet — keep splitting.
- **Split by disjoint scope, not by topic.** Two units that never touch the same files can run in parallel; two that share a file must be sequenced. Draw the dependency DAG before starting, not after a collision.
- **Scout before you build.** Spend the cheap tier (a fast model / a read-only explorer) to gather `file:line` context *first*; hand the expensive tier a unit it can execute without re-discovering the codebase. Cheap tokens buy context; expensive tokens spend it.
- **Never start a unit whose inputs another unit still owns.** If unit B needs the module shape B is producing, B waits — or you fix an interface contract up front so both can proceed against it.

## 2. Dispatch with a contract

Every unit starts cold — assume zero shared memory. A dispatch that omits context gets guesswork back.

- **Self-contained brief**: GOAL (one sentence) · FILES (paths + line ranges + why each matters) · relevant CONTRACT quoted verbatim (never "see the doc") · SCOPE FENCE (what the unit must not touch) · **ACCEPTANCE (the exact commands to run)**.
- **Carry a runnable check in every dispatch.** The unit closes its own loop — edit → run the check → fix — instead of waiting for a human to notice a mistake.
- **Keep boilerplate byte-stable.** Reuse the same template wording across dispatches so the shared prefix stays cache-friendly; put only the novel bytes at the end.
- **One goal per dispatch.** Two goals = two dispatches. Bundled goals produce half-done units and unclear failures.

## 3. Verify with executed evidence, not assertions

- **"It compiles" is not verification.** DONE means the unit pasted the *actual output* of the acceptance commands (typecheck, lint, tests, a curl, a rendered string). A green claim you didn't run is not evidence.
- **Grounding beats self-reflection.** A checker that *runs the check* is reliable; a model that *reasons about whether it was right* is not. Prefer tools over introspection at every verification point.
- **Fresh context for anything risky.** The unit that wrote the code carries its own assumptions; a separate reviewer that sees only the diff and the acceptance criteria refutes on its own terms. Add a second, security-focused gate for anything touching money, authorization, or a public API surface.
- **Calibrate reviewers to correctness, not taste.** A reviewer told to "find issues" will always find some — instruct it to flag only gaps that affect correctness or the stated requirements, or you invite over-engineering.

## 4. Decide what to do next

- **Follow the DAG.** The next unit is the next one whose inputs are all satisfied. Fan out where scope is disjoint; serialize where it isn't.
- **On a blocker, fix the dispatch — don't retry it verbatim.** Report the exact failing output, then change the brief (more context, tighter fence, a corrected assumption). Re-sending the same prompt reproduces the same failure.
- **Two failed corrections = re-plan.** Accumulated failed attempts pollute a context; a clean unit with a sharper brief beats a long thread of patches.
- **Escalate contract contradictions; don't resolve them ad-hoc.** If the work reveals the spec is wrong, amend the spec (through whoever owns it) and proceed from the amended version — never let an implementer silently diverge.
- **Close each milestone durably.** Append a short memory/journal note (what shipped, key decisions, open risks) and commit, so the next session cold-starts from the note instead of re-deriving state.

## Budget & escape valves

- **Cap retries and report length.** A unit BLOCKED after ~3 honest attempts stops and surfaces the failing output; reports stay short and structured (status / changes / decisions / evidence / open) so integration reads from summaries, not raw dumps.
- **Dial reasoning effort deliberately.** Spend deep/extended thinking only on design-heavy or multi-constraint units (architecture, migrations, money paths); routine units run without it — over-deliberation wastes budget and doesn't improve simple tasks.
- **Prefer the least code that passes the check.** Reuse what exists before writing new; a smaller diff has fewer failure modes and less to verify.

## Model tiering (Opus 4.8 ↔ Gemini 3.5 Flash)

Same method, different unit sizing:

- **Strong orchestrator/reviewer tier (e.g. Opus 4.8)**: owns the DAG, writes the dispatch briefs, runs the fresh-context and security reviews, and handles design-heavy units where one unit spans many constraints. Give it the whole picture.
- **Fast cheap tier (e.g. Gemini 3.5 Flash)**: excellent for scouting, well-fenced implementation, and mechanical checks. It does best with **more, smaller, tightly-fenced units** and an explicit acceptance command, rather than one large reasoning-heavy unit. When routing a unit here, shrink the scope and spell out the check; keep the risky reviews on the strong tier.
- **Route per unit, not per project.** `scripts/dispatch.mjs` + `scripts/models.map.json` let each unit pick its runner/model; explorers and boilerplate go cheap, design and review go strong. The verification bar is identical on both — evidence, not assertion.
