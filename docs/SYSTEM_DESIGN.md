# Rushd Financial — System Design

Binding implementation contract. Agents receive 2–5 line quotes as their DESIGN CONTRACT; every sentence here is load-bearing. Decisions are final unless a Decision Record's "Revisit when" trigger fires. No contradiction with `prisma/schema.prisma` as it exists today is permitted — all schema changes live in §4 and are tagged to a milestone.

**Cross-cutting invariant (all milestones):** every feature works with zero external API keys set. Mock/no-key mode is first-class until the live-integration milestone that replaces a given adapter. An exit criterion that only passes with keys is invalid.

---

## 1. Context & goals

**Product.** Gamified, bilingual (Arabic-first) investment-training and family neobanking simulator for the Gulf. Parents supervise children who learn markets and practice investing with virtual play-money across TASI (featured) and NASDAQ (secondary).

**Personas.**
- **PARENT** — Gulf guardian, real email + password. Creates and supervises child accounts, sets allowances, sees each child's activity. Sole account holder for a family.
- **CHILD** — minor (~8–17), no email. Logs in with a parent-issued family code + username + PIN. Learns, takes quizzes, runs simulated trades, earns XP. Sees only their own data.

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

**Non-goals v1:** real money / PSP / KYC, real brokerage execution, multi-parent families, native mobile app.

**Tier gating (product default, tunable in code, not schema):** BASIC = 1 child, TASI only, quizzes. PREMIUM = ≤4 children, NASDAQ, AI signals. ULTRA = unlimited children, advanced analytics, priority AI. Gating is enforced in the authz helper (§8), never by branching UI alone.

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

---

## 3. Auth

Constraints satisfied: parent→child self-relation (`User.parentId`), child accounts without email (`email` stays nullable), roles `PARENT`/`CHILD`, tiers `BASIC`/`PREMIUM`/`ULTRA`.

### DR-1: Self-hosted Auth.js v5 credentials, JWT sessions, dual credential shapes
Decision: use Auth.js v5 (`next-auth@5`) with a single Credentials provider whose `authorize` branches on input shape — `{email, password}` for PARENT, `{familyCode, username, pin}` for CHILD — issuing a JWT session carrying `{userId, role, tier, parentId}`; no database session table, no Auth.js adapter.
Options: Hosted IdP (Clerk/Auth0 — no child-without-email model, PDPL data-residency friction, per-MAU cost on a family app) / hand-rolled cookies+sessions (re-implements CSRF, rotation, JWT verification — security surface we would own) / Auth.js v5 credentials + JWT (self-hosted, models both credential shapes, no new tables).
Rationale: children have no email, so we must own the credential store; Auth.js gives session/CSRF/JWT plumbing while `authorize` stays custom. JWT strategy needs no `Session` table — zero extra writes per request, correct for a monolith at this scale.
Consequences: passwords/PINs are hashed with `bcryptjs` (pure-JS, no native build on Render) at cost 12; JWT sessions cannot be server-revoked instantly (acceptable for play-money; see OQ-5). Child PINs are low-entropy → mandatory lockout: `failedLoginCount` + `lockedUntil`, lock for 15 min after 5 fails, scoped per `(parentId, username)`. Middleware composes next-intl (locale) then Auth.js (session); unauthenticated hits on protected prefixes redirect to `/[locale]/login`.
Revisit when: real money moves (switch to DB sessions for instant revocation) or a second guardian per family is required (OQ-2).

**Credential resolution.** Parent: `User.email` unique + `passwordHash`. Child: resolved by `familyCode` (a short code on the parent) → parent, then `@@unique([parentId, username])` → child, then verify PIN against `passwordHash`. A child cannot log in without a valid family code, so children are never globally enumerable.

**Session contents & use.** The JWT carries `userId`, `role`, `tier`, `parentId`. `src/lib/authz.ts` (§8) reads it to scope every data access. UI reads `role`/`tier` for navigation and gating; the server never trusts client-sent role/tier.

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

No new auth tables (JWT sessions, no adapter). `onDelete: Cascade` already present on each user's owned rows satisfies PDPL right-to-erasure per user; family erasure is app-orchestrated — delete each child `User` (their owned rows cascade), then the parent — because the parent→children self-relation defaults to `SetNull`, not `Cascade`.

---

## 5. Market data integration

Today `fetchMarketData` (`marketData.ts:46`) branches inline on env keys and returns mock data; the MCP server already wraps it. That inline branching is replaced by an interface + registry so live keys swap providers with zero call-site change.

### DR-4: One `MarketDataProvider` + `ShariaScreener` interface with an env-keyed registry; adapters are swappable, mock is the default
Decision: define `MarketDataProvider` (`getQuote`, `getCandles`) and `ShariaScreener` (`screen`) interfaces; a registry selects an adapter per market by env-key presence, defaulting to `MockProvider`/`MockScreener`; `fetchMarketData` becomes a thin façade over the registry.
Options: keep per-call `if (env.KEY)` branching (untestable, duplicated across quote/candle/screen paths) / a separate data microservice (new infra for read-only reference data) / interface + registry inside the monolith (testable, one swap point, no new infra).
Rationale: three providers (SAHMK/Alpaca/Zoya) with independent keys and failure modes need one selection point and one fallback policy; the MCP server and UI must never diverge, which an interface guarantees.
Consequences: adding a provider = one adapter file + one registry line; every adapter must implement the mock-fallback contract so no-key mode keeps working. Screening and quotes stay one code path across HTTP + MCP.
Revisit when: a provider needs push/streaming (WebSocket) rather than request/response, or per-user API budgeting is required.

**Interface (extracted).**
```
interface Quote  { symbol; market; price; currency; asOf }
interface MarketDataProvider { getQuote(symbol, market): Quote; getCandles(symbol, market, days): Candle[] }
interface ShariaVerdict  { symbol; compliant; standard: 'AAOIFI'; ratios?; source: 'mock'|'zoya'; asOf }
interface ShariaScreener { screen(symbol, market): ShariaVerdict }
```

**Adapter spec.**
| Provider | Role | Env key | Selected for | No-key behavior |
|---|---|---|---|---|
| `MockProvider` | quotes + candles | — | default | always available; seeded random walk |
| `SahmkAdapter` | TASI quotes/candles | `SAHMK_API_KEY` | market=TASI when key set | falls back to `MockProvider` |
| `AlpacaAdapter` | NASDAQ quotes/candles | `ALPACA_API_KEY` | market=NASDAQ when key set | falls back to `MockProvider` |
| `MockScreener` | AAOIFI screen | — | default | `TSLA`/`META` non-compliant, else compliant (label "demo data") |
| `ZoyaAdapter` | AAOIFI screen | `ZOYA_API_KEY` | when key set | falls back to `MockScreener` |

**Caching + rate limits (in-process, no Redis).** A module-level TTL `Map`: quotes 60 s, candles until end of the symbol's trading day (TASI calendar Sun–Thu), Sharia verdicts 24 h. A per-provider token bucket caps outbound calls; on 429/timeout/error the layer serves the last cached value, else mock — it **never throws to the UI**. Single-instance cache is acceptable at this scale; revisit with Redis only when the app runs multiple instances.

**Env-key swap path.** Selection happens at call time by env presence, so setting `SAHMK_API_KEY` flips TASI mock→live with no code change; unset reverts to mock. This is the load-bearing property tested in M4.

**MCP relationship.** `mcp/rushd-market` stays a transport-only wrapper (`get_quote`/`get_candles`/`check_sharia_compliance`) over the same registry — one screening/quote implementation, two transports. Its "demo data / Zoya pending" notes are driven by `ShariaVerdict.source`, not a second rule.

---

## 6. AI features

Two endpoints exist: `quiz` (`generateObject`+zod, mock fallback) and `signals` (same, bilingual reasoning). Both call Qwen via the OpenAI-compatible `OPENAI_BASE_URL`.

### DR-7: Keep Qwen via OpenAI-compatible base URL with mock-first fallback; harden with schema-enforced compliance tags and injection-safe inputs
Decision: retain `@ai-sdk/openai` + `generateObject` pointed at Qwen through `OPENAI_BASE_URL`, keep the mock object as a first-class fallback, and extend both zod schemas with a required `complianceTag` plus system prompts that enforce not-advice, minor-appropriate, Arabic-primary output.
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

**Authorization model (parent/child boundary).** The JWT session (`{userId, role, tier, parentId}`) feeds a single guard in `src/lib/authz.ts`. Rules, enforced in every query — not by UI branching:
- CHILD → own rows only (`where userId = session.userId`).
- PARENT → own rows + children's (`where userId IN (self ∪ {c : c.parentId = self})`).
- Cross-family access is impossible: no query omits the scope; a sibling or another family's row returns 403.
- Tier gating (BASIC/PREMIUM/ULTRA feature limits) is checked in the same guard, server-side.

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

---

## 10. Testing & CI

**Minimum gate every milestone must pass before its JOURNAL entry:** `npm run lint` + `npx tsc --noEmit` + `npx vitest run` all green. CI (GitHub Actions) runs this on every PR. A dedicated CI job runs the full suite with **zero API keys set** — mock mode is a first-class, gated path, not an afterthought.

**Milestone-specific suites** (exit gates above): `auth`, `money`, `sweep`, `market`, `eval`, `e2e`, `security`. Coverage priority — money math (Decimal, no drift), the parent/child authz boundary, provider fallback/caching, and AI schema+injection.

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

**Open questions (each with its deciding trigger).**
- **OQ-1 — Real-money rails (PSP/KYC/AML).** Trigger: SAMA sandbox admission or a real-deposit pilot. Until then, v1 is play-money only.
- **OQ-2 — Multi-parent / two-guardian families.** Trigger: first request for co-parent access; v1 is one PARENT per family (fields on `User`, not a `Family` model yet).
- **OQ-3 — Sharia screener vendor (Zoya vs Musaffa/IdealRatings).** Trigger: confirmed pricing + TASI numeric-symbol coverage. Interface (DR-4) makes the choice swap-only.
- **OQ-4 — Live TASI feed vendor (SAHMK vs official Tadawul vs Twelve Data).** Trigger: data-license budget approved. Adapter slot already reserved.
- **OQ-5 — Session revocation model.** Trigger: real money moves — switch JWT→DB sessions for instant revoke (couples with OQ-1).
- **OQ-6 — Arabic LLM (Qwen vs ALLaM/Jais).** Trigger: the M5 Arabic-quality eval score falls below bar; base-URL swap only.
- **OQ-7 — Exact PIN/lockout policy numbers.** Trigger: security-auditor review of M1; current defaults are PIN ≥4 digits, lock 15 min after 5 fails.
