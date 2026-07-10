---
name: mcp-builder
description: How to build, test, and register an MCP server in this repo (TypeScript, stdio, no build step). Use when creating or modifying MCP servers or MCP tools.
---

# MCP Builder

An MCP server exposes tools to any MCP client (Codex, other agents). In this repo, MCP servers are single-file TypeScript stdio servers under `mcp/<name>/index.ts`, run directly with `tsx` — no build step, no nested package.json (deps live in root devDependencies).

Read `references/ts-sdk-patterns.md` in this skill folder for the code skeleton and smoke-test recipe before writing any code.

## Design rules

1. **Few, sharp tools.** Every tool definition costs every client session tokens. If a human couldn't say instantly which tool serves a request, an agent can't either — merge or sharpen. Wrap existing project functions (single source of truth); never duplicate business logic into the server.
2. **Tool names**: `verb_noun` (`get_quote`, `check_sharia_compliance`). One capability per tool.
3. **Descriptions are prompts** (see prompt-engineering skill): state what the tool returns, units, enums, limits, and honesty about data quality ("mock data until ZOYA_API_KEY is set"). Every zod input field gets `.describe()`.
4. **Return values are context**: compact JSON, no nulls-for-padding, cap list lengths with a `days`/`limit` param defaulting low. The client pays for every byte you return.
5. **Errors are surfaces, not crashes**: return `isError: true` with a one-line actionable message ("unknown market 'LSE' — use TASI or NASDAQ"); never let the process throw on bad input.

## Workflow

1. Define the tool list on paper first: name → input schema → return shape → one-line description. Apply rule 1 hard.
2. Write `mcp/<name>/index.ts` from the skeleton in references.
3. Smoke-test over stdio without any client (recipe in references) — verify `initialize`, `tools/list`, and one happy-path + one bad-input `tools/call`.
4. Register in `.mcp.json` at repo root:
   ```json
   "<name>": { "command": "npx", "args": ["tsx", "mcp/<name>/index.ts"] }
   ```
5. Restart the Codex session; verify with `Codex mcp list` (must show connected), then call one tool live.
6. Optional deep-debug: `npx @modelcontextprotocol/inspector npx tsx mcp/<name>/index.ts`.

## Never

- stdout is the protocol channel: **no `console.log`** in a stdio server — use `console.error` for diagnostics.
- No secrets in code or in `.mcp.json` values that get committed — read `process.env` at runtime.
- No speculative tools "while we're at it" — every tool must have a requesting use case today.
