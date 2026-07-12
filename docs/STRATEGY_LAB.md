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
| gapper-orb | T1 | Micro-cap gappers (mcap 10–400M, PM>5%, day>5%, cumVol≥10M consol. / 350k IEX) continue after a 5-min opening-range breakout | v1 (consol.) · v1-iex (minCumVolume 350k) | CODIFIED — INSUFFICIENT_TRADES | 0 (90d IEX, 20 syms×62d) | n/a | n/a | 0.00% | n/a (0 days) | 0 trades in 90d/20-symbol window — universe out of mcap band (16/20 never <400M; 4 in-band SNDL/CHPT/FCEL/DNA have ~0 PM≥5% days); v1-iex calibrated (median IEX/consol vol ratio 3.28% → minCumVolume 350k); needs micro-cap universe (G3d) |
| htf-trend-filter | T1 | Long entries only above the 1H 100-EMA improve every other setup's expectancy (composable filter, not standalone) | v1 | CANDIDATE | – | – | – | – | – | codify; A/B via harness |
| vwap-reclaim | T1 | Long wick + volume + no-follow-through at VWAP marks absorption; reclaim continues up (incl. premarket-VWAP variant) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| rsi-exhaustion-long | T1 | RSI(2–14)≤10 + first reversal candle mean-reverts up (long side only) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| stop-hunt-reversal-long | T1 | Fake break below prior-day low + hard reclaim = stop sweep; continuation up | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| bagholder-bounce | T1 | Gap-down ≥20% + flush + first higher low bounces (long) | v1 | CANDIDATE | – | – | – | – | – | codify after G1 |
| time-of-day | T1 | 9:45 reversal + first-hour trend lock as entry-window constraints improve fills | v1 | CANDIDATE | – | – | – | – | – | codify as constraints; A/B |
| coint-statarb-long-leg | T2 | Engle–Granger cointegrated halal pairs: long the undervalued leg at spread ≥ k·σ, exit at mean | v1 | CANDIDATE | – | – | – | – | – | needs daily bars only; codify after G2 framework |
| bollinger-mr-long | T2 | Buy lower Bollinger band in stationary regimes (Chan ch.2–3); Kalman spread variant later | v1 (20d band, 2σ, VR≤1 gate) | BACKTESTED — REJECTED | 151 | +1.10%/trade (net, but IS-only) | 0.954 full / **0.283 OOS** | **75.4%** | 0.00% | REJECTED: OOS collapses (CAGR −32%, Sharpe −1.37) & MC maxDD p95 75% ≫ 30% breaker & ruin 14.7%. Propose v2 as NEW candidate (tighter regime gate / per-name sizing), do not tune v1 |
| ts-momentum-halal-basket | T2 | Long-only time-series momentum (252d & 63d dual) with vol targeting on halal mega-cap tech basket (compliant NQ proxy) | v1 (252/63 dual mom, 100-EMA-break OR 63d≤0 exit) | BACKTESTED — REJECTED | 231 | +0.72%/trade (net, jitter mean; IS-only) | 0.924 full / **0.186 OOS** | **81.4%** | 0.01% | REJECTED: OOS collapses (CAGR −45%, Sharpe −1.85, DSR 0.186) & MC maxDD p95 81.4% ≫ 30% breaker & ruin 24.2% & permutation p=0.108 (no edge vs sign-flip). Do NOT tune v1; a per-name-sized / regime-conditioned v2 is a NEW candidate |
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
- bollinger-mr-long v1 (G2 daily, measured 2026-07 via `npm run backtest -- --setup bollinger-mr-long --from 2022-07-01 --to 2026-07-10`, seed 42, dataFeed=yahoo-daily; results/bollinger-mr-long-2022-07-01-2026-07-10.json): 25-name NASDAQ-halal universe, real MarketBar spine, **1,777 MOCK bars excluded in-path** (GOOGL 585 / MSFT 514 / NVDA 678). 151 trades (11 full-history names carry it; the 14 recent-backfill names have ≤102 bars and near-zero trades). IN-SAMPLE flatters (CAGR 34.2%, Sharpe 2.20, DSR 0.954, hit 62%, +1.10%/trade net) but **OOS (last 30% of trades) collapses: CAGR −32.3%, Sharpe −1.37, DSR 0.283**. MC maxDD p95 = 75.4% (≫ 30% breaker), risk-of-ruin 14.7%, entry-jitter p=0.048. Verdict **FAILED_PROMOTION → REJECTED**: classic regime-dependent mean-reversion that works in the 2023–24 bull tape and unwinds OOS; loss-avoidance (Klarman) gate fails hard. Do NOT re-tune v1 (data-snooping) — a v2 with a stricter stationarity gate + per-name (not pooled-independent) sizing is a NEW ledger candidate. New daily-cadence engine path: `simulateSetupDaily`/`filterRealDailyBars` in backtest/engine.ts (holds across days; same decide-close/fill-next-open + cost model as `simulate`).
- ts-momentum-halal-basket v1 (G2 daily, measured 2026-07 via `npm run backtest -- --setup ts-momentum-halal-basket --from 2022-07-01 --to 2026-07-10`, seed 42, dataFeed=yahoo-daily; results/ts-momentum-halal-basket-2022-07-01-2026-07-10.json): 25-name NASDAQ-halal basket, real MarketBar spine, **585 MOCK bars excluded in-path** (GOOGL only). 231 trades (11 full-history names carry it — the 12 recent-backfill names have ≤130 bars, < the 252d momentum window, so 0 trades). Dual absolute-momentum entry (252d>0 AND 63d>0), exit on 63d≤0 OR close<EMA100. IN-SAMPLE plausible-looking (CAGR 25.2%, Sharpe 1.30, DSR 0.924, mean +0.72%/trade net) but **OOS (last 30% of trades) collapses: CAGR −45.2%, Sharpe −1.85, DSR 0.186**; hit-rate only 41.6% (trend-follower: few big wins, many small losses). MC maxDD p5/p50/p95 = 36.6/57.8/**81.4%** (≫ 30% breaker), risk-of-ruin 24.2%, **entry-jitter permutation p=0.108 — the edge is NOT distinguishable from random sign-flips**. Verdict **FAILED_PROMOTION → REJECTED**: momentum rides the 2023–24 mega-cap-tech bull then unwinds OOS; the pooled-independent full-cash-per-name sizing amplifies drawdown (same structural flaw flagged for bollinger v1). Do NOT re-tune v1 (data-snooping). A v2 that (a) sizes per-name off shared equity so the basket can't all be max-long at once and (b) adds a market-regime gate is a NEW ledger candidate. Realistic momentum anchor is teens-20s% at Sharpe ~1 — the IS figure sat there, but OOS + MC + permutation together falsify a tradable edge.
- gapper-orb IEX calibration (G3b, measured 2026-07 via scripts/calibrate-iex-ratio.ts): the Alpaca IEX feed prints a MEDIAN 3.28% of consolidated daily volume (1,240 symbol-days, range 0.59–14.97%), so v1's 10M consolidated cumVolume screen ⇒ v1-iex minCumVolume = 350k. Volume leg only; mcap band + gap thresholds unchanged. The full 90d/20-symbol IEX backtest (per-day batched, per-symbol streamed; results/gapper-orb-2026-04-13-2026-07-10-pooled.json) yielded 0 qualifying setups → INSUFFICIENT_TRADES. Funnel (screen legs, symbol-days): mcap∈band 128 / PM≥5% 24 / day≥5% 214 / vol≥350k 884, JOINT 0. Root cause is universe, not edge: 16/20 backfill names never enter the 10–400M band (they're 700M–30B) and the 4 that do (SNDL/CHPT/FCEL/DNA) have ~0 PM≥5% days with near-zero IEX premarket volume. Needs a real micro-cap gapper universe (G3d) before any validation claim.
