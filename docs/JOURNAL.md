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

## 2026-07-19 — R4-B2 nightly incubation evaluation ✅
Shipped: Signed after-close evaluator backfills each missing per-book B1 snapshot date, marks it against real persisted SPY/SPUS closes, and atomically upserts its `BookEvaluation`.
Decisions: lazy-dev rung 2 reused `PortfolioSnapshot`, `BookEvaluation`, existing metrics, B1’s owner/watermark rules, and `AutoRunClaim`; drawdown or tracking-error breaches latch bench state, and only a later revalidation can clear TE state.
Verify: security PASS; focused B2/B1/cron 21/21 plus lint/tsc/Prisma validate/migrate-status/diff clean; full Vitest 1003/1011 with only the same eight pre-existing failures.
Open: B2 requires the existing signed cron plus a PARENT+ULTRA `QUANT_INCUBATION_OWNER_USER_ID`; B2 deliberately emits no benchmark mark when real SPY/SPUS data is absent.

## 2026-07-19 — R4-B1 daily incubation-book automation ✅
Shipped: One signed daily pass for the four exact QDR-8 books through `simulateStrategyBook`, with generated AllocationDecision/BookEvaluation persistence, durable isolated ledgers, allocator wiring, claim leases, breaker, Sharia veto, and InternalSim execution.
Decisions: lazy-dev rung 2 reused allocator/engine/autoRun/executeDecision; strategy-scoped ledgers never touch the owner wallet and fail closed on replay drift, each book stays ≤40%, Alpaca is data-only, and every output carries the unpromoted-paper label.
Verify: security PASS + lint/tsc/Prisma validate/migrate-status/diff clean; focused B1 suite 54/54; full Vitest assertions 993/1001 with the same eight pre-existing failures (final run also hit transient Neon cleanup reachability in quant-eval).
Open: B2 nightly evaluation is next; no deployment performed; production needs `CRON_SECRET` and a PARENT+ULTRA `QUANT_INCUBATION_OWNER_USER_ID`.

## 2026-07-19 — QDR-8 amended (2026-07-19b): internal-sim $1M bankroll, no Alpaca reset ✅
Shipped: QDR-8 + R4 preamble/B1 row/G4 status row amended — the Alpaca paper account cannot be reset (verified live: cash −$82,800.08, buying power $0), so the $1,000,000 bankroll lives in the InternalSimBroker isolated Decimal book ledgers, marked from real persisted bars with the existing cost/slippage fills; Alpaca demotes to data-only.
Decisions: annotate-don't-delete supersession notes; the optional legacy-liquidation Alpaca-mirror pass is gated (explicit user auth + security-auditor) and explicitly OUT of B1 scope; cash-never-buying-power now binds the virtual book cash.
Open: a parallel writer (Codex, B1) is active in the tree (schema AllocationDecision/BookEvaluation + allocator incubation admission observed uncommitted) — B1 still requires a GENERATED prisma migration and the mandatory security-auditor gate before acceptance.

## 2026-07-19 — QDR-8 paper INCUBATION tier + R4 briefs + Kimi routing ✅
Shipped: QDR-8 in QUANT_DESIGN.md (paper-only incubation books for the 4 positive-OOS near-misses, $1M reset envelope, promotion path v2 = 63 live book-days + single FULL card, daily-target readout policy, token-economy caps, zero-cost Sharia tiers); R4 Codex briefs B1/B2/C1/D1/E1–E5 in QUANT_LAB_PLAN.md; kimi-k2.6:free as implementation fallback in models.map.json.
Decisions: incubation supersedes "only ACCEPTED trades" for the paper tier ONLY (user-authorized per version, REJECTED cards stand unedited); no whole-market runs ever (25-name sleeve / halal top-100 caps); halal universe from published SPUS/HLAL holdings + own SEC-XBRL AAOIFI screener, no scraping, fail-closed; Kimi K3 has no free route — excluded.
Open: A2 user action pending — reset Alpaca paper account to $1,000,000 in the dashboard, then `node scripts/verify-alpaca.mjs`; B1–E5 to be delivered by user to Codex (cold-start: QUANT_LAB_PLAN.md R4); security/i18n/design gates stay in the Claude session.

## 2026-07-19 — Exclusive Next.js workspace lifecycle guard ✅
Shipped: Wrapped `dev`, `build`, and `start` with one atomic workspace lock that rejects concurrent Next.js writers and automatically replaces malformed or dead-PID locks, preventing cross-page `.next/vendor-chunks` corruption.
Decisions: lazy-dev rung 3 used Node's exclusive file creation and the already-installed `tsx`; no dependency or Next.js upgrade was needed because the reproduced cause was two Antigravity-launched dev trees sharing one `.next` directory.
Verify: duplicate dev/build rejection passed; clean dev returned 200 for `/ar/dashboard`, `/ar/academy`, `/ar/quant?section=teams`, and `/ar/markets`; lint/tsc/build/diff clean and focused tests 5/5 green.
Open: no deployment performed; direct `next dev` bypasses npm-script protection, while an abrupt terminal kill may leave a harmless stale lock that the next guarded invocation removes.

## 2026-07-18 — Quant Advisor + Strategy Teams unified workspace ✅
Shipped: Combined the real strategy validation lab and evidence league with the Quant Advisor under one `/quant` entry, three accessible tabs, anchored Academy/deep links, and a legacy `/quant/league` redirect that preserves the selected setup.
Decisions: lazy-dev rung 2 reused RunLabPanel, StrategyLeagueClient, and the persisted committee; removed the separate Mavericks battle simulator and its fabricated prices/win rates/XP, while retaining deterministic Sharia and risk gates as vetoes rather than votes.
Verify: lint/tsc/production build/diff clean; focused quant/integration/i18n 14/14 green; browser-verified ar RTL desktop + en 390×844, tab switching, exact legacy redirect, one Quant nav entry, anchored mobile landing, and zero horizontal overflow.
Open: no deployment performed; production build retains pre-existing next-intl cache and jose Edge-runtime warnings.

## 2026-07-18 — Cinematic Academy strategy journey ✅
Shipped: Turned the Academy risk-comfort entry into a reversible four-scene scroll journey—risk context → exact strategy match → answer/seal/compare contract → interactive three-strategy selector—with a normal-flow reduced-motion version.
Decisions: Adapted the MIT cinematic-scroll-prompt-kit pattern using existing Framer Motion and semantic DOM/CSS layers only; transforms stay local to one sticky timeline, final controls remain native buttons/links, and all simulation/Sharia framing stays intact in Arabic and English.
Verify: lint/tsc/build clean; Academy/learning/i18n 77/77 green; headless visual QA passed ar RTL desktop + 390×844 and en LTR with zero overflow, exact matched URL, reverse-scroll restoration, no browser exceptions, and reduced-motion fallback.
Open: no deployment performed; the scene contract and asset manifest are documented in docs/ACADEMY_CINEMATIC.md for future art-direction changes.

## 2026-07-18 — Risk-comfort strategy matching entry ✅
Shipped: Replaced Academy's direct strategy CTA with an explicit lower/balanced/higher risk-comfort selector that reveals one exact reviewed strategy, its educational match rationale, then routes into that setup's existing questions → seal → replay comparison.
Decisions: lazy-dev rung 2 maps to three existing DR-14 modules without persisting or inventing a suitability profile; copy states the match is simulation-only, not financial profiling or advice, and every strategy can lose; shared lab overview made strategy-neutral so non-Bollinger matches stay truthful.
Verify: lint/tsc/build clean; Academy/learning/i18n 76/76 green; browser-verified all 3 ar setup routes, en matched route → correct curriculum, ar/en 390×844 zero overflow and 48px CTA.
Open: no deployment performed; risk selection is intentionally session-local and educational rather than a stored investor profile.

## 2026-07-18 — Academy strategy answer-and-compare entry ✅
Shipped: Added a bilingual Practice Lab entry to /academy that explains answer → seal → compare, names the learner/reviewed-strategy/SPUS/SPY comparison set, and opens the existing seven-question sealed replay under /academy/apply; league learning links now use the same Academy route.
Decisions: lazy-dev rung 2 reused the DR-14 StrategyLearningLab and frozen replay instead of duplicating UI or quant logic; the entry remains gated behind the diagnostic profile so first visit is still diagnostic-only.
Verify: lint/tsc/build clean; Academy + learning integration 75/75 and i18n 9/9 green; browser-verified ar RTL desktop + 390×844 and en 390×844 with zero overflow, 48px CTA, and the Arabic first question opening correctly.
Open: no deployment performed; the unbounded repository-wide Vitest command was stopped after exceeding the verification window, while all affected suites passed in isolation.

## 2026-07-18 — Dashboard hierarchy and truthful learning progress ✅
Shipped: Rebuilt /dashboard around a portfolio-value/P&L hero, compact persisted-XP learning card, quieter supporting KPIs, semantic chart colors, accessible level dialog, and removed the contradictory hardcoded sidebar level summary.
Decisions: lazy-dev rung 2 reused the loaded GamificationProfile, existing tokens/components, and Academy route; client-only daily XP was removed because presentation must never fabricate persisted progress.
Verify: lint/tsc/production build/diff clean; DashboardClient 10/10 + i18n parity green; browser-verified ar desktop + 390×844 RTL and en desktop with zero horizontal overflow.
Open: full Vitest remains red on 8 unrelated pre-existing failures (Academy cross-user fixture, two authz capability expectations, portfolio stale GOOGL marks/timeout, quant-eval timeout); no deployment performed.

## 2026-07-18 — Academy landing as continuous journey path ✅ (deploy #7)
Shipped: /academy rewritten as one winding node path (persona start marker → single loud current-step node → muted upcoming beads → chapter waypoints via details linking to the user's Duolingo track roadmaps); diagnostic-first gate preserved; matching skeleton; fixed client-bundle regression (schema.ts now imports client-safe strategyLearningSetupIds, not the fs/zlib replay registry); authored Unit 6 third lesson `econ-u6-ai-sharia-screening` (hedged AI-screening content) restoring the ≥3-lessons invariant.
Decisions: no fake locks (honest ordinals), connector terminates at last node with opaque node backing, waypoints tint-only so exactly one accent-filled element, psychometric "Assessed Level" chip replaced with starting-path key, contrast floored at /55.
Verify: design gate 4 MED/3 LOW all fixed; lint/tsc/next build clean; vitest academy+adaptive+diagnostic 97/97 incl. economicsTrack 10/10; en/ar key identity.
Open: live 390px/ar visual walkthrough still recommended (all verification code/build/test-based); LESSON_XP stays a UI-mirrored literal until a shared constants module exists.

## 2026-07-18 — Portfolio paper-money-only + honesty fixes ✅ (deploy #6 incl. user's parallel Academy commits)
Shipped: dashboard omits every unavailable-value card whole (auto-fit KPI reflow), Alpaca tab renders only with ready data, real-empty ledger reaches the honest noTransactions state (was: unlabeled demo rows — HIGH), demo-derived Zakat shows "not payable" instead of the live pay button, allocation-donut ghost wrapper gated, dead currencyTotals plumbing removed; deploy also carries the user's 10 parallel commits (Duolingo roadmaps, XP claim + Level modal, colored feedback, wealth-building gating, new lessons).
Decisions: omission over placeholder per honesty rules; real zeros stay visible; source-contract tests lock the user's XP/Level markup untouched; demo-zakat caption is an inline bilingual string per this file's existing demo-badge convention (deviation from the messages-key rule, noted).
Verify: lint/tsc clean; DashboardClient 10 tests; design gate findings (1 HIGH/1 MED/2 LOW + zakat money-path note) all fixed; grep Unavailable → 0.
Open: XP/Level card values are hardcoded (350/Level 3) in the user's fresh commits — needs GamificationProfile wiring (flagged to user); AlpacaPaperPortfolioView still passes the ignored currencyTotals prop; DR-20/M15 (outcome contracts, presentation profiles, difficulty variants) proposed, awaiting user go-ahead to codify.

## 2026-07-17 — Academy diagnostic-first reveal + apply-learning loop ✅ (deployed)
Shipped: first Academy visit renders ONLY "أسئلة نقطة الانطلاق" (diagnostic invite; hero/road/chapters gated on LearnerProfile existence); post-quiz "apply what you learned" CTA routes to /quiz?setupId= (StrategyLearningLab learner-vs-strategy comparison) only when the practice unit co-locates a strategySetup practiceLink — honest absence otherwise, league links stay flag-hidden.
Decisions: skip still creates the default profile and reveals the journey; when the apply CTA is present, continue-journey demotes to ghost so one accent primary remains (design LOW fixed inline).
Verify: design gate all 5 acceptance PASS; lint/tsc/vitest 97/build clean; en/ar key identity.
Open: /quiz destination surface has pre-existing craft debt (inline locale ternaries, tab chrome) — separate ticket; `&apply=` href append assumes ?-bearing quiz href (worth a unit assertion); live 390px/RTL visual pass still recommended.

## 2026-07-17 — Academy story journey + quiz folded into Academy ✅ (deployed)
Shipped: Academy landing restructured as progressive narrative — diagnostic beat → single loud "current step" hero → muted what's-ahead timeline → collapsible per-track Chapters (native details/summary, current track pre-expanded); new /academy/practice?topic= route embeds the existing QuizModal in Academy chrome (breadcrumb, inline pass/fail + retry-save, restart, continue-journey loop); quiz-kind practiceLinks repointed from /quiz; shared quizTopics module extracted.
Decisions: story = presentation over the deterministic nextUp queue, never a new access rule; accessible content collapsed, never fake-locked; save-failure keeps the earned outcome visible with an actionable retry; /quiz remains functional.
Verify: design gate (3 MEDIUM/2 LOW fixed), i18n/Sharia gate zero edits; lint/tsc/next build clean; vitest academy+adaptive+diagnostic 97; en/ar key identity.
Open: no live-browser 390px/RTL walkthrough executed across these passes — one manual visual QA of academy + practice pages recommended; practice.title/eyebrow both read "Practice" (cosmetic).

## 2026-07-17 — M14 Dynamic Academy: diagnostic + LearnerProfile + adaptive Next-Up ✅ (deployed to Vercel)
Shipped: 7-question bilingual zero-LLM diagnostic + deterministic scorer (src/academy/diagnostic), LearnerProfile migration on Neon + self-only profile API with 10s re-take cooldown + in-transaction signals aggregation, pure `nextUp` recommender (6 rules, never widens can() access), and the Academy onboarding stepper + max-5 Next-Up queue UI; three Vercel prod deploys (baseline flag-off slice → foundation → UI), latest `rushd-1pylosde3` lineage via `npx vercel deploy --prod`.
Decisions: incomplete answer sets fall back to defaultProfile (no partial-answer persona skew); isChild persona ceiling in the scorer; persona framed as adjustable "starting path" (نقطة انطلاق) in both locales; signals read-back zod-guarded; MarketsClient got the four M13 workspace props (optional, unconsumed) to unblock `next build` type errors.
Verify: qa PASS (7 code-read invariants), security PASS (3 LOW findings fixed), i18n/Sharia PASS zero edits, design findings (2 MEDIUM/4 LOW) fixed; lint/tsc/next build clean; focused vitest 97+10 tests; en/ar key identity intact.
Open: no live-browser 390px/RTL walkthrough of the final fix pass — recommend one manual look at the held busy-state transition; scorer thresholds are first-pass calibration pending real answer distributions (OQ-12); pre-existing portfolio.test.ts stale-mark failures remain untriaged.

## 2026-07-17 — DR-19 adaptive Academy contract + Strategy-Teams presentation flag ✅
Shipped: SYSTEM_DESIGN.md amended — DR-19 (LearnerProfile, zero-LLM 6–8-question diagnostic + deterministic `nextUp` recommender bounded by the DR-16/DR-17 `can()` guard), M14 milestone table, OQ-12, §4 LearnerProfile row; `SHOW_STRATEGY_TEAMS=false` in src/lib/featureFlags.ts hides the nav entry, quant hero card (+conditional grid, gated view-model fetch), StrategyLearningLab deep link, and 404s /quant/league — DR-14 engine/APIs/data untouched.
Decisions: age never enters LearnerProfile (stays on parent-set User.ageSegment); persona is an adjustable "starting path", never psychometric; League hidden by presentation flag, not deletion — practiceLink invariant preserved; message keys "teams"/"teamsShort" retained for key identity.
Verify: lint clean; tsc clean except pre-existing markets/page.tsx fundamentalsAnnual error; vitest learning+academy 22 files/119 tests; en/ar 962-key identity; qa-reviewer PASS; design-reviewer findings (dead 22rem grid track, dead league fetch) fixed and re-verified; flag-ON round-trip restores all surfaces.
Open: M14 implementation (diagnostic content+scorer, LearnerProfile migration+signals API with security gate, adaptive recommender TDD, Arabic/Sharia diagnostic review) queued after M13; OQ-12 persona taxonomy awaits first cohort data.

## 2026-07-17 — M12 Academy B5 learner UI + family segment controls ✅
Shipped: server-filtered en/ar Academy catalog→track→lesson→checkpoint→progress, exact theory→quiz/strategy links, Academy navigation, and parent-set KIDS/TEENS controls at child creation and family settings.
Decisions: lazy-dev rung 7 reused the registry, `can()`, B4 APIs, and native Next routes; inaccessible content never enters child props, checkpoint state is the only client leaf, and all four ui-craft states fail honestly.
Verify: focused 60/60, lint/TypeScript/diff clean; QA/security/design PASS; en desktop and ar RTL 390×844 walkthroughs passed with exact quiz opening, saved checkpoint, 12px adaptive nav, no overflow or console errors.
Open: full Vitest reached 128/130 files and 921/926 tests; only pre-existing quant shared-DB/time-budget failures remained (`portfolio.test.ts` 4, `quant-eval.test.ts` 1), reproducible in isolation and unrelated to Academy files.

## 2026-07-17 — M12 Academy B4 progress, gates, and parent-set age segment ✅
Shipped: generated/applied `User.ageSegment` + `AcademyProgress`, auth-scoped progress/completion APIs, parent-controlled KIDS/TEENS settings, server-side DR-16 tier + DR-17 segment gates, and fixed +20 XP completion through `addXP`.
Decisions: lazy-dev rung 7 composed existing guards/registry/XP; null child segment fails closed to KIDS, completion is learner-self-only with server-scored checkpoint evidence, and the unique lesson key plus serializable transaction makes repeats no-ops.
Verify: Prisma validate/status clean and DB up to date; Academy/family focused 15/15; lint and TypeScript clean; full Vitest 128 files / 919 tests; security re-review passed.
Open: B5 Academy UI is next; OQ-10 human Sharia-board review still gates final curriculum approval.

## 2026-07-17 — M10-L8 universal league learning gate ✅
Shipped: every one of the nine visible league teams now routes to its exact lesson, while detailed metrics, historical comparison, and trade ledger render only after that setup's sealed result.
Decisions: removed the unsupported-team evidence bypass, kept unknown future setups fail-closed, and split client-safe setup IDs from the server replay registry so gzip/hash validation never enters the browser bundle.
Verify: focused 11/11; lint and TypeScript clean; en/ar 898-key identity; full Vitest 127 files / 913 tests; en desktop 1440×900 and ar RTL mobile 390×844 direct-URL/keyboard walkthroughs passed without overflow or console errors.
Open: M10 L7+L8 complete for the enumerated visible roster. Protected DR-14 terminal-period evidence run was not executed.

## 2026-07-17 — M10-L7 G6B wide-factor learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `g6b-linear-factor-wide`, exact memory-bounded v2 strategy-book replay, registry/API dispatch, and a gzip frozen real PIT fixture for the exact 2,473-name visible roster.
Decisions: locked source run `26f5f132-6bdf-48be-9ad9-2d370642ef53` and roster hash over a 2024-11-01→2024-12-31 evidence interval; production tradable-union restriction plus shared daily risk/fills; REJECTED remains research-only, unscreened, and execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 127 files / 912 tests; future/MOCK injections fail closed and all four normalized series align.
Open: L7 now covers every visible team; L8 universal evidence gate next. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 Stop-Hunt Reversal learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `stop-hunt-reversal-long`, exact v1 intraday-engine replay with prior-day-low preparation, registry/API dispatch, and a frozen PIT descriptor.
Decisions: reused the exact 11-name book, real consolidated prior-day lows, sweep/reclaim and 2R-or-VWAP rules, inverse-vol hint, and shared intraday risk/fills; REJECTED remains research-only and execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 126 files / 909 tests; future/MOCK injections fail closed and all four normalized series align at 100.
Open: only `g6b-linear-factor-wide` lacks a reviewed module; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 VWAP Reclaim learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `vwap-reclaim`, exact v1 intraday-engine replay, registry/API dispatch, and a versioned descriptor over the frozen captured-real PIT snapshot.
Decisions: reused the exact 11-name liquid universe, regular-session VWAP/absorption rules, inverse-vol hint, shared intraday risk/fills, and immutable real rows; REJECTED remains research-only, Sharia-unscreened, and execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 125 files / 906 tests; future/MOCK injections fail closed and all four normalized series align at 100.
Open: two visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 Stocks-in-Play ORB learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `stocks-in-play-orb`, exact intraday-engine replay, registry/API dispatch, and a frozen captured-real PIT fixture with two sealed sessions plus the minimum real opening-range warm-up.
Decisions: reused the setup's exact 11-name book, 14-session relative-volume reference, intraday risk/fill envelope, and immutable ALPACA/YAHOO rows; REJECTED remains research-only, Sharia-unscreened, and execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 124 files / 903 tests; future/MOCK injections fail closed and all four normalized series align at 100.
Open: three visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M12 Academy B0-B3: engine + 3-track curriculum + Arabic/Sharia review ✅
Shipped: DR-16 capability matrix `can()` slice (8feba5a); Academy content engine — zod schema with required bilingual fields/complianceTag/ageSegment/practiceLink + registry + 6 negative lint fixtures (6574971); v1 curriculum — Foundations (KIDS min, 16 lessons, age variants, riba HARAM/Mudarabah HALAL), Economics (TEENS, 15), Advanced Financial Analysis (ADULTS, 16, sukuk/arbun vs bonds/options, CFA no-affiliation disclaimer per OQ-9) = 47 bilingual lessons, every unit practice-linked (dd03992); i18n-fintech review PASS with 3 editorial fixes (df717c0).
Decisions: M11 slice landed early (matrix only — architect to note in M11; pre-existing PREMIUM child-seat 3-vs-4 discrepancy flagged); parallel-lane split with Codex (docs/handoffs/M10_L7_L8_CODEX_BRIEF.md, e86eb5e) — Codex owns M10 L7/L8, this lane owns src/academy/**.
Verify: `npx vitest run academy` 4 files/39 tests; full suite green at every commit; lint/tsc clean throughout.
Open: B4 (AcademyProgress + User.ageSegment migrations + API) BLOCKED on Postgres/Docker being down; B5 UI after B4; sukuk-generalization + arbun HALAL tag → OQ-10 human Sharia board before final; quiz TOPIC_ALLOWLIST worth exporting for cleaner content-test imports.

## 2026-07-17 — M10-L7 dual-momentum rotation learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `dual-momentum-rotation`, exact fixed seven-name strategy-book replay, and a frozen ≤6-month captured-real PIT fixture including HLAL.
Decisions: lazy-dev rung 2 reuses month-end ranking, 25%/one-position book policy, shared fills/risk, plus a capture utility hard-limited to 184 days; REJECTED stays research-only/execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 122 files / 891 tests; key identity green; future/MOCK injections fail closed and four lines align at 100.
Open: four visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 turn-of-month learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `tom-overlay`, exact fixed-SPUS strategy-book replay, shared closed-map compiler helper, and frozen ≤6-month captured-real PIT descriptor.
Decisions: lazy-dev rung 2 reuses observed-session eligibility, shared portfolio fills/risk, and the immutable SPUS snapshot; the REJECTED seasonal hypothesis remains research-only and execution-blocked.
Verify: focused 26/26; lint clean; TypeScript clean; full Vitest 121 files / 888 tests; key identity green; future/MOCK injections fail closed and all four lines start at exact 100.
Open: five visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 TS momentum v3 learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `ts-momentum-halal-basket-v3`, exact strategy-book replay with its volatility governor/holding cap, and frozen ≤6-month captured-real PIT descriptor.
Decisions: lazy-dev rung 2 reuses the v2 signal, shared portfolio engine, v3 book policy, and immutable daily snapshot; the REJECTED setup remains research-only and execution-blocked.
Verify: focused 16/16; lint clean; TypeScript clean; full Vitest 118 files / 861 tests; key identity green; future-bar injection fails closed and four series align at normalized 100.
Open: six visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L7 TS momentum v2 learning module ✅
Shipped: seven-question en/ar curriculum + bounded compiler for `ts-momentum-halal-basket-v2`, registry/API dispatch, generalized result types, and a frozen ≤6-month descriptor over the captured-real daily PIT snapshot.
Decisions: lazy-dev rung 2 reuses the exact v2 setup, shared daily risk/fill engine, and immutable Bollinger data snapshot; the REJECTED setup stays research-only and Sharia-unscreened/execution-blocked.
Verify: focused 28/28; lint clean; TypeScript clean; full Vitest 116 files / 850 tests; en/ar key-identity green; future-bar and MOCK-source injections fail closed.
Open: seven visible league teams still lack reviewed modules; L8 remains disabled. Protected terminal-period run was not executed.

## 2026-07-17 — M10-L6 Mavericks learning bridge ✅
Shipped: exact-team League→Learning deep links, setup-aware completion summaries, and a bilingual evidence gate for reviewed learning modules; Bollinger details stay closed until its sealed four-line comparison.
Decisions: lazy-dev rung 2/7 reuses DR-14 attempts/API/UI; unsupported teams show “module under validation” and retain labeled simulated evidence until a real setup-specific replay exists—no fabricated learner curve or universal lock yet.
Verify: focused 18/18, lint, TypeScript, diff clean; browser English locked→exact lesson and Arabic pending RTL with zero overlays/errors; full suite 111/113 files (821 passed, 2 skipped), with only 10 PostgreSQL-backed outcomes blocked by localhost:5432.
Open: L7 adds one reviewed curriculum/compiler/≤6-month PIT replay per visible team; L8 enables the universal gate only after full coverage. Protected terminal-period run was not executed.

## 2026-07-17 — Free composite Sharia screening source (Zoya-free) ✅
Shipped: CompositeShariaScreener behind DR-4 (opt-in SHARIA_SOURCE=composite): real SPUS holdings (216 tickers, asOf 2026-07-16, fetched from the fund's own CSV; META absence re-verified genuine), honest empty HLAL/Saudi-list stubs (403s documented; scripts/refresh-sharia-snapshots.ts only overwrites on verified parse); ShariaVerdict.compliant widened to boolean|null with fund-absence⇒UNKNOWN, never non-compliant.
Decisions: QA hunt caught pre-existing `?? true` verdict inflation at trade + zakat money boundaries — both now fail-closed (`=== true`); deriveShariaState: any null verdict ⇒ UNSCREENED_EXECUTION_BLOCKED (never claims VERIFIED for an unscreened name); Zoya still wins when both sources configured.
Verify: lint ✔ · tsc clean · vitest 112 files / 826 tests · SPUS spot-check: JPM/BAC/BUD/STZ/WFC/GS absent, AAPL/MSFT/NVDA present · flag-unset behavior byte-identical.
Open: security-auditor pass gates production enablement of SHARIA_SOURCE=composite (default off); StockDetail null-verdict rendering deferred to M13-3; HLAL + Saudi TASI list await a working free source via the refresh script.

## 2026-07-17 — PIP.world Market Mavericks 3D Character Avatars ✅
Shipped: Generated 8 ultra-high quality 3D Maverick character portraits (Quant Core, Trend Surfer, Halal Guardian, Sentiment Radar, Value Anchor, General Commander, Academic Scholar, Shield Warden) for the PIP.world Market Mavericks AI Arena; integrated into `MavericksSquadPanel.tsx`, `CommitteePipeline2D.tsx`, and `public/avatars/`.
Decisions: full 8-archetype agent roster with custom abilities, quotes, and stats; zero external asset dependencies.
Verify: 112 test files / 823 unit tests passed 100%; lint and tsc --noEmit clean.

## 2026-07-17 — M13-2 stock-workspace shell ✅
Shipped: replaced the stock tabs with one sticky bilingual evidence header, verdict/provenance chips, and the ordered S1–S13 anchor/scroll-spy workspace; unavailable sections now say so instead of rendering fabricated analysis.
Decisions: lazy-dev rung 2/7 reused native anchors, IntersectionObserver, and existing panels; the pre-spend “1 of 5” view is driven only by a server access state, while the no-key/no-database path remains usable and the workspace mounts once across breakpoints.
Verify: focused 4/4, lint, TypeScript, and diff checks pass; clean EN/AR browser runs show 13 unique links/sections, RTL, zero overflow, no overlay/errors; full run reached 109/111 files (794 passed, 2 skipped), with only 10 PostgreSQL-backed outcomes blocked by localhost:5432.
Open: M13-3 Sharia verdict/purification detail is next; M11 must supply the real meter entitlement/spend transaction before the pre-spend branch can be exercised end-to-end.

## 2026-07-16 — M13-1 stock-workspace data contract ✅
Shipped: provider-wide 5y/8q fundamentals history, earnings calendar + next date, and market-specific filings links with deterministic bundled NVDA/Aramco fixtures; removed the fabricated analyst-rating field and UI card.
Decisions: lazy-dev rung 2/7 extended the existing registry and façade with zero dependencies, schemas, auth, or external-key requirements; live adapters expose honestly labeled bundled-demo fundamentals until a vendor is selected.
Verify: focused market suites 19/19, lint, TypeScript, i18n parity, and diff checks pass; full run reached 107/109 files (785 passed, 2 skipped) with only 10 PostgreSQL-backed outcomes blocked by the unavailable Docker daemon/localhost:5432.
Open: M13-2 workspace shell/anchor rail is next; the legacy tab shell and later M13 UI/data wiring remain intentionally untouched.

## 2026-07-16 — R3-4b wide-factor FULL verdict ✅
Shipped: bounded shared-book plateau heap without calendar drift, then completed the single FULL wide run: 2,767 symbols / 4,481,246 resolved real bars / 2 MOCK excluded; result JSON + BacktestRun `fff3d286` persisted.
Decisions: lazy-dev rung 2 reused the compact universe and engine; v2 is REJECTED on sample, OOS, DSR, 54.86% MC p95 drawdown, FULL plateau, and Sharia-verification gates; the stronger 2Y view cannot rescue or retune it.
Verify: corrected 2Y diagnostic reproduced all prior metrics exactly; FULL clean SHA `ff73b4f`; lint/TypeScript/diff clean; 109 test files / 792 tests passed with no file parallelism.
Open: no AUTO_PAPER admission; G6a/RL remains parked; next frozen hypotheses are bagholder-bounce then time-of-day unless reprioritized.

## 2026-07-16 — Realized Stock PnL Clean Layout Reorganization ✅
Shipped: Segmented control view switcher separating Stock Breakdown Cards from the Searchable Trade Ledger on /quant/league to prevent page clutter and long scrolling; Stock Cards grid with hero PnL badges, win-rate progress bars, and average return tags.
Decisions: modularized layout using responsive 3-column grid cards and sticky header searchable trade table.
Verify: lint clean; tsc --noEmit clean; 109 test files / 790 unit tests passed 100%.

## 2026-07-16 — Strategy League Team Performance Details UI/UX Enhancement ✅
Shipped: Redesigned Team Performance Details drawer on /quant/league with ambient HSL gradient ring, 4 quick KPI stat cards (OOS CAGR, Sharpe Ratio, 95% MC Drawdown, Realized Net PnL), interactive progress win-rate bars on asset sleeve breakdown, trade search/filter bar for the exact trade ledger, and copyable Git SHA facts card.
Decisions: maintained zero-regression performance and EN/AR RTL translation alignment.
Verify: lint clean; tsc --noEmit clean; 109 test files / 790 unit tests passed 100%.

## 2026-07-16 — PIP.world Market Mavericks AI Arena Parity ✅
Shipped: Glass-Box AI Agent Personality cards for all 8 quant committee archetypes (Quant Core, Trend Surfer, Shield Warden, Sentiment Radar, Value Anchor, Halal Guardian, Academic Scholar, General Commander) with stats for Discipline %, Risk Level, Speed, Win Rate, and Special Abilities; Squad Drafting drawer & customizer; Live Market Battle Run simulator with real-time agent reaction stream and XP progression.
Decisions: integrated directly as a tab inside /quant (CommitteeClient.tsx) with full bilingual EN/AR translation parity.
Verify: lint clean; tsc --noEmit clean; 109 test files / 790 unit tests passed 100%.

## 2026-07-16 — ValueSnapshot UI/UX feature parity suite ✅
Shipped: 4-model interactive Valuation Suite (DCF, EPS Growth, Rule of 40, PEG Ratio) with 5x5 dynamic sensitivity matrices; Opportunity Matrix with 4 rating dimensions; multi-peer side-by-side comparison engine with best-in-row badges; multi-year Income, Balance Sheet, and Cash Flow statement explorer.
Decisions: built client-side recalculation engines for all 4 valuation models with conservative/moderate/aggressive scenario presets; maintained EN/AR translation parity and RTL responsive layout.
Verify: lint clean; tsc --noEmit clean; 109 test files / 790 unit tests passed 100%.
Open: expand real financial statement backfills as additional SEC/Yahoo provider feeds land.

## 2026-07-16 — TASI market option + DR-15..18 design amendment ✅
Shipped: NASDAQ/TASI switcher on /markets (aria-pressed segmented control, .SR deep links, initialMarket threading, 4 new Markets.* keys) hardened through qa-reviewer (2 findings fixed) + design-reviewer (5 fixed: a11y roles, focus ring, light-theme chrome, quote pruning, localized sync string); SYSTEM_DESIGN.md amended — DR-15 account shapes (SOLO/parent-only/family on unchanged Role enum), DR-16 Solo+Family priced plans × capability-matrix tiers + metered workspace, DR-17 age-segmented Academy (KIDS/TEENS/ADULTS), DR-18 stock workspace at ValueSnapshot feature parity with labeled educational valuation models; M11–M13 (M13 provisional), OQ-8..11.
Decisions: valuation copied as editable labeled educational models, never unlabeled verdicts; solo/family is derived state (children.length), no schema role change; tiers gate capabilities, child seats Family-plan-only.
Verify: lint ✔ · tsc clean · vitest 109 files/789 tests · en/ar key-identical 805 · /en+/ar/markets 200 with both labels · ?symbol=2222.SR&market=TASI renders Aramco.
Open: M13 work items finalize after docs/STOCK_WORKSPACE_SPEC.md (recon landed 35ab043 — C2 next); TASI quotes static-priced 15/172 until a TASI feed exists.

## 2026-07-16 — ValueSnapshot stock-page recon ✅
Shipped: a 556-line public-session inventory of all ten stock tabs, shared shell, controls, data fields, responsive/error/locked states, free-versus-paid boundaries, and 22 referenced screenshots.
Decisions: captured feature logic and information architecture in original language; inaccessible trial content is explicitly marked unobservable, and no account was created or hidden report structure inferred.
Verify: every screenshot reference resolves; desktop and 375px mobile evidence checked; lint/TypeScript clean; 109 test files / 790 tests passed; `git diff --check` clean.
Open: trial-only Financials rows and AI/Snapshot/Earnings report-generation flows require separately authorized account evidence if deeper parity is later needed.

## 2026-07-16 — Quant committee narrative workspace ✅
Shipped: a responsive en/ar Quant hero, consolidated evidence readiness, guided paper-automation/review setup, and a theme-native committee board with accessible recorded history.
Decisions: lazy-dev rung 2 retained the existing 2D committee visualizer and APIs; restrained gradients express hierarchy, while automation copy now names authenticated server, risk, Sharia, and kill-switch boundaries without a 24/7 claim.
Verify: full lint and TypeScript clean; 109 test files / 790 tests passed; browser-verified en/ar, RTL, light/dark, and 390px mobile with no horizontal overflow.
Open: portfolio analytics retains its older dense visual language for a later contained pass; auth and the prohibited terminal-period evidence run were untouched.

## 2026-07-15 — Theme-responsive controls + Gross exposure list + Range formatting + Timeframes ✅
Shipped: light/dark theme AI Board controls, Gross exposure list legend, formatted day/year ranges & open/prevClose to 2 decimals, and TradingView-like timeframes (1H, 2H, 4H, 1D, 1W) with dynamic resampling.
Decisions: replaced hardcoded theme hex codes with tailwind-responsive standard classes; listed positions with colored indicators; called toFixed(2) on range/price variables; built a deterministic pseudorandom intraday resampler.
Verify: lint/TypeScript/i18n clean; ran `npm run dev` and verified test suite passing 770/773 (with the same three pre-existing AMD failures).
Open: monitor exposure changes and range values across other stocks pages.

## 2026-07-15 — Market breadth + focused strategy comparison UI ✅
Shipped: semantic session gradients, honest 15/82 quote coverage with six-symbol theme previews, top-ranked persisted strategy curves, and a single canonical Alpaca paper view in Portfolio.
Decisions: unavailable quotes are omitted instead of fabricated at 100/0%; unpriced themes remain neutral, missing historical curves are named rather than inferred, and lower-ranked selections pin only when evidence exists.
Verify: focused 12/12, lint/TypeScript/i18n clean; browser-verified en/ar, RTL, market gradients/coverage, top comparison curves, Quant without Alpaca, and Portfolio with Alpaca; full suite 770/773 with the same three stale-AMD fixture failures.
Open: only two of the current top three league teams persist same-period historical curves; the third remains absent until a bounded reproducible run records it, and the prohibited terminal-period run was not executed.

## 2026-07-15 — M9 shared investing dashboard hierarchy ✅
Shipped: one investing-first Rushd/Alpaca dashboard with a non-duplicated account strip, evidence-first performance, detailed holdings, restrained allocation/risk/order support, and an empty-state-safe light/dark token pass.
Decisions: lazy-dev rung 2 retained the shared data component; removed the false autopilot-active claim and legacy neon/dark-only chrome, preserved the explicit 2D committee choice, and fixed a deterministic SVG-title hydration mismatch.
Verify: focused 10/10, lint/TypeScript/i18n clean; browser-verified live Alpaca + empty Rushd views in en/ar, RTL, zero overflow, selected-range semantics, and no runtime overlay; full suite 758/768 with 10 PostgreSQL-backed outcomes blocked at localhost:5432.
Open: continue M9 on the remaining non-auth surfaces; automation/paper books remain gated on an ACCEPTED strategy, and neither auth nor the prohibited terminal evidence run was touched.

## 2026-07-15 — Institutional landing experience revamp ✅
Shipped: a full-width en/ar investing journey with a learning-loop narrative, honest practice receipt, strategy comparisons, guardrail cards, calm CTA hierarchy, and responsive light/dark states.
Decisions: investing practice now owns the primary conversion instead of family registration; lazy-dev rung 2 reused the server page, tokens, Lucide, and static hero without a new dependency or 3D payload.
Verify: lint/TypeScript/i18n parity clean; browser-verified en/ar copy, RTL direction, and zero overflow; full suite 754/764 with 10 database-backed outcomes blocked because PostgreSQL was unavailable.
Open: this improves the landing slice but does not falsely close the broader M9 token migration; auth and the prohibited terminal evidence path were untouched.

## 2026-07-15 — R3-5 deterministic tournament allocator core ✅
Shipped: a pure QDR-7 allocator with 63-day prior shrinkage, drawdown-penalized scoring, seeded tie ranking, 40% water-filled caps, and residual cash.
Decisions: only ACCEPTED, complete-evidence, VERIFIED_COMPLIANT modes score; drawdown benches, tracking-error revalidates, implausibility disqualifies, and Decimal zero is tested explicitly.
Verify: focused 8/8, lint/TypeScript/diff clean; full suite 761/764 with only the same three stale-AMD portfolio fixture failures.
Open: R3-6 remains gated on at least one ACCEPTED team plus its security review; no persistence/cron/broker/auth work or prohibited terminal-period run occurred.

## 2026-07-15 — L5 spaced retrieval + process-only XP ✅
Shipped: exact-once mastery events, +20 completion/+15 reflection/+15 delayed retrieval through `addXP`, latest-attempt resume, and bilingual mastery UI with a 24-hour recall gate.
Decisions: XP inputs are only milestone kind/response/correctness—never replay P&L or rank; serializable event+XP writes reject racing response changes, with no streak punishment or random reward.
Verify: focused 31/31, migration/lint/TypeScript clean, browser proved 20→35/50 persistence and en/ar mobile RTL; full suite 753/756 with only the same three stale-AMD portfolio fixture failures.
Open: Strategy Learning L0–L5 is complete; the prohibited terminal evidence period and authentication work were not touched.

## 2026-07-15 — L4 strategy mastery loop + honest comparison ✅
Shipped: the Learning page now guides concept → retrieval → bounded policy → immutable seal → four-line learner/team/SPUS/price-only-SPY comparison with risk details and mechanism explanations.
Decisions: curriculum copy is public but executable bounds stay server-only; outcomes remain hidden until seal, retries are labeled, and Sharia-unverified execution stays blocked while educational replay remains visible.
Verify: focused API 10/10, lint/TypeScript clean, English sealed-result and 390px Arabic RTL browser checks with zero warnings/errors; full suite 740/743 with only the same three stale-AMD portfolio fixture failures.
Open: L5 adds delayed knowledge retrieval, reflection, and XP based only on process completion; the prohibited terminal evidence period was not run.

## 2026-07-15 — L3 sealed strategy-learning attempts + API ✅
Shipped: generated/applied `strategy_learning_attempts` migration, immutable sealed attempt + separate result models, and authenticated POST/GET/PATCH APIs with family-scoped access.
Decisions: lazy-dev rung 2 reuses authz, Prisma transactions, L1 compiler, and L2 replay; attempt is inserted before outcome computation, result completion is one-to-one/idempotent, and retries append numbered rows.
Verify: focused L2+L3 13/13, Prisma validate/status and lint/TypeScript clean; full suite 739/742 with only the same three pre-existing stale-AMD portfolio fixture failures; security review PASS.
Open: L4 builds the en/ar mastery-loop UI over this API; no broker, XP, promotion verdict, or prohibited terminal-period backtest was introduced or run.

## 2026-07-15 — L2 short deterministic learner replay ✅
Shipped: a DB-free Bollinger learning adapter plus a committed 7,290-row REAL Yahoo fixture covering the exact 25-name team universe, SPUS, and SPY over a three-month measured interval.
Decisions: preserved production next-open fills/costs and risk envelope; retained warm-up/PIT state before the frozen OOS boundary; exposed unscreened AAOIFI state honestly as execution-blocked while keeping the educational replay visible.
Verify: focused exit 4/4, curriculum+replay 9/9, lint/TypeScript clean; full suite 730/733 with only the same three pre-existing stale-AMD portfolio fixture failures.
Open: L3 adds authenticated immutable sealing/API; no persistence, promotion verdict, broker action, or prohibited terminal-period command was introduced or run.

## 2026-07-15 — L1 bounded strategy-learning curriculum ✅
Shipped: a versioned seven-question en/ar curriculum for `bollinger-mr-long-v2@v2` plus a DB-free compiler that emits complete validated params and a deterministic SHA-256 policy hash.
Decisions: lazy-dev rung 2 maps five closed choices onto existing reviewed setup ranges; two knowledge answers never enter policy; the lesson is `EDUCATIONAL_ONLY` and cannot weaken Sharia or envelope caps.
Verify: red-first missing-module proof, focused 15/15, lint and TypeScript clean; full suite 726/729 with only the same three pre-existing stale-AMD portfolio fixture failures.
Open: L2 must replay this sealed policy on one committed ≤6-month real fixture with exact team/PIT/cost/fill/OOS/Sharia/risk parity; no terminal-period command was run.

## 2026-07-15 — Organized strategy-league evidence workspace ✅
Shipped: selected teams now open one Full-vs-OOS performance/provenance/trade workspace; historical comparison precedes a consolidated risk analysis, and promotion gates are one full-width section.
Decisions: removed duplicate KPI/evidence widgets, keyed risk points to standings ranks with only the selected label visible, and contained tables/tooltips for mobile while preserving en/ar RTL.
Verify: lint, TypeScript, focused 16/16, desktop/mobile browser checks in en/ar, and 721/724 full-suite tests; only the same three pre-existing stale-AMD portfolio fixture failures remain.
Open: exact per-stock/trade rows remain honestly unavailable for the eight legacy cards until a future authorized bounded run; the prohibited full evidence run was not executed.

## 2026-07-15 — Strategy-team performance and trade drill-down ✅
Shipped: clicking a strategy team now scrolls to bilingual performance details; future terminal runs persist exact closed-trade records plus reconciled realized P&L by stock, with a bounded full ledger.
Decisions: lazy-dev rung 2 extends the existing BacktestRun report-card JSON (no schema migration); shared-book vs independent-sleeve P&L is labeled, open/mark-to-market gains are excluded, and legacy runs never reconstruct missing trades.
Verify: focused 54/54, lint, TypeScript, en/ar RTL browser click/scroll, and browser logs clean; full suite 721/724 with the same three pre-existing stale-AMD fixture failures.
Open: existing eight terminal teams show the honest legacy-ledger state until a future authorized bounded validation run persists trade evidence; the prohibited full evidence run was not executed.

## 2026-07-15 — Broader Nasdaq market themes and heatmap ✅
Shipped: expanded the shared market universe from 52 to 82 Nasdaq representatives across 10 themes; both theme rankings and the advanced heatmap now consume the same broader set, with visible coverage in en/ar.
Decisions: used Nasdaq’s published 2026 constituents, kept one batched quote request, and left screener fundamentals explicitly disclosed as estimates; no new provider or dependency.
Verify: focused breadth test, lint, TypeScript, en/ar browser rendering, expanded heatmap, and browser logs clean; full suite 717/720 with the same three pre-existing stale-AMD fixture failures.
Open: TASI sector metadata remains a separate coverage-quality pass; the prohibited 2018-01-02→2026-07-10 evidence run was not executed.

## 2026-07-15 — Shared Rushd/Alpaca portfolio dashboard ✅
Shipped: Alpaca Paper now renders through the same `DashboardClient` as Portfolio, with broker equity/cash/day P&L/positions, buying power, gross exposure, and open orders in the matching dashboard slots.
Decisions: lazy-dev rung 2 reused the existing dashboard; short-side win rate is direction-aware, exposure weights use absolute notional, and missing Alpaca NAV history/risk metrics remain explicitly unavailable rather than synthesized.
Verify: lint/TypeScript/focused 14/14 clean; live six-position account browser-verified in en/ar with zero fresh console/hydration errors; full suite 716/719 with three isolated pre-existing stale-AMD fixture failures in `portfolio.test.ts`.
Open: repair that time-sensitive quant fixture separately; no broker-history persistence or polling was added, and the prohibited 2018-01-02→2026-07-10 evidence run was not executed.

## 2026-07-15 — Alpaca paper portfolio view ✅
Shipped: Parent-only read-only Alpaca Paper view on the canonical Portfolio switcher and Quant, with live equity/cash/buying power/day P&L, positions, open orders, and bilingual honest states.
Decisions: broker values stay separate from Rushd NAV; paper URL only, no polling/schema/dependency, negative cash stays visible, Sharia status is never inferred, and production requires `ALPACA_PORTFOLIO_VIEWER_USER_IDS`.
Verify: focused 14/14; full 96 files / 719 tests; lint, TypeScript, i18n parity, and diff-check clean; browser-verified the connected 6-position account and zero fresh console/hydration errors in English/Arabic.
Open: reload refreshes the snapshot after paper execution; automated reconciliation and polling remain deliberately out of scope, and the prohibited 2018-01-02→2026-07-10 evidence run was not executed.

## 2026-07-15 — Strategy learning simulation contract + visible market heat ✅
Shipped: DR-14/M10 and L0–L5 continuation briefs for sealed bounded learner replays; market theme cards now use continuous signed percentage tint with neutral zero in light/dark.
Decisions: lazy-dev rung 2 reuses the team simulator, risk/Sharia envelope, benchmark evidence, chart, and `addXP`; rewards follow mastery, never P&L, and the full 2018-01-02→2026-07-10 run remains explicitly gated.
Verify: focused 3/3; full 95 files / 713 tests; lint and TypeScript clean; browser-verified perceptible emerald/rose magnitude tint and neutral 0.00% in light/dark.
Open: execute L1 next for one exact existing team—5–8 bilingual questions plus a pure bounded policy compiler only; no replay/API/schema/UI or terminal backtest in that unit.

## 2026-07-14 — R3-4 G6b linear factor codified; terminal run gated 🧪
Shipped: `g6b-linear-factor@v1`, fixed 25-name panel, honest dollar-volume proxy, exact monthly 7-name target weights, shared-book resizing, active-month inference, replay isolation, and frozen 3×3 plateau.
Decisions: true turnover rate is unavailable; proxy is labeled, AAOIFI remains unscreened/execution-blocked, and the 2018-01-02..2026-07-10 terminal run still requires explicit user authorization.
Verify: source `f550c8e`; independent QA P1s closed; focused 31/31, full 710/710, lint/typecheck/diff-check; short diagnostic used 15,800 real bars / 0 MOCK and persisted no JSON/BacktestRun.
Open: diagnostic-only 18 active months (10 OOS): CAGR 11.39% / 15.24%, DSR 0.303 / 0.195, MC p95 DD 42.17%, plateau FAIL; no terminal verdict or promotion claim.

## 2026-07-14 — R3-3 TOM overlay codified; terminal run gated 🧪
Shipped: `tom-overlay@v1`, exact SPUS shared-book calendar, 25% continuous cap, closed-episode inference, frozen 3×3 plateau, monthly-block bootstrap, and no-write diagnostics.
Decisions: `--diagnostic` is non-terminal and cannot persist results/BacktestRun; the 2018-01-02..2026-07-10 terminal run requires explicit user authorization.
Verify: source `c1420f5` + boundary/risk fix `8346472`; focused 39/39, full 655/655, lint/typecheck/diff-check; short diagnostic used 632 real bars / 0 MOCK and left zero artifacts/runs.
Open: 2024-01-02..2026-07-10 diagnostic only: 30 episodes (9 OOS), CAGR −0.74% / −0.47%, DSR 0.023 / 0.044, plateau FAIL; no terminal verdict or promotion claim.

## 2026-07-14 — R3-2 episode-unit correction ✅
Shipped: collapsed 136 partial concentration trims + 11 final exits into 11 independent closed episodes for R3-2 sample, permutation and plateau inference; raw turnover remains separately audited.
Decisions: REJECTED on `INSUFFICIENT_SAMPLE`, `DSR_FAILURE`, `NO_PROFIT_PLATEAU_OVERFIT`, `SHARIA_UNVERIFIABLE`; `d3628d85` / docs `173b92a` are superseded for trim pseudo-replication.
Verify: source `0aef451`; focused 30/30, full 645/645, lint/typecheck/diff-check; BacktestRun `13a95084-5890-4d17-92f5-c01d913e2d5c`, seed 42, reproducible=true.
Open: execute R3-3 next; R3-2 remains research-only with 11≪100 episodes, no significant permutation edge (p=0.236), and AAOIFI execution blocked.

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
