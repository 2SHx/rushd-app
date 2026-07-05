# Rushd Financial

Gamified multi-market investment training + family neobanking for the Gulf market (parent/child accounts, TASI + NASDAQ, Sharia-aware).

## Stack
Next.js 14.2 App Router · TypeScript 5 · Tailwind 3.4 · Prisma 5 + PostgreSQL · next-intl v4 (en/ar, RTL) · Vercel AI SDK v3 → Qwen via OPENAI_BASE_URL · lightweight-charts v3.8 · framer-motion · zod 3.

## Commands
- `npm run dev` / `npm run build` / `npm run lint`
- `npx tsc --noEmit` — typecheck (no test runner yet; vitest arrives with test-engineer's first dispatch)
- `npx prisma migrate dev` / `npx prisma studio`

## Map
- `src/app/[locale]/` — pages (only `/` boilerplate + `/dashboard` exist; `/markets` `/quiz` `/profile` are dead links)
- `src/app/api/quiz|signals/route.ts` — the two LLM endpoints (zod + generateObject, mock fallback when no key)
- `src/services/marketData.ts` — mock market data (pure TS, no Next imports) · `src/services/engines.ts` — XP + savings sweep, NOT yet wired
- `prisma/schema.prisma` — User (parent↔child self-relation), GamificationProfile, PortfolioItem, Transaction, SavingsJar, QuizAttempt
- `messages/en.json` + `messages/ar.json` — must stay key-identical
- `mcp/rushd-market/` — project MCP server · `docs/SYSTEM_DESIGN.md` — THE implementation contract · `docs/JOURNAL.md` — session memory

## Orchestration
Main session orchestrates; subagents implement. ALWAYS dispatch with the template in `docs/AGENTS.md` — never freehand.
Routing: questions→explorer · UI→frontend-expert · DB/API/auth→backend-expert · LLM/MCP→ai-features-expert · Arabic/RTL/Sharia→i18n-fintech-expert · tests/CI→test-engineer · verify→qa-reviewer · auth/money/API-surface changes also get security-auditor · design→architect only.
Cold-start a work session from `docs/JOURNAL.md` + the relevant `docs/SYSTEM_DESIGN.md` slice — do not re-explore the codebase.

## Hard rules
- IMPORTANT: lazy-dev ladder applies to ALL code (skill: lazy-dev). New dependencies require written rung-1-to-5 justification.
- Money fields are Float — known debt. Flag it, never compound it. Migration is governed by SYSTEM_DESIGN.md.
- Every user-facing string lands in BOTH `messages/en.json` and `messages/ar.json` in the same change.
- SAHMK/Alpaca/Zoya are mocked; every feature must keep working with no API keys set.
- Interest-language ("interest", "APY") and money-mechanics changes require i18n-fintech-expert review (Sharia framing).

When compacting, always preserve: the modified-file list, acceptance commands, design-contract quotes, and the current milestone.
