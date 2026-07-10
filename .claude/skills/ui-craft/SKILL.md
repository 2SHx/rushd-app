---
name: ui-craft
description: Design-engineering taste for every UI change in RUSHD — motion, depth, type, states, RTL/Arabic, a11y, and fintech honesty. Use before writing or reviewing ANY component, animation, or layout. Agents default to mediocre UI; these are the non-negotiable defaults that make it exceptional.
---

# UI Craft — the taste layer

**Premise (Emil Kowalski):** *agents don't have great taste.* Left alone a model picks `ease-in` for
an enter, a solid 1px gray border, a spinner, and `left-4` in an RTL app. Every rule below exists
because the default was wrong. Apply them without being asked.

**Order of operations for any UI task:** states → layout → type/number → depth → motion → a11y → RTL.
Motion is last. Motion never rescues a bad layout.

---

## 1. Motion

- **Enter = `ease-out`. Exit = `ease-in`.** An entering element arrives fast and settles. Never
  `ease-in` on an enter (it looks broken/laggy). `ease-in-out` for elements that move while visible.
- **Duration:** micro-feedback (hover, toggle) **100–150ms**; standard (dropdown, panel, list item)
  **200–300ms**; large surfaces (modal, route) **300–500ms**. Nothing UI-feedback-related exceeds
  500ms. If it feels slow, cut duration before changing easing.
- **Animate only `transform` and `opacity`.** Never animate `width/height/top/left/margin` — that's
  layout thrash. Grow with `scale`, move with `translate`. (`framer-motion` `layout` prop is the
  sanctioned exception.)
- **Spring vs tween:** springs for physical/draggable/playful (`type:'spring'`, moderate `damping`,
  no visible overshoot on utilitarian UI). Tween + `ease-out` for functional UI. A price ticker is
  functional. Don't bounce money.
- **Origin-aware:** an element animates *from where it came*. Set `transform-origin` to the trigger.
  A dropdown scales from its button's edge, not from its own center.
- **Stagger** list children **20–40ms** apart. More than ~60ms reads as sluggish.
- **`prefers-reduced-motion`: honor it.** Drop transforms; keep opacity or nothing. This is a11y, not
  a nicety.
- **Data updates flash once, they don't animate.** A quote refresh gets a brief tint, never a
  slide/bounce. Repeated motion on live data is nausea.

**Animation review checklist** (run before shipping any animation): right easing for direction? ≤500ms?
transform/opacity only? origin correct? reduced-motion path? does it still feel right on the 5th repeat?

## 2. Depth & surface

- **Prefer semi-transparent shadows over solid borders.** `border: 1px solid #333` is the tell of a
  generic UI. Use a hairline `rgba(255,255,255,0.06)` (dark) / `rgba(0,0,0,0.08)` (light), or no
  border at all and let the shadow do the work.
- **Layer shadows:** one tight, low-opacity shadow (contact) + one large, soft one (ambient). A single
  big blur looks flat and fake.
- **Glass** (this repo's language): translucent fill + backdrop blur + hairline top highlight. Never
  glass over glass — one level of translucency per stack, or it turns to mud.

## 3. Type & numbers (fintech-specific)

- **Numbers are the hero.** Prices/NAV/%: `font-variant-numeric: tabular-nums` so digits don't jitter
  on update. Right-align numeric columns; align on the decimal.
- Clear hierarchy: one dominant number per card, everything else recedes. Don't bold everything.
- Never center long-form text. Never letter-space Arabic.
- Format by market: **SAR** for TASI, **USD** for NASDAQ — locale-aware separators, never raw floats.

## 4. States — all four, every time

Every list, panel, and data surface ships **loading · empty · error · populated**. No exceptions.
- **Skeletons, not spinners**, for content — and the skeleton matches the final layout so nothing
  shifts when data lands. Reserve space; **zero layout shift** is the bar.
- **Empty states teach**: say what will appear and how to get it. Not "No data."
- **Error states are honest and actionable** ("couldn't reach market data — retry"), never silent.
- **Degraded ≠ fake.** If a model/feed is unavailable, say so. See §7.

## 5. Color & signal

- Semantic, tokenized: **up = emerald, down = rose**, neutral = zinc; **halal/compliant = emerald,
  non-compliant = amber**. Never invent a one-off hex in a component.
- **Never encode meaning in hue alone** — colorblind users. Pair every color signal with an icon,
  arrow, or sign (`+2.4%` ▲). This is mandatory on gain/loss and compliance badges.
- Text contrast ≥ **4.5:1**; large text ≥ 3:1. Verify on both themes — light mode is where glass UIs
  usually fail.
- Both **dark and light** are first-class. Don't ship dark-only.

## 6. RTL & Arabic (RUSHD is Arabic-first — this is not optional)

- **Logical properties only.** `ms-*/me-*/ps-*/pe-*`, `text-start/text-end`, `inset-inline-*`,
  `border-s/border-e`. A literal `left-`/`right-`/`ml-`/`pr-` in a component is a bug.
- **Mirror directional affordances** (back arrows, chevrons, progress direction). **Do NOT mirror**
  numbers, charts, candlesticks, or time axes — time still flows left→right.
- Arabic needs more **line-height (~1.7)** than Latin. Never letter-space or condense Arabic.
- Every user-facing string lives in **both** `messages/en.json` and `messages/ar.json`, key-identical,
  in the same change. No inline `isAr ? '…' : '…'` ternaries — use `useTranslations`.

## 7. Honesty (fintech, non-negotiable)

- **Never render fabricated analysis.** No hardcoded "AI" paragraphs, invented compliance verdicts, or
  placeholder financial claims. If the model/feed is down, show a labeled degraded/disabled state.
- Persistent **not-advice** and **paper-money / simulated** disclaimers on every trading surface.
- Distinguish **proven out-of-sample** from **simulated** performance in the copy. Never imply a
  backtest is a track record.
- Every displayed number is **DB-backed**. A hardcoded portfolio figure is a lie with a font.

## 8. Accessibility & performance

- Real semantics: `<button>`/`<a>`, never `div onClick`. Visible `focus-visible` rings. Keyboard-navigable
  lists. `aria-label` on icon-only controls.
- **Batch, don't fan out.** No per-row `fetch` — the parent fetches visible rows in one request and
  passes data down. (This repo already paid for that lesson: 30 rows = 30 API calls.)
- Virtualize long lists; memoize rows; lazy-load charts. Gate any `setInterval` on
  `document.visibilityState === 'visible'` and never poll a hidden tab.

---

## Vocabulary (say what you mean)

Use precise terms in prompts and reviews — vague words produce vague UI:
`ease-out` · `spring (stiffness/damping)` · `stagger 30ms` · `transform-origin` · `scale-in from trigger`
· `hairline border` · `ambient + contact shadow` · `tabular-nums` · `skeleton (layout-matched)` ·
`optimistic update` · `reduced-motion fallback` · `logical inset`. "Make it pop" is not a spec.
