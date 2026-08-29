# The swarm

Autonomous work on the standing goal, without a human writing a task description each time.

## Run it

```bash
node scripts/swarm.mjs                      # dry run — shows what it WOULD do. Safe, default.
node scripts/swarm.mjs --execute            # dispatch the single highest-priority ready item
node scripts/swarm.mjs --execute --max=3    # three items
node scripts/swarm.mjs --execute --only=T-3 # one specific item
```

Dry run first, always. It prints owner-only items before anything else, which is usually the answer
to "why hasn't this moved" — the swarm can grind data quality for a week without touching the four
things that actually gate the mission.

## The four files

| File | What it is |
|---|---|
| `objective.json` | The standing goal, what is **already settled**, hard constraints, and what only the owner may do. Agents read this instead of being briefed. |
| `GUARDRAILS.md` | What agents must never do. Every rule names the incident that produced it. |
| `backlog.json` | The queue. Every item carries an `accept` **command**. |
| `runs/` | One JSON per dispatch: the item, the agent's output, and whether acceptance passed. |

## Why acceptance is a command, not a judgement

An agent's claim of success is not evidence. This program has repeatedly found work that reported
success while doing nothing — a two-symbol ingest roster, POST-only cron routes, an unsatisfiable
incubation roster, and a Sharia gate silently rewriting every BUY to HOLD, all returning HTTP 200.

So `swarm.mjs` runs the `accept` command itself, **after** the agent reports, and the agent never
sees the result. It also runs it *before* dispatching: if acceptance already passes, the work is
done and running an agent would be pure cost.

### Writing an acceptance test that is worth anything

Two of the first three written for this backlog were broken, in the same way, and both were mine:

- **T-5** checked that `data/compliance/` existed. That passed the moment somebody ran the script by
  hand — it could not distinguish "scheduled" from "someone ran it once".
- **T-4** checked that `research-assertions` was **imported**. A script can import a module and call
  nothing.

Both drifted toward *what is easy to grep for* rather than *what is true*. When you write one, ask:
**can this pass while the work is undone?** If yes, it is not a test.

The third failure mode: **an acceptance nobody can pass**. T-5 originally required two dated
snapshots, which cannot both exist on the day the item is written. That is not a high standard, it
is a broken test, and it burns an agent run before anyone notices.

## Anchors vs regression checks

`scripts/lib/research-assertions.ts` exposes both, and they are not interchangeable.

- `anchor()` — compare to something knowable **outside this pipeline**. Catches "was this ever right".
- `regressionCheck()` — compare to a number **this pipeline produced before**. Catches "did this change".

All three wrong results this program published were *consistently* wrong across runs. A regression
check would have passed on every one of them, twice. Use both; never let the second stand in for the
first.

A subagent, explicitly warned about this, still used `anchor()` for two prior-run figures out of
fifteen. Instructions get followed to the letter and miss their point — which is why the distinction
now lives in the function name rather than in a comment.

## What the swarm is deliberately NOT for

**Alpha discovery.** More agents searching for a signal means more hypotheses tested, which means
more false positives — not more discoveries. Six pre-registered signals have already been falsified
on the full 6,786-name universe. An unsupervised agent would have reported the leveraged-ETF result
as a 12.18pp/yr win.

Any item claiming a *result* rather than fixing a bug must clear four gates: an external anchor,
printed holdings, a beaten random null control, and a declared data basis. See `GUARDRAILS.md`.

## Runners

`scripts/dispatch.mjs` shells out to `opencode` / `claude` / `gemini` / `codex` per
`scripts/models.map.json` (currently free OpenRouter models). `swarm.mjs` detects whether any is
installed and, if none is, **writes the assembled task to `runs/<ID>.task.txt` instead of pretending
to dispatch** — hand that to a subagent from the orchestrator session. The external CLIs are the
any-model path, not the only path.

## Adding work

Append to `backlog.json` with `"state": "proposed"`. Only the orchestrator or the owner promotes an
item to `"ready"`. Anything an agent must not do gets `"state": "owner"` and a `blockedBy` naming
precisely what only the owner can supply — and before writing that, **prove the blocker is real**.
The grace-period ruling looked like it blocked the divestment fix and did not: divesting at the next
cycle is conservative under every admissible reading, so the mechanism shipped with the parameter
left open.
