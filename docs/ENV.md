# Environment Reference

`.env` (gitignored, human-edited only) configures Rushd. Everything defaults to the
zero-outbound **bundled mode**. Keys do nothing unless their integration is explicitly enabled.

## Required
```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/rushd"
AUTH_SECRET=""          # openssl rand -base64 32   (required outside local dev)
CRON_SECRET=""          # openssl rand -hex 24      (schedulers' Bearer token)
RUSHD_APP_URL=""        # production HTTPS origin used by the one daily Render cron
PUBLIC_DEMO_MODE="0"    # set to "1" only for a temporary public no-login demo
```

## Alpaca — market data + PAPER account preflight
Free tier. Gives the quant pipeline real-time IEX data and permits read-only paper-account
preflight. External paper order mutation is a separate M17 security gate, not implied by keys.
```bash
MARKET_DATA_MODE="live"  # bundled (default/no network) | keyless (Yahoo delayed) | live
ALPACA_API_KEY=""       # the Key ID from your PAPER account
ALPACA_API_SECRET=""    # the Secret shown once at key-generation time
# ALPACA_BASE_URL=      # LEAVE UNSET for paper. The app defaults to the paper
                        # endpoint; a live URL is hard-blocked unless the CMA
                        # licensing gate is satisfied (QUANT_DESIGN §5 / liveGuard).
# QUANT_PAPER_BROKER="ALPACA_PAPER"       # leave unset: INTERNAL_SIM is authoritative/default
# QUANT_SHADOW_PAPER_MUTATIONS="1"        # leave unset until every DR-11/M17 gate passes
```

### How to get the paper key (≈2 minutes)
1. Go to **https://alpaca.markets** → **Sign up** (free) and confirm your email.
2. In the dashboard, switch to **Paper Trading** (top-left account switcher — it says "Live"/"Paper"). Make sure it reads **Paper**.
3. On the right panel find **"API Keys"** → **Generate New Keys** (or "View").
4. Copy the **API Key ID** → `ALPACA_API_KEY`, and the **Secret Key** (shown only once) → `ALPACA_API_SECRET`, into `.env`.

Then verify: `node scripts/verify-alpaca.mjs` (read-only; inventories account/positions/open orders,
checks a live bar, never prints the secret, and exits blocked unless the paper account is clean).

## LLM — committee analysts, debate, Portfolio Manager
OpenAI-compatible and free-model-first. Unset → the committee uses deterministic analysts,
one local bilateral debate, and the versioned deterministic PM policy with zero outbound calls.
```bash
QUANT_LLM_API_KEY=""    # explicit opt-in; generic OPENAI_API_KEY is deliberately ignored
QUANT_LLM_BASE_URL="https://openrouter.ai/api/v1"
# QUANT_LLM_RETRY="true" # optional second free-model attempt; off by default
```

## LLM — quiz and educational signal prose
The bilingual local quiz bank and a symbol-bound educational HOLD are the defaults.
```bash
# APP_LLM_MODE="live"
# APP_LLM_API_KEY=""
# APP_LLM_BASE_URL="https://openrouter.ai/api/v1"
# APP_LLM_MODEL="openai/gpt-oss-20b:free"
```

## Optional vendors (mock without)
```bash
SAHMK_API_KEY=""        # TASI market data (else Yahoo .SR / mock)
ZOYA_API_KEY=""         # AAOIFI Sharia screening (else mock screener)
AUTO_RUN_MAX_STRATEGIES="1"  # default 1, hard ceiling 50
AUTO_RUN_MAX_SYMBOLS="5"     # default 5, hard ceiling 20
# QUANT_LEGACY_REBALANCE_ENABLED="1" # obsolete unbounded fan-out route; leave unset/dark
```

## Real-money LIVE execution — DARK BY DEFAULT (do not set casually)
Live orders require **all three** below **and** a CMA license. Leave unset for paper.
```bash
# QUANT_LIVE_EXECUTION="1"
# QUANT_CMA_LICENSE_REF="..."
# ALPACA_BASE_URL="https://api.alpaca.markets"
```
