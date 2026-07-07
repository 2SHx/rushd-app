# Environment Reference

`.env` (gitignored, human-edited only) configures Rushd. Everything runs in **mock mode**
with keys unset — each key upgrades one integration from mock → real. Copy the blocks you
need into `.env` and fill in the values.

## Required
```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/rushd"
AUTH_SECRET=""          # openssl rand -base64 32   (required outside local dev)
CRON_SECRET=""          # openssl rand -hex 24      (schedulers' Bearer token)
```

## Alpaca — PAPER trading (real NASDAQ data + real paper order execution)
Free. Gives the quant committee **real Alpaca market data** and **real paper fills** on
virtual money. See the 4 steps below to get the keys.
```bash
ALPACA_API_KEY=""       # the Key ID from your PAPER account
ALPACA_API_SECRET=""    # the Secret shown once at key-generation time
# ALPACA_BASE_URL=      # LEAVE UNSET for paper. The app defaults to the paper
                        # endpoint; a live URL is hard-blocked unless the CMA
                        # licensing gate is satisfied (QUANT_DESIGN §5 / liveGuard).
```

### How to get the paper key (≈2 minutes)
1. Go to **https://alpaca.markets** → **Sign up** (free) and confirm your email.
2. In the dashboard, switch to **Paper Trading** (top-left account switcher — it says "Live"/"Paper"). Make sure it reads **Paper**.
3. On the right panel find **"API Keys"** → **Generate New Keys** (or "View").
4. Copy the **API Key ID** → `ALPACA_API_KEY`, and the **Secret Key** (shown only once) → `ALPACA_API_SECRET`, into `.env`.

Then verify: `node scripts/verify-alpaca.mjs` (checks the paper account + a live bar; never prints the secret).

## LLM — committee analysts, debate, Portfolio Manager
OpenAI-compatible. OpenRouter unlocks the free per-agent models + Opus fallback (docs/MODELS.md).
Unset → the committee runs on its deterministic mock.
```bash
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://openrouter.ai/api/v1"
# QUANT_LLM_API_KEY=    # optional quant-only override; else uses OPENAI_API_KEY
```

## Optional vendors (mock without)
```bash
SAHMK_API_KEY=""        # TASI market data (else Yahoo .SR / mock)
ZOYA_API_KEY=""         # AAOIFI Sharia screening (else mock screener)
```

## Real-money LIVE execution — DARK BY DEFAULT (do not set casually)
Live orders require **all three** below **and** a CMA license. Leave unset for paper.
```bash
# QUANT_LIVE_EXECUTION="1"
# QUANT_CMA_LICENSE_REF="..."
# ALPACA_BASE_URL="https://api.alpaca.markets"
```
