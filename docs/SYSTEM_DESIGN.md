# Rushd Financial — System Design

Binding implementation contract. Agents receive 2–5 line quotes as their DESIGN CONTRACT; every sentence here is load-bearing. Decisions are final unless a Decision Record's "Revisit when" trigger fires. No contradiction with `prisma/schema.prisma` as it exists today is permitted — all schema changes live in §4 and are tagged to a milestone.

**Cross-cutting invariant (all milestones):** every feature works with zero external API keys set. Mock/no-key mode is first-class until the live-integration milestone that replaces a given adapter. An exit criterion that only passes with keys is invalid.

---

## 1. Context & goals

**Product.** Gamified, bilingual (Arabic-first) investment-training and neobanking simulator for the Gulf — for self-directed adults learning to invest and for parents supervising children. All practice uses virtual play-money across TASI (featured) and NASDAQ (secondary).

**Personas.**
- **SOLO** — self-directed Gulf adult (18+), own email + password, role `PARENT` with zero children (DR-15). Learns via the Academy (DR-17) and strategy lessons (DR-14), runs simulated trades. Becomes a family by adding a first child.
- **PARENT** — Gulf guardian, real email + password. Creates and supervises child accounts, sets allowances, sees each child's activity. The family's single account holder; may have zero children (parent-only) — family features activate with the first child (DR-15).
- **CHILD** — minor (~8–17), no email. Logs in with a parent-issued family code + username + PIN. Learns age-appropriate content (DR-17), takes quizzes, runs simulated trades, earns XP. Sees only their own data.

**Markets.** TASI is the quality bar: numeric symbols (`2222`=Aramco, `1120`=Al Rajhi), SAR pegged 3.75/USD, trades **Sunday–Thursday** ~10:00–15:00 AST (never hardcode Mon–Fri). NASDAQ secondary: alphabetic symbols, USD.

**Money.** Pure simulation. All balances are virtual play-money — no payment processor, no KYC, no real funds move in v1. The design is nonetheless **SAMA-credible**: not-real-money/not-advice disclaimers everywhere, complete audit trail, PDPL-aligned data minimization, and a documented path to the SAMA regulatory sandbox (§8, DR-9).

**Sharia stance.** Strict *product mechanics* (nothing the user can DO with play-money uses interest — the savings sweep is reframed as Mudarabah before launch, DR-3) alongside comprehensive *educational content* (everything the user can LEARN — interest, bonds, APY — is taught openly, each non-compliant concept persistently labeled, DR-5).

**What "done" means for v1.**
1. Parent and child can register and log in (child via family code + PIN); sessions carry role/tier/family.
2. Arabic-default bilingual UI, full RTL, `messages/*.json` key-identical, global disclaimers in both locales.
3. Dashboard shows DB-backed gamification + portfolio + TASI/NASDAQ data (mock, or live when keys set) — no hardcoded XP.
4. Quiz + AI signals: Arabic-primary, compliance-tagged, guardrailed, structured-output, mock fallback.
5. Savings is Mudarabah profit-share (zero riba), every distribution audited as a `Transaction`.
6. Market data behind one provider interface with env-key live swap; MCP server reads the same layer.
7. Money is `Decimal` with a full audit trail.
8. `npm run lint` + `npx tsc --noEmit` + `npx vitest run` green, including a no-keys mock CI run.

**Non-goals v1:** real money / PSP / KYC, real brokerage execution, multi-parent families, native mobile app, à-la-carte per-feature billing. Solo-adult accounts are IN scope as of DR-15 (M11) — the product is no longer family-only.

**Plans & tier gating (product default, tunable in code, not schema — DR-15/DR-16):** two priced plans — **Solo** (user-based) and **Family** — at different price points, annual-first and SAR-denominated; within each plan, BASIC/PREMIUM/ULTRA is a capability matrix, not a child count. BASIC (free) = both market overviews, TASI simulated trading, quizzes, Academy Foundations track, first strategy-team lesson, and 5 full stock-workspace unlocks per rolling 30 days (the Sharia verdict chip stays visible even when metered). PREMIUM = NASDAQ trading, AI signals, unmetered workspace, Economics track + all strategy-team lessons. ULTRA = Advanced Financial Analysis track (CFA-candidate level, OQ-9) + capstones, advanced/quant analytics, priority AI. Child seats exist only on the Family plan: BASIC = 1, PREMIUM = 4, ULTRA = unlimited. Price numbers are OQ-8. Gating and metering are enforced in the authz helper (§8), never by branching UI alone.

---

## 2. Architecture overview

Single Next.js 14 App-Router monolith. No new runtime service, queue, or datastore is introduced — every capability is a module inside the app or a thin transport over an existing module.

```
                 ┌───────────────────────── Next.js monolith ─────────────────────────┐
Browser ──HTTP──▶│ middleware (Auth.js session + next-intl locale)                      │
                 │   src/app/[locale]/**        RSC + client UI                         │
                 │   src/app/api/{quiz,signals,cron,auth}/route.ts   HTTP endpoints     │
                 │        │                    │                                        │
                 │        ▼                    ▼                                        │
                 │   src/services/engines.ts   src/services/marketData/  (provider      │
                 │   (XP, Mudarabah)           interface + registry + adapters)         │
                 │        │                    │            ▲                           │
                 │        ▼                    ▼            │                           │
                 │   src/lib/prisma.ts (singleton) ── Prisma ──▶ PostgreSQL             │
                 └────────────────────────────┼────────────────┼──────────────────────┘
Render Cron ──HTTP(signed)──▶ /api/cron/distribute            │
LLM: quiz/signals ──▶ Qwen via OPENAI_BASE_URL (OpenAI-compatible), mock fallback
MCP client (stdio) ──▶ mcp/rushd-market ──── reuses ────────▶ src/services/marketData
```

**Module boundaries.**
- `src/app/[locale]/**` — UI (React Server Components + client islands).
- `src/app/api/**` — HTTP endpoints (LLM, cron, Auth.js handler).
- `src/services/engines.ts` — the ONLY money/XP mutation path; `addXP` stays the sole XP writer.
- `src/services/marketData/**` — provider interface, registry, adapters, screener (DR-4).
- `src/lib/prisma.ts` — single `PrismaClient` (fixes the private client in `engines.ts:4`).
- `src/lib/auth.ts` — Auth.js v5 config; `src/lib/authz.ts` — the session-scoping guard (§8).
- `src/lib/compliance.ts` — disclaimer strings + flagging helpers.
- `mcp/rushd-market/` — MCP stdio transport; a thin wrapper over `marketData`, never its own data source.

**Request/data flow (≤10 lines).** A request enters middleware → next-intl resolves `[locale]` and Auth.js resolves the session (redirect to `/[locale]/login` if a protected prefix is unauthenticated). RSC pages call services directly; client actions call `/api/*`. Services read/write through the Prisma singleton; every money mutation runs in a `prisma.$transaction` that also writes an audit `Transaction` row. LLM endpoints call Qwen with `generateObject`+zod and fall back to a mock object on any error or missing key. The MCP server and the HTTP UI share one `marketData` code path, so a screening or quote change lands in both transports at once.

### DR-8: Background jobs run on Render Cron hitting a signed internal route — no queue
Decision: schedule the daily Mudarabah distribution as a Render Cron Job that POSTs `/api/cron/distribute` with a shared-secret header; the route runs `processCashSweeps()` in a DB transaction.
Options: In-process `setInterval` (dies with the request lifecycle on serverless/Render web) / dedicated worker service + queue (BullMQ/Redis — new infra for one daily job) / Render Cron → internal route (reuses the platform we already deploy to).
Rationale: RUSHD already deploys on Render (commit `ddd56be1`); one daily, idempotent job over a few thousand rows needs neither a queue nor a second service. "Do nothing" fails — profit must actually be credited; "use what exists" wins.
Consequences: the cron route must authenticate (shared secret) and be idempotent (guard against double-run per day). No retry infra; a missed run is caught by the next day's idempotent pass.
Revisit when: distribution fan-out exceeds ~1 job/minute or needs per-user scheduling, or a second recurring job appears — then introduce one worker + a lightweight queue.

**Presentation layer.** The visual contract for all UI is ui-craft §0 (institutional minimalism, morpho.org reference) — quoted, never re-stated here. DR-12 fixes the token-level decisions; DR-13 fixes the one place 3D is permitted and the dependency that powers it.

### DR-12: Institutional-minimal design system — light-first paper base, one purple accent, semantic-only status colors, ThemeToggle is the sole appearance control
Decision: replace the neon/glass token set (`globals.css`, `tailwind.config.ts` incl. `neonBlue`) with an institutional-minimal system per ui-craft §0 — "Near-monochrome base. One restrained accent, used sparingly for a single primary action. Whitespace is the layout. Almost no borders. Quiet motion. Applied to RUSHD: the numbers ARE the ornament — if a decoration competes with a number, delete the decoration." Four settled (user-DECIDED) points: (a) theme is **light-first** — off-white paper base ~`#FAFAFA`, near-black type; dark remains first-class via `ThemeToggle`, and the layout bootstrap default flips `'dark'`→`'light'`. (b) The brand accent is **one** restrained institutional purple (iris/violet, `#5B5BD6`–`#7C3AED` range; exact token chosen at implementation with ≥4.5:1 contrast on the light base); emerald/rose/amber become purely semantic — up/compliant · down · non-compliant — never decorative. (c) `DesignControlCenter.tsx` (user-facing glow/blur/color-preset customizer) is **removed**; `ThemeToggle` is the only appearance control. (d) All tokens live in the Tailwind theme + CSS variables — no per-component hex.
Options: keep the neon/glass aesthetic (reads as a game skin, undermines the SAMA-credibility posture of DR-9) / dark-first minimal (institutional, but light paper is the stronger trust register for a family-finance product and prints/screenshots cleanly for regulators) / light-first institutional-minimal with first-class dark (chosen — matches ui-craft §0 and the reference aesthetic).
Rationale: a product asking regulators and parents to take it seriously cannot look like a neon terminal toy; the data (prices, NAV curves, XP) must be the ornament. One accent with semantic colors reserved for meaning also removes the standing risk of red/green being repurposed decoratively, which matters when rose additionally encodes "non-compliant" (DR-5).
Consequences: `neonBlue` and all glow/glass utilities are deleted, not aliased; every component re-skinned in M9 must pass design-reviewer against ui-craft; the `DesignControlCenter` removal deletes its persisted preferences (acceptable — presentation-only, no schema impact); en/ar parity holds because tokens carry no copy. Dark theme is a token swap, never a component fork.
Revisit when: a brand refresh introduces a second accent, or user research shows dark-first preference dominant in the Gulf family segment — then re-run the theme-default decision, not the token architecture.

### DR-13: A single lazy-loaded 3D layer (three + @react-three/fiber) on the landing hero and /quant only — everywhere else stays 2D
Decision: adopt `three` + `@react-three/fiber` (drei only if a concrete helper is proven needed during implementation, not preinstalled) for exactly two surfaces — the landing hero and the `/quant` analyst-committee scene — loaded via `next/dynamic` with `ssr: false` so no other route pays for it. Rung-1→5 justification (required for any new dependency): **Rung 1 — do nothing:** fails; the revamp mandate includes a credibility-grade hero and a committee visualization, and the current static neon hero is being deleted (DR-12). **Rung 2 — use what exists:** fails; framer-motion and CSS 3D transforms cannot produce lit, depth-sorted, state-driven 3D — no scene graph, no lighting model, no z-sorted geometry reacting to committee state. **Rung 3 — write a little code:** fails; hand-rolled WebGL is ≈1000+ untested lines of shader, matrix, and resize/context-loss plumbing — strictly worse than the audited library. **Rung 4 — adapt an existing dep:** fails; no installed dependency renders 3D. **Rung 5 — new dependency:** `three` + `@react-three/fiber`, approved.
Options: no 3D at all (rung 1 — loses the committee scene that makes the quant module legible to a learner) / raw three.js without r3f (imperative escape hatch inside a React app; manual lifecycle/disposal is exactly the bug class r3f exists to remove) / three + r3f lazy-loaded on two routes (chosen).
Rationale: the committee scene is pedagogy, not decoration — the learner watches 8 analysts deliberate (DR-10) — and the hero is the one page where spectacle earns trust rather than competing with a number; every other surface obeys "the numbers ARE the ornament", so 3D is fenced to these two routes by construction.
Consequences — the perf budget is a contract, tested in M9: the render loop (RAF) is **paused when the tab is hidden or the canvas is off-screen**; `prefers-reduced-motion` renders a **static frame** (no loop); **mobile / no-WebGL gets a 2D card fallback** (all four ui-craft states, no blank canvas); and `npm run build` must show **zero first-load JS growth on non-3D routes** — the 3D bundle exists only in the two routes' dynamic chunks. The 2D fallback doubles as the no-key/mock-mode-safe path: the scene renders from the same view-model whether committee data is mock or live.
Revisit when: a third surface genuinely needs 3D (re-justify the fence, not the dependency) or the 3D chunk exceeds ~300 kB gzipped on either route — then trim drei/three imports before touching the design.

### DR-18: The stock page is one workspace at ValueSnapshot feature parity — honest computed data, labeled educational valuation models, no unlabeled verdicts
Decision: rebuild `StockDetail` as a single scrollable workspace with anchor/scroll-spy navigation — parity is with ValueSnapshot's *feature set*, never its tab chrome or visual style (DR-12 tokens govern) — comprising: a sticky header (symbol/price/day change) + a verdict-chip row, then chart-first sections covering the full parity set: price charts; financial history (revenue/net-income/margin bars); a **valuation lab** — real educational DCF, EPS-growth, PEG, and Rule-of-40 calculators with visible, editable assumptions and a persistent "مخرجات نموذج تعليمي — ليست نصيحة" / "model output — not advice" label, age-gated TEENS+ per DR-17; an analyst view (the quant committee's stances + R-Score — RUSHD's honest analog of analyst ratings, never a buy/sell consensus); compare (2–4 symbols side-by-side incl. Sharia verdicts); AI analysis; a snapshot card; earnings history; filings links (SEC EDGAR for NASDAQ, Saudi Exchange disclosures for TASI); plus a persistent watchlist. Chips surface only computed data: AAOIFI verdict (`ShariaVerdict`), purification ratio (screener ratios / `PurificationEntry.ratio`), R-Score, and data provenance ("demo data"/live source per DR-4). Honesty rule, test-enforced: **banned** = unlabeled or unexplained fair value, target prices, upside/downside %, and buy/sell/hold ratings; **allowed** = the same numbers inside a labeled educational calculator whose assumptions are visible and editable. The audience includes minors — a number without its assumptions is a claim, and claims are banned.
Options: keep the four-tab layout (`type Tab` at `StockDetail.tsx:27` — hides the Sharia verdict, the product's differentiator, behind a click) / clone ValueSnapshot's visuals and fair-value verdicts (violates DR-12 and ships fabricated claims to minors) / one-page workspace at feature parity with labeled educational models (chosen).
Rationale: ValueSnapshot's validated retention pattern is verdict-first, charts-over-tables, everything on one page; RUSHD's honest equivalents — AAOIFI verdict, purification ratio, R-Score, committee stances — are computed today (`MockScreener`/`ZoyaAdapter`, `RScorePanel`, `PurificationEntry.ratio`). Valuation taught as an editable model is pedagogy; valuation asserted as a verdict is advice.
Consequences: anchor navigation replaces tab a11y (keyboard order preserved); the DR-16 metered state is a first-class workspace state (chip row + upgrade card visible, deep sections withheld); KIDS-segment child sessions get an age-gated placeholder instead of the valuation lab (DR-17 gate, server-enforced); watchlist and earnings need one new model + provider methods (§4, M13); every section keeps the four ui-craft states, mock mode, and RTL logical props. Detailed section-by-section scope is BINDING in `docs/STOCK_WORKSPACE_SPEC.md` (parity map, new-data contract §3, honesty dispositions §4, gating matrix §6 — sourced from `docs/recon/VALUESNAPSHOT_STOCK_RECON.md`); M13 implements that spec.
Revisit when: user testing shows time-to-verdict above ~2 s — then reorder sections, never reintroduce tab chrome; any scope change routes through `docs/STOCK_WORKSPACE_SPEC.md` and never past the honesty rule.

---

## 3. Auth

Constraints satisfied: parent→child self-relation (`User.parentId`), child accounts without email (`email` stays nullable), roles `PARENT`/`CHILD`, tiers `BASIC`/`PREMIUM`/`ULTRA`.

### DR-1: Self-hosted Auth.js v5 credentials, JWT sessions, dual credential shapes
Decision: use Auth.js v5 (`next-auth@5`) with a single Credentials provider whose `authorize` branches on input shape — `{email, password}` for PARENT, `{familyCode, username, pin}` for CHILD — issuing a JWT session carrying `{userId, role, tier, parentId}`; no database session table, no Auth.js adapter.
Options: Hosted IdP (Clerk/Auth0 — no child-without-email model, PDPL data-residency friction, per-MAU cost on a family app) / hand-rolled cookies+sessions (re-implements CSRF, rotation, JWT verification — security surface we would own) / Auth.js v5 credentials + JWT (self-hosted, models both credential shapes, no new tables).
Rationale: children have no email, so we must own the credential store; Auth.js gives session/CSRF/JWT plumbing while `authorize` stays custom. JWT strategy needs no `Session` table — zero extra writes per request, correct for a monolith at this scale.
Consequences: passwords/PINs are hashed with `bcryptjs` (pure-JS, no native build on Render) at cost 12; JWT sessions cannot be server-revoked instantly (acceptable for play-money; see OQ-5). Child PINs are low-entropy → mandatory lockout: `failedLoginCount` + `lockedUntil`, lock for 15 min after 5 fails, scoped per `(parentId, username)`. Middleware composes next-intl (locale) then Auth.js (session); unauthenticated hits on protected prefixes redirect to `/[locale]/login`.
Revisit when: real money moves (switch to DB sessions for instant revocation) or a second guardian per family is required (OQ-2).

**Credential resolution.** Parent: `User.email` unique + `passwordHash`. Child: resolved by `familyCode` (a short code on the parent) → parent, then `@@unique([parentId, username])` → child, then verify PIN against `passwordHash`. A child cannot log in without a valid family code, so children are never globally enumerable. A SOLO adult uses the parent shape (email + password) — there is no third credential path (DR-15).

**Session contents & use.** The JWT carries `userId`, `role`, `tier`, `parentId`. `src/lib/authz.ts` (§8) reads it to scope every data access. UI reads `role`/`tier` for navigation and gating; the server never trusts client-sent role/tier.

### DR-15: Three account shapes — SOLO adult, parent-only, parent+children — on the unchanged Role enum; solo/family is derived state, never stored
Decision: serve all three account shapes on the existing `Role {PARENT, CHILD}`: every self-registered adult is a PARENT-role account holder; "solo" vs "family" is derived (does the account have children), onboarding asks intent ("for myself" / "for my family") but writes identical rows; `familyCode` is issued lazily at first child-create; the CHILD persona and credential shape are unchanged.
Options: add an ADULT/SOLO enum value (schema migration plus a third branch in every role check, for zero behavioral difference) / a separate solo product (forks the codebase and the pricing page) / PARENT-role holder with derived shape (chosen — the §8 authz formula `own ∪ children` already degrades to `own` when the children set is empty).
Rationale: the authorization rule generalizes without modification, and product copy — not the data model — is what must stop saying "parent". The Solo/Family plan split (DR-16) is derived at billing time from the same fact, so no second source of truth appears.
Consequences: family panels render only when children exist — no dead family UI on solo accounts; copy says "account holder" (صاحب الحساب), never "parent", until a first child exists (both locales); solo→family upgrade is simply creating a child, which also moves the account to the Family plan (DR-16); solo adults use the same `addXP` engine — whether their gamification *presentation* is toned down is OQ-11.
Revisit when: a persona the PARENT role cannot express appears (e.g. a CHILD turning 18 and graduating to an independent account) — add a migration path, not a new role.

---

## 4. Data model evolution

Every change below is additive or a type-only migration on pre-launch play-money data — **no backfill of real balances exists**, so each is a straight `prisma migrate dev`. Schema today (6 models) is the baseline; nothing here contradicts it.

### DR-2: Money is `Decimal`, never JS `number`; migrate before any balance mutation ships
Decision: migrate all monetary fields to `Decimal @db.Decimal(18,4)` and share quantities to `Decimal @db.Decimal(18,6)`, and forbid JS floating-point arithmetic on money in code (use `Prisma.Decimal`/string math).
Options: keep `Float` (rounding drift, fails SAMA-credibility and audit reconciliation) / integer minor-units (awkward with SAR+USD and fractional shares, more conversion code) / `Decimal` (exact, native Postgres `numeric`, Prisma-supported).
Rationale: an audit trail that does not reconcile to the cent is worthless to a regulator; `Float` (`SavingsJar.balance`, `Transaction.amount`, `PortfolioItem.shares`) cannot guarantee that. Doing it pre-launch is free.
Consequences: money-touching code handles `Decimal` types (no `+`/`*` on raw numbers); mock generators and charts convert to `number` only at the display boundary. Must land in **M2**, before M3 wires any balance-writing engine.
Revisit when: never for correctness; only the precision (`18,4`) is revisited if a currency needing more decimals is added.

**Migration table.**

| Change | Model / field | Milestone |
|---|---|---|
| `Float` → `Decimal @db.Decimal(18,4)` | `SavingsJar.balance`, `Transaction.amount` | M2 |
| `Float` → `Decimal @db.Decimal(18,6)` | `PortfolioItem.shares` | M2 |
| Add `passwordHash String?` | `User` | M1 |
| Add `username String?` + `@@unique([parentId, username])` | `User` | M1 |
| Add `familyCode String? @unique` (PARENT only, app-enforced) | `User` | M1 |
| Add `failedLoginCount Int @default(0)`, `lockedUntil DateTime?` | `User` | M1 |
| Add `@@index([parentId])` (family fan-out queries) | `User` | M1 |
| Add `@@index([userId, createdAt])` | `Transaction`, `QuizAttempt` | M2 |
| Add `PROFIT_SHARE` to `TransactionType` enum | enum | M3 |
| Add `profitShareRatioBps Int @default(7000)` (disclosed Mudarabah split) | `SavingsJar` | M3 |
| Add `WorkspaceUnlock` model — `userId`, `symbol`, `market`, `unlockedAt`, `@@index([userId, unlockedAt])` (DR-16 metering credits: distinct symbols in a rolling 30 days) | new model | M11 |
| Add `AcademyProgress` model — `userId`, `trackId`, `unitId`, `lessonId`, `status`, `score?`, `answers Json?`, `contentVersion`, `completedAt?`, `@@unique([userId, trackId, unitId, lessonId])` | new model | M12 |
| Add `ageSegment String?` (CHILD only, parent-set: `KIDS` \| `TEENS` — DR-17 age gate) | `User` | M12 |
| Add `WatchlistItem` model — `userId`, `symbol`, `market`, `@@unique([userId, symbol, market])` (DR-18 watchlist) | new model | M13 |
| Add `LearnerProfile` model — `userId @unique`, `persona` (enum-in-code), `baselineKnowledge Int`, `skillLevel Int`, `diagnosticAnswers Json`, `signals Json`, `profileVersion`, `updatedAt` — no age field, ever (DR-19) | new model | M14 |

No new auth tables (JWT sessions, no adapter). `onDelete: Cascade` already present on each user's owned rows satisfies PDPL right-to-erasure per user; family erasure is app-orchestrated — delete each child `User` (their owned rows cascade), then the parent — because the parent→children self-relation defaults to `SetNull`, not `Cascade`.

---

## 5. Market data integration

Today `fetchMarketData` (`marketData.ts:46`) branches inline on env keys and returns mock data; the MCP server already wraps it. That inline branching is replaced by an interface + registry so live keys swap providers with zero call-site change.

### DR-4: One `MarketDataProvider` + `ShariaScreener` interface with an explicit-mode registry; adapters are swappable, bundled is the default
Decision: define `MarketDataProvider` (`getQuote`, `getCandles`) and `ShariaScreener` (`screen`) interfaces; a registry selects adapters through `MARKET_DATA_MODE=bundled|keyless|live`, defaulting to `MockProvider`/`MockScreener`; `fetchMarketData` becomes a thin façade over the registry. `bundled` performs no outbound data calls, `keyless` explicitly enables delayed Yahoo data, and `live` alone may select keyed Alpaca/Sahmk/Zoya adapters.
Options: keep per-call `if (env.KEY)` branching (untestable, duplicated across quote/candle/screen paths) / a separate data microservice (new infra for read-only reference data) / interface + registry inside the monolith (testable, one swap point, no new infra).
Rationale: three providers (SAHMK/Alpaca/Zoya) with independent keys and failure modes need one selection point and one fallback policy; the MCP server and UI must never diverge, which an interface guarantees.
Consequences: adding a provider = one adapter file + one registry line; every adapter must implement the mock-fallback contract so no-key mode keeps working. Screening and quotes stay one code path across HTTP + MCP.
Revisit when: a provider needs push/streaming (WebSocket) rather than request/response, or per-user API budgeting is required.

**Interface (extracted).**
```
interface Quote  { symbol; market; price; currency; asOf }
interface MarketDataProvider { getQuote(symbol, market): Quote; getCandles(symbol, market, days): Candle[] }
interface ShariaVerdict  { symbol; compliant; standard: 'AAOIFI'; ratios?; source: 'mock'|'zoya'|'none'; asOf }
interface ShariaScreener { screen(symbol, market): ShariaVerdict }
```

**Adapter spec.**
| Provider | Role | Env key | Selected for | No-key behavior |
|---|---|---|---|---|
| `MockProvider` | quotes + candles | — | default | always available; seeded random walk |
| `SahmkAdapter` | TASI quotes/candles | `SAHMK_API_KEY` | `live` mode + market=TASI + key | falls back to `MockProvider` |
| `AlpacaAdapter` | NASDAQ quotes/candles | `ALPACA_API_KEY` | `live` mode + market=NASDAQ + key | falls back to `MockProvider` |
| `MockScreener` | AAOIFI screen | — | default | `TSLA`/`META` non-compliant, else compliant (label "demo data") |
| `ZoyaAdapter` | AAOIFI screen | `ZOYA_API_KEY` | `live` mode + key | live screening failures return unverified/non-compliant `source=none` |

**Caching + rate limits (in-process, no Redis).** A module-level TTL `Map`: quotes 60 s, candles until end of the symbol's trading day (TASI calendar Sun–Thu), Sharia verdicts 24 h. A per-provider token bucket caps outbound calls. Quote/candle failures serve cache or labeled mock data; live Sharia failures serve only a fresh verified cache and otherwise fail closed with `source=none`. Single-instance cache is acceptable at this scale; revisit with Redis only when the app runs multiple instances.

**Explicit-mode swap path.** Selection happens at call time. The default/unset mode is `bundled`; `keyless` opts into delayed Yahoo data; `live` plus the relevant key selects Alpaca/Sahmk/Zoya and safely falls back. A generic key never silently creates outbound traffic.

**MCP relationship.** `mcp/rushd-market` stays a transport-only wrapper (`get_quote`/`get_candles`/`check_sharia_compliance`) over the same registry — one screening/quote implementation, two transports. Its "demo data / Zoya pending" notes are driven by `ShariaVerdict.source`, not a second rule.

---

## 6. AI features

Two endpoints exist: `quiz` (`generateObject`+zod, local bank fallback) and `signals` (same, bilingual reasoning). Both are local by default. Live generation requires the explicit `APP_LLM_MODE=live` plus `APP_LLM_API_KEY` opt-in.

### DR-7: Keep Qwen via OpenAI-compatible base URL with mock-first fallback; harden with schema-enforced compliance tags and injection-safe inputs
Decision: retain `@ai-sdk/openai` + `generateObject` behind the explicit `APP_LLM_*` opt-in, keep local deterministic content as the default/fallback, and require schema-enforced `complianceTag` plus not-advice, minor-appropriate, Arabic-primary output. The default hosted model slug is free-tier and env-overridable.
Options: swap SDKs / call the model unstructured and parse text (loses schema guarantees, reopens injection) / harden the existing structured path (minimal change, keeps mock-mode, adds the guardrails we actually need).
Rationale: the structured `generateObject` path already gives schema validation and a mock fallback — the gap is compliance labeling and input hygiene, not the transport. Provider stays swappable via base URL (Qwen today, ALLaM/Jais under evaluation, OQ-6).
Consequences: schema rejects model output missing a tag; mock fallbacks must also carry a tag; a golden-set eval (M5) guards Arabic quality and schema validity in CI without live keys.
Revisit when: the Arabic-quality eval score drops below the bar, triggering a model swap (OQ-6).

**Arabic output quality bar.** `reasoningArabic` (and all Arabic fields) must be Modern Standard Arabic in a financial-literacy register for families/minors, non-empty, no transliterated English jargon where an Arabic term exists (محفظة, سهم, ربح). Arabic is the primary generation target; English mirrors it.

**Guardrails.**
- **Not advice / minor-appropriate:** system prompt states outputs are educational simulation, not financial advice, appropriate for ages ~8–17.
- **Compliance tag in schema:** `complianceTag: 'HALAL' | 'HARAM' | 'MASHBOOH' | 'EDUCATIONAL_ONLY'` — the model must classify; `HARAM`/`MASHBOOH` concepts are teachable but never rendered as an actionable trade (§7, DR-5).
- **Injection-safe inputs:** `market` is an enum; `symbol` is regex-validated (numeric for TASI, alphabetic for NASDAQ); `topic` is length-capped and drawn from an allowlist; `portfolioHoldings` is server-derived, never trusted from the client body. Model output can never trigger a money mutation — executing a simulated trade is a separate authenticated user action.

**Eval approach.** A golden set of prompts (quiz topics + signal cases, incl. an injection probe like `topic="ignore your rules and…"`) runs in `vitest` against mock (and optionally live) and asserts: schema-valid, `complianceTag` present, `reasoningArabic` non-empty and free of banned jargon, injection probe still yields valid schema. This is M5's exit gate.

### DR-14: Strategy lessons compile bounded learner choices into a sealed deterministic replay
Decision: bind each strategy lesson to one exact league `setupId` + version; present 5–8 scenario questions split into `KNOWLEDGE_CHECK` and `POLICY_DECISION`; compile only policy decisions into prevalidated, versioned parameters; seal the first attempt before any outcome is revealed; and replay it deterministically beside the team, SPUS, and the S&P 500 price proxy (SPY) on the same frozen point-in-time OOS interval, universe, fills, costs, Sharia gate, and risk envelope.
Options: factual quiz only (teaches vocabulary but cannot demonstrate consequences) / generate executable strategy logic from free-form or LLM answers (unsafe, irreproducible, and invites look-ahead) / bounded policy choices + deterministic replay (chosen — meaningful agency with auditability and risk parity).
Rationale: the learner should experience how entry, exit, sizing, holding period, and risk choices change both return and drawdown without mistaking a lucky result for skill. Retrieval practice plus immediate explanatory feedback supports retention; autonomy and visible mastery support motivation; sealing outcomes prevents hindsight edits and loss-chasing.
Consequences: knowledge checks may have a correct answer and immediate explanation but never alter the replay; policy decisions show their mechanism/trade-off without revealing P&L, map through a pure policy compiler, and cannot weaken Sharia or risk caps. `StrategyLearningAttempt` is immutable after sealing and records user/setup/question-set/policy versions, answers, policy hash, replay configuration/data provenance, and result references; every retry creates a labeled new attempt. The result surface normalizes all four lines to 100 on one common interval and shows return, max drawdown, volatility, trade count, and choice-to-outcome explanations; SPY is labeled a price-only S&P 500 ETF proxy, not the index or total return. XP rewards completion, retrieval, and reflection through `addXP`—never portfolio profit, rank, or risk-taking. No variable-ratio rewards, loss-chasing streak pressure, loot-box mechanics, or winner/loser language. Development uses a fixed ≤6-month fixture first; the prohibited 2018-01-02→2026-07-10 evidence run is never triggered by this learning flow and still requires explicit user authorization.
Revisit when: evidence shows the bounded choices cannot express a strategy's defining decisions; add another reviewed policy branch, never arbitrary executable code.

### DR-17: Rushd Academy — versioned code-resident academic curriculum, age-segmented, compliance-tagged, additive to practical strategy learning
Decision: build the Academy as zod-validated TypeScript content modules in `src/academy/content/**` (Track → Unit → Lesson → CheckPoint) whose schema REQUIRES three things per lesson: bilingual fields (en + ar — structural parity, Arabic-primary per DR-6), a `complianceTag` per concept (DR-5: interest math, bonds, derivatives are taught openly, persistently labeled, never executable), and an `ageSegment` — `KIDS` (~8–12), `TEENS` (13–17), `ADULTS` (18+) — with per-segment lesson variants of the same concept where the material must differ. v1 ships three tracks — **Finance Foundations** (bachelor-intro level, incl. Islamic-finance units; KIDS/TEENS/ADULTS variants), **Economics** (TEENS/ADULTS), **Advanced Financial Analysis** (CFA-candidate level, ADULTS only; public naming gated on OQ-9) — behind a registry designed for O(1) track addition; valuation-model content is TEENS+. Progress lives in DB (`AcademyProgress`, §4); content never does. Every unit declares ≥1 `practiceLink` into a DR-14 strategy lesson or quiz topic — theory→practice is a tested invariant, and the Academy is additive to the strategy-team track, never a replacement. XP flows only through `addXP` at fixed server policy amounts (same anti-loot-box stance as DR-14).
Options: CMS/DB-stored content (authoring infra + versioning ambiguity RUSHD's scale cannot justify) / MDX pipeline (a new rendering dependency that loses type-safe bilingual + segment enforcement) / zod-validated TS modules (chosen — extends the existing quiz-bank and DR-14 question-set pattern, zero new dependencies, works with zero API keys by construction).
Rationale: one lesson body cannot serve an 8-year-old and a CFA candidate — encoding the segment in the content schema makes age-appropriate material a compile-time property instead of an editorial hope, and keeps child protection enforceable server-side; code-resident content keeps the curriculum versioned, reviewable in PRs, and mock-mode-safe.
Consequences: age gating is server-side in the same authz helper (§8) — a CHILD session resolves its parent-set `User.ageSegment` (§4, M12) and can never fetch a higher segment's lesson: KIDS sees KIDS, TEENS sees KIDS+TEENS, any PARENT-role account sees all; UI filtering alone is a defect. Tier gates (DR-16) and segment gates compose in one guard. A lesson missing an ar field, a `complianceTag`, or an `ageSegment` fails the content-lint test, not a human review. Sharia-board review scope for the expanded curriculum is OQ-10.
Revisit when: content passes ~200 lessons or a non-engineer author joins (then evaluate a CMS), or the Sharia board review (OQ-10) mandates label or segment changes.

### DR-19: Learner profile + deterministic adaptive curriculum — diagnostic onboarding with zero LLM in the profiling path; Strategy-Teams presentation goes behind a code flag
Decision: add one additive Prisma model `LearnerProfile` (`userId @unique`, `persona` string whose taxonomy is an enum-in-code, `baselineKnowledge Int`, `skillLevel Int`, `diagnosticAnswers Json`, `signals Json`, `profileVersion`, `updatedAt`) — age is NEVER stored in it; age stays exclusively on `User.ageSegment` (parent-set for CHILD, registration-declared for adults per DR-15), and the diagnostic never asks a CHILD their age. The diagnostic is 6–8 closed bilingual questions, zod-schema'd and content-linted exactly like Academy lessons (DR-17 pattern), scored by a deterministic pure-TS scorer into persona + `baselineKnowledge`/`skillLevel` — zero LLM anywhere in the profiling path; it is skippable (writing an honest default persona), versioned via `profileVersion`, and re-takeable (a retake overwrites the profile at the new version). The adaptive engine is a pure deterministic recommender in `src/academy/adaptive.ts` — `nextUp(profile, progress)` returns an ordered lesson/practice queue — that reorders and recommends strictly WITHIN what the DR-16/DR-17 `can()` guard already allows: it never widens access, and a recommendation the guard would deny is a defect. The feedback loop updates `LearnerProfile.signals` from the existing M12 progress-completion API (checkpoint `score`/`answers` are finally read back); `skillLevel` thresholds shift recommender branches; XP remains process-only via `addXP` at fixed amounts. `practiceLink`s resolve through the profile — filtered and ranked per persona, never deleted — and the DR-14 replay engine is retained wholesale as the "Practice Lab" sandbox backend. Presentation flag: all Strategy Teams / League branding, navigation entries, and standings UI go behind a code-level feature flag (tunable in code, not schema, per DR-16's standing contract), default OFF; the DR-17 practiceLink invariant is preserved by re-labeling those destinations as Practice Lab, not by deleting links. Honesty rule: the persona is presented as an adjustable "starting path," never a psychometric claim, in both locales.
Options: LLM-inferred learner profiling (non-deterministic, unauditable for minors, breaks no-key mock mode) / no profile — keep ageSegment ∩ tier only (personalization stays zero; persisted checkpoint scores remain dead data) / DB-stored recommendation rules (violates "tunable in code, not schema") / diagnostic + deterministic in-code recommender over one additive model (chosen).
Rationale: adaptivity for a child-inclusive audience must be reproducible, reviewable in PRs, and functional with zero keys — properties only a pure-TS scorer and recommender guarantee; one `@unique` profile row per user is the smallest schema that closes the loop between persisted checkpoint evidence and what the catalog shows next.
Consequences: `LearnerProfile` migration lands in M14 (§4); the recommender and scorer are unit-testable pure functions (TDD in M14); the signals write path rides the existing completion API — no new endpoint class; a security-auditor gate applies because child data is written (PDPL: the profile stores answers and derived levels only, never age or free text); the League surfaces at `/quant/league`, the Navigation entry, and `StrategyLearningLab` presentation are flag-gated while DR-14 sealed-attempt data and the replay engine remain intact and power the Practice Lab; diagnostic copy gets an Arabic/Sharia review like all Academy content.
Revisit when: OQ-12 fires (persona taxonomy validated or refuted by first cohort data / user interviews), or the recommender needs collaborative/cohort signals — then re-run the pure-function decision, never the guard boundary.

---

## 7. i18n/RTL & compliance

### DR-6: Arabic is the default locale and the RTL quality bar
Decision: set `defaultLocale: 'ar'` with an always-on locale prefix in middleware, and treat Arabic + RTL as the primary review target for every UI change.
Options: keep `defaultLocale: 'en'` (contradicts the Saudi-first mandate) / no prefix on default (breaks deterministic `dir` from the `[locale]` segment) / Arabic default + always-prefix (matches mandate, keeps `dir` derivation clean).
Rationale: the market is Saudi-first and Arabic-primary; the current `en` default (`middleware.ts:5`) is a defect against the mandate. Deriving `dir` from the segment (already done in `layout.tsx`) requires the prefix to always be present.
Consequences: `/` redirects to `/ar`; shared components must use Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`, `text-start`/`text-end`), never `ml-`/`mr-`; `messages/en.json` and `messages/ar.json` stay key-identical (a missing `ar` key is a build-quality bug). Interpolated LTR tokens (tickers, signed numbers) are wrapped in their own flex items for bidi safety. Numbers use Western Arabic numerals; currency via `Intl.NumberFormat('ar-SA', …)`.
Revisit when: a third locale is added (generalize the default-selection rule).

### DR-3: The savings sweep is a Mudarabah profit-share, not interest — reframed before launch
Decision: replace `processCashSweeps` fixed-APY logic with a Mudarabah distribution — the platform (mudarib) invests the pooled jar balance in a simulated Sharia-compliant instrument, and *actual, variable, non-guaranteed* simulated profit is split by a disclosed ratio (`profitShareRatioBps`, default 70% user / 30% platform), with every distribution written as a `PROFIT_SHARE` `Transaction`.
Options: Mudarabah profit-share (correct structure for a savings/investment pool, loss-bearing, variable) / Wakala fixed-fee (needs an explicit underlying instrument to be meaningful) / Murabaha cost-plus (wrong instrument for savings) / keep 2.0% APY + 2.5% spread (riba — banned outright).
Rationale: `engines.ts:37-41` pays a fixed 2.0% "APY" and keeps a 2.5% "spread" — textbook riba. Mudarabah removes the fixed/guaranteed rate, ties returns to (simulated) investment profit, discloses the split, and is loss-bearing in principle. The `2.0/365`, `0.025/365`, and all "APY"/"interest" constants and language are deleted.
Consequences: no fixed-rate constant remains in `engines.ts`; user copy uses ربح/مضاربة, never فائدة/APY (escalate any task requiring interest language); the audit gap at `engines.ts:57` is closed — each distribution writes a `Transaction`, and the platform's mudarib share is a separate recorded row.
Revisit when: real capital is introduced — this requires a Sharia board fatwa and AAOIFI FAS accounting treatment before going live.

### DR-5: Teach every concept, persistently label the non-compliant ones — never hide, never execute
Decision: tag every educational concept/quiz/signal with a `complianceTag`; `HARAM`/`MASHBOOH` content is taught but rendered with a persistent label "غير متوافق مع الشريعة — تعليمي فقط" (not Sharia-compliant — educational only) and is never executable as a simulated trade.
Options: hide non-compliant content (violates the "understand the whole market" objective) / teach it unlabeled (violates strict flagging) / teach-with-persistent-label + block execution (satisfies both — knowledge open, mechanics strict).
Rationale: the mandate is strict *mechanics*, open *education*. The executability gate (whether the user can act) is governed by `ShariaVerdict.compliant` from the screener; the label (whether a concept is flagged) is governed by `complianceTag`. Two orthogonal switches, one policy.
Consequences: LLM schemas carry the tag (DR-7); the trade/execute UI reads `isShariaCompliant`/`ShariaVerdict.compliant` and disables action on non-compliant assets while still showing the educational explanation and label.
Revisit when: a Sharia board reviews and approves the full curriculum's labels.

**Zoya AAOIFI flow.** Screening runs through `ShariaScreener` (DR-4): `MockScreener` until `ZOYA_API_KEY`, then `ZoyaAdapter`; verdicts cache 24 h and carry `source` so the UI labels honestly ("AAOIFI screening — demo data" until live). The AAOIFI two-stage screen (sector + financial ratios: interest-debt <30% mcap, interest-securities <30% mcap, non-compliant income <5%) is the contract `ZoyaAdapter` fulfills.

**Required disclaimers (both locales, key-identical).**
1. Not real money — "أموال افتراضية للتعلّم فقط — ليست أموالاً حقيقية" — global banner on every page.
2. Not investment advice — "ليست نصيحة استثمارية" — on every AI signal and market view.
3. Educational-only compliance label — "غير متوافق مع الشريعة — تعليمي فقط" — on flagged concepts.
4. Data/PDPL notice — link on auth + profile screens.

---

## 8. Security & privacy

### DR-9: Regulatory-readiness posture makes the play-money MVP SAMA-credible without real-money rails
Decision: ship no PSP/KYC in v1 but make the MVP convincing to SAMA via four pillars — omnipresent disclaimers (§7), a complete money audit trail (every mutation a `Transaction` row), PDPL-aligned data minimization, and a documented sandbox path — all satisfiable in the monolith.
Options: add real-money rails now (needs KYC/AML/PSP + a license — out of v1 scope) / ship play-money with no compliance posture (fails the "must convince SAMA" mandate) / play-money + regulatory-readiness posture (credible, cheap, reversible).
Rationale: the user mandate is a simulation that convinces regulators; audit + disclaimers + PDPL alignment demonstrate operational readiness without the licensing burden of moving real funds.
Consequences: every money-mutating path runs in `prisma.$transaction` and writes an audit row (closes `engines.ts:57`); an auth-event audit is added in M7; child data is minimized (below); this document itself is the sandbox-application artifact.
Revisit when: SAMA sandbox admission or a real-deposit pilot — then real-money rails, KYC, and DB-session revocation land together (OQ-1, OQ-5).

### DR-10: Rushd Quant — an AI analyst-committee trading module (see `docs/QUANT_DESIGN.md`)
Decision: build a quantitative-trading product as a committee of 8 analyst agents in an extractable `src/quant/` module; a Portfolio-Manager LLM (temperature 0) decides action + size inside a deterministic envelope it cannot cross — the Sharia agent is an absolute veto and a Risk Manager clamps size/exposure/drawdown. Full design, data model, and Q0–Q7 roadmap live in `docs/QUANT_DESIGN.md` (QDR-1..5); this record links it to the parent contract.
Options: LLM decides everything incl. gates (unauditable, unsafe with money) / fully deterministic ensemble (rigorous but forfeits the requested "AI agents") / LLM-decides-inside-deterministic-gates (chosen — latitude within a safe box, validated by virattt/ai-hedge-fund + TradingAgents).
Rationale: money systems need hard, testable gates; the LLM adds reasoning/explanation (and pedagogy — the learner watches the committee) without ever breaching the Sharia veto or a risk cap.
Consequences: new models (MarketBar/Fundamentals/NewsItem/Strategy/AnalystSignalRecord/Order/Decision/BacktestRun/PortfolioSnapshot) tagged to Q-migrations; backtests use a deterministic PM policy-surrogate (QDR-4); mock-first invariant preserved.
Revisit when: the committee's live paper track diverges materially from its backtest, or a fifth analyst class is added.

### DR-11: Paper-first quant execution; real brokerage stays dark behind a CMA-licensing gate
Decision: execute only on paper now via a `BrokerAdapter` (Alpaca paper for NASDAQ, internal-sim for TASI + keyless mock). Alpaca paper and live are the same API, so going real is a keys/base-URL swap — hard-gated behind a feature flag + CMA/broker licensing + KYC/AML, isolated in `src/quant/execution/`, dark by default.
Options: build live execution now (unlicensed real-money dealing — legally impermissible) / simulate internally only (loses real order-lifecycle fidelity) / Alpaca paper now + gated live later (chosen — real fills on virtual money, clean licensed path).
Rationale: paper-only needs no license and gives realistic execution; isolating the live adapter keeps the regulated surface one flag away yet unreachable until licensed.
Consequences: `src/quant/execution/` is the sole broker boundary; a test asserts no live path is reachable without the gate (Q6); TASI live needs a separate licensed Saudi broker.
Revisit when: a CMA license/partner and KYC/AML are in place.

### DR-16: Two priced plans (Solo, Family) with a capability-matrix tier inside each — child seats are a Family-plan capability, not the tier axis; the aha feature is metered, never hard-walled
Decision: price the product as two plans — **Solo** (user-based) and **Family** — at different price points, annual-first and SAR-denominated (numbers are OQ-8); within each plan, BASIC/PREMIUM/ULTRA is a capability matrix in code (`src/lib/authz.ts`: `can(session, capability)` plus a workspace meter), per the §1 table. Plan is derived, never stored: an account with children (or creating its first child) is on the Family plan; a zero-children account is Solo (DR-15). The full stock workspace is metered on BASIC at 5 distinct symbols per rolling 30 days via `WorkspaceUnlock` rows (§4) — revisiting an unlocked symbol is free, and the Sharia verdict chip stays visible even when metered. ULTRA's identity is education depth (Advanced Financial Analysis track + capstones, DR-17) plus advanced analytics — the top tier monetizes learning, not just feature switches. Schema untouched: plan and matrix are code, per the standing "tunable in code, not schema" contract.
Options: keep the child-count tier axis (meaningless for solo users — a solo BASIC and a solo ULTRA would be identical) / à-la-carte feature flags (billing complexity, no upgrade ladder) / market-level hard walls (kills the metered-aha funnel — free users must browse the whole catalog to want credits) / two plans × capability-matrix tiers with a metered workspace (chosen).
Rationale: the freemium lesson RUSHD adopts is meter-the-aha (the Sharia verdict workspace) rather than wall it, and monetize education at the top; a plan axis (who is covered) orthogonal to a tier axis (what is unlocked) prices solo adults and families fairly without inventing schema or a billing service.
Consequences: the meter is server-side and DB-backed (survives restarts, uncheatable from the UI); child-seat caps (Family plan: 1/4/unlimited) are enforced at child-create; creating a first child moves the account Solo→Family at the pricing layer only — no data migration; the frontend reads capabilities from the session/API, never decides them; until real billing exists (OQ-1 territory), plan and tier remain admin/env-set product defaults. The meter credit count is a code constant; its final value ships with OQ-8's numbers.
Revisit when: meter-conversion telemetry demands a different credit count (a code-constant change, not a redesign) or a community feature ships (re-run the ULTRA-identity decision).

**Authorization model (parent/child boundary).** The JWT session (`{userId, role, tier, parentId}`) feeds a single guard in `src/lib/authz.ts`. Rules, enforced in every query — not by UI branching:
- CHILD → own rows only (`where userId = session.userId`).
- PARENT → own rows + children's (`where userId IN (self ∪ {c : c.parentId = self})`).
- SOLO and parent-only accounts use the same PARENT rule — the children set is empty, so scope reduces to own rows (DR-15); no third branch exists.
- Cross-family access is impossible: no query omits the scope; a sibling or another family's row returns 403.
- Plan + tier gating (the DR-16 capability matrix and workspace meter) and Academy age-segment gating (DR-17 — a CHILD session never fetches a lesson above its parent-set `ageSegment`) are checked in this same guard, server-side.

**LLM threat model (prompt injection).** Inputs are constrained before reaching the model: `market` enum, `symbol` regex, `topic` allowlisted + length-capped, `portfolioHoldings` server-derived. Output is structured-only (`generateObject`+zod) and never `eval`'d or used to trigger a mutation — a simulated trade is a separate authenticated user action. The injection probe in the M5 eval is the standing regression test.

**Children's-data minimization (PDPL).** Child rows store only `name` + `username` + hashed PIN — no email, phone, or third-party analytics on child sessions. Audit logs pseudonymize by `userId`. `onDelete: Cascade` erases each user's owned rows; family-level erasure is app-orchestrated (delete each child `User`, then the parent — the parent→children self-relation defaults to `SetNull`). Data-residency intent: Saudi/GCC region hosting, documented as a deployment constraint. Purpose limitation: play-money simulation only.

**Endpoint hardening.** Auth endpoints get lockout (DR-1) + rate limiting; LLM endpoints get rate limiting to cap cost and abuse. Cron route (`/api/cron/distribute`) requires a signed shared-secret header and is idempotent per day.

---

## 9. Roadmap

Owners are exactly one of: frontend-expert, backend-expert, ai-features-expert, i18n-fintech-expert, test-engineer. Every exit criterion is a command, a visible behavior, or a reviewable artifact. Every milestone keeps no-key mock mode working.

### M0: Quality gate & foundation
Goal: every subsequent change is typed, tested, Arabic-default, and disclaimed.
| Work item | Owner | Exit criterion |
|---|---|---|
| Vitest + CI workflow (lint + tsc + vitest on PR) | test-engineer | GitHub Action green on a PR; `npx vitest run` passes locally |
| `src/lib/prisma.ts` singleton; `engines.ts` imports it | backend-expert | `grep -rn "new PrismaClient" src` returns only `src/lib/prisma.ts` |
| Arabic default locale + always-on prefix | i18n-fintech-expert | GET `/` → 302 `/ar`; `defaultLocale: 'ar'` in `middleware.ts` |
| Global "not real money / not advice" banner, en+ar | i18n-fintech-expert | banner visible on every page in both locales; keys in both JSON |

### M1: Auth & family boundary
Goal: parents and children log in; sessions carry role/tier/family.
| Work item | Owner | Exit criterion |
|---|---|---|
| Schema: `passwordHash`, `username`+`@@unique([parentId,username])`, `familyCode`, `failedLoginCount`, `lockedUntil`, `@@index([parentId])` | backend-expert | `npx prisma migrate dev` applies; `npx prisma validate` clean |
| Auth.js v5 credentials (parent email+pw / child code+username+PIN), JWT `{userId,role,tier,parentId}` | backend-expert | curl login sets session cookie; protected route 401 without it |
| Middleware composes next-intl + Auth.js; protected prefixes redirect | backend-expert | GET `/ar/dashboard` unauthenticated → 302 `/ar/login` |
| Parent onboarding + child-create form + child login screen | frontend-expert | parent creates child, child logs in with PIN (walk-through) |
| Auth tests incl. lockout | test-engineer | `npx vitest run auth` green; lockout after 5 fails asserted |

### M2: Money integrity
Goal: money is `Decimal` and every XP/money mutation reconciles.
| Work item | Owner | Exit criterion |
|---|---|---|
| Money → `Decimal(18,4)`, shares → `Decimal(18,6)` | backend-expert | schema shows `Decimal`; no `Float` money field remains |
| Indexes `@@index([userId, createdAt])` on Transaction, QuizAttempt | backend-expert | `prisma migrate` diff adds the indexes |
| Wire `addXP` into quiz completion via authenticated API route | backend-expert | quiz pass writes XP to DB (integration test) |
| Dashboard reads XP/level from DB; remove hardcodes | frontend-expert | `grep -n "useState(450)\|useState(3)" src/components/DashboardClient.tsx` empty |
| Money-math tests (Decimal, no float drift) | test-engineer | `npx vitest run money` green |

### M3: Sharia savings (Mudarabah) engine
Goal: sweep replaced by audited, compliant profit-share.
| Work item | Owner | Exit criterion |
|---|---|---|
| Rewrite `processCashSweeps` as Mudarabah; add `PROFIT_SHARE` type + `profitShareRatioBps`; write a Transaction per distribution | backend-expert | `grep -inE "APY\|interest\|0.02\|0.025" src/services/engines.ts` empty; each run creates Transaction rows |
| Render Cron → signed `/api/cron/distribute`, idempotent per day | backend-expert | route 200 with secret header, 401 without; second same-day run is a no-op |
| Copy: ربح/مضاربة + profit-share disclosure, no فائدة/APY | i18n-fintech-expert | `grep -n "فائدة\|APY" messages/*.json` empty; disclosure key in both JSON |
| Distribution tests (ratio, audit rows, zero-balance skip) | test-engineer | `npx vitest run sweep` green |

### M4: Market data provider layer
Goal: one interface, live-key swap, MCP parity.
| Work item | Owner | Exit criterion |
|---|---|---|
| Extract `MarketDataProvider`+`ShariaScreener`+registry+Mock adapters; `fetchMarketData` delegates | backend-expert | unit test: registry picks Mock with no keys |
| SAHMK/Alpaca/Zoya adapter stubs behind env keys; TTL cache + rate-limit + error→cached/mock | ai-features-expert | with a fake `SAHMK_API_KEY`, TASI routes to adapter; unset → mock (test) |
| MCP server reads registry only; `source`-driven honesty note | ai-features-expert | 3 MCP tools return provider data; "demo data" note when no Zoya key |
| Provider tests (fallback, TTL, TASI Sun–Thu calendar) | test-engineer | `npx vitest run market` green |

### M5: AI hardening & compliance flagging
Goal: quiz/signals safe, Arabic-primary, flagged.
| Work item | Owner | Exit criterion |
|---|---|---|
| Add `complianceTag` to quiz+signals zod; prompts enforce not-advice + minor-appropriate + Arabic-primary | ai-features-expert | schema rejects missing tag; mock fallback carries a tag |
| Injection-safe inputs (enum/regex/allowlist); output never mutates state | ai-features-expert | injection-probe test still returns valid schema |
| Render educational-only label on HARAM/MASHBOOH, en+ar | i18n-fintech-expert | "غير متوافق … تعليمي فقط" shows on a flagged concept in both locales |
| AI eval golden set (schema-valid + Arabic non-empty + no banned jargon) | test-engineer | `npx vitest run eval` runs the set and asserts all three |

### M6: Frontend wiring & personas
Goal: no dead links, real data, both personas usable.
| Work item | Owner | Exit criterion |
|---|---|---|
| Live `/markets`, `/quiz`, `/profile`; replace boilerplate landing | frontend-expert | nav links resolve (no 404); landing shows product, not create-next-app |
| Parent supervision view (children list + each child's XP/portfolio) | frontend-expert | parent sees each child; child cannot see siblings (manual + 403 test) |
| RTL/a11y/i18n pass (logical props, key-identical JSON) | i18n-fintech-expert | `grep -rnE "\bml-\|\bmr-" src/components` empty in shared comps; JSON keys match |
| Persona E2E happy paths (parent + child) | test-engineer | `npx vitest run e2e` green for both personas |

### M7: Security & privacy hardening
Goal: authz enforced, PDPL minimized, audit complete.
| Work item | Owner | Exit criterion |
|---|---|---|
| `src/lib/authz.ts` scopes every query by session; tier gating server-side | backend-expert | cross-family + sibling access tests return 403 |
| Auth-event audit log + rate limits on auth & LLM endpoints | backend-expert | brute-force test locks out; auth events recorded (query/artifact) |
| PDPL data-map + retention/erasure note artifact | backend-expert | `docs/DATA_MAP.md` lists child fields = {name, username, pinHash} only |
| Security & authz test suite | test-engineer | `npx vitest run security` green |

*(M8 is the Rushd Quant track — Q0–Q7 in `docs/QUANT_DESIGN.md`, DR-10/DR-11.)*

### M9: Front-end revamp (institutional-minimal, DR-12 + DR-13)
Goal: every surface re-skinned to the DR-12 token system; 3D lands on exactly two routes within the DR-13 perf budget. Units execute in DAG order U1→U5; each unit ships independently green.
| Work item | Owner | Exit criterion |
|---|---|---|
| U1 — Foundation tokens: light-first paper base + purple accent + semantic emerald/rose/amber in Tailwind theme/CSS vars; delete `neonBlue`, glow/glass utilities, `DesignControlCenter.tsx`; layout bootstrap default `'dark'`→`'light'` | frontend-expert | `grep -rn "neonBlue\|DesignControlCenter" src tailwind.config.ts` empty; ThemeToggle still switches light↔dark; design-reviewer PASS |
| U2 — Landing + navigation re-skin on U1 tokens (no 3D yet; hero renders the 2D fallback) | frontend-expert | landing + nav show no legacy neon classes (visual walk-through en+ar); design-reviewer PASS |
| U3 — 3D committee scene + landing hero: `three` + `@react-three/fiber` via `next/dynamic` `ssr:false`; RAF pauses on hidden tab/off-screen canvas; `prefers-reduced-motion` → static frame; mobile/no-WebGL → 2D card fallback; works in mock mode | frontend-expert | `npm run build` output shows zero first-load JS growth on non-3D routes; reduced-motion and no-WebGL fallbacks demonstrated; design-reviewer PASS |
| U4 — Markets re-skin: quotes/candles/compliance labels on semantic-only status colors | frontend-expert | `/markets` uses only DR-12 tokens (grep for legacy classes empty in `src/app/[locale]/markets`); design-reviewer PASS |
| U5 — Remaining surfaces (dashboard, quiz, profile, auth screens) re-skinned; RTL logical props preserved | frontend-expert | no legacy token remains repo-wide (`grep -rn "neon" src` empty); design-reviewer PASS |
| en/ar parity + regression suite for the revamp | test-engineer | `npm run lint` + `npx tsc --noEmit` + `npx vitest run` green incl. en/ar key-parity test |

### M10: Strategy learning simulations
Goal: a learner can understand each reviewed Maverick strategy team, commit bounded decisions, and inspect an honest sealed replay against that exact team, SPUS, and SPY before its detailed league evidence opens.
| Work item | Owner | Exit criterion |
|---|---|---|
| L1 — Versioned 5–8-question curriculum + pure policy compiler; knowledge checks cannot affect policy and all decisions stay inside reviewed parameter bounds | ai-features-expert | focused tests prove identical answers → identical policy hash; invalid/out-of-range answers fail closed; changing a knowledge answer leaves the policy byte-identical |
| L2 — DB-free short-fixture replay adapter using the selected team's PIT context, costs, fills, OOS boundary, Sharia veto, and risk envelope | backend-expert | `npx vitest run strategy-learning` proves deterministic replay, future-bar failure, no MOCK bars, risk/Sharia parity, and four normalized-100 series over one common ≤6-month interval |
| L3 — Auth-scoped immutable `StrategyLearningAttempt` persistence and completion API through a generated Prisma migration | backend-expert | integration tests prove first attempt seals before results, mutation after sealing returns 409, retries create new labeled rows, cross-family access returns 403, and no money/order path is called |
| L4 — Mastery-loop UI: choose team → learn → decide → seal → compare; immediate mechanism feedback, four-line chart, return/maxDD/volatility/trades, process-first explanation, en/ar + RTL | frontend-expert | browser walk-through in en/ar at desktop/mobile shows loading/empty/error/populated states, keyboard completion, reduced motion, outcome hidden pre-seal, and honest simulated/price-only labels |
| L5 — Retrieval revisit + XP for mastery effort only | i18n-fintech-expert | a delayed knowledge revisit is offered; XP is written only via `addXP` for completion/retrieval/reflection and remains unchanged when simulated return changes |
| L6 — Strategy-learning capability registry + league bridge: exact-setup deep links, lightweight sealed-attempt check, and evidence gate only for teams whose deterministic module is reviewed | frontend-expert | focused tests prove a completion for setup A cannot unlock setup B; browser walk-through shows locked → learn/decide/seal/compare → unlocked for `bollinger-mr-long-v2`; an unsupported team says its module is under validation and never receives a fabricated replay |
| L7 — Expand reviewed curriculum/compiler/short replay modules one terminal league setup per bounded unit, reusing the exact setup engine and frozen ≤6-month PIT fixture | ai-features-expert | each module independently proves 5–8 bilingual questions, knowledge-policy isolation, deterministic policy hash/replay, future-bar failure, real-data provenance, risk/Sharia/fill parity, and four aligned normalized-100 series; no terminal evidence period is run |
| L8 — Universal Mavericks evidence gate after module coverage reaches every visible league team | frontend-expert | every visible team routes to its exact lesson; no detailed metrics, historical comparison, or trade ledger render before that setup's sealed result; direct URL selection and a different team's completion remain locked; en/ar desktop/mobile keyboard walk-through passes |

*(League-visibility note, DR-19: the Strategy Teams / League presentation shipped by M10 — `/quant/league`, its Navigation entry, and the standings UI — is flag-gated OFF by default as of M14; the sealed-attempt engine, its data, and the L1–L8 guarantees are untouched and power the Practice Lab.)*

*(M11–M13 execute after M10, in order: M11's capability matrix and meter gate both M12 and M13; M13 additionally consumes M9's U4 tokens. Mock mode holds throughout — Academy content is local by construction, and workspace chips run on `MockScreener` with demo provenance.)*

### M11: Account shapes, plans & tier capability matrix (DR-15, DR-16)
Goal: a solo adult, a parent-only account, and a family are all first-class; plans and tiers gate capabilities, not child counts.
| Work item | Owner | Exit criterion |
|---|---|---|
| Onboarding intent fork ("for myself" / "for my family") writing identical PARENT rows; solo dashboard variant — family panels render only when children exist; add-first-child entry point | frontend-expert | walk-through en/ar: solo registers with zero child prompts; parent-only sees an empty-state family panel with add-child CTA; a family sees the children list; no dead links |
| Capability matrix `can(session, capability)` in the authz helper; Solo/Family plan derived from children set; child-seat caps at child-create; `familyCode` issued lazily at first child-create | backend-expert | `npx vitest run tiers` green: BASIC denied AI signals + NASDAQ trade; Family-BASIC denied a 2nd child; Family-PREMIUM denied a 5th; solo account acquires `familyCode` only on first child-create |
| `WorkspaceUnlock` migration + server-side meter (5 distinct symbols per rolling 30 days; revisits free; metered payload still carries the Sharia-verdict chip data) | backend-expert | integration test: 6th distinct symbol in-window returns the metered payload containing verdict-chip data only; revisiting an unlocked symbol consumes no credit |
| Adult-neutral copy (صاحب الحساب "account holder", solo/family wording) en+ar | i18n-fintech-expert | `messages/*.json` key-identical; walk-through shows no "parent" labeling on solo surfaces in either locale |
| Account-shape regression: solo / parent-only / family authz + meter + seat caps | test-engineer | `npx vitest run tiers security` green incl. cross-shape access 403s |

### M12: Rushd Academy v1 (DR-17)
Goal: a learner completes age-appropriate academic lessons across three tracks, every concept compliance-tagged, each unit linking into DR-14 practical learning.
| Work item | Owner | Exit criterion |
|---|---|---|
| Content engine: zod schema (bilingual-required fields, `complianceTag`, `ageSegment` per lesson), track registry, content-lint test | ai-features-expert | `npx vitest run academy` fails a negative fixture missing an ar field, a tag, or a segment; passes the real content set |
| v1 curriculum: Foundations (incl. Islamic-finance units; KIDS/TEENS/ADULTS variants of at least its first two units), Economics (TEENS/ADULTS), Advanced Financial Analysis (ADULTS; naming placeholder pending OQ-9) — ≥3 tracks × ≥4 units × ≥3 lessons, checkpoint per lesson | ai-features-expert | content-count test asserts the minimums and the segment coverage; every riba/bond/derivative lesson carries `HARAM` or `EDUCATIONAL_ONLY` (test) |
| Arabic register + Sharia-label review of all v1 lessons; extend the M5 golden set to Academy strings | i18n-fintech-expert | review checklist artifact in the PR; `npx vitest run eval` covers Academy Arabic fields (non-empty, no banned jargon) |
| `AcademyProgress` + `User.ageSegment` migrations; auth-scoped progress/completion API — XP via `addXP` at fixed amounts, idempotent completion; DR-16 track gating + DR-17 segment gating server-side; segment set/edited by parent at child-create/settings | backend-expert | integration tests: completion writes progress + one XP event; repeat completion is a no-op; cross-user access 403; BASIC blocked from an ULTRA-track lesson; KIDS child requesting a TEENS/ADULTS lesson → 403 |
| Academy UI: catalog → track → lesson reader → checkpoint → progress; theory→practice link block on every unit; segment picker in the child-create/settings form | frontend-expert | walk-through en/ar, desktop/mobile, four ui-craft states, RTL logical props; a practice link lands on the mapped strategy lesson (M10 L4 surface) or quiz |
| Practice-link + segment-gate integrity suite (every unit ≥1 link; all link targets resolve; no lesson below its track's minimum segment) | test-engineer | `npx vitest run academy` green incl. link-integrity and segment-gate assertions |

### M13: One-page stock workspace at feature parity (DR-18, spec: `docs/STOCK_WORKSPACE_SPEC.md`)
Goal: the stock page is a single honest workspace implementing the spec's parity map — verdict chips first, charts over tables, labeled educational valuation models, zero unlabeled claims, metered state first-class.
| Work item | Owner | Exit criterion |
|---|---|---|
| Data contract (spec §3): `getFundamentalsHistory` (5 annual + 8 quarterly), `getEarningsCalendar` (history + next date), `filingsLinks` pure URL builders; deterministic seeded mocks + NVDA/Aramco fixtures; REMOVE `analystRatings` from `MarketData`/`getMockStats` (spec D6) | backend-expert | unit tests: mock returns 5 annual + 8 quarterly periods and a next-earnings date for fixture symbols; filings URLs resolve per market; `grep -rn "analystRatings" src` empty |
| Workspace shell (spec §1): delete the tab layout; sticky header + chip row; anchor/scroll-spy in spec section order S1–S13; metered state = chips + upgrade card + pre-spend cost notice ("1 of 5") | frontend-expert | `grep -n "type Tab" src/components/markets/StockDetail.tsx` empty; keyboard navigation demonstrated; metered walk-through shows cost notice before a credit is spent; design-reviewer PASS (DR-12) |
| Verdict-chip row + Sharia detail section (AAOIFI verdict, purification ratio, R-Score, provenance; compliance ratios beside statements) driven only by registry/computed data | frontend-expert | with zero keys, the provenance chip shows the demo-data label; a missing datum renders "unverified", never a fabricated value; all four ui-craft states |
| Financial history + statements (spec §2.3–2.4): 10–12 essentials metric charts, Annual/Quarterly, 5y/8q statements with core rows (interest-expense row DR-5-labeled), per-metric About modals linking Academy lessons | frontend-expert | walk-through: metric charts + three statements render from mock series; About modal shows definition/calculation/interpretation en+ar; interest row carries the educational label |
| Valuation lab (spec §2.5): DCF / EPS-growth / PEG / Rule-of-40 as pure tested functions in `src/lib/valuation/`; editable visible assumptions, presets, 5×5 sensitivity, projection views; persistent "model output — not advice" label en+ar; TEENS+ gate with KIDS placeholder; no aggregate verdict/tally (spec T4) | frontend-expert | calculator unit tests green (fixture assumptions → exact outputs); label on every model output in both locales; KIDS session receives the age-gated placeholder (server-enforced test); no aggregate-verdict string renders |
| Committee view (spec T5): 8-agent stance distribution + conviction + bilingual rationale from a deterministic mock committee view-model, labeled "simulated — not consensus, not advice"; per-agent evidence gated ULTRA | frontend-expert | walk-through shows stance distribution with the simulated label in en/ar; ULTRA gate on evidence panel asserted (test); no price-target or upside string renders |
| `WatchlistItem` migration + auth-scoped watchlist API + compare endpoint (≤4 symbols, honest rows incl. AAOIFI verdict/purification/R-Score; new compared symbol spends a BASIC meter credit) | backend-expert | integration tests: watchlist add/remove scoped per user (cross-user 403); compare returns aligned payloads in mock mode with verdict rows; new compare symbol consumes a credit, revisit does not |
| Compare + snapshot-card + earnings + filings UI (spec §2.7–2.8) on DR-12 tokens | frontend-expert | walk-through en/ar: compare table with best-in-row emphasis + legend; snapshot card shows chips + provenance; earnings actual-vs-expected + next date; filings list links out to EDGAR/Saudi Exchange; design-reviewer PASS |
| Honesty guard (spec §4): banned = unlabeled/unexplained fair value, target price, upside %, buy/sell/hold ratings across markets UI + `messages/*.json`; allowed only inside the labeled valuation lab with visible assumptions; asserts `analystRatings` stays gone | test-engineer | `npx vitest run honesty` green: banned strings absent outside the valuation lab, every model output carries label + assumptions, `analystRatings` absent repo-wide, negative fixture (injected banned term) fails |
| Arabic/RTL pass: metered-state copy, chips, anchor rail + sensitivity-matrix mirroring, bidi-safe LTR tokens (tickers/ratios) | i18n-fintech-expert | ar walk-through: RTL-correct rail and matrices, verdict chip + upgrade card in metered state; JSON key-identical |

### M14: Learner profile & adaptive curriculum (DR-19)
Goal: a learner takes (or skips) a bilingual diagnostic, receives a persona-labeled "starting path," and sees a deterministic adaptive queue that reorders only within the DR-16/DR-17 guard; Strategy Teams presentation is flag-gated OFF while the Practice Lab keeps the DR-14 engine.
| Work item | Owner | Exit criterion |
|---|---|---|
| Diagnostic content (6–8 closed bilingual questions, zod-schema'd, content-linted) + pure-TS scorer → persona + baseline/skill levels; skippable with honest default; versioned + re-takeable | ai-features-expert | `npx vitest run diagnostic` green: identical answers → identical persona/levels; a fixture missing an ar field or with an open-ended question fails the lint; skip writes the default persona at the current `profileVersion`; no LLM import in the scorer path (`grep -rn "generateObject\|ai-sdk" src/academy/diagnostic*` empty) |
| `LearnerProfile` migration + auth-scoped profile/signals API riding the existing completion API; no age field; security-auditor gate (child data) | backend-expert | `npx prisma migrate dev` applies; integration tests: completion updates `signals`; cross-user profile access 403; a CHILD profile row contains no age datum (test asserts field absence); security-auditor PASS in the PR |
| Adaptive recommender `nextUp(profile, progress)` in `src/academy/adaptive.ts` — TDD, pure, guard-bounded; persona-ranked practiceLinks | test-engineer | `npx vitest run adaptive` green (tests authored before implementation lands): deterministic queue for a fixture profile; every recommended item passes `can()` for that session (a KIDS/BASIC fixture never receives a TEENS/PREMIUM item); skillLevel threshold shift changes the branch (asserted) |
| Arabic register + Sharia review of diagnostic copy; "starting path, adjustable — not an assessment of you" framing en+ar | i18n-fintech-expert | review checklist artifact in the PR; `messages/*.json` key-identical; walk-through shows the adjustable-path framing in both locales; no psychometric-claim wording (grep list in the honesty suite) |
| Strategy-Teams hide-flag sweep: code-level flag (default OFF) over League branding, nav entry, standings UI; Practice Lab re-labeling preserves every practiceLink target | frontend-expert | with the flag OFF, `/quant/league` branding and the nav entry are absent in en/ar walk-through; flag ON restores them; link-integrity test still green (`npx vitest run academy`); sealed-attempt flows unchanged |

---

## 10. Testing & CI

**Minimum gate every milestone must pass before its JOURNAL entry:** `npm run lint` + `npx tsc --noEmit` + `npx vitest run` all green. CI (GitHub Actions) runs this on every PR. A dedicated CI job runs the full suite with **zero API keys set** — mock mode is a first-class, gated path, not an afterthought.

**Milestone-specific suites** (exit gates above): `auth`, `money`, `sweep`, `market`, `eval`, `e2e`, `security`, `tiers`, `academy`, `honesty`. Coverage priority — money math (Decimal, no drift), the parent/child authz boundary (incl. age-segment and plan/tier gates), provider fallback/caching, AI schema+injection, and the DR-18 honesty rule.

**Review chain (per `docs/AGENTS.md`):** implementation → qa-reviewer (same acceptance block) → security-auditor when the change touches auth, money movement, or the API surface. Sharia/Arabic-touching changes get an i18n-fintech-expert pass before qa-reviewer. Reviewers report only; owners in §9 remain the five implementer agents.

**Vitest is the single test dependency added** (justified: no runner exists today; `tsx` is already installed for MCP). No E2E browser framework in v1 — persona "E2E" runs as integration tests against route handlers; revisit Playwright when UI regressions escape integration tests.

---

## 11. Decision log & open questions

| DR | Decision (one line) |
|---|---|
| DR-1 | Self-hosted Auth.js v5 credentials, JWT sessions, parent-email / child-code+PIN shapes. |
| DR-2 | Money is `Decimal(18,4)` / shares `Decimal(18,6)`; no JS float on money; migrate in M2. |
| DR-3 | Savings sweep is a Mudarabah disclosed profit-share, fully audited — zero riba. |
| DR-4 | One `MarketDataProvider`+`ShariaScreener` interface + env-keyed registry; mock is default. |
| DR-5 | Teach every concept, persistently label HARAM/MASHBOOH, block their execution. |
| DR-6 | Arabic is the default locale and the RTL quality bar. |
| DR-7 | Keep Qwen via OpenAI-compatible base URL, mock-first, add schema compliance tags + injection-safe inputs. |
| DR-8 | Daily jobs run on Render Cron → a signed internal route; no queue, no worker. |
| DR-9 | Play-money MVP is SAMA-credible via disclaimers + audit + PDPL minimization + documented sandbox path. |
| DR-10 | Rushd Quant is an extractable eight-agent committee whose LLM decides only inside deterministic Sharia and risk gates. |
| DR-11 | Quant execution is paper-first; real brokerage remains dark behind CMA licensing and KYC/AML. |
| DR-12 | Institutional-minimal tokens, semantic finance colors, and honest data-led surfaces govern the UI. |
| DR-13 | Exactly two lazy-loaded 3D surfaces may ship within explicit performance and fallback constraints. |
| DR-14 | Strategy lessons compile bounded choices into immutable deterministic replays; mastery—not simulated profit—drives rewards. |
| DR-15 | Three account shapes ride the unchanged PARENT/CHILD roles; solo vs family is derived state, never stored. |
| DR-16 | Two priced plans (Solo, Family) with a capability-matrix tier inside each; the aha workspace is metered, never hard-walled; ULTRA monetizes education. |
| DR-17 | Rushd Academy is versioned code-resident curriculum — age-segmented (KIDS/TEENS/ADULTS), compliance-tagged, theory linked to DR-14 practice. |
| DR-18 | The stock page is one workspace at ValueSnapshot feature parity; valuation ships only as labeled editable educational models — unlabeled verdicts stay banned and test-enforced. |
| DR-19 | One `LearnerProfile` model + deterministic diagnostic and recommender personalize the Academy strictly inside existing guards; Strategy-Teams presentation is flag-gated OFF, the DR-14 engine powers the Practice Lab. |

**Open questions (each with its deciding trigger).**
- **OQ-1 — Real-money rails (PSP/KYC/AML).** Trigger: SAMA sandbox admission or a real-deposit pilot. Until then, v1 is play-money only.
- **OQ-2 — Multi-parent / two-guardian families.** Trigger: first request for co-parent access; v1 is one PARENT per family (fields on `User`, not a `Family` model yet).
- **OQ-3 — Sharia screener vendor (Zoya vs Musaffa/IdealRatings).** Trigger: confirmed pricing + TASI numeric-symbol coverage. Interface (DR-4) makes the choice swap-only.
- **OQ-4 — Live TASI feed vendor (SAHMK vs official Tadawul vs Twelve Data).** Trigger: data-license budget approved. Adapter slot already reserved.
- **OQ-5 — Session revocation model.** Trigger: real money moves — switch JWT→DB sessions for instant revoke (couples with OQ-1).
- **OQ-6 — Arabic LLM (Qwen vs ALLaM/Jais).** Trigger: the M5 Arabic-quality eval score falls below bar; base-URL swap only.
- **OQ-7 — Exact PIN/lockout policy numbers.** Trigger: security-auditor review of M1; current defaults are PIN ≥4 digits, lock 15 min after 5 fails.
- **OQ-8 — Pricing numbers.** Solo vs Family SAR price points per tier, annual/monthly split, and the final workspace-meter credit count. Trigger: first paid-launch decision / pricing research complete. The structure (two plans, capability-matrix tiers, annual-first SAR, metered aha) is decided in DR-16 and is not reopened by the numbers.
- **OQ-9 — CFA-candidate-level naming.** How to describe the Advanced Financial Analysis track's level without implying CFA Institute affiliation or endorsement ("CFA®" never appears in product copy without counsel). Trigger: before the track's public copy ships — M12 uses a placeholder name until resolved.
- **OQ-10 — Sharia board review scope for the expanded curriculum.** Labels-only vs full content review including the Academy's interest-math/bonds/derivatives units and their age-segment variants. Trigger: board engagement — this concretizes DR-5's "Revisit when" clause.
- **OQ-11 — Solo-adult gamification presentation.** Identical XP/badges UI vs a toned adult variant; the engine (`addXP`) is shared either way — only presentation varies. Trigger: first solo-user usability round after M11 ships.
- **OQ-12 — Persona taxonomy validation.** Is the DR-19 persona cut (the enum-in-code taxonomy) the right segmentation, or should it merge/split before it hardens into copy and recommender branches? Trigger: first cohort data or user interviews — until then the taxonomy ships as designed and remains a code-only change to revise.
