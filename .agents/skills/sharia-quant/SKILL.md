---
name: sharia-quant
description: Sharia compliance in a quant/derivatives context for Rushd Quant — AAOIFI screening as a hard veto, purification, why conventional bonds/most derivatives are non-compliant, halal alternatives (Sukuk, salam, arbun), and the teach-all/flag-haram policy for the CFA-X/CME-X curricula. Use for the Sharia agent (#5), any tradeable-universe gate, or Islamic-finance educational content.
---

# Sharia Quant

Extends [[rushd-domain]] into trading, derivatives, and automation. Two orthogonal switches (RUSHD's DR-5): **executability** (can the user act?) is governed by the Sharia verdict — HARAM/MASHBOOH is never tradeable; **flagging** (is a concept labelled?) governs education — everything is teachable with a persistent label. Strict mechanics, open education.

## The Sharia agent is a VETO, not a vote
- Agent #5 runs BEFORE sizing and outputs a hard verdict; a non-compliant symbol is removed from the tradeable universe entirely — the Portfolio Manager LLM never even sees it as an option ([[agent-committee]], [[risk-management]]).
- Two-stage AAOIFI screen (via Zoya when keyed, mock screener otherwise): **sector** (no conventional finance/insurance, alcohol, gambling, pork, tobacco, weapons, adult) + **financial ratios** (interest-bearing debt < ~30% of market cap; interest-bearing securities/cash < ~30%; non-compliant income < ~5%, which must be **purified**).
- **Purification:** track the non-compliant income fraction of any realized gain and surface the amount to donate — a first-class number, not an afterthought.

## Derivatives & fixed income (the CME-X / CFA-X hazard zone)
- **Conventional bonds = riba** → non-tradeable; teach openly with the label, and teach **Sukuk** (asset-backed) as the halal alternative.
- **Most conventional derivatives** (futures/options/swaps as commonly structured) raise **gharar** (excessive uncertainty), **riba**, or **maysir** (speculation) concerns → educational-only, non-executable. Teach the mechanics with the flag, and teach halal alternatives: **salam** (forward sale), **arbun** (deposit/option-like), **wa'd**-based and Sharia-compliant hedging structures.
- Margin/short-selling/leverage: conventional margin is interest-based → flag; teach the constraints.

## Automation & real money
- Auto-trading must apply the veto on **every** pass — a scheduled strategy can never drift into a non-compliant name. The kill-switch and Sharia veto are both always-on ([[risk-management]]).
- Any real-money (CMA-gated) path inherits the same veto plus the licensing/KYC gate — compliance does not relax when money becomes real; it tightens.

## Content rule for CFA-X / CME-X curricula
Teach the full professional curriculum (interest, bonds, derivatives, APY) — never hide it — but every non-compliant concept carries the persistent label **«غير متوافق مع الشريعة — تعليمي فقط»** and its halal alternative alongside. Arabic-first, established Islamic-finance terms (ربح not فائدة; صكوك; مضاربة; سلم). This is the differentiator vs Western quant curricula.

## Anti-patterns
- Never let the LLM decide compliance — it's a deterministic screen; the LLM only explains the verdict.
- Never present a flagged instrument as tradeable "just for the demo" — the executability gate is absolute.
- Never state a name is halal unqualified while screening is mock — label it "AAOIFI screening — demo data" until Zoya is live.
- Never teach a haram structure without its halal alternative in the same breath.
