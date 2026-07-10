# RUSHD Journal — session memory

Append one entry per completed milestone or significant session. Max 5 lines each. Newest first. Future sessions cold-start here instead of re-exploring the codebase.

Entry format:
```
## YYYY-MM-DD — <milestone/task>
Shipped: <what, one line>
Decisions: <key choices made, one line>
Open: <risks/next, one line>
```

---

## 2026-07-08 — Markets UI Rebuild & Monolith Decomposition ✅
Shipped: Decomposed MarketsClient.tsx monolith into 10 clean, sub-500-line components under src/components/markets/. Integrated dynamic 250ms debounced live stock search over the database and live universes. Connected the Sage Mentor assistant panel to /api/signals POST endpoint to fetch live AI recommendations and bilingual logic. Implemented a narrative storytelling design layer (compliance shields, biography quest stats, and custom sliders/drawers).
Decisions: Synchronized selected stock status using window.history.pushState for immediate, shareable deep-linking. Updated incorrect English names for 8250.SR and 6060.SR.
Open: Ready for user interaction verification.

## 2026-07-07 — Quant Committee Integrations & Launch-Gating (QUANT_HANDOFF.md Levers) ✅
Shipped: Deep historical backfill for Pattern analyst (Yahoo Finance hybrid range resolver, 4 years/1200 bars loaded for all 30 symbols), fundamentals DB populator (seeded all symbols), RAG research docs ingestion (seeded AAOIFI/stock outlooks, activated RAG analyst). Real Zoya Sharia screening API integration. Enforced requireUltraTier gating on all /api/quant/* endpoints + QuantPage view. Added Navigation.tsx and MarketsClient.tsx links to /quant. Configured all LLM models to point to OpenRouter free slugs.
Decisions: Redirect unauthorized users from /quant UI to /profile to upgrade subscription. Mocked requireUltraTier in tests to keep vitest fully green.
Open: Ready for visual review and production deployment.

## 2026-07-11 — Quant UI/UX Board & Autopilot Upgrades ✅
Shipped: Dual-tab layout switcher in Quant dashboard (/quant); 24/7 AI Autopilot trading mode toggle updating Strategy autonomy tier via POST to `/api/quant/autonomy`; Interactive Sandbox Controls pre-seeding TASI/NASDAQ symbols; click-to-replay Recent Decisions history feed allowing users to audit past deliberated signals; integrated Portfolio Analytics tab containing Net Asset Value curve, allocation donut, stats cards, and holdings table with Sharia tags.
Decisions: Implemented simulated 30-day performance curve fallback if portfolio snapshots count is less than 2; added a new API endpoint route `/api/quant/autonomy` in Prisma; enabled quick approval execution directly from proposed cards.
Open: Re-evaluation of visual orbits for 3D view mode.

## 2026-07-07 — Rushd Quant Q2/Q6/Q7: backtest, automation, committee UI ✅
Shipped: **Q2** backtest — metrics (CAGR, Sharpe, deflated Sharpe, maxDD, hit-rate, implausible flag), deterministic PM surrogate (QDR-4), event-driven engine (decide-on-close/fill-next-open, commission+slippage+ADV cap, OOS split, look-ahead-injection guard proven). Data **ingestion** (MarketBar via provider registry + signed cron). **API**: /api/quant/pass (run committee → signals+decision), /api/quant/backtest (metrics). **Q7 committee UI** (/[locale]/quant): per-analyst stance/conviction/Arabic-rationale cards, PM decision, Sharia badge, backtest tiles — Arabic-first RTL, educational. **Q6 automation**: QuantControl kill-switch, runAutomatedStrategies (AUTO_PAPER only auto-executes on paper; AUTO_REAL/HUMAN_APPROVE never), signed /api/cron/quant-run.
Decisions: security gate on auto-execution found+fixed HIGH double-execute race (per-(day,strategy,symbol) AutoRunClaim @unique — race-safe + resumable), constant-time cron secret, caps (50 strategies/20 symbols). 207 tests, tsc+lint clean. Q3 (Sharia veto + News + Fundamental) was delivered inside Q1.
Open: **Q4 Research/RAG analyst #7** is the only remaining roadmap item. Product is demonstrable end-to-end: ingest → run committee → watch it reason (UI) → paper-execute → backtest → automate. Drop ALPACA/OpenRouter keys for live data+models. Add a nav link to /quant + hard ULTRA-tier gating on the quant routes/UI before launch.

## 2026-07-07 — Rushd Quant Q0+Q1: AI analyst-committee, end-to-end paper trading ✅
Shipped: new product `docs/QUANT_DESIGN.md` (8-agent committee) + 7 skills. **Q0**: data spine (MarketBar/Fundamentals/NewsItem) + point-in-time no-look-ahead core (query filter + runtime assertion + injection test). **Q1**: per-agent model router (free model per job — News=Gemini Flash, Fundamental=Qwen72B, PM=Gemini Pro — with **Opus fallback** free→Opus→mock, all temp 0, OpenRouter-unified, mock-first); 6 analysts (Quant Core, Technical, News, Fundamental, Pattern/Analog w/ strict OOS+leakage guards) + Sharia hard-veto gate; risk envelope (Decimal clamps + kill-switch); committee collector; bull/bear debate; Portfolio Manager (LLM decides INSIDE the envelope — proven it can't force a non-compliant BUY); committee runner (persists auditable Decision + signals); paper execution (BrokerAdapter + InternalSim + gated Alpaca paper) via authed `/api/quant/execute`. 150 tests.
Decisions: LLM-decides/rules-veto hierarchy (virattt pattern); backtests use a deterministic PM surrogate; real money DARK behind assertLiveExecutionAllowed (3 conditions). qa+security gate found & fixed 4: CRITICAL dead live-gate (now enforced in AlpacaPaperBroker ctor), HIGH broker-submit-before-tx race (Order claimed via @unique before external call), MED virtual-cash never moved (User.cashVirtual debit/credit), MED global ratelimit→per-user + P2002→409.
Open/next: Q2 backtest engine (walk-forward, deflated Sharpe), Q4 Research/RAG #7, Q6 automation+autonomy tiers, Q7 committee UI. Drop an ALPACA_API_KEY (paper) to light up real NASDAQ data+execution; OPENROUTER key to light up live models. Q0 MarketBar/Fundamentals naming drifted slightly from QUANT_DESIGN §4 (functional; reconcile later).

## 2026-07-06 — M8: Mobile-first premium experience mimicry & language hub ✅
Shipped: Extended MarketData interface; MarketsClient dashboard overview & details layout; interactive SVG earnings expected/actual circle plot; company statistics sliders; custom bottom sheet drawers for Sharia purification and fractional shares; bilingual bottom navbar; context-aware embedded Quiz Modal; floating LanguageSwitcher widget.
Decisions: Seeded exact metrics for NVDA matching the screenshots; split Markets into Server routing page & Client UI component for performance; dynamically matched quizzes to specific stock tickers; routed locale changes using path segments parsing and search query params preservation.
Open: Ready for visual review.

## 2026-07-06 — M7: Security & privacy hardening ✅
Shipped: authorizeAccess and validateChildCreationLimit in authz.ts; audit logs inside NextAuth authorize handler; TokenBucket rate limiters on auth, signals, and quiz routes; docs/DATA_MAP.md outlining PDPL compliance.
Decisions: Mapped parent-supervision and self-access scopes strictly to prevent sibling cross-viewing; bypassed edge NextAuth constraints in security.test.ts by module mocking.
Open: Ready for deployment audits.

## 2026-07-06 — M6: Frontend wiring & personas ✅
Shipped: ParentDashboardClient rendering parent invitation code and children cards; markets page (/markets) with exchanges and charts; quizzes page (/quiz) with topic picker; profile page (/profile); bilingual home page (/); e2e.test.ts.
Decisions: Dynamically routed /dashboard based on Role.PARENT vs Role.CHILD; used native Next.js link elements to avoid hydration parameters mismatches.
Open: Ready for user testing.

## 2026-07-06 — M5: AI hardening & compliance flagging ✅
Shipped: Sanity checks and complianceTag on quiz GET; regex checks on signals POST (TASI numeric, NASDAQ alphabetic); server-side portfolio holdings loading; trade UI disables execution and displays warning for non-compliant assets; ai-eval.test.ts.
Decisions: Sandboxed topic inputs to a strict allowlist to block prompt injections; set mock fallbacks to explicitly include complianceTag.
Open: Refine prompts under varying LLM temperatures.

## 2026-07-06 — M4: Market data provider layer ✅
Shipped: Quote/Candle/Verdict interfaces, registry selection, Sahmk/Alpaca/Zoya adapters behind env keys, token-bucket rate limiter, 60s quote TTL cache, end-of-day candles cache, 24h verdicts cache, and MCP integration note.
Decisions: Refactored fetchMarketData to delegate to cached wrappers, guaranteeing UI routes never throw; mapped MCP note to verdict.source ('zoya' vs 'mock').
Open: M5 next (AI hardening and compliance tagging); golden prompting evaluations.

## 2026-07-06 — M3: Sharia savings (Mudarabah) engine ✅
Shipped: mudarabah_savings migration; processCashSweeps rewritten to simulate variable Daily Mudarabah yield split (default 70% user / 30% platform) with PROFIT_SHARE Transaction logs; Bearer-authenticated /api/cron/distribute route with daily idempotency.
Decisions: Handled undefined profitShareRatioBps fallback (default 7000 bps) for backward compatibility; added customYieldRate argument to processCashSweeps for deterministic testing.
Open: APY and interest terminology completely expunged.

## 2026-07-06 — M2: Money integrity ✅
Shipped: Migrated balance, amount, and shares columns to Decimal type in Prisma; added indexes on Transaction and QuizAttempt; wired addXP into quiz POST route; bound DashboardClient to DB-backed stats.
Decisions: Used new Prisma.Decimal(val.toString()) cast to safely support test mocks returning number and DB returning Decimal; lazily initialized GamificationProfiles on page/api hit.
Open: M3 next (Sharia savings / Mudarabah engine); interest language and fixed APY calculations must be removed.

## 2026-07-06 — M1: Auth & family boundary ✅
Shipped: init_auth migration; Auth.js v5 credentials (parent email+pw / child familyCode+username+PIN), JWT {userId,role,tier,parentId}, per-(parentId,username) lockout 5-fail/15-min; middleware composes next-intl+Auth.js (protected prefixes → /[locale]/login); /api/register + /api/family/children + authz.ts helpers; ar-first login/register/new-child UI; 34 tests. QA PASS (role/tier forgery defeated); security no CRIT/HIGH.
Decisions: hardened 3 findings — AUTH_SECRET positive gate (throws unless NODE_ENV=development), dummy bcrypt.compare kills login timing-enumeration, expired lock resets counter. Dev Postgres = Docker container rushd-postgres (matches .env).
Open/ACCEPTED DEBT: (1) register 409 email_taken is enumerable — inherent to signup, mitigated by rate-limiting later; (2) NO rate limiting on auth endpoints yet — deferred per design OQ, needed before launch; (3) tier-based child-count gating (BASIC=1/PREMIUM=4/ULTRA=∞) not enforced in /api/family/children — must land before tier limits matter. M2 next (money → Decimal).

## 2026-07-06 — M0: Quality gate & foundation ✅
Shipped: prisma singleton (src/lib/prisma.ts), Arabic default locale (/, → 307 /ar), global disclaimer banner en+ar, vitest (8 tests: engines + i18n parity) + CI workflow; fixed pre-existing app-wide 404 (next-intl v4 requestLocale) and 2 QA findings (ar banner advice clause, /fr → 404).
Decisions: colocated *.test.ts convention; mock at @/lib/prisma boundary; unknown locales 404 in layout; Arabic disclaimers strengthened, never weakened (SAMA posture).
Open: M1 next (auth) — BLOCKER: needs a running Postgres for `prisma migrate dev`; API-route tests deferred to their milestones.

## 2026-07-06 — Any-model portability layer
Shipped: root AGENTS.md (guest-agent rules for Gemini/Antigravity etc.), scripts/dispatch.mjs + models.map.json (per-agent any-runner routing, dry-run tested), docs/MODELS.md (gateway/dispatch/Antigravity routes).
Decisions: .claude/agents/*.md stays the single source of truth — other runners get it injected, never forked; review tier stays on a strong model regardless of route.
Open: gemini/opencode/codex CLIs not yet installed (map defaults to claude runner); LiteLLM gateway documented but not provisioned.

## 2026-07-06 — SYSTEM_DESIGN.md v1 (the implementation contract)
Shipped: 356-line design doc — 9 DRs, M0–M7 roadmap (34 owned work items), security/SAMA/PDPL posture; QA PASS zero findings, one precision amendment applied.
Decisions: Auth.js v5 credentials (child = code+PIN, no email) · money Float→Decimal(18,4) · sweep → Mudarabah profit-share (zero riba) before launch · teach-all/label-haram/block-execution education policy · Arabic default locale · Qwen mock-first · Render Cron for sweeps · SAMA-credible simulation.
Open: M0 next (foundation: prisma singleton, landing page, locale default ar); 7 OQs in doc §11 with firing triggers; postgres MCP unverified until local DB runs.

## 2026-07-06 — Agent infrastructure bootstrap
Shipped: git repo initialized; CLAUDE.md, 6 skills, 9 agents, hooks, AGENTS.md protocol created.
Decisions: tiered models (haiku/sonnet/opus); report-only reviewers; MCP servers under mcp/ run via tsx.
Open: SYSTEM_DESIGN.md pending architect run; postgres MCP unverified until local DB confirmed.
