# Verified halal universe (QUANT_DESIGN.md QDR-8, R4 unit C1)

Zero-cost, fail-closed universe assembly. Every function here is pure/synchronous or DB-read-only
(no persistence); network is confined to one optional, never-tested file (`tier2XbrlFetch.ts`).

**This module never decides `VERIFIED_COMPLIANT`.** It only labels which tier produced a name
(`index-provider-screened` / `rushd-xbrl-screened` / `zoya-verified`) and carries its per-name
purification ratio when one exists. The i18n-fintech-expert gate (a later stitch) decides which
tier(s) qualify for execution; anything unlabeled/excluded is fail-closed.

**Documented QDR-8 exception (Sharia-gate CONDITIONAL PASS, tracked for a QUANT_DESIGN.md
amendment):** Tier-1 entries carry `purificationRatioBps: 'n/a — not computed'` with the
structured reason code `FUND_LEVEL_PURIFICATION_ONLY` in `reasonCodes` — SPUS/HLAL disclose only
fund-level AAOIFI screening (and, for HLAL, fund-level dividend purification), never a per-name
ratio, so QDR-8's "every verified name carries a per-name purification ratio" is met for Tier-2
(`rushd-xbrl-screened`) names but not yet for Tier-1 ones; QUANT_DESIGN.md is being amended to
record this as an accepted, documented exception rather than silently under-delivering the
contract.

## Files

- `types.ts` — `UniverseEntry` / `ExclusionReason` shared shapes.
- `csv.ts` — minimal CSV parser for the committed fixtures (no dependency: fixtures have no
  quoted-comma fields, verified at write time — see lazy-dev ladder note in the file).
- `tier1SpusFixture.ts` — **Tier-1**: parses `fixtures/spus-holdings-2026-07-17.csv` (219 rows,
  217 tradable after fail-closed exclusions) and `fixtures/hlal-purification-q2-2026.csv`
  (fund-level dividend purification only).
- `tier2AaoifiScreener.ts` — **Tier-2**: pure AAOIFI-aligned ratio screen (interest-bearing
  debt/mcap < 30%, cash+interest-securities/mcap < 30%, non-compliant income/revenue < 5% — this
  ratio IS the purification ratio) plus a SIC-code sector exclusion list. These are
  AAOIFI-aligned ratio criteria (industry-standard 30/30/5, market-cap denominator), not a
  verbatim citation of a specific AAOIFI Sharia Standard clause. Also fail-closes on
  `STALE_FUNDAMENTALS`: any XBRL input older than `maxInputAgeDays` (default 550 days — one
  fiscal year + filing lag) is excluded rather than silently treated as still-compliant.
- `tier2XbrlFetch.ts` — optional, network-touching SEC EDGAR fetcher for Tier-2 raw inputs. Not
  imported by the default build path; not used by any test.
- `buildVerifiedUniverse.ts` — assembles Tier-1 → Tier-2 (Tier-1 wins on symbol collision) →
  Tier-3 stub (key-gated, produces zero entries in this unit — never fabricates a Zoya verdict).
- `sleeveSelector.ts` — top-~100-by-real-dollar-volume sleeve over `MarketBar` (DB read, reuses
  `PointInTimeStore` from `src/quant/data/pointInTime.ts` — no new query pattern, no look-ahead).

## HLAL N-PORT status: TODO, not shipped

Wahed publishes no machine-readable daily holdings file for HLAL. Per QDR-8's zero-scraping rule,
the only free path to HLAL's full portfolio is its latest **SEC N-PORT filing** on EDGAR
(`data.sec.gov/Archives/edgar/data/.../primary_doc.xml` or the equivalent JSON), which requires
resolving HLAL's CIK, locating the most recent `NPORT-P` filing, and parsing its holdings XML —
not cleanly achievable inside this unit's scope fence (new-files-only, no new dependency for XML
parsing, no time to validate the schema against a real filing). **This unit ships SPUS-only
Tier-1** and records HLAL holdings ingestion as an explicit TODO for a follow-up data-engineer
unit. The committed `hlal-purification-q2-2026.csv` fixture is retained because it is real,
usable data — HLAL's fund-level *dividend purification factor* — but it is NOT a holdings list and
grants no per-name Tier-1 membership.

## Manual-verification artifact: 5-name Tier-2 AAOIFI ratio table

Computed from **real SEC XBRL data** (`data.sec.gov/api/xbrl/companyfacts` + `submissions`,
fetched 2026-07-19, User-Agent `RUSHD-Quant/0.1 research@rushd.app`) combined with the real price
column from the committed SPUS fixture (`spus-holdings-2026-07-17.csv`, as-of 2026-07-17). Four
mega-caps (NVDA, AAPL, MSFT, GOOGL) plus one non-mega-cap already in SPUS (SWKS — Skyworks
Solutions, SIC 3674). No data was pasted in from Zoya/Musaffa/Islamicly or any other screening
app — only SEC filings and the committed fixture.

Thresholds (QDR-8 / QUANT_DESIGN.md §2.3 agent-5, AAOIFI-aligned — not a verbatim clause
citation): debt/mcap < 30%, cash+interest-securities/mcap < 30%, non-compliant income/revenue < 5%
(= purification ratio), sector not excluded, **and** every contributing XBRL fact ≤ 550 days old
(`STALE_FUNDAMENTALS`, `computeAaoifiScreen`'s `asOf` = the OLDEST of the four facts, not the
newest — see `tier2AaoifiScreener.ts`). Reference date for the staleness check: 2026-07-19.

| Symbol | SIC (sector) | Debt/Mcap | Cash+Sec/Mcap | Non-compliant income / revenue | Purification ratio | Oldest input date (age) | Verdict | Notes |
|---|---|---|---|---|---|---|---|---|
| NVDA | 3674 Semiconductors | 8,468M / 4,923,750M ≈ **0.17%** | (10,605M+34,621M) / 4,923,750M ≈ **0.92%** | 2,300M / 215,938M ≈ **1.07%** (106.6 bps) | **107 bps** | 2026-01-25 (≈175d) | **PASS** | All four facts (debt/cash/revenue/interest income) FY end 2026-01-25 (10-K, filed 2026-02-20) — fresh. mcap = SEC shares outstanding (24.30B, 2026-02-20) × SPUS fixture price ($207.40). |
| AAPL | 3571 Electronic Computers | 90,678M / 4,923,750M ≈ **1.84%** | (35,934M+18,763M) / 4,923,750M ≈ **1.11%** | 3,750M / 416,161M ≈ **0.90%** (90.1 bps) | n/a (excluded) | 2023-09-30 (≈1,023d) | **EXCLUDED — `STALE_FUNDAMENTALS`** | Debt/cash/revenue are fresh (FY end 2025-09-27), but the non-compliant-income tag (`InvestmentIncomeInterestAndDividend`) was last separately reported 2023-09-30 (Apple has since folded it into "Other income, net") — **1,023 days old, over the 550-day ceiling**. The ratios above are shown for transparency but the screen correctly refuses to pass on a >2.8-year-old input rather than let a fresh debt/revenue date mask it. mcap = shares outstanding (14.78B, 2025-10-17) × SPUS fixture price ($333.26). |
| MSFT | 7372 Prepackaged Software | 43,151M / 2,981,382M ≈ **1.45%** | (30,242M+64,323M) / 2,981,382M ≈ **3.17%** | 677M / 281,724M ≈ **0.24%** (24.0 bps) | n/a (excluded) | 2013-06-30 (≈4,768d) | **EXCLUDED — `STALE_FUNDAMENTALS`** | Same pattern as AAPL, far worse: the non-compliant-income tag was last separately reported for FY2013 (≈13 years old). Debt/cash/revenue are fresh (FY end 2025-06-30) but that no longer matters once the screen keys off the oldest input. mcap = shares outstanding (7.43B, 2025-07-24) × SPUS fixture price ($401.10). |
| GOOGL | 7370 Computer Programming/Data Processing | 49,085M / 4,284,510M ≈ **1.15%** | (30,708M+96,135M) / 4,284,510M ≈ **2.96%** | 4,337M / 402,836M ≈ **1.08%** (107.7 bps) | **108 bps** | 2025-12-31 (≈200d) | **PASS** | All four facts FY end 2025-12-31 (10-K, filed 2026-02-05) — Alphabet still separately tags `InterestIncomeOther`, so nothing is stale. mcap = shares outstanding (12.088B, 2025-12-31) × SPUS fixture price ($354.46). |
| SWKS | 3674 Semiconductors | 995.8M / 8,641.8M ≈ **11.52%** | (1,161.3M+212.9M) / 8,641.8M ≈ **15.90%** | 1.2M / 4,086.9M ≈ **0.03%** (0.3 bps) | n/a (excluded) | 2021-10-01 (≈1,753d) | **EXCLUDED — `STALE_FUNDAMENTALS`** | Non-mega-cap control. Debt/cash/revenue are fresh (FY end 2025-10-03), but the interest-income tag (`InvestmentIncomeInterest`) was last separately reported FY2021 (≈4.8 years old) — over the ceiling even though the ratio itself would clear 5% by a wide margin. |

**Why three of five now read EXCLUDED instead of PASS:** an earlier version of this table (and of
`tier2XbrlFetch.ts`) computed `asOf` as the NEWEST of the four contributing facts, which let a
fresh debt/revenue filing mask a years-stale non-compliant-income tag and pass names that should
not have been trusted yet. The Sharia gate flagged this (CONDITIONAL PASS, fix #1); `asOf` is now
the OLDEST contributing fact, and `computeAaoifiScreen` fail-closes with `STALE_FUNDAMENTALS` on
anything older than `maxInputAgeDays` (default 550d). This is a real, inherent limitation of an
XBRL-only Tier-2 (several large filers stop separately tagging small non-operating income once
they net it into "Other income (expense), net") — not a bug in the fix, and the honest reason
Tier-2 exists as a *fallback* behind Tier-1 fund holdings, not a replacement for them.

**Sector screen**: none of the five names fall in the SIC exclusion ranges (`tier2AaoifiScreener.ts`:
conventional finance 6000–6411, alcohol 2080–2085, tobacco 2100–2141, gambling 7993/7999, pork
2013/0213, weapons 3480–3489/3760–3769/3795). **Known gap**: "adult entertainment" has no
dedicated SIC code and is NOT screenable via this mechanism — recorded here rather than guessed at
with an arbitrary code.
