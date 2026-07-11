# RUSHD Free-First Operating Modes

The objective is zero external API spend by default, without weakening the Sharia veto,
risk envelope, authorization, audit trail, or honest data labels. Hosting and PostgreSQL
may still cost money depending on the chosen provider and data-residency requirements.

## 1. Bundled demo - default

- `MARKET_DATA_MODE` unset or `bundled`: no Yahoo, Alpaca, Sahmk, Zoya, or CNN calls.
- `APP_LLM_MODE` unset and no `QUANT_LLM_API_KEY`: no runtime LLM calls.
- Market data, Sharia screening, quiz content, debate, and PM use labeled local fallbacks.
- Orders use `InternalSimBroker`; no live brokerage or payment processor is required.
- Local PostgreSQL is the only required service.

## 2. Free-key demo - explicit opt-in

- `MARKET_DATA_MODE=keyless` enables delayed Yahoo market data. It is labeled delayed.
- `APP_LLM_MODE=live` plus `APP_LLM_API_KEY` enables quiz/signal generation through the
  configured free OpenAI-compatible model.
- `QUANT_LLM_API_KEY` independently enables the five-call Quant narrative path.
- Free-provider quotas and availability are not guaranteed; every path degrades locally.

## 3. Keyed paper demo

- `MARKET_DATA_MODE=live` plus Alpaca keys enables NASDAQ data and paper orders.
- Sahmk and Zoya remain optional. Missing keys fall back to labeled local data.
- Live-money execution remains dark and CMA-gated; this mode is still virtual money.

## Cost guardrails

- A full live Quant pass uses at most five primary LLM calls. Retry is opt-in.
- Automation defaults to 1 strategy x 5 symbols; ceilings remain 50 x 20.
- Daily ingestion backfills 90 days once, then requests only elapsed days plus a 3-day overlap.
- Sharia verdicts are cached for 24 hours and stock universes for 12 hours.
- GitHub Actions cancels superseded runs on the same branch.
- No Redis, queue, vector database, worker, payment service, or live broker is needed.

## Honest limitations

- Bundled Sharia screens are demo data and never presented as verified.
- Bundled fundamentals are synthetic educational fixtures, not official filings.
- Yahoo and CNN endpoints are unofficial; use only with explicit opt-in and review their terms.
- A globally hosted free database may conflict with Saudi/GCC data-residency requirements.
