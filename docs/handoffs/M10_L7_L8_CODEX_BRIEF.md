# Codex handoff — finish M10: L7 learning modules for every league team, then the L8 universal gate

**Who this is for:** Codex (or any capable coding agent) working in this repo. Read `AGENTS.md` (repo root) first, then this brief. Cold-start context: `docs/JOURNAL.md` top entries + `docs/SYSTEM_DESIGN.md` §6 DR-14 + §9 M10.

**Lane ownership (a parallel Claude lane is building the Academy — do not collide):**
- YOURS: `src/quant/learning/**`, `src/components/learning/**`, the league evidence-gate components, `src/app/api/learning/**`.
- NOT YOURS: `src/academy/**`, `prisma/**`, `src/lib/authz.ts`, Academy UI routes (Claude lane); `src/components/markets/**` unless you are separately doing M13.
- SHARED: `messages/en.json` + `messages/ar.json` — additive edits only, run a recursive key-identity check before every commit, never reformat.

## State (verified 2026-07-17)

M10 L1–L6 are shipped. The module registry `src/quant/learning/strategyLearningModules.ts` has `STRATEGY_LEARNING_SETUP_IDS = ['bollinger-mr-long-v2']` — exactly one reviewed module. Every other visible league team renders "module under validation" (honest, from your L6 work). L8 (universal gate) is contractually blocked until L7 covers every visible team.

## Unit 0 — enumerate the roster

List the exact visible league teams from the league surface (the terminal teams the /quant/league UI shows). Post the list in your first commit message body. One L7 unit per team follows, sequenced (shared registry file — no parallel edits).

## Units 1..N — one L7 module per team (one commit each)

Copy the proven pattern per team:
1. `src/quant/learning/<team>Curriculum.ts` + colocated test — model on `bollingerMrLongV2Curriculum.ts`.
2. Register the setup id in `STRATEGY_LEARNING_SETUP_IDS`.
3. Frozen ≤6-month PIT fixture under `src/quant/learning/fixtures/` replayed through the existing `strategyLearningReplay.ts` — reuse the exact setup engine; never a bespoke simulator.
4. All learner-facing strings in BOTH `messages/en.json` and `messages/ar.json`, same commit.

**Per-module exit criteria (M10 L7 row, verbatim contract):** each module independently proves 5–8 bilingual questions, knowledge-policy isolation (identical answers → identical policy hash; invalid/out-of-range answers fail closed; changing a knowledge answer leaves the policy byte-identical), deterministic policy hash/replay, future-bar failure, real-data provenance (no MOCK bars), risk/Sharia/fill parity with the real setup engine, and four aligned normalized-100 series (learner / team / SPUS / SPY price-proxy, labeled as such); **no terminal evidence period is run**.

**Hard prohibitions (DR-14, non-negotiable):**
- The prohibited terminal-period evidence run (2018→2026 FULL) is NEVER triggered by any learning flow.
- Policy decisions map through the pure compiler inside reviewed parameter bounds; they can never weaken Sharia or risk caps.
- XP only via `addXP` for completion/retrieval/reflection — never for simulated profit. No variable-ratio rewards, no winner/loser language.
- First attempt seals before any outcome is revealed; retries are new labeled attempts.
- For REJECTED teams (most of them), the module's copy must keep the team's REJECTED/research-only status visible — teaching a rejected strategy's mechanics is the point; implying it's a winner is forbidden.

## Final unit — L8 universal gate (only after every visible team has a module)

**Exit criteria (M10 L8 row, verbatim contract):** every visible team routes to its exact lesson; no detailed metrics, historical comparison, or trade ledger render before that setup's sealed result; direct URL selection and a different team's completion remain locked; en/ar desktop/mobile keyboard walk-through passes.

## Per-commit discipline

`npm run lint` · `npx tsc --noEmit` · `npx vitest run` (focused module suite + full) green; key-identity check on messages; one team per commit; append a `docs/JOURNAL.md` entry per landed unit (format at the top of that file) so the parallel lane sees your progress; scoped `git add` by explicit paths — never `git add -A` (the tree carries the other lane's work).
