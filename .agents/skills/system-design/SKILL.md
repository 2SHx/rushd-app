---
name: system-design
description: The contract for docs/SYSTEM_DESIGN.md — required sections, decision-record format, and milestone/exit-criteria format. Use when producing or amending the system design, architecture decisions, or the feature roadmap.
---

# System Design Contract

`docs/SYSTEM_DESIGN.md` is a binding implementation contract, not an essay. Implementation agents receive 2–5 line quotes from it as their DESIGN CONTRACT; every sentence must survive being quoted alone. Decide — never hedge. "Consider X" is banned; write "X, because Y" or nothing.

## Required sections (in order)

1. **Context & goals** — product, personas (parent/child), markets (TASI/NASDAQ), what "done" means for v1.
2. **Architecture overview** — monolith module boundaries, where the MCP server sits, request/data flow in ≤10 lines of prose or one ASCII diagram.
3. **Auth** — full decision record (see format below). Constraints that must be satisfied: parent→child self-relation in schema, child accounts without email (nullable), roles PARENT/CHILD, tiers BASIC/PREMIUM/ULTRA.
4. **Data model evolution** — money Float→Decimal migration plan, models auth needs, indexes; each change tagged with its milestone.
5. **Market data integration** — provider interface extracted from `marketData.ts`, adapter spec per provider (SAHMK/Alpaca/Zoya), caching + rate limits, the env-key swap path, and the MCP server's relationship to it.
6. **AI features** — quiz/signals hardening, Arabic output quality bar, guardrails ("not financial advice", minor-appropriate content), eval approach.
7. **i18n/RTL & compliance** — Zoya AAOIFI flow, Sharia-compliant reframing of the savings sweep, required disclaimers.
8. **Security & privacy** — authz model for the parent/child boundary, threat model for the LLM endpoints (prompt injection), children's-data minimization.
9. **Roadmap** — milestones (see format below).
10. **Testing & CI** — the minimum quality gate per milestone.
11. **Decision log & open questions** — anything genuinely undecidable now, with its trigger for deciding.

## Decision-record format (for every major decision)

```
### DR-<n>: <title>
Decision: <one sentence, imperative>
Options considered: <A / B / C, one line each with the killing constraint>
Rationale: <why the winner wins, tied to THIS codebase's constraints>
Consequences: <what becomes easier/harder; debt accepted>
Revisit when: <concrete trigger, e.g. "real money moves" — never "later">
```

## Milestone format

```
### M<n>: <name>
Goal: <one sentence>
| Work item | Owner (agent) | Exit criterion (checkable) |
```
Every work item names ONE owning agent (frontend-expert, backend-expert, ai-features-expert, i18n-fintech-expert, test-engineer). Every exit criterion is a command, a visible behavior, or a reviewable artifact — never "improved" or "better".

## Architecture-scale lazy-dev

Apply the ladder at system scale: prefer boring monolith-internal solutions; every new service, queue, cron infrastructure, or dependency must justify itself against "do nothing" and "use what exists". RUSHD is ~800 lines — design for the next 10k, not the next million.
