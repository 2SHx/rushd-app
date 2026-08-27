# Gemini Flash 3.7 — what to give it, and what never to

**Author:** orchestrator, 2026-08-27

## The routing rule

Route by **cost of being wrong**, not by task size.

Flash is fast and cheap. Its failure mode is not gibberish — it is a **plausible, confident, wrong answer**. So the question for any task is: *if this comes back wrong, will anyone notice?*

- **Wrong is visible** → Flash. A failing test, a broken build, a missing file, a wrong line number. The feedback loop catches it.
- **Wrong is invisible** → Opus. A benchmark that looks reasonable, a threshold that looks justified, a purification formula that produces a plausible number. Nothing catches it, and it becomes evidence.

This session produced three concrete examples of the second kind: a lesson silently truncated mid-instruction, a safety violation filed under the milder failure code, and a cost model that charged a price movement as company income for a 30–80× overstatement. All three *ran fine*. All three would have passed a Flash review.

## Give Flash these

**1. `explorer` — fact-finding.** "Where is X defined?", "what calls Y?", "which files import Z?" Wrong answers are immediately obvious because the next step fails. Highest-volume, lowest-risk work in the repo.

**2. Codemods and literal sweeps.** Exactly the `126 → 135` / `relatedSetups 14 → 15` update across six test files. Mechanical, verified by the suite.

**3. Translation parity.** `messages/en.json` ↔ `messages/ar.json` key-set comparison. A missing key is a hard, checkable fact. Flash should report the diff — **not** author Arabic financial copy, which is Sharia-framing work.

**4. Mechanical test authoring against a spec you already wrote.** Give it the exact assertions; let it write the boilerplate. Do not let it decide *what* to assert.

**5. Documentation and changelog drafting** from a diff that already exists.

**6. Dead-code and unused-asset sweeps.** The kind that found eight 1024×1024 avatars referenced nowhere.

## Never give Flash these

**Governance and evidence.** `quant-research-director`, `quant-validation-auditor`, any QDR record, any manifest, any threshold or gate. The zakat ruling corrected **two errors in my own brief** and caught a defect where a cost-constant change would leave all four sealed hashes byte-identical while silently changing what the sealed lane measured. Flash would have implemented the brief as written.

**Anything on the money path.** `rebalancer.ts`, execution, purification, zakat, order placement. A wrong number here is a real financial and Sharia error that reports success.

**`security-auditor`.** Its whole value is suspicion.

**P1 of the Sept 8 brief** — proving the unattended path actually trades. That task exists *because* `runAutomatedStrategies` currently returns success having done nothing. A plausible green result is worse than no result.

**Sealed manifests, `pointInTimeMembership.ts`, the survivorship fence.** Anything where the failure mode is silent relaxation.

## Wiring it

`scripts/models.map.json` already routes every agent. Switching a role to Flash is one string:

```bash
DISPATCH_RUNNER=gemini DISPATCH_MODEL=<flash-model-id> node scripts/dispatch.mjs explorer "where is X?"
```

To make it permanent, change the `runner`/`model` on the `explorer` and `test-engineer` rows only. **Leave every quant role, `security-auditor`, and `qa-reviewer` where they are** — `qa-reviewer` in particular must stay on a different, stronger model than the implementer, because that diversity is the entire reason a review gate catches anything.

## The one rule that matters

**Flash proposes; something stronger verifies anything that becomes evidence.**

A Flash result that ends up in a QDR record, a terminal card, a manifest, or a money calculation must be independently checked first — the same way agents may propose a lesson via the `LESSON:` line but can never admit their own.
