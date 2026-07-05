---
description: Interview the user, then dispatch the architect agent to produce/update docs/SYSTEM_DESIGN.md
disable-model-invocation: true
---
Produce (or update, if it exists) `docs/SYSTEM_DESIGN.md` via the architect agent. Follow these steps exactly.

## Step 1 — Interview the user (AskUserQuestion)

Ask ONLY the decisions the user must make — dig into hard parts, skip anything the codebase or prior answers already settle. Cover, unless already decided in `docs/SYSTEM_DESIGN.md` or this conversation:
1. **Auth build-vs-buy posture**: self-hosted open-source (Auth.js v5 style) vs managed provider (Clerk-style, per-user cost) vs minimal custom sessions — constraint: child accounts have no email.
2. **Money scope for v1**: pure simulation (no real money, no PSP) vs real family allowances (payment provider, KYC, real compliance burden). This single answer reshapes M4 and the security bar.
3. **Launch market/language priority**: Saudi-first (Arabic primary, TASI emphasized) vs bilingual-equal.
4. **Sharia positioning**: strict (no interest mechanics anywhere, sweep redesigned as Mudarabah/wakala before launch) vs pragmatic (educational simulation may show conventional mechanics with labels).
Ask follow-ups only if an answer creates a new fork the architect can't resolve alone.

## Step 2 — Dispatch the architect agent

Use the dispatch template from `docs/AGENTS.md`, prepended with `think hard`. Fill:
- GOAL: produce the complete docs/SYSTEM_DESIGN.md per the system-design skill's required sections.
- FILES: prisma/schema.prisma (all models) · src/services/engines.ts:1-68 (XP + sweep, unwired) · src/services/marketData.ts:46-84 (provider placeholders + mock Sharia rule) · src/app/api/quiz/route.ts and signals/route.ts (LLM endpoints) · src/middleware.ts (locale routing) · package.json (installed deps) · mcp/rushd-market/index.ts if present (MCP surface).
- DESIGN CONTRACT: "none yet — this dispatch creates it."
- STATE: MVP ~800 lines; everything mocked; no auth/tests; dead nav links to /markets /quiz /profile; dashboard hardcoded.
- DECIDED: the user's interview answers, verbatim, one per line.
- SCOPE FENCE: writes to docs/SYSTEM_DESIGN.md ONLY.
- ACCEPTANCE: every required section from the system-design skill present · every major decision is a DR with all five fields · every milestone table row has one owning agent + a checkable exit criterion · no "consider"/"might" language (grep the doc) · no contradiction with prisma/schema.prisma.

## Step 3 — QA pass

Dispatch qa-reviewer with the SAME acceptance block, plus: "verify internal consistency — no section contradicts another; the sweep reframing satisfies the user's Sharia positioning answer."

## Step 4 — Hand to the user

Report the architect's DECISIONS list and qa-reviewer's STATUS. The user approves or requests amendments (amendments go back through the architect, never edited inline).
