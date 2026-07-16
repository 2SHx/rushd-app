# Rushd Stock Workspace — Feature Specification

**Authority.** This spec is the binding section-by-section scope for the DR-18 one-page stock workspace and the source of truth for milestone **M13** in `docs/SYSTEM_DESIGN.md`. It converts the recon inventory in `docs/recon/VALUESNAPSHOT_STOCK_RECON.md` (36 feature groups across ten tabs, observed 2026-07-16, anonymous session) into RUSHD's buildable feature map. Constraints inherited, not restated: DR-12 tokens (institutional-minimal, semantic-only status colors), DR-16 plan/tier capability matrix + workspace meter, DR-17 age segments, DR-5 compliance labeling, DR-6 Arabic-first RTL, and the cross-cutting no-keys invariant.

**Honesty rule (DR-18, test-enforced by the `honesty` suite).** Banned anywhere: unlabeled or unexplained fair value, target prices, upside/downside %, buy/sell/hold ratings. Allowed: the same numbers inside a labeled educational calculator whose assumptions are visible and editable. A number without its assumptions is a claim, and claims are banned. Parity below means *feature parity, never claim parity*: RUSHD reproduces the recon's information architecture and interaction depth with its own copy, its own computed data, and the Sharia layer — it never reproduces ValueSnapshot's verdicts, targets, or visual system.

---

## 1. Workspace layout

One scrollable page per symbol; no tab chrome (`type Tab` in `StockDetail.tsx` is deleted). An anchor rail (scroll-spy, keyboard-navigable, RTL-mirrored) replaces the recon's ten tabs.

**Persistent chrome.**
- **Sticky header:** name (ar/en from the stock universe), ticker, sector chip, price, day change, market cap; watchlist toggle (♥ → `WatchlistItem`, auth-scoped); trade action (disabled + labeled on non-compliant assets per DR-5; NASDAQ trading is PREMIUM per DR-16).
- **Verdict-chip row (always visible, including in the metered state):** AAOIFI verdict (`ShariaVerdict.compliant`, `standard`) · purification ratio (`purificationRatioBps` / screener ratios) · R-Score · data provenance ("demo data" / delayed / live from `shariaSource` + `marketDataSource`). Chips render only computed values; a missing datum renders **unverified**, never a substitute number.

**Section order** (anchor ids in parentheses): S1 Sharia & purification detail (`sharia`) → S2 price history (`price`) → S3 key financials + mini-charts (`key-financials`) → S4 chart library (`charts`) → S5 statements (`statements`) → S6 valuation lab (`valuation`, TEENS+) → S7 committee view (`committee`) → S8 compare (`compare`) → S9 AI analysis & considerations (`ai`) → S10 snapshot card (`snapshot`) → S11 earnings (`earnings`) → S12 filings & provenance (`filings`) → S13 my thesis (`thesis`).

**Metered state (DR-16).** On BASIC, a locked workspace shows: header, full chip row, and one upgrade card — never blurred content, never empty frames (recon caution: "premium tabs render empty iframes beneath lock cards"). Before spending a credit the UI states the cost ("this opens 1 of your 5 monthly workspaces") — recon caution: metering must identify which action spends a use *before* the user triggers it. Revisiting an unlocked symbol is free.

**Mobile.** Single column, anchor rail scrolls horizontally within its own bounds, no document-level horizontal overflow (recon: disciplined responsive containment). Every section implements the four ui-craft states.

---

## 2. Parity map

Legend — **Disposition:** PARITY (adopted, honest equivalents) · TRANSFORMED (adopted with a compliance/honesty transformation, see §4) · NEW-DATA (adopted, needs data we don't have, see §3) · DROPPED (see §4) · DEFERRED (post-M13, see §8) · OPEN (unobservable in recon, see §5). **Gate:** plan/tier per DR-16; **Age:** DR-17 segment floor (— = all segments). Data sources refer to `src/services/marketData.ts`: `fetchMarketData` façade, `MarketDataProvider`/`ShariaScreener` registry, `getMockStats`, plus the new methods in §3.

### 2.1 Shared shell

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Company header (identity, price, change, mcap) | Sticky header | `getQuote` + `statistics` + stock universe (arName) | mock quote + `getMockStats` | free (all tiers) | — | compliance state colors semantic-only | PARITY |
| Ten-tab navigation | Anchor rail, one page | — | — | — | — | — | TRANSFORMED (T1) |
| Global stock search | Existing `StockSearch` | `getStockUniverse` | bundled universe | free | — | verdict badge in results | PARITY |
| Watchlist heart + sign-in toast | Header watchlist toggle | `WatchlistItem` (M13 migration) | works (DB, no keys) | free, auth-scoped | — | — | PARITY |
| Theme switch | Existing `ThemeToggle` (DR-12) | — | — | — | — | — | PARITY |
| Invalid-ticker error state | Shell + error card + retry | façade error path | same | — | — | — | PARITY |
| Premium patterns (blur / lock-over-iframe / usage dialog) | Metered upgrade card, chips visible, pre-spend cost notice | `WorkspaceUnlock` meter | meter works (DB) | DR-16 meter | — | verdict chip never withheld | TRANSFORMED (T6) |

### 2.2 Overview (8 groups)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Price history (ranges, hover crosshair, 52-w range, period facts) | S2 — lightweight-charts; ranges 1M/6M/YTD/1Y/5Y all available in an unlocked workspace (no range paywall — our gate is the workspace meter) | `getCandles(days)`; 5Y via keyless Yahoo tier or mock | `generateMockHistory` | unlocked workspace | — | — | PARITY |
| Automated verdict card ("high quality, ~33% below fair value") | Chip row (S0) — verdicts are AAOIFI/purification/R-Score/provenance only | screener + R-Score | `MockScreener` + demo label | free | — | this IS the Sharia layer | TRANSFORMED (T2) |
| Valuation snapshot (Fair Value, High Estimate, Upside, Margin of Safety, band) | Exists only inside S6 valuation lab as *the user's model output*, labeled | valuation lab (§2.5) | pure client math | unlocked workspace | TEENS+ | model-output label (DR-5 register) | TRANSFORMED (T3) |
| Key financials cards (10 TTM metrics incl. Forward P/E, "Fortress" chip) | S3 cards: computed trailing metrics only; qualitative chips replaced by ratios with visible formulas; Forward P/E dropped with D4 | `getFundamentalsHistory` derived (§3 N4) | seeded mock series | unlocked workspace | — | AAOIFI ratio cards alongside | PARITY + TRANSFORMED (T7) |
| Linked financial mini-charts (revenue/FCF/margins/EPS, 5–6y) | S3 mini-charts linking into S4/S5 | `getFundamentalsHistory` (N1–N4) | seeded mock series | unlocked workspace | — | — | PARITY + NEW-DATA |
| Bull and bear cases | S9 "considerations" — both sides always, compliance-tagged, not-advice label | `/api/signals` structured output (DR-7) | local deterministic fallback | PREMIUM (AI signals) | — | `complianceTag` per item | TRANSFORMED (T9) |
| Opportunity Matrix (4 rated dimensions, "Strong Opportunity") | S13 "my thesis" reflection widget — same segmented interaction, process-language aggregate ("thesis complete"), never an opportunity/buy signal | local client state (v1) | works | unlocked workspace | — | — | TRANSFORMED (T8) |
| Company profile + onward links | S1/S12 profile block + progressive links into deeper sections | `getMockStats` about/ceo/employees/hq (bilingual) | works | unlocked workspace | — | — | PARITY |

### 2.3 Charts (7 groups)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Chart-library header (Annual/Quarterly/TTM, ranges) | S4 controls: Annual/Quarterly, 3Y/5Y (v1 depth = 5y/8q, §3) | `getFundamentalsHistory` | seeded mock | unlocked workspace | — | — | PARITY + NEW-DATA |
| Category rail (Essentials 9 / Profitability 18 / Cash Flow 7 / Balance Sheet 14 / Valuation 11) | v1 ships an Essentials-scale set of 10–12 metric charts; full category taxonomy is the PREMIUM depth as categories land | derived series (N4) | seeded mock | Essentials: unlocked workspace; extended categories: PREMIUM | — | — | PARITY (scoped) |
| Chart cards (headline value + history + hover) | S4 cards | derived series | seeded mock | as above | — | — | PARITY |
| About modal (definition, calculation, interpretation, tips) | Per-metric About modal, bilingual, linking into the matching Academy lesson (DR-17) | static bilingual content + Academy registry | works | free content | lesson link respects segment | `complianceTag` on flagged concepts | PARITY |
| Expand modal (large chart, summary stats) | Expand modal with period stats; PNG/clipboard export deferred | derived series | works | as card | — | — | PARITY (export DEFERRED) |
| Chart Builder (multi-ticker, add metrics, presets) | Not in M13 | — | — | — | — | — | DEFERRED |
| Premium boundary (30+ advanced charts CTA) | Tier gate on extended categories, upgrade card pattern (no blur) | — | — | PREMIUM | — | — | TRANSFORMED (T6) |

### 2.4 Financials (4 groups)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Quick Insights (12 latest-period cards) | S5 header cards (revenue, CAGR, net income, FCF, margins, EPS, ROE, debt/equity, net cash) | derived series (N4) | seeded mock | unlocked workspace | — | debt ratios cross-referenced to AAOIFI screen | PARITY + NEW-DATA |
| Statement controls (Annual/Quarterly × Income/BS/CF) | S5 statement switcher; v1 depth 5 annual + 8 quarterly (28-year history deliberately not copied — pedagogy needs trend, not archaeology) | N1–N3 | seeded mock | latest annual + latest quarter: unlocked workspace; full 5y/8q history: PREMIUM | — | `latestStatementQuarter` provenance shown | PARITY (scoped) + NEW-DATA |
| Income-statement rows (21 observed) | v1 core rows (~12: revenue→EPS chain incl. margins, interest expense persistently labeled per DR-5) | N1 | seeded mock | as above | — | interest-expense row carries the educational-interest label | PARITY (scoped) |
| Premium boundary (blur + pointer-block) | Upgrade card; visible rows are real, never blurred fakes | — | — | PREMIUM | — | — | TRANSFORMED (T6) |
| "Share Image" action | Not in M13 | — | — | — | — | — | DEFERRED |

### 2.5 Valuation (6 groups) — the valuation lab (S6), age floor TEENS+ (KIDS sessions receive a server-enforced age-gated placeholder)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Model selector + aggregate view (Compare-All-4, AI synthesis, "Strong Buy", 6-bullish/0-bearish, avg upside +97%) | Side-by-side view of the four models' outputs, each labeled with its own assumptions; NO aggregate verdict, NO bullish/bearish tally, NO average upside | pure client model math over N4 references | works | unlocked workspace | TEENS+ | persistent "مخرجات نموذج تعليمي — ليست نصيحة" / "model output — not advice" | TRANSFORMED (T4) |
| DCF model (editable inputs, presets, projections, 5×5 sensitivity, price-vs-model history) | Full parity: sliders + textboxes, historical reference shortcuts, conservative/moderate/aggressive presets, sensitivity matrix, projection table, price-vs-your-model chart | pure functions in `src/lib/valuation/` seeded from N4 + candles | works | unlocked workspace | TEENS+ | label on every output; under/fair/over colors semantic-only | PARITY |
| EPS model | Parity; "Wall Street average/high/low" reference chips replaced by historical-only references (TTM/1Y/3Y/5Y) — consensus estimates are D4 | same | works | unlocked workspace | TEENS+ | label | PARITY + TRANSFORMED (T10) |
| Rule of 40 | Parity: live score, visible formula, reference scale | same | works | unlocked workspace | TEENS+ | label | PARITY |
| PEG | Parity: visible formula, reference bands, implied-price-at-PEG-1 shown as model output | same | works | unlocked workspace | TEENS+ | label | PARITY |
| Persistence (saved models, history, research notes) + anonymous meter | v1: model state persists per session client-side; durable save/notes deferred. Metering = the DR-16 workspace meter, no second valuation meter | — | works | — | — | — | PARITY (scoped; save DEFERRED) |

### 2.6 Analyst (5 groups) — becomes the committee view (S7)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Price-target range (low/consensus/high, ±%) | None — target prices and upside % are banned claims | — | — | — | — | — | DROPPED (D1) |
| Forward estimates (revenue/EPS consensus) | None in v1 — no licensed estimates feed; showing "estimates" without provenance violates honesty | — | — | — | — | — | DROPPED (D4) |
| Rating distribution (Buy · 79 analysts) | Committee stance distribution: 8 agents' BULLISH/BEARISH/NEUTRAL + conviction + bilingual rationale, labeled "simulated analyst committee — not consensus, not advice"; R-Score detail beside it. The existing `MarketData.analystRatings {buy/sell/hold}` mock field is REMOVED | quant committee view-model (`AnalystSignalRecord` shape) with a deterministic mock committee in no-keys mode | mock committee | stances: unlocked workspace; per-agent evidence + decision history: ULTRA (advanced analytics) | — | Sharia agent's veto shown as first-class | TRANSFORMED (T5) + DROPPED (D6) |
| Recent price-target changes feed | None — target prices | — | — | — | — | — | DROPPED (D2) |
| Recent analyst actions feed (upgrades/maintains) | None in v1 — rating language + unlicensed data; committee decision history (ULTRA) is the honest successor | — | — | — | — | — | DROPPED (D3) |

### 2.7 Compare (2 groups) — S8

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| Peer slots + two-step add flow (≤3 peers) | Parity: search → select → Add, remove per column, ≤4 columns; suggested peers from a bundled sector list (N7); each *new* compared symbol spends one workspace-meter credit on BASIC | compare endpoint over façade | mock | unlocked workspace + meter | — | — | PARITY |
| Metric comparison table (15 rows incl. Price Target / Target Upside / Analyst Rating / # Analysts) | Honest rows: price, mcap, P/E, P/S, FCF margin, 3Y/5Y revenue CAGR, dividend yield, revenue/net income/FCF TTM + **AAOIFI verdict, purification ratio, R-Score** rows; the four analyst/target rows are dropped (D5); best-in-row emphasis + preference legend kept | N4 + screener + R-Score | mock | unlocked workspace | — | verdict + purification rows are mandatory | PARITY + DROPPED (D5) |

### 2.8 AI Analysis, Snapshot, Earnings, SEC Filings (4 groups)

| Recon item | RUSHD target | Data source | No-keys behavior | Gate | Age | Sharia layer | Disposition |
|---|---|---|---|---|---|---|---|
| AI Analysis (locked multi-page SWOT deep dive) | S9: structured bilingual analysis via the existing signals endpoint (strengths/weaknesses/opportunities/threats-style considerations), not-advice label; no multi-page report generation in v1 | `/api/signals` (DR-7) | deterministic local fallback | PREMIUM (AI signals) | — | `complianceTag` + not-advice on every block | TRANSFORMED (T9) |
| Snapshot (locked AI infographic) | S10 snapshot card: chips + key facts + provenance in one shareable/printable card; AI infographic generation deferred | chips + N4 | works | unlocked workspace | — | chips embedded | PARITY (scoped; generation DEFERRED) |
| Earnings (locked transcripts) | S11: earnings actual-vs-expected history (exists in `earningsHistory`) + next earnings date (N5); transcripts deferred — no transcript source | `getEarningsCalendar` (N5) + existing mock | works | unlocked workspace | — | — | PARITY (scoped; transcripts DEFERRED) |
| SEC Filings (external EDGAR link) | S12 filings & provenance: in-app list of filing links — EDGAR full-text/browse by ticker for NASDAQ, Saudi Exchange (Tadawul) issuer-disclosures page for TASI — each labeled with source; recon takeaway "preserve provenance, keep the user's place" honored by opening externally from an in-app index | `filingsLinks(symbol, market)` pure URL builders (N6) | works (links are static) | unlocked workspace | — | disclosure provenance reinforces AAOIFI-ratio sourcing | PARITY + TRANSFORMED (T11) |

Sidebar destinations (Value Analyzer, Technical Signals, Stock Ideas, Market Briefs) are not stock-page features and are out of this spec's scope.

---

## 3. (a) New-data requirements — 7 items

Provider-contract additions in `src/services/marketData.ts` (registry pattern per DR-4; every method has a deterministic seeded mock so the no-keys invariant holds; live vendor selection is OPEN, §5):

```
interface FundamentalsPeriod { period: string; freq: 'annual'|'quarterly';
  income: { revenue; costOfRevenue; grossProfit; opex; rdExpense; operatingIncome; interestExpense; taxExpense; netIncome; epsDiluted; sharesDiluted };
  balance: { totalCash; totalDebt; totalEquity; totalAssets };
  cashflow: { operatingCF; capex; freeCashFlow };
  source: string }
MarketDataProvider gains:
  getFundamentalsHistory(symbol, market, freq, periods): FundamentalsPeriod[]   // v1 depth: 5 annual, 8 quarterly
  getEarningsCalendar(symbol, market): { history: {quarter; actual; expected}[]; nextEarningsDate?: string }
Pure helpers (no fetch): filingsLinks(symbol, market): { label; labelAr; url; source }[]
```

| # | New data | Needed by | v1 source |
|---|---|---|---|
| N1 | Multi-year income-statement series | S3–S5, valuation references | seeded mock generator + NVDA/Aramco fixtures; live vendor OPEN |
| N2 | Balance-sheet series | S5, AAOIFI ratio cross-check | same |
| N3 | Cash-flow series | S3–S5, DCF references | same |
| N4 | Derived metric series (margins, EPS, ROE, FCF, net cash, per-share, CAGRs) | S3, S4, S8, S6 reference chips | computed from N1–N3 in code — never stored |
| N5 | Next-earnings date | S11 | mock fixture; live vendor OPEN |
| N6 | Filings link metadata | S12 | pure URL builders (EDGAR ticker query; Saudi Exchange issuer page) — no API |
| N7 | Peer-suggestion list per sector | S8 add-flow shortcuts | bundled static list in the stock universe |

The quant `Fundamentals` Prisma model's point-in-time discipline (`asOf`/`releasedAt`) is the storage convention if these series are ever persisted; v1 serves them from the provider layer without new tables.

## 4. (b) Compliance/honesty dispositions

**Transformed — 11 items:** T1 tabs→anchor sections · T2 automated fair-value verdict card→honest chip row · T3 overview valuation snapshot→valuation-lab-only labeled model output · T4 aggregate Strong-Buy synthesis→side-by-side model outputs with no verdict/tally/average-upside · T5 analyst rating distribution→labeled simulated committee stances · T6 blur/lock/empty-iframe premium patterns→metered upgrade card with pre-spend cost notice · T7 qualitative judgment chips ("Fortress")→computed ratios with visible formulas · T8 Opportunity Matrix→"my thesis" reflection widget in process language · T9 bull/bear cases→compliance-tagged, not-advice considerations · T10 EPS-model analyst reference chips→historical-only references · T11 external-only SEC link→in-app provenance index linking out.

**Dropped for honesty — 6 items:** D1 price-target range (low/consensus/high + upside %) · D2 price-target-changes feed · D3 analyst-actions feed · D4 forward consensus estimates (revisit only if a licensed, attributable estimates feed is adopted) · D5 compare-table rows Price Target / Target Upside / Analyst Rating / Number of Analysts · D6 the existing `MarketData.analystRatings` buy/sell/hold field (removed from the interface, `getMockStats`, and any consuming UI — it is a rating claim).

**Deferred for scope (not honesty) — 6 items:** Chart Builder · PNG/clipboard/Share-Image exports · durable saved models + research notes · earnings transcripts · AI infographic generation · statement history beyond 5y/8q.

## 5. (c) Unobservable in recon → OPEN — 6 items

Trigger for all: separately authorized trial recon; absent that, RUSHD designs these surfaces independently and makes no parity claim (recon rule: "never fabricate inaccessible report sections").

| # | Unobservable surface |
|---|---|
| U1 | Balance-sheet / cash-flow statement row inventories (pointer-blocked) — our S5 rows are defined from statement standards, not parity |
| U2 | AI Analysis report structure, generation UX, regeneration |
| U3 | Snapshot infographic generation/regeneration/export |
| U4 | Earnings transcript tooling (selection, search, summaries) |
| U5 | Chart Builder full composition/export behavior |
| U6 | Technical Signals / Stock Ideas / Market Briefs member surfaces |

Also OPEN: the live fundamentals/earnings vendor for N1–N3/N5 (recon observed Financial Modeling Prep as ValueSnapshot's source; RUSHD's choice follows the DR-4 adapter pattern and the OQ-4 budget trigger).

## 6. Gating summary

| Capability | BASIC | PREMIUM | ULTRA | Age floor |
|---|---|---|---|---|
| Workspace unlock | metered 5/30d (chips always visible) | unmetered | unmetered | — |
| Price history all ranges, S1–S3, essentials charts, latest statements, snapshot, earnings, filings, thesis | in unlocked workspace | ✓ | ✓ | — |
| Extended chart categories + full 5y/8q statements | — | ✓ | ✓ | — |
| Valuation lab (all four models) | in unlocked workspace | ✓ | ✓ | TEENS+ |
| AI analysis & considerations (S9) | — | ✓ | ✓ | — |
| Committee stances (S7) | in unlocked workspace | ✓ | ✓ | — |
| Per-agent evidence + decision history | — | — | ✓ | — |
| Compare (new symbol = 1 credit on BASIC) | metered | ✓ | ✓ | — |
| Watchlist | ✓ (auth) | ✓ | ✓ | — |
| Simulated trading | TASI | TASI+NASDAQ | TASI+NASDAQ | — |

All gates and the meter are enforced in the §8 authz helper (DR-16), server-side; age gates per DR-17.

## 7. States, i18n, a11y

Every section: loading / empty / error / populated (ui-craft). Arabic-first: all labels in both `messages/*.json` key-identical; tickers, signed numbers, and ratios are bidi-wrapped LTR tokens; anchor rail and sensitivity matrices mirror in RTL; numbers Western Arabic numerals, currency via `Intl.NumberFormat('ar-SA')`. Semantic bindings are explicit for assistive tech (recon caution: ambiguous DOM ordering of labels/values) — every chip and model output binds its label programmatically. Motion: ease-out enters, transform/opacity only.

## 8. Traceability

M13 work items in `docs/SYSTEM_DESIGN.md` §9 map to: data contract (§3) · shell + metered state (§1) · chips/Sharia (§1–S1) · financial history + statements (§2.3–2.4) · valuation lab (§2.5) · committee view (§2.6) · watchlist/compare (§2.7) · snapshot/earnings/filings (§2.8) · honesty suite (§0 rule, D1–D6) · Arabic/RTL (§7). The `honesty` vitest suite asserts: banned strings absent outside the valuation lab, every model output carries the label + visible assumptions, `analystRatings` absent from the codebase, and a negative fixture fails.
