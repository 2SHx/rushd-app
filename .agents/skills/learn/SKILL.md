---
name: learn
description: Explain, from persisted RUSHD evidence, how an agent team, implementation lane, or quant strategy reached a result. Use when the user invokes /learn or asks how, why, or by whom a result was produced; wants a short team/process walkthrough; or asks to expand into the timeline, math, code, tests, reviews, or evidence caveats.
---

# Learn

Reconstruct the path to a result from evidence, not memory. Stay concise by default and expand only
the dimension the user requests.

## Resolve the result

1. Search the named result, setup, metric, milestone, or team in `docs/STRATEGY_LAB.md`, then
   `docs/JOURNAL.md`, `docs/quant-experiments/`, and `git log`.
2. Treat the current Strategy Lab status and append-only amendments as authoritative for quant
   metrics and verdicts. Use the Journal for chronology, manifests for frozen configuration and
   actors, raw `results/*.json` or DB artifacts when present, and commits for implementation order.
3. Use `docs/AGENTS.md`, agent definitions, code, and tests to explain responsibilities and method;
   never treat a role contract as proof that a particular review occurred.
4. Ask one short clarification only when multiple candidates remain after searching.

Done when the setup/version or milestone is identified and every claim has a persisted source.

## Answer briefly

Default to at most 180 words:

- **Outcome:** the result and its current status.
- **How the team got there:** three compact steps covering hypothesis/decision, implementation, and
  independent verification.
- **What it means:** the decisive caveat or next action.
- **Sources:** two to four clickable local file links.

For quant results, always pair return with OOS DSR, MC-p95 drawdown, sample count, plateau, and
terminal verdict. Say `no performance run` for zero-run lanes. Label diagnostic, simulated,
survivor-conditional, rejected, or non-promotable evidence explicitly.

Done when a reader can understand the result, process, and reliability without opening the sources.

## Expand on request

Interpret `more`, `deep dive`, `timeline`, `math`, `code`, `tests`, `agents`, or `evidence` as a request
to expand only that view:

- **timeline:** decisions, commits, diagnostics, terminal run, and review order;
- **math:** signal, labels, portfolio construction, costs, and metrics;
- **code/tests:** implementation seams, important tests, and executed verification;
- **agents:** each recorded role, its input, output, and independence constraints;
- **evidence:** manifests, hashes, raw artifacts, data lineage, and known gaps.

Keep facts separate from inference. State when raw artifacts or reviewer reasoning were not
persisted; never reconstruct them from a headline or from a role description. Remain read-only unless
the user separately asks to change documentation or code.
