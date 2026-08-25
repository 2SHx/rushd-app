# Survivorship coverage measurement

## Decision: DEFER licensed-history purchase

Across 25 point-in-time formation dates (2020-07-28 through 2026-07-29), exact bar coverage and confirmed delisting-adjacent opportunity counts are unavailable from the committed offline artifacts. The snapshots prove 320 historical identified symbols and 107 permanent fund removals, but removals are not delistings. **Recommendation: defer the purchase because the decisive exposure evidence cannot yet distinguish confirmed delistings or the 63-trading-day window. Capture and byte-pin the free lifecycle evidence and a date-keyed bar inventory first.**

This memo measures exposure only. It produces no corrected return statistic.

## Measurement status

- **M1 — unavailable, not zero.** Reasons: `M1_MARKET_BAR_DATE_INVENTORY_NOT_COMMITTED`, `M1_NPORT_HOLDING_IDENTITIES_UNRESOLVED`. The repository contains no committed symbol/date MarketBar inventory, so available-member counts, coverage ratios, and missing-symbol lists cannot be computed offline.
- **M2 — unavailable, not zero.** Confirmed count: unavailable. Reasons: `M2_CONFIRMED_DELISTING_LIFECYCLE_NOT_COMMITTED`, `M2_63_TRADING_DAY_WINDOW_INTERVAL_CENSORED`. Quarterly holdings only bound a removal between observations; they do not locate it within an exact trading-day window. No committed lifecycle artifact identifies which removals are confirmed delistings.
- **M3 — unavailable, not zero.** Confirmed bounds: unavailable. Reasons: `M3_CONFIRMED_DELISTING_INPUT_UNAVAILABLE`, `M3_DOLLAR_VOLUME_SLEEVE_INPUTS_NOT_COMMITTED`. The snapshot-only unclassified-removal proxy is 18–107: lower counts final holdings ranked in the fund's top 60 by weight; upper counts every permanent removal. This is not a confirmed-delisting exposure bound and cannot decide the purchase.

## M1 snapshot-only facts

Formation time is the SEC acceptance date. Each row was selected with `latestAvailableSpusNportSnapshot()`; report dates are not treated as dates when the filing was public.

| Formation | Report date | Accession | Identified members | Unresolved positive-value members | Available members | Coverage |
|---|---|---|---:|---:|---:|---:|
| 2020-07-28 | 2020-05-31 | 0001145549-20-041804 | 180 | 0 | unavailable | unavailable |
| 2020-10-28 | 2020-08-31 | 0001145549-20-063095 | 179 | 0 | unavailable | unavailable |
| 2021-01-29 | 2020-11-30 | 0001145549-21-004631 | 184 | 0 | unavailable | unavailable |
| 2021-04-23 | 2021-02-28 | 0001387131-21-004867 | 160 | 30 | unavailable | unavailable |
| 2021-07-29 | 2021-05-31 | 0001387131-21-007842 | 169 | 29 | unavailable | unavailable |
| 2021-10-27 | 2021-08-31 | 0001387131-21-010436 | 174 | 28 | unavailable | unavailable |
| 2022-01-26 | 2021-11-30 | 0001387131-22-000732 | 181 | 29 | unavailable | unavailable |
| 2022-04-26 | 2022-02-28 | 0001387131-22-005323 | 182 | 30 | unavailable | unavailable |
| 2022-07-28 | 2022-05-31 | 0001387131-22-008131 | 183 | 32 | unavailable | unavailable |
| 2022-10-26 | 2022-08-31 | 0001387131-22-010802 | 185 | 28 | unavailable | unavailable |
| 2023-01-26 | 2022-11-30 | 0001387131-23-000702 | 186 | 24 | unavailable | unavailable |
| 2023-04-26 | 2023-02-28 | 0001387131-23-005252 | 186 | 22 | unavailable | unavailable |
| 2023-07-28 | 2023-05-31 | 0001387131-23-008965 | 187 | 21 | unavailable | unavailable |
| 2023-10-30 | 2023-08-31 | 0001387131-23-012885 | 202 | 0 | unavailable | unavailable |
| 2024-01-29 | 2023-11-30 | 0002000324-24-000218 | 203 | 0 | unavailable | unavailable |
| 2024-04-26 | 2024-02-29 | 0002000324-24-001338 | 197 | 0 | unavailable | unavailable |
| 2024-07-26 | 2024-05-31 | 0002000324-24-001962 | 238 | 0 | unavailable | unavailable |
| 2024-10-25 | 2024-08-31 | 0002000324-24-003031 | 233 | 0 | unavailable | unavailable |
| 2025-01-29 | 2024-11-30 | 0002000324-25-000189 | 225 | 0 | unavailable | unavailable |
| 2025-04-29 | 2025-02-28 | 0002000324-25-001560 | 228 | 0 | unavailable | unavailable |
| 2025-07-29 | 2025-05-31 | 0002000324-25-002489 | 218 | 0 | unavailable | unavailable |
| 2025-10-29 | 2025-08-31 | 0002000324-25-004070 | 212 | 0 | unavailable | unavailable |
| 2026-01-28 | 2025-11-30 | 0002000324-26-000257 | 213 | 0 | unavailable | unavailable |
| 2026-04-27 | 2026-02-28 | 0002000324-26-001717 | 211 | 0 | unavailable | unavailable |
| 2026-07-29 | 2026-05-31 | 0002000324-26-003242 | 213 | 0 | unavailable | unavailable |

## M2 unclassified permanent removals

These 107 symbols appear in at least one captured snapshot and never appear in a later captured snapshot. They remain ordinary/unclassified fund removals unless pinned Form 25 evidence proves otherwise. No row below contributes to a confirmed-delisting count.

| Symbol | Last-seen report | Last-seen formation | Final fund weight | Weight rank | Top-60 weight proxy |
|---|---|---|---:|---:|---|
| AAP | 2023-11-30 | 2024-01-29 | 0.0136% | 201 | no |
| ABMD | 2020-11-30 | 2021-01-29 | 0.0801% | 164 | no |
| ABNB | 2024-08-31 | 2024-10-25 | 0.1716% | 87 | no |
| ALK | 2020-05-31 | 2020-07-28 | 0.0346% | 174 | no |
| ALXN | 2020-11-30 | 2021-01-29 | 0.1759% | 103 | no |
| AME | 2025-02-28 | 2025-04-29 | 0.1380% | 101 | no |
| AMGN | 2023-05-31 | 2023-07-28 | 0.6358% | 32 | yes |
| AMT | 2021-05-31 | 2021-07-29 | 0.7154% | 35 | yes |
| AMZN | 2025-05-31 | 2025-07-29 | 6.2463% | 4 | yes |
| ANSS | 2025-05-31 | 2025-07-29 | 0.0909% | 132 | no |
| APH | 2025-02-28 | 2025-04-29 | 0.2549% | 61 | no |
| APTV | 2024-11-30 | 2025-01-29 | 0.0463% | 198 | no |
| ATVI | 2020-11-30 | 2021-01-29 | 0.4037% | 51 | yes |
| AVB | 2026-02-28 | 2026-04-27 | 0.0758% | 152 | no |
| BALL | 2025-05-31 | 2025-07-29 | 0.0517% | 182 | no |
| BAX | 2022-02-28 | 2022-04-26 | 0.2340% | 78 | no |
| BIO | 2024-08-31 | 2024-10-25 | 0.0223% | 230 | no |
| BKR | 2026-02-28 | 2026-04-27 | 0.1984% | 85 | no |
| BMY | 2024-05-31 | 2024-07-26 | 0.2934% | 54 | yes |
| BWA | 2020-05-31 | 2020-07-28 | 0.0522% | 168 | no |
| CCI | 2023-11-30 | 2024-01-29 | 0.2330% | 70 | no |
| CDAY | 2023-11-30 | 2024-01-29 | 0.0478% | 179 | no |
| CERN | 2020-11-30 | 2021-01-29 | 0.1504% | 114 | no |
| COG | 2020-11-30 | 2021-01-29 | 0.0453% | 182 | no |
| CPT | 2026-02-28 | 2026-04-27 | 0.0353% | 201 | no |
| CTLT | 2024-02-29 | 2024-04-26 | 0.0429% | 185 | no |
| CTRA | 2026-02-28 | 2026-04-27 | 0.0715% | 157 | no |
| CTXS | 2020-11-30 | 2021-01-29 | 0.0997% | 147 | no |
| CVX | 2024-02-29 | 2024-04-26 | 1.1104% | 17 | yes |
| CXO | 2020-05-31 | 2020-07-28 | 0.0831% | 154 | no |
| DAY | 2024-02-29 | 2024-04-26 | 0.0452% | 183 | no |
| DGX | 2024-08-31 | 2024-10-25 | 0.0576% | 194 | no |
| DLTR | 2023-11-30 | 2024-01-29 | 0.1158% | 118 | no |
| DOC | 2021-11-30 | 2022-01-26 | 0.0901% | 154 | no |
| DRE | 2020-11-30 | 2021-01-29 | 0.0927% | 157 | no |
| ENPH | 2025-02-28 | 2025-04-29 | 0.0243% | 223 | no |
| EQR | 2025-08-31 | 2025-10-29 | 0.0758% | 148 | no |
| ESS | 2023-05-31 | 2023-07-28 | 0.0792% | 156 | no |
| ETN | 2025-02-28 | 2025-04-29 | 0.3677% | 45 | yes |
| ETSY | 2024-08-31 | 2024-10-25 | 0.0208% | 233 | no |
| FANG | 2024-08-31 | 2024-10-25 | 0.1152% | 123 | no |
| FB | 2020-11-30 | 2021-01-29 | 4.3841% | 3 | yes |
| FBHS | 2020-11-30 | 2021-01-29 | 0.0758% | 166 | no |
| FLS | 2020-08-31 | 2020-10-28 | 0.0255% | 177 | no |
| FMC | 2025-02-28 | 2025-04-29 | 0.0146% | 228 | no |
| FTV | 2025-02-28 | 2025-04-29 | 0.0873% | 142 | no |
| GAP | 2021-11-30 | 2022-01-26 | 0.0180% | 181 | no |
| GEN | 2022-11-30 | 2023-01-26 | 0.0788% | 160 | no |
| GIS | 2025-02-28 | 2025-04-29 | 0.1074% | 124 | no |
| GOOG | 2025-05-31 | 2025-07-29 | 2.6414% | 9 | yes |
| HES | 2025-05-31 | 2025-07-29 | 0.1181% | 111 | no |
| HOLX | 2026-02-28 | 2026-04-27 | 0.0507% | 176 | no |
| HON | 2025-02-28 | 2025-04-29 | 0.4385% | 38 | yes |
| HPQ | 2025-05-31 | 2025-07-29 | 0.0755% | 147 | no |
| HSIC | 2025-11-30 | 2026-01-28 | 0.0272% | 207 | no |
| ILMN | 2024-05-31 | 2024-07-26 | 0.0580% | 188 | no |
| INTC | 2023-05-31 | 2023-07-28 | 0.7110% | 26 | yes |
| INTU | 2021-08-31 | 2021-10-27 | 0.8560% | 26 | yes |
| IPGP | 2022-05-31 | 2022-07-28 | 0.0210% | 183 | no |
| J | 2025-02-28 | 2025-04-29 | 0.0510% | 192 | no |
| JNPR | 2025-05-31 | 2025-07-29 | 0.0385% | 201 | no |
| K | 2025-11-30 | 2026-01-28 | 0.0684% | 148 | no |
| KDP | 2025-02-28 | 2025-04-29 | 0.1205% | 114 | no |
| KEYS | 2025-02-28 | 2025-04-29 | 0.0869% | 143 | no |
| KLG | 2023-11-30 | 2024-01-29 | 0.0032% | 203 | no |
| KO | 2023-11-30 | 2024-01-29 | 1.0453% | 18 | yes |
| KSU | 2020-11-30 | 2021-01-29 | 0.1151% | 133 | no |
| LDOS | 2025-02-28 | 2025-04-29 | 0.0546% | 183 | no |
| LKQ | 2024-11-30 | 2025-01-29 | 0.0325% | 216 | no |
| LUV | 2020-05-31 | 2020-07-28 | 0.1257% | 124 | no |
| LW | 2025-02-28 | 2025-04-29 | 0.0231% | 225 | no |
| MCD | 2021-05-31 | 2021-07-29 | 1.0678% | 22 | yes |
| META | 2025-05-31 | 2025-07-29 | 4.5854% | 5 | yes |
| MHK | 2025-11-30 | 2026-01-28 | 0.0184% | 212 | no |
| MOH | 2025-02-28 | 2025-04-29 | 0.0515% | 191 | no |
| MOS | 2025-02-28 | 2025-04-29 | 0.0241% | 224 | no |
| MRNA | 2024-02-29 | 2024-04-26 | 0.1272% | 113 | no |
| MSI | 2025-02-28 | 2025-04-29 | 0.2317% | 66 | no |
| MXIM | 2020-11-30 | 2021-01-29 | 0.1458% | 115 | no |
| NLOK | 2020-11-30 | 2021-01-29 | 0.0710% | 170 | no |
| NOV | 2020-05-31 | 2020-07-28 | 0.0345% | 175 | no |
| NVR | 2023-05-31 | 2023-07-28 | 0.0824% | 150 | no |
| NWS | 2024-05-31 | 2024-07-26 | 0.0111% | 238 | no |
| OGN | 2021-08-31 | 2021-10-27 | 0.0470% | 172 | no |
| PAYC | 2025-02-28 | 2025-04-29 | 0.0325% | 216 | no |
| PFE | 2024-02-29 | 2024-04-26 | 0.6240% | 30 | yes |
| PH | 2025-02-28 | 2025-04-29 | 0.2718% | 56 | yes |
| PKI | 2020-11-30 | 2021-01-29 | 0.0977% | 150 | no |
| PSA | 2024-02-29 | 2024-04-26 | 0.1865% | 83 | no |
| PXD | 2024-02-29 | 2024-04-26 | 0.2280% | 70 | no |
| Q | 2025-11-30 | 2026-01-28 | 0.0000% | 213 | no |
| QRVO | 2024-11-30 | 2025-01-29 | 0.0206% | 225 | no |
| RHI | 2024-05-31 | 2024-07-26 | 0.0234% | 235 | no |
| SBUX | 2023-11-30 | 2024-01-29 | 0.5231% | 34 | yes |
| SEDG | 2022-11-30 | 2023-01-26 | 0.0980% | 143 | no |
| SWK | 2022-05-31 | 2022-07-28 | 0.1080% | 136 | no |
| TFX | 2025-02-28 | 2025-04-29 | 0.0187% | 226 | no |
| TIF | 2020-11-30 | 2021-01-29 | 0.0932% | 154 | no |
| TWTR | 2020-11-30 | 2021-01-29 | 0.2421% | 77 | no |
| UA | 2020-11-30 | 2021-01-29 | 0.0184% | 184 | no |
| UAA | 2020-11-30 | 2021-01-29 | 0.0202% | 183 | no |
| VAR | 2020-11-30 | 2021-01-29 | 0.1039% | 144 | no |
| VFC | 2022-11-30 | 2023-01-26 | 0.0671% | 173 | no |
| VLO | 2025-02-28 | 2025-04-29 | 0.1309% | 108 | no |
| WBA | 2024-08-31 | 2024-10-25 | 0.0218% | 232 | no |
| XRAY | 2024-02-29 | 2024-04-26 | 0.0288% | 194 | no |
| ZBH | 2025-11-30 | 2026-01-28 | 0.0583% | 164 | no |

## Reproduction and limits

Generate this memo with:

```sh
env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/measure-survivorship-coverage.ts --write
```

The script reads frozen SEC N-PORT fixtures only. It performs no network call, database access, migration, or write outside this memo. A current-symbol list is never an input.
