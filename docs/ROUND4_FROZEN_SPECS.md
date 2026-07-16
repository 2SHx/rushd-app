# Round-4 candidate teams — frozen a-priori specifications

**Freeze declaration.** These four specs were authored and dispatched for codification BEFORE any
result of the g6b-linear-factor-wide FULL run (2018-01-02→2026-07-15, seed 42, `--universe wide`)
was viewed by any session. The run artifact was persisted at 2026-07-16 19:14 local; this document's
git commit timestamps the freeze. Every parameter below is decided from repo precedent or published
literature — none is fitted to viewed data. Tuning any of these values after this commit voids the
a-priori claim and must be recorded as a NEW candidate per QDR-7.

Common charter: long-only cash, no short, no margin; QDR-6 promotion gates unchanged; wide-universe
teams implement `tradableBookSymbols` (memory-bound path); every future validation records
cumulative `validationTrials` honestly.

## Team B — `g6b-linear-factor-wide-v3` ("governed breadth")

- Signal family: g6b-linear-factor-wide v2 byte-identical (rankable = ≥253 bars, close ≥$5, 21d
  dollar-volume proxy ≥$21M; 12−1M momentum + dollar-volume 50/50 ranks; breadth floor 100 else
  cash; top decile capped at 50 equal weights; monthly).
- New layer 1 — universe-regime gate: equal-weight index of the CURRENT rankable set vs its own
  200d SMA; below ⇒ no NEW entries, exits unchanged (precedent: ts-momentum-halal-basket-v2,
  MC p95 81.4%→37.25%).
- New layer 2 — book-level vol governor: trailing-60-book-day realized vol targeting 15%
  annualized, down-only scalar to cash, never levering up (precedent: ts-momentum-halal-basket-v3).
- Plateau axes (9 cells): momentumLookback {231, 252, 273} × targetVol {13.5%, 15%, 16.5%}.

## Team C — `halal-multifactor-book` v1

- Three fixed sleeves, signal params exactly as their ledger rows froze them:
  ts-momentum-halal-basket-v2 (trend), bollinger-mr-long-v2 (mean-reversion),
  g6b-linear-factor-wide v2 (cross-sectional breadth).
- Sleeve weights: inverse trailing-60-book-day realized vol of each sleeve's own paper NAV
  (equal-risk approximation), renormalized monthly; gross ≤ 1.0; residual cash. The combination
  rule is parameter-free and frozen.
- Honesty: future DSR computed with validationTrials = 36 (3 sleeves × 9 prior trials + 9 own).
- Hypothesis: trend and mean-reversion sleeves are structurally anti-correlated; the composed book
  clears the 30% MC p95 drawdown breaker and the 0.95 OOS DSR gate through diversification —
  the only mechanism that raises Sharpe and cuts tail drawdown simultaneously.

## Team D — `momentum-ensemble-rotation` v1

- Rank: mean of cross-sectional percentile ranks of 126d, 189d, 252d momentum (each skip-21).
  Ensemble ranks are plateau-robust by construction (fixes dual-momentum-rotation's
  `spiky_neighborhood` FAIL).
- Sleeve: the declared deep-history halal names + SPUS + HLAL (dual-momentum-rotation's sleeve
  declaration pattern).
- Hold TOP-3 equal weight (fixes the 11-episode INSUFFICIENT_SAMPLE); absolute filter: ensemble
  momentum ≤ 0 ⇒ cash for that slot; monthly; fixed 25% per-name cap.
- Plateau axes (9 cells): topN {2, 3, 4} × skip {10, 21, 42}.

## Team E — `halal-low-vol-defensive` v1

- Universe: wide rankable gate verbatim (≥253 bars, ≥$5, ≥$21M dollar-volume proxy; breadth floor
  100 else cash).
- Rank ASCENDING by trailing-252d realized daily vol; hold lowest-vol decile capped at 50 equal
  weights; monthly. NO regime gate, NO momentum — defensive by construction (low-vol anomaly,
  long side).
- Plateau axes (9 cells): volLookback {189, 252, 315} × cap {40, 50, 60}.
