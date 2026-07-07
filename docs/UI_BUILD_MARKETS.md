# Markets UI Rebuild — Build Spec

> **For the implementing model (Gemini / Antigravity).** This is a complete, self-contained
> brief. You are rebuilding the **Markets page** of the Rushd Financial app. The backend it
> depends on is **already built, tested, and frozen** — your job is the UI only. Read §3
> (frozen contracts) before writing any code. Do not modify backend files (§9 scope fence).
> Every acceptance item in §10 must pass.

---

## 1. Product context

**Rushd Financial** — a gamified, Arabic-first (en/ar, RTL) investment-training app for the Gulf
market, aimed at **18–40 year-old** young adults. Two markets: **TASI** (Saudi Tadawul, prices in
**SAR**) and **NASDAQ** (US, **USD**), with **Sharia-compliance** awareness throughout.

**Stack (already in the repo — use these, add nothing new):**
- Next.js 14.2 **App Router** · TypeScript 5 · Tailwind 3.4
- **next-intl v4** for i18n (en/ar) + RTL · **framer-motion** (animation) · **lucide-react** (icons)
- **lightweight-charts v3.8** (price charts) · Prisma 5 + PostgreSQL
- Money is **Prisma.Decimal** server-side; convert to `number` only at the display boundary.

**The goal for this rebuild:** the current Markets page is the app's worst surface. Make it a clean,
polished, **data-driven** experience where a user can **search and view any stock in the real
universe** (not a frozen list), with a maintainable component structure.

---

## 2. The problem you are fixing

The current page is `src/components/MarketsClient.tsx` — a **single 1,748-line client component**
with three specific rots you must eliminate:

1. **Frozen universe.** It renders only ~30 hardcoded tickers from `src/lib/tickers.ts` (with stale
   fake prices). Users literally cannot see other stocks. → **Replace with live search over the real
   universe** (the backend for this already exists — §3).
2. **Fabricated AI text.** `getRushdGPTResponse()` returns **hardcoded fake Arabic/English analysis
   paragraphs** per symbol (invented compliance verdicts, invented "growth drivers"). This is
   misleading in a finance app. → **Delete it.** Replace the assistant panel with either a real
   endpoint call (if one exists — grep `src/app/api` for `research`/`signals`/`rushdgpt`) or a clearly
   **disabled "coming soon"** state. **Never ship invented financial claims as static strings.**
3. **Bypassed i18n.** The component hardcodes `isAr ? 'عربي' : 'English'` ternaries everywhere
   instead of using next-intl. There is **no `Markets` namespace** in the message files yet. → **Do it
   properly** (§7): create a `Markets` namespace in **both** `messages/en.json` and `messages/ar.json`
   and use `useTranslations('Markets')`.

---

## 3. Frozen backend contracts — BUILD ON THESE, DO NOT MODIFY

Everything in this section already exists on `main`, is tested (230 tests green), and is **out of
scope to change**. Bind your UI to these exact shapes.

### 3.1 Stock search — the universe
`GET /api/stocks/search?q=<query>&market=<TASI|NASDAQ>` (requires an authenticated session)
```jsonc
// 200 OK
{ "results": [ { "symbol": "2222.SR", "name": "Saudi Aramco", "arName": "أرامكو السعودية", "market": "TASI" } ] }
// 401 if unauthenticated · 400 if market invalid or q missing · 429 if rate-limited
```
- `q` is matched against **symbol, English name, and Arabic name** (substring). Returns **up to 30**.
- **Debounce** your calls (~250 ms). Do **not** call it on every keystroke.
- NASDAQ returns the **live Alpaca catalog** (thousands) when the server is keyed; a bundled fallback
  otherwise. TASI is a bundled roster of **172 real companies**.
- ⚠️ **`arName` is empty (`""`) for ~147 of the 172 TASI entries** right now (a separate i18n backfill
  is planned). Your row/detail rendering **must fall back** to `name` (or `symbol`) when `arName` is
  empty — never render a blank label.

### 3.2 Universe module (for a default/"featured" list without typing)
`src/lib/stockUniverse.ts` exports:
```ts
export interface StockUniverseEntry { symbol: string; name: string; arName: string; market: 'TASI'|'NASDAQ' }
export const TASI_UNIVERSE: StockUniverseEntry[]              // 172 real Tadawul companies
export const NASDAQ_UNIVERSE_FALLBACK: StockUniverseEntry[]   // 52 well-known US names
export function searchUniverse(market, query, limit): StockUniverseEntry[]  // pure matcher
```
You **may** import these directly in a Server Component for the initial/empty-query "featured" list.
User-typed search **must** go through `/api/stocks/search` (§3.1).

### 3.3 Per-symbol market data (the detail panel + chart)
`GET /api/market-data?symbol=<sym>&market=<TASI|NASDAQ>` (auth required) → the `MarketData` object
below **plus** `sharesOwned: number`. This is the existing endpoint the detail view already uses.
```ts
export interface Candle { time: string; open: number; high: number; low: number; close: number; value?: number }
export interface MarketData {
  symbol: string; market: 'TASI' | 'NASDAQ'; price: number;
  history: Candle[];                       // feed lightweight-charts
  isShariaCompliant: boolean; purificationRatioBps?: number;
  analystRatings?: { buy: number; sell: number; hold: number };
  earningsHistory?: { quarter: string; actual: number; expected: number }[];
  aboutTextEnglish?: string; aboutTextArabic?: string;
  ceo?: string; employees?: number; headquarters?: string;
  sectorArabic?: string; sectorEnglish?: string;
  movementReasonArabic?: string; movementReasonEnglish?: string;
  statistics?: { dayRange:[number,number]; yearRange:[number,number]; open:number; prevClose:number;
                 volume:number; avgVolume:number; marketCap:number; peRatio:number };
  financials?: { revenue:number; netIncome:number; grossMargin:number; totalCash:number; totalDebt:number;
                 debtToEquity:number; complianceRatios:{ debtToMcap:number; interestIncomeToRevenue:number };
                 latestStatementQuarter:string };
}
```
Currency: **SAR** for TASI, **USD** for NASDAQ. Prices with no key are mock but shaped identically —
your UI must not assume live keys.

### 3.4 The server page (keep this wiring)
`src/app/[locale]/markets/page.tsx` is a Server Component that reads `searchParams.symbol` /
`searchParams.market`, calls `fetchMarketData(symbol, market)` for the **active** symbol, resolves the
session + the user's `jarBalance`/`sharesOwned`, and passes them into the client. Keep this
server-side active-symbol fetch; keep the URL contract `?symbol=<sym>&market=<TASI|NASDAQ>` so a
selected stock is shareable/deep-linkable.

---

## 4. Target architecture

Decompose the monolith into a **`src/components/markets/` folder** — **≥4 focused components**, each
**≤ ~500 lines**, composed by a slim client container. Suggested split (adapt names sensibly):

| Component | Responsibility |
|---|---|
| `MarketsContainer.tsx` (client) | State + composition; owns active symbol/market, search state, URL sync. |
| `MarketTabs.tsx` | TASI ⇄ NASDAQ toggle. |
| `StockSearch.tsx` | Debounced search box → `/api/stocks/search`; loading/empty/error states. |
| `StockList.tsx` + `StockListRow.tsx` | Results (or "featured" when query empty); each row lazy-loads its quote via `/api/market-data` on view/select. |
| `StockDetail.tsx` | Header (name, symbol, price, change, currency, Sharia badge) + composes the panels below. |
| `PriceChartPanel.tsx` | Wraps the existing `AdvancedTradingChart` with `history`. |
| `FundamentalsPanel.tsx` | `statistics` / `financials` / ratings / Sharia ratios. |
| `AssistantPanel.tsx` | Real endpoint call **or** disabled "coming soon" (§2.2) — **no fabricated text**. |
| `TradeAction.tsx` | The buy/sell entry point (reuse the existing `/api/trade` flow if wired; otherwise keep the existing button behavior — do not break it). |

**Reuse, don't rewrite:** `src/components/AdvancedTradingChart.tsx` and
`src/components/QuizModal.tsx` are existing children — keep their public props and pass them through.

---

## 5. UX requirements

- **Search-first browse.** A prominent search box at the top of the list. Empty query → a **"featured"
  list** (slice `TASI_UNIVERSE`/`NASDAQ_UNIVERSE_FALLBACK`, ~15–20). As the user types (debounced),
  show live results from `/api/stocks/search`. Show clear **loading**, **empty ("no matches")**, and
  **error** states.
- **Row content:** display name (Arabic name when present & locale is `ar`, else English/symbol),
  symbol (strip a trailing `.SR` for display but keep it in the data/URL), and a **lazily-loaded**
  price + day change (green up / red down, with an arrow). Do not block the list on quotes.
- **Selecting a row** updates the URL (`?symbol=&market=`) and loads the detail panel via
  `/api/market-data`. Keep it a **zero-reload** client transition where practical.
- **Detail panel:** price header with Sharia-compliant badge (green "متوافق / Compliant" vs amber
  "غير متوافق / Non-compliant"), the chart, then fundamentals/statistics, then the assistant panel.
- **Responsive:** laptop = split view (list left, detail right, RTL-aware order); mobile = single
  column with a list⇄detail toggle. (The repo already has a laptop-split / mobile-toggle pattern —
  match it.)
- **Disclaimer:** keep the "not financial advice / virtual money" disclaimer visible (a
  `DisclaimerBanner` component already exists — reuse it).

---

## 6. Design direction

The repo's design language is **"Apple-grade" glassmorphism** (frosted panels, soft glows, subtle
motion). Match and elevate it — this page should feel premium:
- Clean type hierarchy, generous spacing, rounded-2xl cards, soft shadows, translucent panels over a
  subtle gradient. Tasteful framer-motion on mount and on symbol switch (no gratuitous animation).
- Numbers are the hero: large, tabular, aligned. Color semantics: **up = emerald, down = rose**,
  neutral = zinc. Sharia states: **compliant = emerald, non-compliant = amber**.
- **Dark + light** both supported.
- **Accessibility:** real `<button>`/`<a>` semantics, focus states, `aria-label`s, sufficient
  contrast, keyboard-navigable list.

---

## 7. i18n rules (non-negotiable)

- Create a **`Markets` namespace in BOTH `messages/en.json` and `messages/ar.json`**, with
  **identical keys** in both files (the app enforces key parity). Put every user-facing string there.
- Use next-intl: `const t = useTranslations('Markets')` in client components (the page already
  provides the locale). **Do not** add new `isAr ? '…' : '…'` ternaries — that pattern is what you're
  replacing.
- **Arabic is primary.** Arabic copy must be natural MSA for a young-adult register — not machine
  Arabic. RTL must be correct: use **logical Tailwind properties** (`ms-*`/`me-*`/`ps-*`/`pe-*`,
  `text-start`/`text-end`, `flex-row` that follows `dir`), never hardcoded `left/right`.
- Formatting: SAR for TASI, USD for NASDAQ; format numbers with locale-aware separators. When a TASI
  `arName` is empty, fall back to `name`/`symbol` (§3.1) — never render blank.

---

## 8. Hard rules (from the project — CI enforces these)

1. **Mock-first invariant:** the page must fully work with **no API keys set** (data comes back mock
   but correctly shaped). Never assume live keys.
2. **No new npm dependencies.** framer-motion, lucide-react, lightweight-charts, next-intl are already
   present. Adding a dependency requires separate written justification — don't.
3. **Money at the display boundary only.** Values arrive as `number` from the API; format for display,
   don't do money math in the component.
4. **Every new user-facing string in both message files, same keys, same change.**
5. **No fabricated financial analysis** anywhere in the UI (static or generated-looking).

---

## 9. Scope fence + data fixes

**Do NOT touch (frozen / other owners):**
`src/services/marketData.ts` · `src/lib/stockUniverse.ts` · `src/app/api/**` · `src/quant/**` ·
`prisma/**` · any `.env*` file.

**Small data fix you SHOULD make** (in `src/lib/tickers.ts`, the featured-subset file): two English
labels are wrong — `8250.SR` is **Gulf Insurance Group** (currently mislabeled "Amana Insurance") and
`6060.SR` is **Ash-Sharqiyah Development Co.** (currently "East Agriculture"). Correct both.

---

## 10. Acceptance criteria (all must pass)

- [ ] Typing `aramco` (TASI) or `app` (NASDAQ) in the search box shows matches **beyond the old 30**,
      sourced from `/api/stocks/search`. Selecting a result loads its real chart + quote and updates
      the URL.
- [ ] Empty query shows a featured list; loading/empty/error states all render.
- [ ] `src/components/MarketsClient.tsx` is decomposed into **≥4 components under
      `src/components/markets/`**; **no new file > ~500 lines**.
- [ ] `grep -rn "getRushdGPTResponse" src/` → **no results** (fabricated analysis removed).
- [ ] A `Markets` namespace exists in **both** `messages/en.json` and `messages/ar.json` with
      identical keys; no new `isAr ? …` string ternaries introduced.
- [ ] `8250.SR` and `6060.SR` English labels corrected.
- [ ] RTL correct with logical properties; Arabic renders naturally in `ar` locale.
- [ ] **Commands green:** `npx tsc --noEmit` (clean) · `npm run lint` (no new errors) ·
      `npx vitest run` (all pass) · `npm run build` (succeeds).

---

## 11. File map (where to look)

```
src/app/[locale]/markets/page.tsx        server page — active-symbol fetch + session (keep wiring)
src/components/MarketsClient.tsx          the 1,748-line monolith to decompose (then delete/replace)
src/components/markets/**                 NEW — your decomposed components live here
src/components/AdvancedTradingChart.tsx   reuse (price chart child)
src/components/QuizModal.tsx              reuse (quiz child)
src/components/DisclaimerBanner.tsx       reuse (not-advice banner)
src/lib/stockUniverse.ts                  FROZEN — import rosters/searchUniverse (do not edit)
src/lib/tickers.ts                        featured subset — only the two label fixes in §9
src/services/marketData.ts               FROZEN — data interfaces + fetchMarketData (do not edit)
src/app/api/stocks/search/route.ts        FROZEN — the search endpoint (do not edit)
src/app/api/market-data/route.ts          FROZEN — per-symbol data (do not edit)
messages/en.json, messages/ar.json        add the identical `Markets` namespace to BOTH
```

---

## 12. Definition of done

The Markets page lets a user **search the whole real universe** in either market and either language,
view a polished, accurate detail panel with a live chart and Sharia badge, in clean RTL/LTR — built
from small, maintainable components, with **no fabricated analysis** and **no hardcoded 30-stock
ceiling**, all green under `tsc` / `lint` / `vitest` / `build`, and working with zero API keys.
