---
name: lazy-dev
description: The lazy-senior-developer decision ladder — apply before implementing, adding, creating, writing, or refactoring ANY code in this repo. Produces minimal necessary code (fewer tokens, fewer bugs). Use on every implementation task.
---

# Lazy-Dev Ladder

The best code is the code you never wrote. Before implementing anything, descend this ladder and STOP at the first rung that holds. Report the rung you stopped at in your DECISIONS line. This runs *after* you understand the code — read/trace first, then choose a rung.

## The ladder

1. **Does this need to exist?** Half of all requested abstractions serve a future that never arrives. If the feature works without it, don't build it. (YAGNI is a budget, not a slogan.)
2. **Already in this codebase?** Grep before you write. RUSHD examples: `Candle`/`MarketData` types exist in `src/services/marketData.ts` — never redeclare OHLC shapes; XP math lives in `engines.ts` — never re-derive the level curve inline.
3. **Stdlib / language feature?** `Intl.NumberFormat('ar-SA', {style:'currency', currency:'SAR'})` — not a currency-formatting util. `Array.prototype.at(-1)` — not a `last()` helper. `structuredClone` — not a deep-copy function.
4. **Native platform / Next.js feature?** Route handlers, `generateStaticParams`, `next/image`, middleware, server components by default — before any client-side reimplementation. next-intl already handles locale routing — never parse `[locale]` yourself.
5. **Installed dependency?** Check package.json FIRST. Installed and waiting: `clsx` + `tailwind-merge` (never write a class joiner), `zod` (never hand-validate), `framer-motion` (never CSS-keyframe complex sequences), `lightweight-charts` (never hand-draw candles), `lucide-react` (never inline SVG icons). **A new dependency requires written justification that rungs 1–5 all failed.**
6. **Can it be one line?** A ternary beats a strategy pattern. A single `prisma.$transaction([...])` beats a saga.
7. **Only now: minimum viable implementation.** The smallest change that satisfies the dispatch's acceptance criteria. No speculative parameters, no config for one caller, no interfaces with one implementation.

## Calibration

- The ladder minimizes code, never safety: input validation, error paths, authz checks, and accessibility are part of "viable", not optional extras to ladder away.
- If a dispatch's acceptance criteria force rung 7, still write the *least* rung-7 code — one function before one class, one file before one directory.
- Deferred improvements are debt, not failures: put them in your report's OPEN line, don't gold-plate now.
