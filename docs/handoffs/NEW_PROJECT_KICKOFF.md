# Kickoff prompt — training + nutrition app

Hand this to your agents as the cold-start brief.

**It is deliberately self-contained.** An agent reading only this file knows what to build, under what discipline, and what "done" means. Nothing here requires the previous project in context — every rule it inherited is restated in full below, with the reason it exists. Start the new project in a fresh session and hand over this file alone.

---

## `<product>`

Build the app that **closes the loop between training and eating**.

Gym apps and nutrition apps are separate products because the math joining them is hard, not because users want two apps. Every competitor owns one half:

| App | What it genuinely does best | What it cannot see |
|---|---|---|
| Lyfta | 3D animated exercise demonstrations | What you ate |
| Hevy / Strong | Fastest logging, offline, rest timer | What you ate |
| MacroFactor | Adaptive TDEE inferred from weight trend + intake | That you squatted 8 heavy sets today |
| Cronometer | Micronutrient depth | Training entirely |
| Whoop / Oura | Recovery and readiness | Both |

**The thesis:** one system where today's training load sets today's nutrition target, today's intake and sleep set tomorrow's training prescription, and the loop tightens with every logged session.

Nobody has shipped that well. That is the product, and it is the only reason to build another fitness app.

## `<non-goals>`

Do **not** try to match Lyfta's animation library, MacroFactor's food database, and Whoop's sensor stack simultaneously. That is three companies' worth of capital, and attempting it is the most likely way this project dies.

Parity in each category is not the goal. **The loop is the goal.** Individual surfaces need to be excellent where the user spends time — logging a set, logging a meal — and merely adequate everywhere else.

## `<differentiators>`

Ranked by defensibility. The first three are the product; the rest are strong additions.

**1. Training-aware adaptive TDEE.** MacroFactor infers expenditure from weight trend versus intake — the best math in the category — but it is blind to what you actually lifted. Feeding real logged volume, intensity and session density into the expenditure estimate is a genuine improvement on the state of the art, not a feature.

**2. Zero-friction food logging.** Roughly the entire churn problem in nutrition apps is logging friction; most users stop within two weeks. Photo and voice capture through a vision model, with the parsed result **always editable before it is saved**, is the single highest-leverage thing in the app. A wrong silently-saved estimate is worse than no logging, because it corrupts the TDEE model that everything else depends on.

**3. Auto-regulated progressive overload.** Prescribe the next session's loads from last session's actual performance and reported RIR/RPE, not from a static spreadsheet. This is what a good coach does and what no popular app does properly.

**4. Recovery-gated programming, on everyone's data.** Poor sleep or a depressed HRV trend reduces prescribed volume automatically instead of letting the user grind into injury. Read from every device the user already owns — see `<data-layer>`, which is a core system, not an integration checklist.

**5. Ramadan and Gulf mode.** You already have this domain expertise, and it is genuinely unserved: fasting-aware session scheduling (training near iftar, not at 2pm), suhoor/iftar macro splits, halal filtering in the food database, Arabic with correct RTL. Every global competitor treats Ramadan as an inconvenience. This is a defensible regional wedge, not a localisation checkbox.

**6. Injury-aware substitution.** Log a painful joint, get the movement swapped for one that trains the same pattern. High retention value, low build cost.

## `<data-layer>`

Capture **every biometric the user's devices already produce**, normalise it once, and make every downstream model read from that normalised layer. This is the app's real asset: the loop is only as good as the data feeding it, and a user who switches from Amazfit to Oura must keep their history intact.

**Do not build N integrations.** Build one normalised schema plus thin adapters — the provider-adapter pattern, mock-first, so every screen works with zero devices connected and zero API keys set. An adapter that cannot reach its API degrades to absent data, never to a fabricated value.

Two tiers, because the access reality differs sharply:

**Tier 1 — direct OAuth, richest data.** Whoop and Oura both publish real APIs (recovery score, HRV, resting HR, detailed sleep staging, respiratory rate, skin temperature deviation). Fitbit likewise. These give proprietary derived scores you cannot recompute yourself, so store both the raw signals and the vendor's score, labelled as vendor-derived.

**Tier 2 — through the platform hubs.** Apple HealthKit (on-device only, no cloud API — sync must originate on the phone), Google Fit / Health Connect, and Samsung Health. This is how Amazfit/Zepp, Garmin, Polar, Suunto and most of the long tail arrive. Garmin's own API needs partnership approval; do not block on it. Zepp has no dependable public API — treat Health Connect as the supported path and say so in the UI rather than implying a direct integration exists.

**Normalise to signals, not to devices:** HRV (state the method — RMSSD vs SDNN — they are not interchangeable), resting HR, sleep duration and stages, respiratory rate, skin temperature deviation, SpO2, steps, active energy, workout sessions. Every stored sample carries `source`, `deviceModel`, `capturedAt`, `receivedAt`, and `confidence`.

**`capturedAt` versus `receivedAt` is load-bearing.** A recovery score that arrives at noon must never influence a prescription the app made at 6am. If you have worked on anything point-in-time before, this is the same discipline: a model may only read what was actually knowable at decision time. Getting this wrong makes every retrospective evaluation of the app's own advice silently optimistic.

**Devices disagree, and that is data.** Two wearables will report different HRV for the same night because they sample differently. Never average them into a single number and never silently prefer one. Pick a declared primary per signal, show the disagreement when it is material, and keep both.

## `<research-grounding>`

Every model that produces a number — expenditure, readiness, recovery, protein target, one-rep-max estimate — must record, in code, the published basis it came from and the error bar that basis reports.

Concretely: TDEE estimators (Mifflin-St Jeor, Katch-McArdle, and the trend-based inference this app actually relies on) disagree by hundreds of calories on the same person, and the literature is explicit about that spread. Protein recommendations for trained lifters have a well-studied range, not a single value. HRV-guided training has real supporting evidence and real limits. Sleep-stage classification from a wrist optical sensor is meaningfully less accurate than polysomnography, and vendors disclose this.

**The rule:** if a number is displayed, its source and uncertainty are retrievable in one tap. A health app that shows "2,347 calories burned" as though it were measured is lying with a precision it has not earned. Show the range, or show a rounder number honestly.

Keep a `docs/references/` directory the way a research project would, and have the science skills cite it rather than restating half-remembered guidance.

## `<stack>`

**Use Expo + React Native, not a Next.js PWA.** This contradicts the RUSHD stack and is deliberate: the experience bar set here requires offline set-logging in a basement gym, background rest timers, and HealthKit/Google Fit access. A PWA cannot read HealthKit. Choosing web would cap the product below the stated goal on day one.

Keep from RUSHD where it costs nothing: TypeScript, Prisma + PostgreSQL, zod at every boundary.

**Food data:** start with USDA FoodData Central and Open Food Facts — both free, and barcode coverage is the reason people stay. Paid providers (Nutritionix, Edamam) buy convenience, not correctness; do not pay before free coverage is measured and proven insufficient. Record the measurement.

## `<harness>`

Port from RUSHD before writing product code. This is the machinery that made that project work, and it is domain-free.

**Copy and keep:**
- `scripts/continual-harness.mjs` and `scripts/continual-benchmark.mjs` — the lesson system. Agents propose lessons via a `LESSON:` report line but **cannot admit their own**; admission requires independent evidence review; the ledger is hash-chained and append-only; lessons can never override the project kernel. This is the "keeps improving" mechanism.
- `scripts/dispatch.mjs` + `scripts/models.map.json` — run any agent on any model.
- `.agents/continual/` — the ledger.
- `docs/AGENTS.md` — the dispatch template, routing table, and report contract.
- `.claude/hooks/typecheck-on-edit.sh` and `protect-files.sh`.
- Skills: `lazy-dev`, `working-method`, `context-discipline`, `prompt-engineering`, `system-design`, `ui-craft`.

**Leave behind:** every quant agent and skill, `sharia-quant`, `rushd-domain`, `market-integration`, `i18n-fintech-expert`, `3d-visualist`, the `rushd-market` MCP.

**Write fresh:** a `nutrition-science` skill (TDEE models, macro splits, micronutrient RDAs, the honest error bars on all of it) and a `training-science` skill (progressive overload, periodisation, RIR/RPE, fatigue management).

## `<kernel>`

These are the hard rules for the new project's `CLAUDE.md`. Each one was paid for in the previous project.

- **One database writer at a time.** File fences do not cover shared resources. A concurrent migration destroyed 255,000 rows; a test-suite run deleted every user record. Fence dispatches by *resource*, not only by file.
- **Running the test suite is a production write** until a disposable database exists. Wire that on day one, not after the first loss.
- **Verification means executed output.** A report that says "tests pass" without the actual lines is not evidence. Three agent claims were checked in a single session and one was false.
- **Tripwire tests earn their keep.** When a rule must not be silently bypassed, pin it with a test whose comment states what it protects.
- **Predict before you measure.** State the expected result and the kill condition *before* running anything expensive. This generalises well past finance: it is what stops a disappointing result from being quietly reinterpreted as a good one.
- **Every user-facing string ships in English and Arabic in the same change.**
- **Health claims are not marketing copy.** Any number shown to a user — calories burned, TDEE, recovery score — must state its uncertainty or its source. Fabricated precision in a health app is a safety issue, not a UX one.

## `<milestone-1>`

Ship the loop end to end for **one user, one goal, one week**. Not a feature set — a working circuit:

1. Log a workout offline; it syncs.
2. That session's volume moves the day's calorie and protein target, and the app can explain *why* in one sentence.
3. Log a meal by photo; correct the parse before saving.
4. Weight trend plus intake updates the expenditure estimate.
5. One wearable connects, its sleep and HRV land in the normalised schema, and a red recovery signal visibly reduces the next prescription.
6. The next session's prescribed loads reflect the last session's actual performance.

If step 2, 5 or 6 is faked, the milestone is not met. Those three steps *are* the product; everything else is a logging app that already exists.

Do the whole circuit with **one** Tier-1 device (Whoop or Oura — both have real APIs and rich data). Breadth comes after the loop is proven, and it comes cheaply because the adapters share one schema.

## `<never>`

- Never save a vision-parsed meal without the user confirming it. A silent wrong estimate corrupts the TDEE model that every downstream number depends on.
- Never show a calories-burned or recovery figure without its uncertainty or source.
- Never prescribe a load increase when the recovery signal is red, however good the last session was.
- Never let an agent admit its own proposed lesson.
- Never run a migration while another agent holds the database.
- Never pay for a data provider before measuring and recording what the free source actually failed to cover.
- Never let a biometric sample influence a decision made before its `receivedAt`. Backdating a recovery score into an earlier prescription makes the app's own advice look better than it was.
- Never average two devices' readings for the same signal into one number, and never fabricate a sample when an adapter fails — absent data is a valid state.
- Never imply a direct device integration the app does not have. Amazfit and Garmin arrive through Health Connect; say so.

## `<report>`

Every agent replies in this exact shape, capped at 25 lines, no file dumps:

```
STATUS: DONE | PARTIAL | BLOCKED
CHANGES: <file:lines — one line each>
DECISIONS: <lazy-dev rung reached; what was reused instead of written>
VERIFY: <commands run + actual output lines (evidence, not assertions)>
OPEN: <risks/unknowns, max 3 bullets>
LESSON: NONE | PROPOSE <distilled lesson + evidence>
```

## `<first-dispatch>`

Start here, in this order:

1. **architect** — produce `docs/SYSTEM_DESIGN.md`: the data model for workouts, meals, and the expenditure estimator; the offline-sync strategy; and the explicit contract for how training load reaches the nutrition target. That contract is the product; design it before any screen.
2. **backend-expert** — port the harness, stand up Prisma + the disposable test database, and prove the fence works.
3. **data-engineer** — the normalised biometric schema and the first two adapters (one Tier-1 OAuth, one platform hub), mock-first so every screen works with no device and no keys.
4. **test-engineer** — tripwire tests for the kernel rules, including one that fails if a sample with a later `receivedAt` can reach an earlier decision.

Do not write a screen until step 1's contract exists.
