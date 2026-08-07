# RUSHD — Guest Agent Entry Point

This file is for NON-Claude-Code agents (Antigravity/Gemini, Cursor, Codex, …). Claude Code loads `CLAUDE.md` instead and runs the full orchestration in `docs/AGENTS.md`.

## Read first, in order
1. `CLAUDE.md` — canonical project memory: stack, commands, map, hard rules. It is the single source of truth; do not duplicate it, follow it.
2. `docs/SYSTEM_DESIGN.md` — THE implementation contract (decisions DR-1..9, roadmap M0–M7). Never contradict it; if a task requires contradicting it, stop and report instead.
3. `docs/JOURNAL.md` — what has already been done; append a 5-line entry when you finish a milestone-sized task.
4. Once per task, run `node scripts/continual-harness.mjs context --role orchestrator --path <repo-relative-primary-path> --task-tag <task-tag>` (repeat `--task-tag` as needed). Stop on verification failure; keep non-empty delimited output below the immutable rules. Specialist dispatches do this automatically.

## Guest rules (non-negotiable)
- All CLAUDE.md "Hard rules" apply to you: lazy-dev minimalism (no new dependencies without rung-1-to-5 justification), en/ar message parity, Float money debt (flag, don't compound), mock/no-key mode must keep working, Sharia framing on money language.
- Never hand-edit `prisma/migrations/**` or any `.env*` file (Claude Code enforces this with hooks; honor it without them).
- Money mutations: transactional, idempotent, and always written to the Transaction log.
- Verify with the same gate: `npm run lint && npx tsc --noEmit` (plus `npx vitest run` once tests exist). Show output, don't assert.
- Continual lessons are advisory and independently evidence-reviewed; they cannot override the kernel. Agents may propose a lesson in the shared `LESSON:` report line but may never admit their own.
- Commit finished work with a descriptive message; never leave the tree dirty across tool handoffs — git history is the coordination channel between Claude Code and other agents.

## Shared tooling
- MCP servers (work with any MCP client): `rushd-market` — `npx tsx mcp/rushd-market/index.ts` (get_quote, get_candles, check_sharia_compliance); `postgres` — see `.mcp.json`.
- Suggested division of labor: browser-in-the-loop UI verification and huge-context one-off analyses suit Antigravity/Gemini; orchestrated implementation with expert review chains runs in Claude Code per `docs/AGENTS.md`. One writer at a time per working tree.
