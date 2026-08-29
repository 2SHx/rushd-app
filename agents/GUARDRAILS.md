# Swarm guardrails

Read with `agents/objective.json`. These are the rules that make unsupervised dispatch safe enough
to be worth doing. They exist because of specific incidents, and each one names its incident.

## The thing that makes an autonomous research swarm dangerous

More agents searching for alpha means more hypotheses tested, which means **more false positives**,
not more discoveries. This is not a theoretical worry:

- A full-universe screen reported beating the benchmark by **12.18pp/yr**. It was holding TQQQ (3×
  leveraged), SQQQ (3× inverse) and TLT (Treasury bonds), because the universe never excluded funds.
  Borrowed beta dressed as alpha, two holdings impermissible outright. Caught only by printing
  holdings — no summary statistic would have shown it.
- Three strategies were rejected because a **15bps cost assumption** made them look unprofitable.
  The measured figure is 0.13–3.6bps. The rejection stood on re-measurement; the *reasoning* did not.
- Market caps computed from split-adjusted prices and as-reported share counts put Apple at **$309B
  against a true $1.27T**, failing companies on a screen they comfortably passed.

So: **the swarm is pointed at verification, operations and data quality — not at alpha discovery.**
Six pre-registered signals have already been falsified on the full universe. An agent that proposes
a seventh must say what is different about it, in the proposal, before running anything.

## Never, without the owner

Surface these and stop. Do not simulate having done them, and do not work around them.

1. Authorise a strategy **version by name** for AUTO_PAPER (QDR-8).
2. Change `NASDAQ_HALAL_UNIVERSE` or any book's charter — it invalidates frozen validation priors.
3. Issue a **Sharia ruling**: grace periods, business-activity judgments, purification amounts.
   Screening *ratios* may be computed; the *judgment* is not ours.
4. Set production environment variables.
5. Enable a live broker or move real money. Paper only, and the account pin stands.
6. Admit a continual-harness lesson. Agents propose; only independent evidence review admits.

## Never, full stop

1. **Write synthetic data into a real store.** `MockProvider` fabricates candles rather than failing;
   64 MOCK rows were found in the research database, three predating the session that found them, and
   their presence had already defeated the preflight's freshness check. The ingest route now returns
   503 rather than write them.
2. **Run the test suite against the production database.** A full-suite run once deleted every `User`
   row. Treat running tests as a production write.
3. **Run `prisma migrate dev` while another agent is working.** One migration wiped 255k bars
   mid-session. File fences do not cover the database — one DB writer at a time.
4. **Resolve missing evidence toward the permissive side.** Absent debt is not zero debt; a stale
   quarter is not a current pass. Screens are three-state: PASS / FAIL / INSUFFICIENT.
5. **Report a number without an independent check.** Every measurement calls `anchor()` from
   `scripts/lib/research-assertions.ts` and aborts on failure.

## Mandatory gates for any claim

A backlog item claiming a *result* (as opposed to fixing a bug or closing a data gap) is not
complete until all four hold, and the agent must show the output:

| Gate | Why |
|---|---|
| `anchor()` against a value known outside the pipeline | catches unit, scale and basis errors — the class that actually occurs |
| holdings printed | catches "the rule is buying something you didn't expect" |
| beaten its own **random null control**, drawn from the identical eligible set | momentum returned 8.29%/yr against random's 13.20%; comparison to the benchmark alone would never have shown that |
| basis declared — adjusted vs raw, as-reported vs restated | the market-cap error was a basis mismatch nothing in the output disclosed |

## Escalation

Before declaring something owner-blocked, **prove it is**. Most "irreplaceable" blockers are not:
the grace-period ruling looked like a blocker on the divestment fix, and was not — divesting at the
next cycle is conservative under every admissible reading, so the mechanism could ship with the
parameter left open.

State the blocker, what you tried, and what specifically only the owner can supply.
