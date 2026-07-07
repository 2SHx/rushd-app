# Rushd Quant — Handoff & Next Steps (model-agnostic)

> **Purpose.** Single source of truth to resume the Rushd Quant committee to "perfect" **from a cold
> start, on any model, without re-exploring the codebase.** Read this + `docs/QUANT_DESIGN.md` §
> (the contract) + `docs/JOURNAL.md` (session log). Do **not** re-derive state — it's below.
> Last verified: 2026-07-07. Ground truth = disk + DB, not prior journal claims.

---

## 1. Objective

Make the 8-agent AI analyst committee (Rushd Quant) reason on **real data, every agent
contributing**, paper-only, Sharia-gated — then gate it for launch. Q0–Q7 build is **complete and
committed**; the remaining work is **activating integrations** (each is a keyed upgrade from
mock→real) and **launch gating**. No new architecture is needed.

---

## 2. Current state — LIVE vs MOCK (verified)

**Alpaca paper key is set in `.env` and fully verified** (`node scripts/verify-alpaca.mjs` →
account ACTIVE, $400k buying power, live MSFT bar). DB holds real data.

| # | Agent | State | Runs on | Blocker to "real" |
|---|-------|-------|---------|-------------------|
| 1 | **Quant Core** | ✅ LIVE | real Alpaca bars | none |
| 3 | **Technical/Chart** | ✅ LIVE | real Alpaca bars | none |
| 5 | **Sharia gate** | ⚠️ honest mock | AAOIFI mock screener | `ZOYA_API_KEY` |
| 2 | **News/Catalyst** | ⚠️ degraded | has real news, no LLM | **LLM key** (returns `"no live model available"`) |
| 6 | **Fundamental** | ⚠️ degraded | no data + no LLM | **LLM key** + fundamentals vendor |
| 7 | **Research/RAG** | ⚠️ degraded | empty corpus + no LLM | **LLM key** + seeded corpus |
| 8 | **Portfolio Manager** | ⚠️ surrogate | deterministic sizer | **LLM key** (for real reasoning; surrogate is correct for backtests) |
| 4 | **Pattern/Analog** | ⚠️ abstains | ~216 bars ingested | **~1040+ bars** (needs ≥100 analogs) |

**DB (Postgres `rushd-postgres`, up):** ~432 `MarketBar` (MSFT/NVDA), ~88 `NewsItem` — all
`source=ALPACA`. Pipeline runs end-to-end: `npx tsx scripts/quant-pass-demo.ts MSFT NASDAQ`
produces a real Decision (PM HOLD; QUANT_CORE bearish from real momentum; TECHNICAL bullish from
real RSI/MACD; Sharia COMPLIANT; 4 agents correctly abstaining).

**Everything still runs keyless in mock mode** — the mock-first invariant is intact. A missing key
never breaks a build/test; it degrades one agent.

---

## 3. The gap to "perfect" — ranked levers

Each lever is **independent**. Do them in this order (leverage-first). None require code changes to
the committee — the app is wired for all of them.

### Lever 1 — LLM key (OpenRouter) · highest leverage · ~free · **user credential needed**
Activates **4 agents at once**: News (2), Fundamental (6), Research (7), and the real LLM Portfolio
Manager (8) + the bull/bear debate — with Arabic-first reasoning and the Opus fallback chain
(free→Opus→mock, see `docs/MODELS.md`).
- **Action (user):** add to `.env` (documented in `docs/ENV.md` §LLM):
  ```bash
  OPENAI_API_KEY="sk-or-..."               # an OpenRouter free-tier key works
  OPENAI_BASE_URL="https://openrouter.ai/api/v1"
  ```
- **Verify:** `npx tsx scripts/quant-pass-demo.ts MSFT NASDAQ` — News/Fundamental/Research rows
  should show real rationale (not `[degraded] "no live model available"`), and the PM narration
  should be model-generated.
- **Why the assistant can't do it:** `.env` is human-only (enforced by a PreToolUse hook); the key
  is the user's credential. This is the *only* blocker for 4 of the 8 agents.

### Lever 2 — Deep history for the Pattern analyst (4) · **partly built, uncommitted**
Pattern (4) abstains until it has ≥100 historical analogs (needs ~1040+ daily bars ≈ 4yr).
- **State:** `scripts/backfill-history.ts` exists (untracked) — backfills 1200 bars/ticker via
  `ingestBars` for all `TICKERS`. Alpaca free IEX gave only ~10 months; the last commit (`80dba79`)
  wired a **Yahoo fallback for NASDAQ deep history** to get 4yr keyless.
- **Action:** run `npx tsx scripts/backfill-history.ts`, confirm bar counts, then commit the script.
  If Yahoo depth is still short, either lower `MIN_ANALOGS`/widen the analog window in
  `src/quant/analysts/pattern.ts` (document the trade-off), or add a deeper data plan.
- **Verify:** after backfill, the Pattern row in `quant-pass-demo` stops abstaining and reports a
  base-rate signal **with OOS validation** (never act on an unvalidated pattern — QUANT_DESIGN
  integrity guardrail).

### Lever 3 — Fundamentals for the Fundamental analyst (6) · **decision + partly built**
- **State:** `scripts/seed-fundamentals.ts` exists (untracked) but seeds **synthetic** metrics — a
  demo stand-in, NOT a real vendor. Good for lighting up the pipeline; **not** "real."
- **Decision needed (user):** pick a vendor — Financial Datasets API / Alpha Vantage / Finnhub
  (default in plan: Financial Datasets). Then wire a `FUNDAMENTALS_API_KEY` adapter behind the
  registry pattern (mirror `AlpacaAdapter`), mock fallback intact.
- **Interim:** the synthetic seed can run now to demo agent 6 end-to-end; label it clearly as mock.

### Lever 4 — Research corpus for the RAG analyst (7)
Agent 7 retrieves from an empty store → abstains even with an LLM key.
- **Action:** seed a per-symbol/sector-tagged corpus (quant + Islamic-finance sources; later the
  CFA-X/CME-X curriculum sources per the plan). A `scripts/seed-research.mjs` is called for in the
  plan but **not yet written** — author it, tag docs by symbol/sector, ingest via
  `src/quant/data/researchRetriever.ts`.
- **Verify:** PM rationale cites retrieved sources; degrades to a documented stub with no docs.

### Lever 5 — Zoya (real Sharia screening)
- **Action (user):** add `ZOYA_API_KEY` → real AAOIFI verdicts replace the honest mock screener.
  Lowest urgency (the mock is a faithful AAOIFI sector+ratio screen).

---

## 4. Uncommitted work in progress (decide before continuing)

Two scripts are on disk **untracked** (`git status`): decide keep/commit/delete before the next
model touches them, or they'll cause confusion.
- `scripts/backfill-history.ts` — Lever 2. **Recommend: run, verify, commit.**
- `scripts/seed-fundamentals.ts` — Lever 3 interim. Synthetic. **Recommend: commit only if clearly
  labeled mock; otherwise hold until a real vendor is chosen.**

---

## 5. Launch-gating items (MUST precede any non-demo use)

Recorded in JOURNAL/memory; not yet done. These are **blocking for launch**, independent of the
levers above:
1. **Hard ULTRA-tier gating** on every `/api/quant/*` route **and** the `/quant` UI (reuse
   `requireSession`/`Tier` in `src/lib/authz.ts`). Today the quant surface is not tier-gated.
2. **Nav link to `/quant`** (currently reachable only directly; `/markets` should link to it per Q7).
3. **Real-money live broker path stays DARK** — verify `assertLiveExecutionAllowed` is still called
   in `AlpacaPaperBroker` when `ALPACA_BASE_URL` is live (Q1 security fix — regression-check it),
   and that no live path is reachable without all 3 flags + CMA license (`docs/ENV.md` §live).
4. **Disclaimers** (not-advice / not-real-money) on every quant screen.

---

## 6. Cold-start protocol for the next model

1. **Read, don't explore:** this file → `docs/QUANT_DESIGN.md` (the contract) → `docs/JOURNAL.md`
   (log) → `docs/ENV.md` (keys). Trust disk over any journal claim; verify a file exists before
   citing it.
2. **Bring the world up:** `docker start rushd-postgres` (container name is `rushd-postgres`).
3. **Confirm live state:** `node scripts/verify-alpaca.mjs` then
   `npx tsx scripts/quant-pass-demo.ts MSFT NASDAQ`.
4. **Global gate before any commit:** `npx tsc --noEmit && npm run lint && npx vitest run`
   (quant tests: `npx vitest run quant`). Mock-first must hold — it must all pass with zero API keys.
5. **Pick up** at the highest un-done lever in §3, or a §5 launch item. Commit per slice; add a
   `docs/JOURNAL.md` entry. Money mutations stay transactional + audited (Prisma.Decimal, never
   float). Every user-facing string lands in **both** `messages/en.json` and `messages/ar.json`.

### Key file map (verified on disk)
```
src/quant/
  types.ts                         AnalystSignal contract
  data/{pointInTime,ingest,researchRetriever}.ts   PIT store + no-look-ahead guard, ingestion, RAG
  analysts/{quantCore,technical,news,fundamental,pattern,research}.ts   the 6 analysts
  gates/sharia.ts                  hard veto
  risk/envelope.ts                 applyEnvelope — deterministic risk clamps
  committee/{collect,debate,pm,runner}.ts   pipeline: gather→bull/bear→PM→run
  backtest/{metrics,pmSurrogate,engine}.ts  event-driven backtester + deterministic PM surrogate
  execution/{broker,internalSim,alpacaPaper,registry,liveGuard,executeDecision}.ts
  llm/{models,client,generate}.ts  per-agent model router + Opus fallback + mock
  automation/{control,autoRun}.ts  kill-switch + race-safe daily claim
src/app/api/quant/{pass,backtest,execute}/route.ts     cron/{quant-ingest,quant-run}/route.ts
src/services/marketData.ts         ProviderRegistry, real AlpacaAdapter + Yahoo, TokenBucket
scripts/{verify-alpaca.mjs, quant-ingest.ts, quant-ingest-news.ts, quant-pass-demo.ts}   committed tooling
scripts/{backfill-history.ts, seed-fundamentals.ts}    UNCOMMITTED WIP (§4)
```

### Invariants that must never be violated
- **Mock-first:** builds/tests/demos pass with **zero** API keys. A key upgrades one integration.
- **No look-ahead:** decide on bar t close, fill at t+1 open; `assertNoLookahead` guards it. A
  look-ahead-injection test must *fail the run* — that proves the guard.
- **LLM decides inside a deterministic envelope it cannot cross:** Sharia = absolute veto, Risk
  Manager = hard clamps. The LLM can never propose a haram or over-cap trade.
- **Reproducible backtests:** temperature 0; PM approximated by the deterministic surrogate; every
  Decision persists inputs→prompt→output + contributing signals.
- **Money = Prisma.Decimal**, every mutation transactional + `Transaction` audit row.
- **`.env` is human-only** (hook-enforced) — the assistant cannot set keys; surface the exact block
  to paste (see §3) and verify after.

---

## 7. One-paragraph status (paste-ready)

> Rushd Quant's 8-agent committee is built (Q0–Q7 complete, committed) and running on **real Alpaca
> paper data** (432 bars, 88 news; account verified). Quant Core + Technical are fully live; Sharia
> is an honest mock. The remaining 4 agents (News, Fundamental, Research, LLM PM + debate) are
> degraded **only** for lack of an LLM key — adding `OPENAI_API_KEY`+`OPENAI_BASE_URL` (OpenRouter
> free tier) to `.env` activates all four at once. Pattern needs a 4yr backfill (script written,
> uncommitted); Fundamental needs a real vendor (synthetic seed exists as interim); Research needs a
> seeded corpus. Before launch: ULTRA-tier gating on quant routes/UI, a `/quant` nav link, and a
> regression check that the real-money path stays dark. Everything still runs keyless in mock mode.
