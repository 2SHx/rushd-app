# Recon brief: ValueSnapshot stock page — exhaustive feature inventory

**For:** any browser-capable agent (Codex, Claude Code with browser MCP, etc.)
**Target:** `https://valuesnapshot.io/stock/NVDA` (if NVDA fails to load — the SPA sometimes errors — try AAPL or MSFT via the site's own search)
**Output:** save the inventory as `docs/recon/VALUESNAPSHOT_STOCK_RECON.md` in this repo (this directory), one `##` section per tab. Save screenshots to `docs/recon/shots/` named `<tab>-<n>.png` and reference them from the markdown. If you are running outside this repo, produce the same markdown and hand it back to the user.

## Access

A free account (7-day trial, no credit card, per their pricing page) may unlock more of the page — register one if needed. Note in the output which observations required the account.

## Inventory rules

Capture the site's **features, data fields, and information architecture** — in your own words. Do **not** copy their prose/marketing text (short field labels like "P/E Ratio" are fine), do **not** copy CSS or visual styling, and do **not** reproduce their AI-report text beyond a one-line description of what each section contains. We are building feature parity in our own design system, not a clone of their assets.

## For EACH tab — Overview, Charts, Financials, Valuation, Analyst, Compare, AI Analysis, Snapshot, Earnings, SEC Filings — record:

1. Every section top-to-bottom, in order.
2. Every metric/field: exact label, value format (%, $, ×, chip, sparkline…), and where it sits.
3. Every chart: type, series shown, available time ranges/toggles, hover/tooltip behavior, legend.
4. Every interactive control (dropdown, toggle, segmented control, slider, expandable row) — **click/try each one** and note what changes.
5. **Valuation tab in maximum depth:** each model (DCF, EPS, PEG, Rule of 40, …), its visible input assumptions, whether inputs are editable, the output (fair value, upside %, verdict chip), and how multiple models are aggregated into one verdict.
6. **Compare:** how stocks are added, which metrics are compared, layout.
7. **AI Analysis:** which sections the report has (summary / bull case / bear case / risks / thesis — names only), generation UX (instant vs loading), regeneration options.
8. Watchlist / alert / portfolio actions available from the stock page.
9. **Free-vs-paid boundaries:** exactly which elements are locked, what the locked state looks like (blur / CTA / counter), and any usage meter ("X of 5 valuations used").
10. States: initial loading, empty, error; mobile layout differences (resize to ~390 px).
11. Sidebar features reachable from this page (Value Analyzer, Technical Signals, Stock Ideas, Market Briefs) — one short paragraph each on what they show.

## Finish with `## Summary`

Total feature count per tab, the 5 most impressive UX details, and anything unexpected.
