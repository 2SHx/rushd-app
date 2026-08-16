# Captured real fixtures (QDR-8 Sharia Tier-1) — never synthetic
- spus-holdings-2026-07-17.csv: full SPUS daily holdings, captured 2026-07-19 from https://www.sp-funds.com/wp-content/uploads/data/TidalFG_Holdings_SPUS.csv (219 names, as-of 07/17/2026)
- hlal-purification-q2-2026.csv: HLAL fund-level dividend purification factors, captured 2026-07-19 from https://cdn.prod.website-files.com/692951a60766e54470be6c6e/6a4788f6aa513628c038253b_HLAL_PurificationQ22026.csv
- HLAL full holdings: NOT published as a machine file by Wahed; source = latest SEC N-PORT (EDGAR, free, PIT)

## SPUS SEC N-PORT captured-real history

Official identifiers are frozen as CIK `0001742912`, series `S000067283`, class `C000216395`.
Filings are discovered series-scoped (not CIK-scoped — the CIK "Tidal Trust I" files NPORT-P for
many unrelated funds) via
`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=S000067283&type=NPORT-P&count=100&output=atom`,
which as of 2026-08-09 lists **25** NPORT-P filings for this series/class, quarterly from
reportDate 2020-05-31 through 2026-05-31, no gap. Directories under `sec-spus-nport/` hold the raw
SEC `primary_doc.xml` plus `index-headers.html` for every filing that
`parseSpusNportDocuments` accepts; exact URLs, accessions, acceptance timestamps, and SHA-256
hashes live in `src/quant/universe/spusNport.ts`. These filings prove disclosed membership only.
They do not prove security suspension/delisting lifecycle coverage or an independent per-name
AAOIFI verdict.

### Captured (15 of 25) — parsed and in `SPUS_NPORT_FILINGS`

| accession | reportDate | acceptedAt (ET) | primary_doc.xml sha256 |
|---|---|---|---|
| 0001145549-20-041804 | 2020-05-31 | 2020-07-28T14:40:17-04:00 | f7979cf82a89d684b87229927a54813f4017c458fcfdfb6e139a21513d14c107 |
| 0001145549-20-063095 | 2020-08-31 | 2020-10-28T16:34:01-04:00 | 82b61fd2384331874686cfa318994172c3b6703f7bfadd9fc6af9ffe9b7e901f |
| 0001145549-21-004631 | 2020-11-30 | 2021-01-29T12:23:12-05:00 | cdfe007c9583863e8ec1acc94d704ce53832b446d4e67cfd0c660313437fbfa0 |
| 0001387131-23-012885 | 2023-08-31 | 2023-10-30T13:02:03-04:00 | 25afeec12f2b93e1737078ac09a7e34dbb1f5718f1a7ee10cf46d40d38693036 |
| 0002000324-24-000218 | 2023-11-30 | 2024-01-29T15:44:49-05:00 | d030ddc0dedc54cb67fc240b8189680a8700e3385cfee97e862fc7fbd45559a2 |
| 0002000324-24-001338 | 2024-02-29 | 2024-04-26T15:37:49-04:00 | b60c6c9d5c4cd01119c83e1720bbbe328034453a21e014647b012a73ce58b6ca |
| 0002000324-24-001962 | 2024-05-31 | 2024-07-26T12:20:33-04:00 | 120b74100e9e39fa89f6d364cc680eeee1c1e2a07baf2edc474875ec1da69726 |
| 0002000324-24-003031 | 2024-08-31 | 2024-10-25T13:17:39-04:00 | 852d9586d8d0a5b5048c1e8cfd2a4f7750de504976ef0a482858d0b0e6439131 |
| 0002000324-25-000189 | 2024-11-30 | 2025-01-29T14:40:05-05:00 | ff9a105a658de3b0fe7ab80bbfd0ad147861874596c28a60d9cd848675171fb7 |
| 0002000324-25-001560 | 2025-02-28 | 2025-04-29T12:04:54-04:00 | e8abcf0f2ecbf52bb1d116d2c817754f30bb09318ada7e1f6add5a4abdfad2aa |
| 0002000324-25-002489 | 2025-05-31 | 2025-07-29T10:04:01-04:00 | 5695de6a3f5483254780255e066fc332af1697028d86049cb0930dc5c0fc9cc4 |
| 0002000324-25-004070 | 2025-08-31 | 2025-10-29T10:52:28-04:00 | cc825c8fdad03c442d24b549da1a20e2c2ddc100225f5cbe33976b3103d6f698 |
| 0002000324-26-000257 | 2025-11-30 | 2026-01-28T13:48:50-05:00 | 0a454820b48a8314478d73c2b8e36fdb4075312023edbcceeaf513312b62cc59 |
| 0002000324-26-001717 | 2026-02-28 | 2026-04-27T14:11:42-04:00 | c999e563b342723ed9f0d15d2c4be5679958608e968bb5c32793e8d22016aacb |
| 0002000324-26-003242 | 2026-05-31 | 2026-07-29T15:21:24-04:00 | a17d9ff488d8802b8afe944999306146b296eead2fcc99e35933e182663dd55c |

Header-document URLs and SHA-256 hashes for every row above are the frozen
`headerDocumentUrl`/`headerDocumentSha256` fields in `src/quant/universe/spusNport.ts`
(archive URL pattern: `https://www.sec.gov/Archives/edgar/data/1742912/<accession-no-dashes>/primary_doc.xml`).

Two real, recurring SEC filing artifacts required (and received) a narrow, principled extension
to `parseSpusNportDocuments` — not a second parser — rather than being silently dropped or
fabricated:
- **Zero-value merger contingent-value-rights** (e.g. ABIOMED/J&J CVR, TPG CVR): filed with
  `valUSD` `"0"`, `cusip` `"N/A"`, and either no `<ticker/>` or a non-market internal code. These
  are excluded from `holdings` and captured verbatim in the new `unidentifiedHoldings` field —
  never assigned a fabricated symbol, never counted toward membership.
- **Foreign-domiciled issuers with no CUSIP** (e.g. Allegion plc, Irish-incorporated): filed with
  `cusip` literal `"N/A"` but a real ticker and ISIN. The CUSIP format check now accepts the
  literal `"N/A"` sentinel in addition to a 9-character CUSIP; the ticker is still required and
  validated exactly as before.

### Unparseable (10 of 25) — excluded, not silently skipped

reportDate 2021-02-28 through 2023-05-31 (10 filings, `sec-spus-nport-unparseable/`) disclose
**ISIN-only identifiers** — every holding's `<identifiers>` block contains `<isin/>` with **no
`<ticker/>` element at all**, a genuine SEC-schema-era gap (SEC's 2023 N-PORT amendments made
ticker disclosure mandatory starting with reportDate 2023-11-30; before that it was filer-optional
and SPUS's filer omitted it entirely for this window). There is no keyless, reliable ISIN→ticker
crosswalk available to backfill symbol identity without risking silent misidentification, so these
are excluded rather than force-fit. Raw `primary_doc.xml`/`index-headers.html` are committed for
audit; hashes below are of the primary document only:

| accession | reportDate | primary_doc.xml sha256 |
|---|---|---|
| 0001387131-21-004867 | 2021-02-28 | a81a0673d606139984abff61c9cb6d2f5b81ad288f7e79b5122529fbc94e84dc |
| 0001387131-21-007842 | 2021-05-31 | ee4f980e61e4169d1b2639fb1344d31450435aae1f09a9176f87f00f7039b98c |
| 0001387131-21-010436 | 2021-08-31 | 0b0d5a01d9127092e99f2b7aa1863a4efd23932f5ecb785e3b810e6d93fc3042 |
| 0001387131-22-000732 | 2021-11-30 | 02e17b7d94da15ba405defdf189043e23fa4e0ba8153180f670a59dfcf903584 |
| 0001387131-22-005323 | 2022-02-28 | 86f48c52797bef9a97774f5ce5f3806d45c06feec19aabd58ba9cda00d58b9b4 |
| 0001387131-22-008131 | 2022-05-31 | d0f8a37034e5f89669f7849b586432b2fe9283accbc5b12055c4523f36de4fad |
| 0001387131-22-010802 | 2022-08-31 | 2551b6e649a46dc655a7f3b17fb6d8ac2778625114e7b26fdbe8cfa257babfb0 |
| 0001387131-23-000702 | 2022-11-30 | 44ee619178647bf4b8ae1bfebb7c1f52b9aca0bde0db2d45d3adcf651f95f6ba |
| 0001387131-23-005252 | 2023-02-28 | 77ff628f5689df7528db7e5a39e93d0b6503097666a6fe7a509a90f70ccc1b82 |
| 0001387131-23-008965 | 2023-05-31 | 0f5c4339586689ba6923f9029f89686499ddddd6f3d7cdd82746f4c8cf851189 |

These 10 are not referenced by `SPUS_NPORT_FILINGS` and are not loaded by
`loadCapturedSpusNportSnapshots`. Coverage gap: 2020-11-30 → 2023-08-31 (this 10-filing window).

## OpenFIGI ISIN->ticker crosswalk (QDR-14) — identity resolution only

`openfigi-isin-crosswalk/spus-nport-unparseable-isins.json` (sha256 pinned as
`OPENFIGI_CROSSWALK_FIXTURE_SHA256` in `src/quant/universe/openFigiCrosswalk.ts`): a one-time,
captured-and-hash-pinned response from the free, keyless `https://api.openfigi.com/v3/mapping`
endpoint, queried 2026-08-16 for every non-zero-valUSD ISIN disclosed across the ten unparseable
filings above (244 unique ISINs; batches of 10, job shape `{idType: "ID_ISIN", idValue, exchCode:
"US"}` — `exchCode: "US"` restricts each match to the composite United States listing, i.e. the
same US-equity scope `src/services/marketData.ts`/`src/lib/stockUniverse.ts` already use, not a
foreign/OTC/currency-suffixed listing of the same issuer). Result: 216 ISINs resolved to a US
composite ticker, 28 had no US composite listing (OpenFIGI returned "No identifier found." —
observed for names later acquired, taken private, spun off, or reincorporated under a new ISIN,
e.g. ABIOMED/J&J, Activision Blizzard/Microsoft, Twitter/X, Exxon Mobil's 2024 holdco reorg).
`openFigiCrosswalk.ts`'s `resolveIsinToTicker` additionally requires the OpenFIGI-resolved company
name to match the filing's own disclosed `<name>` after normalization (mandatory ticker-reuse
defense — see the doc comment on `normalizeCompanyName` for the exact rule and its deliberate
false-negative cost: genuine same-entity renames, e.g. Facebook Inc -> Meta Platforms Inc, are
excluded too, since this module cannot mechanically distinguish "renamed" from "reused"). A run
never queries OpenFIGI live; the module only replays this committed fixture. Wiring resolved
filings back into `SPUS_NPORT_FILINGS` is a separate, later change — this capture only proves the
crosswalk mechanism and its coverage.
