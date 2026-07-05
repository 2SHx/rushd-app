---
name: rushd-domain
description: RUSHD's fintech domain knowledge — AAOIFI/Sharia screening, halal/haram framing, TASI/Saudi market facts, Arabic RTL rules, and the gamification economy. Use for any task touching Sharia compliance, Arabic content, Gulf-market behavior, or XP/savings mechanics.
---

# RUSHD Domain Knowledge

## AAOIFI Sharia screening (what "compliant" means here)

Two-stage screen per AAOIFI standards:
1. **Sector screen** — business activity must not be primarily: conventional banking/insurance, alcohol, gambling, pork, tobacco, adult entertainment, or weapons.
2. **Financial ratio screen** — commonly applied thresholds: interest-bearing debt < 30% of market cap; interest-bearing deposits/securities < 30% of market cap; non-compliant income < 5% of revenue (must be purified/donated).

**In this codebase**: compliance is MOCKED at `src/services/marketData.ts:67` — `TSLA`/`META` hardcoded non-compliant, everything else compliant. Real screening arrives via Zoya API (`ZOYA_API_KEY`). Any UI must label the source honestly ("AAOIFI screening — demo data") until then.

**Standing Sharia flag**: the savings sweep in `src/services/engines.ts:34-68` pays a fixed 2.0% "APY" and keeps a 2.5% platform spread — this is riba (interest) as written. User-facing framing must use Sharia-compliant structures (profit-sharing/Mudarabah, cost-plus/Murabaha, or wakala fee) per SYSTEM_DESIGN.md. Never introduce "interest"/"APY" language into user copy; escalate any task requiring it.

## TASI / Saudi market facts

- Tadawol (TASI) trades **Sunday–Thursday**, ~10:00–15:00 AST; closed Fri/Sat (this inverts typical Western weekend logic — never hardcode Mon–Fri).
- Currency **SAR, pegged at 3.75 SAR/USD**. NASDAQ side is USD.
- TASI symbols are **numeric** (e.g. `2222` = Saudi Aramco, `1120` = Al Rajhi Bank — itself an Islamic bank); NASDAQ symbols alphabetic (`AAPL`, `TSLA`).
- Target personas: Gulf parents (PARENT role) supervising children's (CHILD role) simulated investing; tiers BASIC/PREMIUM/ULTRA gate features.

## Arabic / RTL rules

- `messages/en.json` and `messages/ar.json` MUST stay key-identical — a missing ar key is a build-quality bug.
- Layout: direction comes from the `[locale]` segment; components use Tailwind **logical properties** (`ms-`/`me-`/`ps-`/`pe-`, `text-start`/`text-end`) — never `ml-`/`mr-` in shared components.
- Numbers: Western Arabic numerals (0-9) throughout, consistent with existing `ar.json`; format currency with `Intl.NumberFormat('ar-SA', ...)`.
- Bidi safety: wrap interpolated LTR tokens (tickers, numbers with signs like "+2.4%") so they don't scramble in RTL sentences; prefer putting them in their own flex items over inline string concatenation.
- Arabic copy register: Modern Standard Arabic, financial-literacy tone appropriate for families and minors; no transliterated English jargon when an Arabic financial term exists (محفظة = portfolio, سهم = stock).

## Gamification economy (as implemented)

- Level curve: `level = floor(sqrt(xp/100)) + 1` (`engines.ts:18`) — so 100 XP → L2, 400 → L3, 900 → L4. Content that awards XP must respect this quadratic pacing; don't invent flat thresholds elsewhere.
- `addXP(userId, amount)` returns `{xp, level, leveledUp}`; it is the ONLY XP mutation path.
- Quiz flow: `QuizAttempt` records score; XP awards for quizzes should route through `addXP`, not direct profile writes.
- Sweep: `processCashSweeps()` iterates all SavingsJars daily-rate style; it currently writes **no Transaction records** (audit-trail gap — flag on any task touching it).
