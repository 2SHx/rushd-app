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

## 2026-07-14 — R3-2 dual-momentum terminally rejected ✅
Shipped: fixed seven-asset monthly dual-momentum v1 plus continuous 25% shared-book cap; exact final run used 14,108 real bars / 0 MOCK and 2,141 NAV days.
Decisions: REJECTED on `DSR_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE`; positive OOS CAGR and passing cap/MC risk gates cannot authorize AUTO_PAPER.
Verify: source `d48638c`; focused 28/28, full 643/643, lint/typecheck/diff-check; BacktestRun `d3628d85-43a8-43c2-a327-44f642104729`, seed 42, reproducible=true, post-fill gross≤25%.
Open: execute R3-3 turn-of-month next; `abe70156…` (deleted data) and `7fc795e8…` (entry-only cap) remain superseded audit records, not strategy evidence.

## 2026-07-14 — R3-1 final QA-safe replay identity ✅
Shipped: additive supersession record for the PIT/cache-purity and bilingual-rationale fix, preserving the prior v3 card while making `d3d0071` / `f9e5f702-253b-4a9d-bdec-d89144038ecb` the final replay identity.
Decisions: metrics and REJECTED reasons have zero drift; `DSR_FAILURE`, `DRAWDOWN_RISK_FAILURE`, `SHARIA_UNVERIFIABLE` still bind, with research-only execution blocked.
Verify: focused 24/24, full 630/630, i18n parity 1/1, lint/typecheck/diff-check passed; exact post-commit run reproducible=true; frozen 9-cell heap 1.053s.
Open: R3-2 remains next; the superseded `f9d788b` / `f841fa65-41e6-4932-ae65-906dd3e3bd99` evidence remains immutable for audit history.

## 2026-07-14 — R3-1 momentum-v3 terminally rejected ✅
Shipped: promotion-grade v3 shared-book evidence over 49,243 real bars / 2,141 NAV days, with the exact terminal row/card and frozen 3×3 plateau recorded.
Decisions: REJECTED on `DSR_FAILURE`, `DRAWDOWN_RISK_FAILURE`, `SHARIA_UNVERIFIABLE`; plateau PASS and +11.83% OOS CAGR are informative but cannot override hard gates or authorize AUTO_PAPER.
Verify: source `f9d788b`; focused 67/67 and full 626/626 passed with lint/typecheck/diff-check; BacktestRun `f841fa65-41e6-4932-ae65-906dd3e3bd99`, seed 42, reproducible=true.
Open: execute R3-2 dual-momentum rotation next; v3 remains research evidence only, with no profit promise and no AUTO_REAL path.

## 2026-07-14 — G3e/R3-0 shared strategy-book engine ✅
Shipped: DB-free Decimal `simulateStrategyBook`, date-major shared cash/NAV/positions, true daily drawdown, real-position envelope calls, and explicit shared CLI routing with legacy default preserved.
Decisions: next-open exits precede entries; each side is canonical-symbol ascending; YAHOO/ALPACA only; lazy-dev rung 7 added no dependency/schema/service/API and left the legacy single-symbol engine untouched.
Verify: focused 12/12 and full 616/616 Vitest tests passed; lint, TypeScript and diff-check passed.
Open: R3-1 may now opt momentum-v3 into this route to validate the frozen 15% basket-vol governor and six-position cap; persistence remains separately scoped.

## 2026-07-14 — G3e/R3-0 shared strategy-book prerequisite contracted ✅
Shipped: amended QDR-6/QDR-7 consequences and the binding lab DAG with a testable DB-free, date-major shared-cash daily portfolio engine before momentum-v3.
Decisions: shared within each isolated mode and isolated across modes; canonical-symbol same-day priority is frozen a priori; legacy pooled-independent runs remain byte-stable but cannot evidence portfolio controls.
Open: implement R3-0/G3e and pass its focused gate before R3-1 may test the 15% basket-vol governor and six-position cap.

## 2026-07-13 — Acceptance capabilities live + queue batch: stop-hunt rejected, plateau verdicts land ✅
Shipped: profitPlateau sweep (frozen-center robustness), earned walkForward (decision-window assertion), per-run Sharia snapshots (ed51992); background queue.sh pattern (zero agent tokens) ran stop-hunt validation + both v2 full-checklist re-runs; league UI committed f739221 after design+i18n gates.
Decisions: stop-hunt REJECTED decisively (887 trades, −0.33%/trade, ruin 100% — 7th intraday falsification); bollinger-v2 plateau FAIL (parameter-fragile — near-miss framing corrected); momentum-v2 plateau PASS → strongest candidate, blocked only by MC p95 37.2%>30% + OOS DSR 0.894<0.95 + Sharia verification.
Open: R2-4c/d (bagholder, time-of-day) + momentum-v3 (a-priori basket vol target) + allocator core + Sharia screening source; token-economy mode: scripted background queues over agent dispatches wherever deterministic. Docker/Postgres restored by user.

## 2026-07-13 — G5 model vs SPY/SPUS historical learning chart ✅
Shipped: Persisted normalized-100 weekly model/SPY/SPUS comparison evidence in terminal `BacktestRun` cards and rendered a bilingual accessible chart with OOS boundary, sources, signed ending changes, mobile containment, and an honest legacy-rerun state.
Decisions: Lazy-dev rung 2 reused the JSON evidence envelope (no schema/dependency); benchmarks are real Yahoo close-price ETF proxies, dividends excluded, common period starts at SPUS availability, and the model is explicitly pooled simulated trade-sequenced equity—not a daily investable portfolio.
Open: All four teams were reproducibly rerun at `0daef96` and remain REJECTED; next build a true shared-cash daily portfolio/drawdown curve before MC fan or paper P&L, while automation stays inactive with zero ACCEPTED teams.

## 2026-07-12 — G5 strategy league evidence UI, first slice ✅
Shipped: Authenticated `/quant/league` reads strict persisted terminal cards and graphs OOS CAGR versus MC p95 drawdown; accepted and rejected teams remain selectable with full/OOS metrics, gates, exact reasons, provenance, and Sharia execution state in English/Arabic.
Decisions: Removed fabricated committee decisions and synthetic compound-growth fallbacks; missing equity history is shown as missing rather than invented. Mobile scroll is contained inside the graph/table cards, with RTL, interaction, and console checks executed in-browser.
Open: Persist real equity/drawdown series plus setup version/effective params through a generated migration, finish G5/M9 visual surfaces, then complete frozen R2-4 validations and prioritize explainable cross-sectional G6b before RL; zero teams remain ACCEPTED, so automation stays inactive.

## 2026-07-12 — R2-4a VWAP-reclaim team terminally rejected ✅
Shipped: Frozen regular-session VWAP-reclaim v1, exact signal/fill provenance, shrink-only volatility sizing under the envelope, Decimal stop/2R math, Sharia execution block, safe prefix memoization, and a clean-SHA two-year validation.
Decisions: REJECTED on 347 trades: CAGR −40.62%, OOS −44.90%, hit 17%, MC p95 DD 67.43%, ruin 100%, jitter p=1.000; supported reasons OOS/DSR/drawdown/plateau/Sharia. Premarket v1.1 remains untested because v1 failed the a-priori non-negative-expectancy prerequisite.
Open: Continue R2-4 with stop-hunt-reversal-long, then bagholder-bounce and time-of-day; future JSON cards must serialize setupVersion/effective params (current v1 remains reproducible via SHA + ledger); zero teams are ACCEPTED, so automation remains inactive.

## 2026-07-12 — Strategy tournament round 1 complete: 4 teams validated, 4 honest rejections ✅
Shipped: Team A genuine run on the G3d PIT micro-cap universe (153 symbols, 394 real gap days): 76 trades, −4.19%/trade, ruin 99.9% → REJECTED NEGATIVE_EXPECTANCY with terminal card; Mode D coint-statarb REJECTED INSUFFICIENT_SAMPLE (9 trades; Sharpe 5.05 auto-flagged IMPLAUSIBLE); Modes B/C previously REJECTED. Ledger + plan table fully closed for round 1.
Decisions: Expert finding recorded — long gap-continuation on micro-cap gappers is the losing side (gap-ups fade; documented edge is short-side, Sharia-excluded); v2 hypotheses must change (Stocks-in-Play relative-volume/trend, per-name sizing, deep-history universe), never retune viewed data. Backwards daily deep-backfill identified as the unlock for all daily v2 candidates.
Open: QA gate over the milestone, then the PAUSE report card to the user. Zero validated-promotable strategies is the honest round-1 outcome — the gates prevented four losing automations at $0 LLM cost.

## 2026-07-12 — QDR-7 competing-team final-status contract ✅
Shipped: Bound every strategy team to `CANDIDATE → CODIFIED → VALIDATING → ACCEPTED | REJECTED`, with mandatory terminal evidence cards and deterministic cumulative rejection codes.
Decisions: Only ACCEPTED versions enter isolated AUTO_PAPER books; Sharia-unscreened research cannot be accepted; rejection binds the tested version/run and never erases its measured results.
Open: G3d must repair its current-market-cap survivorship bias, revalidate gapper-orb on a PIT micro-cap universe, then complete the pending independent QA gate and user report-card pause.

## 2026-07-12 — Quant Strategy Lab G3: intraday harness + Monte Carlo + backtest CLI ✅
Shipped: intradayEngine.ts (minute-bar, envelope-clamped, halt-gap no-fill, participation partial fills, look-ahead guard), seeded monteCarlo.ts (bootstrap/jitter-permutation/Kelly-through-envelope), daily-return distribution incl. P(day≥+5%), report card with dataFeed labels + RED implausible, `npm run backtest` CLI; 353 tests green; 379k real IEX minute bars backfilled (20 symbols × 90d).
Decisions: zero LLM in the whole path; fixture run honestly returns INSUFFICIENT_TRADES (IEX cumVolume ~1.5M fails the 10M screen — feed undercount is real and labeled); results/ gitignored (runs reproducible via seed+gitSha); multi-symbol = pooled independent sims.
Open: G3b historical snapshot backfill in flight (SEC-XBRL PIT mcaps + checkpoints); then the 90-day real-data validation run → ledger + QA gate → report-card PAUSE. IEX volume undercount may need a documented screener param decision (consolidated-volume source or labeled v1-iex threshold) — quant-strategist + architect, never silent.

## 2026-07-11 — Quant Strategy Lab G2: StrategySetup + gapper-ORB codified ✅
Shipped: Minimal PIT-only StrategySetup contract/catalog and deterministic gapper-ORB v1 screen/entry/exit signal using captured real fixtures; provider minute-start timestamps normalize to bar-close before PIT persistence.
Decisions: Setup emits PATTERN_ANALOG-compatible signals but never sizes/executes; unchanged Sharia veto + risk envelope remain downstream; v1 stays long-only, zero-LLM, low-conviction and explicitly CODIFIED—not validated.
Open: G3 must implement next-bar/cross-spread fills, participation caps, walk-forward/OOS, Deflated Sharpe and seeded Monte Carlo; no performance claim exists yet.

## 2026-07-11 — Quant Strategy Lab G1: intraday real-data spine ✅
Shipped: Additive IntradayBar/SymbolSnapshot migrations; explicit fixtures→Yahoo→Alpaca-IEX tiers; resumable 90-day/60-minute-overlap backfill; signed bounded cron; Eastern-session PIT snapshots; 10 captured-real symbol-days (3,598 bars, 667 KB; gapper+controls) with integrity tests.
Decisions: Strategy-lane fixtures remain real provider downloads only; captured prior closes + SEC-XBRL shares produce PIT market caps; bar/mcap provenance stays separate; keyless mode cannot activate Alpaca from ambient keys; empty passes never write snapshots.
Open: G2 StrategySetup + gapper-ORB is next, then G3 backtest/Monte Carlo and the mandatory user report-card pause; IEX coverage remains partial and must be reflected in validation claims.

## 2026-07-11 — Quant Strategy Lab G0: contract, ledger, research RAG, continuation brief ✅
Shipped: QDR-6 + §9b roadmap in QUANT_DESIGN.md (deterministic intraday gapper lane, MC promotion gate, honest-expectations policy); docs/STRATEGY_LAB.md ledger (11 setups tiered + research anchors); 8 research docs seeded into ResearchDoc RAG; docs/QUANT_LAB_PLAN.md — the cross-AI continuation brief with the full G-1→G6 status DAG.
Decisions: USER DIRECTIVE — no mock/synthetic data in the strategy lane; fixtures = captured REAL bars; tiers = real fixtures → Alpaca free backfill → Yahoo keyless. Strategy lane is LLM-free ($0 recurring). Long-only cash, NASDAQ-first, AUTO_PAPER only. Alpaca paper keys verified live.
Open: G1 data spine in flight (data-engineer); G2/G3 next; STOP after G3 for the validation report card. Alpaca paper account has negative cash from old margin paper trades — G4 envelope must limit by cash, not buying power. Cold-start from docs/QUANT_LAB_PLAN.md.

## 2026-07-11 — Free-first runtime and quota controls ✅
Shipped: Zero-outbound bundled defaults, explicit app/Quant LLM opt-ins, five-call live Quant ceiling, one-call bilateral debate, deterministic PM fallback, incremental bar ingestion, cached Sharia universe, conservative automation caps, offline Fear/Greed, and CI cancellation.
Decisions: Generic OpenAI keys never activate Quant; market data requires `MARKET_DATA_MODE`; local quiz/HOLD content is the honest default; no Redis, queue, vector DB, worker, PSP, or live broker is required.
Open: Hosting/PostgreSQL cost depends on provider and Saudi data-residency needs; free model/vendor quotas are not guarantees; bundled Sharia/fundamentals remain explicitly demo/unverified.

## 2026-07-11 — Portfolio truthfulness and rebalance integrity ✅
Shipped: Hardened manual/cron rebalancing with Bearer auth, fresh marks, stable Alpaca client IDs, bounded fills, validated broker results, signed audit rows, deterministic portfolio views, and expanded regression coverage.
Decisions: A shared non-expiring per-user execution lock serializes every trade path; unlabeled `cashVirtual` is never assigned a currency or combined into NAV; mock Sharia screens remain explicitly unverified/demo-qualified.
Open: A crashed worker can strand the execution lock and needs operator cleanup; persist an owner-token lease only through a generated migration when recovery automation is required. Complete the outstanding DR-12 visual-token/accessibility cleanup separately.

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
