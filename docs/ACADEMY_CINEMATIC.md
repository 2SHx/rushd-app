# Academy cinematic strategy entry

Adapted from the MIT-licensed [cinematic-scroll-prompt-kit](https://github.com/amirmushichge/cinematic-scroll-prompt-kit) for RUSHD's existing Next.js Academy.

## Project brief

- Subject: choosing one educational strategy through risk comfort.
- Primary message: choose risk comfort first; then learn, seal, and compare one exact strategy.
- Audience: Arabic-first Gulf learners using virtual money.
- Visual direction: institutional, near-monochrome decision chamber; data and rules replace travel photography.
- Final interaction: a keyboard- and swipe-accessible three-card risk rail routing to the matched `/academy/apply?setupId=` lesson.
- Constraints: preserve diagnostic-first onboarding, app navigation, bilingual parity, truthful simulation/Sharia disclosures, and the existing DR-14 replay engine.

## Timeline map

Progress is local to `StrategyPracticeEntry`, reversible, and clamped by Framer Motion's `useScroll` target.

| Progress | Scene | Purpose |
| --- | --- | --- |
| `0.00–0.22` | Establishing frame | Explain that risk comfort comes before strategy selection. |
| `0.18–0.46` | Strategy match | Reveal that one choice maps to one exact reviewed learning module. |
| `0.42–0.70` | Learning contract | Explain questions → sealed policy → frozen comparison before the selector appears. |
| `0.66–1.00` | Interactive rail | Keep the risk selector, matched strategy, comparison set, and CTA usable. |

## DOM layer manifest

No production image layers are required. The scene uses lightweight semantic/DOM layers so it inherits theme tokens and avoids fabricated financial imagery.

| Layer | Prompt-kit role | Anchor | Depth | Notes |
| --- | --- | --- | --- | --- |
| `decision-grid` | `00` opaque background | center | `0.0` | Tokenized grid and paper surface. |
| `orbit-far` | `10` distant landscape | center | `0.2` | Slow scale/vertical drift. |
| `orbit-mid` | `20` midground | center | `0.5` | Three decision nodes around the central rule dial. |
| `rule-dial` | `30` hero object | center | `0.7` | Strategy/risk icon and concentric rings. |
| `frame-near` | `40/41` foreground | block edges | `0.9` | Quiet top/bottom planes that move faster than the background. |
| narrative and rail | `20+` semantic UI | logical inline start | n/a | Real headings, buttons, links, and disclosures; never baked into art. |

## Responsive and motion contract

- Desktop uses a `300svh` local scroll section and sticky stage; mobile shortens travel to `240svh`.
- The final cards form a horizontal snap rail on mobile and fit as a three-card row on wider screens.
- `prefers-reduced-motion` removes the pinned timeline entirely and presents the same information and selector in normal document flow.
- Scroll motion is transform/opacity only; no continuous RAF runs outside Framer Motion's observed values.
- The final rail remains the only interactive scene. Earlier hidden scenes are disabled for keyboard and assistive technology.
