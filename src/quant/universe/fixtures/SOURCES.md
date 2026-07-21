# Captured real fixtures (QDR-8 Sharia Tier-1) — never synthetic
- spus-holdings-2026-07-17.csv: full SPUS daily holdings, captured 2026-07-19 from https://www.sp-funds.com/wp-content/uploads/data/TidalFG_Holdings_SPUS.csv (219 names, as-of 07/17/2026)
- hlal-purification-q2-2026.csv: HLAL fund-level dividend purification factors, captured 2026-07-19 from https://cdn.prod.website-files.com/692951a60766e54470be6c6e/6a4788f6aa513628c038253b_HLAL_PurificationQ22026.csv
- HLAL full holdings: NOT published as a machine file by Wahed; source = latest SEC N-PORT (EDGAR, free, PIT)

## SPUS SEC N-PORT captured-real history

Official identifiers are frozen as CIK `0001742912`, series `S000067283`, class `C000216395`.
The three directories under `sec-spus-nport/` contain the SEC raw `primary_doc.xml` plus its
`index-headers.html`; exact URLs, accessions, acceptance timestamps, and SHA-256 hashes live in
`src/quant/universe/spusNport.ts`. These filings prove disclosed membership only. They do not prove
security suspension/delisting lifecycle coverage or an independent per-name AAOIFI verdict.
