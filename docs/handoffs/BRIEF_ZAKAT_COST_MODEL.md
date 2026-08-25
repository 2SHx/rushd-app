# Brief — zakat and purification in the quant cost model

**Author:** orchestrator, 2026-08-26 · **Branch:** `fix/db-safety-and-continual-governance` (base `bee1b15`)
**Route:** `quant-research-director` (ruling) → `quant-strategist` (implementation) → `quant-validation-auditor` (gate). **Read-only first: nothing is implemented until the director rules.**

## The gap

`src/quant/` contains **no zakat modelling of any kind.** The engine applies `COMMISSION_BPS + SLIPPAGE_BPS` on trade notional (`portfolioEngine.ts:168`) and nothing else.

That is **15 bps per side of trading friction modelled, against ~250 bps per year of zakat unmodelled** — a cost an order of magnitude larger and considerably more certain than slippage. A `/api/purify/zakat` route applies 2.5% on the product side, so the obligation is recognised by the application and invisible to the research.

Every CAGR this program has published therefore overstates what the investor keeps.

## Magnitude — why this is not a rounding error

Hawl is lunar (~354 days), so a solar year carries ~1.031 zakat events → an effective **2.577%/yr** on full market value.

| Gross CAGR | After zakat | Absolute drag | **Relative** loss |
|---|---|---|---|
| 11.52% (30% engine weight) | 8.66% | −2.86pp | **−24.8%** |
| 15% | 12.04% | −2.96pp | −19.7% |
| 25% | 21.78% | −3.22pp | −12.9% |
| 37.11% (full engine) | 33.58% | −3.53pp | −9.5% |

**Zakat is regressive against the configurations the gate favours.** It removes a quarter of the return at 11.52% and under a tenth at 37.11%. The low-drawdown configurations that survive the risk breaker are precisely the ones it damages most — which bears directly on the drawdown budget still to be declared.

## The three rulings needed

### R1 — Is zakat a strategy cost or an investor cost?

**The case for excluding it from returns:** zakat is a personal obligation of the *investor*, not a property of the strategy. It depends on nisab, hawl date, and the holder's other assets. Two investors running the identical book owe different amounts. Embedding it in strategy returns makes cards non-comparable across investors and across time, the way income tax would.

**The case for including it:** it is certain, recurring, material, and larger than every cost already modelled. Publishing 105.92% while the investor keeps ~100.6% is precision the record has not earned.

**Recommended framing, for the director to accept or reject** — the QDR-19 precedent: **mandatory reporting, no threshold moved.** Strategy returns stay gross and comparable; every card additionally publishes a zakat-adjusted net figure with its assumptions stated. Nothing is gated on it. This is exactly how Ulcer, CVaR and the benchmark block were introduced: published evidence, no gate change, no reseal.

### R2 — Amortised drag, or dated liability?

These are not equivalent and the difference is the interesting part.

- **Amortised** (multiply annual return by 0.97423): simple, but loses the mechanism entirely.
- **Dated liability** (a ~2.5% NAV withdrawal on a fixed hawl date): path-dependent. With a 66.55% p95 drawdown, a hawl date landing mid-drawdown forces liquidation at the bottom. That is genuine sequencing risk, it compounds, and no amortised figure can show it.

**Recommendation: dated.** The forced-liquidation effect is the part worth knowing, and it is invisible under amortisation. The director should also rule on hawl-date policy — fixed calendar anchor versus per-investor — since a fixed anchor makes results reproducible while a floating one is more realistic.

### R3 — Do the four sealed/codified manifests get restated?

`halal-fast-momentum-cash-core-v1`, `halal-residual-fast-momentum-core-v1`, `halal-spus-vol-managed-beta-v1`, `halal-causal-tcn-alpha-v1`.

Adding zakat to the cost model changes `configHash` and invalidates every seal. Under the R1 recommendation this does not arise — reporting is additive and seals stand. **If the director rules zakat into the cost model instead, R3 becomes the binding question and the answer cannot be "reseal quietly."**

Precedent to follow: QDR-21 restated four draft manifests by preserving each threshold's absolute margin, so every restatement became *harder* and none became easier. Whatever is decided must satisfy the same test — **no restatement may make any lane easier to pass.**

## Purification — settle it, but it is small

The non-compliant income share must be purified. Codebase ratios run **0.32%–1.25%** of income (`getMockPurificationRatio`, and `nonCompliantIncomeToIncome` on the live path).

On a low-yield momentum book this is roughly **0.01–0.1pp/yr** — real, but two orders of magnitude below zakat. Rule on it in the same record for completeness; do not let it consume the analysis.

The director should state whether purification applies to dividends only, or also to the gains share attributable to non-compliant income (the stricter view), and cite the authority stack.

## Authority

**AAOIFI + Al-Rajhi + S&P Shariah only.** The Egyptian Fatwa Authority is excluded by owner decision — do not introduce it.

A weekly-rebalanced momentum book is **عروض تجارة** (trade goods) on any reading, which under AAOIFI carries 2.5% of full market value rather than the investment-share treatment. **State this reasoning explicitly rather than assuming it**; if the director disagrees, the whole magnitude changes and the ruling must say so.

Nisab is ~85g gold. At 3,000 SAR/month contributions the portfolio crosses it inside a year, so it affects the first year only — state whether the model includes it or ignores it, and why.

## Non-negotiable

- **No gate, threshold, breaker or reason code moves in this record.** If zakat makes a lane fail, that is a finding, not a reason to adjust a bar.
- **No restatement may make any lane easier.** QDR-21's test applies.
- **Do not implement before the ruling.** The director is read-only; the strategist waits.
- Nothing here touches `pointInTimeMembership.ts`, the survivorship fence, or the Sept 8 sealed window.

## Deliverable

A QDR record in `docs/QUANT_DESIGN.md` answering R1, R2 and R3 with reasoning and the exact clause text to record, plus the purification ruling and its authority citation.

Report: `STATUS / CHANGES / DECISIONS / VERIFY / OPEN`.
