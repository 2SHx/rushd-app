---
name: market-integration
description: How to wire real market APIs into Rushd Quant behind the provider/broker adapter pattern — Alpaca (data + paper trading + news), TASI data, Zoya screening, fundamentals — with mock-first fallback and the gated paper→live path. Use when building data ingestion, the BrokerAdapter, or any external-feed adapter.
---

# Market Integration (adapters, mock-first)

Every external API is an adapter behind the registry, so the whole system runs keyless in mock mode — the project's hard invariant. Extend the existing `ProviderRegistry` + `MarketDataProvider`/`ShariaScreener` interfaces + `TokenBucket` + TTL cache in `src/services/marketData.ts` (mirror the `AlpacaAdapter` stub shape). Never let a live path throw — degrade to cache, then mock.

## Alpaca — the anchor (NASDAQ)
One provider, three jobs, all free-tier viable:
- **Market Data** (`ALPACA_API_KEY`/`ALPACA_API_SECRET`): 6+ yrs of OHLCV+VWAP+trade-count bars (1Min–12Month). Powers Q0 ingestion (the backtest substrate) and the Technical/Pattern agents. Free tier = IEX feed (~2.5% volume) — fine for paper/learning; note the coverage limit.
- **Paper Trading** (`ALPACA_PAPER=true`, paper base URL): real order lifecycle (submit → fill → positions → account) on virtual money. **Same API as live** — going real is a keys+base-URL swap, which is exactly why it must be HARD-gated (below).
- **News** (same keys): real per-symbol headlines → the News/Catalyst agent (#2).

## The BrokerAdapter interface (execution)
Abstract execution so the committee/UI are market-agnostic:
- `AlpacaPaperBroker` — NASDAQ: places real Alpaca paper orders; **sync positions back to `PortfolioItem`** and reconcile the internal virtual-cash/cost-basis ledger to Alpaca's account (Alpaca is the source of truth when connected).
- `InternalSimBroker` — TASI + keyless mock: mutates `PortfolioItem` + cash + writes an audit `Transaction` inside a `$transaction` (atomic; avoid the non-atomic per-jar race in `cron/distribute`).
- Both implement `submitOrder / getPositions / getAccount`; the Sharia veto + risk clamp run BEFORE either is called.

## Other feeds (all env-gated, mock fallback)
- **TASI data:** Alpaca is US-only. Use `SAHMK_API_KEY` (existing stub) or Twelve Data / EODHD (cover Tadawul). TASI symbols are numeric (2222 = Aramco); trades Sun–Thu; SAR.
- **Sharia:** `ZOYA_API_KEY` → real AAOIFI verdicts + ratios for agent #5 ([[sharia-quant]]).
- **Fundamentals:** `FUNDAMENTALS_API_KEY` (Financial Datasets / Alpha Vantage / Finnhub) for agent #6 — carry the **release timestamp** so [[backtesting-rigor]]'s point-in-time rule holds.

## The paper→live gate (safety)
Live execution = `ALPACA_PAPER=false` + a live account. That switch is **dark by default** behind a feature flag + CMA/broker licensing + KYC/AML review, isolated in `src/quant/execution/`. No code path reaches a live broker without the flag; a test asserts it (Q6). NASDAQ-via-Alpaca is the first realistic live path; TASI live needs a separate licensed Saudi broker.

## Operational notes
- Caches/limiters are **per-instance in-memory** (stateless Next.js on Render) — fine for mock/paper; a multi-instance live path needs shared cache/limits (flag it, don't silently assume single-instance).
- Rate-limit every adapter with a `TokenBucket`; respect provider quotas; back off on 429.
- Persist ingested data (`MarketBar`/`Fundamentals`/`NewsItem`) — don't re-fetch history every pass; ingestion is a cron, reads are from the DB (point-in-time).
