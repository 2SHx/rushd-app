# Strategy Lab — Ledger

Single source of truth for the strategy loop (plan: `G2/G3 Strategy Lab`). One row per setup.
Statuses: `CANDIDATE → CODIFIED → BACKTESTED → VALIDATED | PARKED | REJECTED`. Never delete a row —
a REJECTED row with evidence prevents blind re-tries. Cold-start every session from this file +
docs/JOURNAL.md, never from re-exploration. Raw bars / equity curves / MC distributions live in
DB + `results/*.json`, NEVER in this file — headline metrics only.

**Promotion gate (QDR-6):** walk-forward · ≥20–30% OOS holdout · ≥100–200 trades · deflated Sharpe ·
profit plateau · MC maxDD p95 within envelope. Sharpe > 3 ⇒ `implausible`, blocks promotion.
All setups long-only cash (Sharia: no short, no margin). Every claim labeled simulated/paper.

## Active catalog

| id | tier | hypothesis (one line) | params ver | status | trades | expectancy/trade (net) | dSharpe | maxDD p95 | P(day≥5%) | next action |
|---|---|---|---|---|---|---|---|---|---|---|
| gapper-orb | T1 | Micro-cap gappers (mcap 10–400M, PM>5%, day>5%, vol>10M) continue after a 5-min opening-range breakout | v1 | CODIFIED | – | – | – | – | – | run G3 backtest + MC; no validation claim yet |
| htf-trend-filter | T1 | Long entries only above the 1H 100-EMA improve every other setup's expectancy (composable filter, not standalone) | v1 | CANDIDATE | – | – | – | – | – | codify; A/B via harness |
| vwap-reclaim | T1 | Long wick + volume + no-follow-through at VWAP marks absorption; reclaim continues up (incl. premarket-VWAP variant) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| rsi-exhaustion-long | T1 | RSI(2–14)≤10 + first reversal candle mean-reverts up (long side only) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| stop-hunt-reversal-long | T1 | Fake break below prior-day low + hard reclaim = stop sweep; continuation up | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| bagholder-bounce | T1 | Gap-down ≥20% + flush + first higher low bounces (long) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| time-of-day | T1 | 9:45 reversal + first-hour trend lock as entry-window constraints improve fills | v1 | CANDIDATE | – | – | – | – | – | codify as constraints; A/B |
| coint-statarb-long-leg | T2 | Engle–Granger cointegrated halal pairs: long the undervalued leg at spread ≥ k·σ, exit at mean | v1 | CANDIDATE | – | – | – | – | – | needs daily bars only; codify after G2 framework |
| bollinger-mr-long | T2 | Buy lower Bollinger band in stationary regimes (Chan ch.2–3); Kalman spread variant later | v1 | CANDIDATE | – | – | – | – | – | codify after G2 framework |
| ts-momentum-halal-basket | T2 | Long-only time-series momentum with vol targeting on halal mega-cap tech basket (compliant NQ proxy) | v1 | CANDIDATE | – | – | – | – | – | define basket with Sharia agent |
| silver-swing | T2 | Swing long on silver exposure — instrument fiqh-contested (ribawi/spot rules) | v1 | PARKED | – | – | – | – | – | Sharia agent adjudicates proxy (miners' equities?) first |

## Parked — data-gated (Tier D)

| id | missing data | note |
|---|---|---|
| l2-hidden-bid-scalp | Level-2 order book feed | no free source; revisit if feed acquired |
| options-flow (gamma/max-pain/OI) | options chain + OI feed | free sources unreliable; park |
| dark-pool-footprints | ATS/dark-pool prints | paid feeds only; park |
| merger-arb | corporate-events feed + shorting (Sharia) | doubly gated; park |

## Excluded — Sharia (Tier S)

Short-side setups (broken-parabolic short, fake-halt rug, AH pump fade, earnings-rip fade, FOMC fade,
merger-arb short) are EXCLUDED from execution (no shorting). Long mirrors kept where they exist:
earnings/FOMC panic-flush → long bounce (folded into bagholder-bounce / time-of-day). Educational
content may teach them flagged per DR-5.

## Post-pause research lanes (G6 — need user go)

| id | lane | first rung (lazy-dev) |
|---|---|---|
| rl-ppo-baseline | G6a deep-RL | single-agent PPO on G3 gym env; identical gates; QDR-3 Python escape needs architect |
| xsec-factor-linear | G6b cross-sectional factor | LINEAR momentum+turnover quantile ranks (Quantformer's inputs) before any transformer; monthly cadence |

## Research anchors (calibration — beating these by 10× = implausible flag, not celebration)

- Zarattini/Aziz/Barbon SPY ORB (Swiss Finance Inst. 24-97): ≈19.6%/yr, Sharpe 1.33–2.4 — best published intraday momentum.
- VWAP band reversion (QuantConnect): 61–71% win rate, ≈1.4:1 RR.
- Quantformer (arXiv 2404.00424, CREDIBLE): 17–25%/yr, Sharpe 0.9–1.0, alpha ≈0.16, 0.3% costs, 4,601 A-shares; monthly rebalance beat weekly AND daily; long-only by construction.
- DRL survey (Pricope 2021): most published RL traders unprofitable in realistic settings; best case ~20–60% ANNUAL; backtest ≠ live.
- MAPPO-SLSTM paper (WARNING, not target): Sharpe 4.0 with zero transaction costs on ~1,070 records, incomplete walk-forward — exceeds our implausible flag.
- OHLCV-signal falsification literature exists (arXiv 2605.04004).
- Klarman doctrine: loss avoidance first — steady 16%/yr × 10y beats 20%/yr × 9y then one −15% year. MC maxDD p95 gate enforces this.
