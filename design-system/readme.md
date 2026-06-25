# PlayStadium.io — Design System

**"Chip Gold & Carbon."** The design language for PlayStadium.io, a **points-based**
betting platform — casino originals, a sportsbook, rewards, and leaderboards, all
tied to one shared player figure. The points are **not money**: they can't be bought,
cashed out, or redeemed. The UI borrows betting language and dollar-style formatting
because it reads cleaner, not because real funds change hands.

The brand is **chill and confident** — playful but uncluttered, with a **retro /
Canadian-weather-station** streak (hand-drawn display type, dot-matrix scoreboards,
a pixel poker-chip mark). One warm gold accent on a deep carbon canvas does the heavy
lifting; everything else stays quiet.

---

## Sources this system was built from

This system distills the live product. If you have access, explore these to go deeper:

- **GitHub — product codebase:** [`dimebagforafifth/DimeBag-Bets`](https://github.com/dimebagforafifth/DimeBag-Bets)
  (working title; "PlayStadium" is the chosen brand). See `OVERVIEW.md`, `BrandIdeas.md`,
  the `games/`, `sportsbook/`, `app/`, and `core/` trees. 21 casino games, sportsbook
  ticket flow, a shared "money core," and a role-gated operator console.
- **Fonts:** DJR *Slight Chance* + *Slight Chance Mono* (Testing License — see Caveats);
  Barlow Condensed (OFL, self-hosted); Barlow + Barlow Semi Condensed (Google Fonts);
  ECWC Standard (LED scoreboard face).
- **Brand mark:** the pixel poker-chip logo (`brand/logos/originals/`, `assets/logo/`).

> The points-only, closed-loop identity is deliberate: chip / stack / token imagery
> is both on-brand and legally cleaner than real-money language.

---

## CONTENT FUNDAMENTALS — how PlayStadium writes

**Voice:** chill, confident, a little playful — never hype-y or aggressive. It talks
like a sharp friend, not a billboard.

- **Person:** addresses the player as **"you"** ("your figure," "your week," "place a
  bet"). The brand refers to itself as **"we"** sparingly. Never first-person-singular.
- **Casing:** **UPPERCASE eyebrows / section labels** with wide tracking
  (`EVENTS`, `ORIGINALS`, `THIS WEEK`). Headings are Title Case or hand-drawn display.
  Body is sentence case. Buttons are short and Title Case ("Place bet", "Cash out").
- **Numbers are the star.** Balances, multipliers, odds, and standings are always set
  in the mono numeral face and formatted like currency (`12,480`, `+2.4x`, `−$320`)
  even though they're points. Up is green, down is red, neutral is silver.
- **Vocabulary** leans on real betting slang used plainly: *figure* (your balance),
  *stake*, *parlay*, *single*, *lock*, *streak*, *week* (the weekly reset),
  *Originals* (the in-house casino games). Avoid real-money words (deposit, withdraw,
  cash) except as ironic UI formatting.
- **Tone of system messages:** brief and human. "Bet placed." "You're up 2.4x."
  "Better luck next roll." No exclamation spam, no emoji in product chrome.
- **Emoji:** **not used** in the product UI. Personality comes from type + the chip
  mark, not emoji.
- **Length:** terse. Eyebrows are 1–2 words, taglines under ~30 characters, helper
  text one short line.

Examples — *"Stack your week."* · *"21 Originals, one figure."* · *"Tap odds to add
to your slip."* · *"Points only — no buy-in, no cash-out."*

---

## VISUAL FOUNDATIONS

**Palette — one gold on carbon.** The canvas is a cool, deep graphite (`--bg #101113`)
with a warm-grey surface ramp (`--surface #161616` → `--surface-2 #20201f`) and chip-grey
hairlines (`--line #333332`). Text is chip-white → silver → faint
(`#fcfcfb` / `#c4c4c2` / `#919190`). The **single accent is chip gold** (`--gold #f0be4a`),
used only for small hits: the primary CTA, focus rings, key figures, the `.io` dot, and
hover edges. **Gold is never a large background fill.** Green (`#46c88a`) and red
(`#e0556e`) are the *only* non-logo hues — reserved for figure up/down, win/loss, and
"live." Three experimental alternate accent themes (`jade`, `ember`, `ice`) re-point
the accent + canvas tint via `[data-theme]` on a wrapper; **gold ("stadium") is the
live default.**

**Type — a legible layer and a character layer.** *Barlow Condensed* leads headings +
uppercase eyebrows; *Barlow* carries body + UI; *Barlow Semi Condensed* for labels.
The **character layer is hand-drawn**: **Slight Chance** for hero display + the wordmark's
personality, and **Slight Chance Mono** for *every numeral* (balances, multipliers,
tickers) — so figures tabulate by nature. **ECWC Standard** is a dot-matrix LED face
reserved for literal scoreboard moments. Scale runs 11 → 48px from the live app; body
base is 15px. Eyebrows are uppercase with `0.18em` tracking.

**Spacing & shape.** 4px base scale (`--space-1…8`), default grid `--gap: 16px`, one
shared `--content-max: 1200px` that the header + page cap to and centre. Corner radii:
**8px** inputs/chips, **12px** the default (cards, buttons, tiles), **18px** large
surfaces/modals, **999px** pills. Rounding is moderate — friendly, not bubbly.

**Backgrounds.** Flat carbon by default. Surfaces get a subtle **`--sheen`** (a 1px inner
top-highlight) so flat dark panels have a lit edge. Hero/featured areas use a soft
**radial gold glow** (`rgba(var(--gold-glow), …)`) bleeding from one corner — never a
full gradient wash. Game-icon tiles sit on a small gold-tinted radial. No photography,
no busy patterns; the optional animated "Pixel Beams" halftone field (from the codebase)
is the one decorative texture.

**Elevation — one systematic ramp.** `--elev-1` resting cards, `--elev-2` hover/raised,
`--elev-3` popovers/modals — soft, never harsh, tuned for a deep canvas. A special
**`--elev-gold`** lift (translucent gold) is the hover glow for the primary CTA and
focused tiles. This single ramp is what reads as "premium" vs. random shadows.

**Borders.** Hairline `1px solid var(--line)` on virtually every surface. On hover,
borders warm toward gold via `color-mix(... var(--gold) 50%, var(--line))` rather than
jumping to full gold.

**Motion.** Shared rhythm: `--dur-fast .13s` / `--dur .18s` / `--dur-slow .28s`. Easing
is `--ease-out` for entering/hover, `--ease-in` for exiting, and `--ease-spring`
(`cubic-bezier(.16,1,.3,1)`) for soft overshoot (the floating hero icon, bet-result pop).
Fades + small translates dominate; a hero icon floats on a slow loop. All decorative
loops respect `prefers-reduced-motion`.

**Hover / press states.** Hover = lift (`translateY(-3px)`), warmed border, gold glow,
or text brightening (silver → white). Press = a small `translateY(1px)` settle on
buttons; the primary CTA darkens to `--gold-press`. No scale-down on press for tiles.

**Focus.** One accessible ring everywhere: `--ring` = 2px canvas gap + 4px translucent
gold halo (`0 0 0 2px var(--bg), 0 0 0 4px rgba(var(--gold-glow), .7)`).

**Cards.** `var(--surface)` fill, `1px var(--line)` border, `--radius` (12px), `--elev-1`
+ `--sheen` at rest, lifting to `--elev-2 + --elev-gold` on hover. Game tiles add a
gold-tinted radial art zone up top and a "Play →" that slides in on hover.

**Transparency & blur.** Used sparingly and purposefully: the sticky header is
`color-mix(in srgb, var(--bg) 86%, transparent)` + `backdrop-filter: blur(12px)`; modal
scrims are a dark wash with a light blur. Not decorative — only for layering chrome over
scrolling content.

**Imagery vibe.** The only raster imagery is the set of **3D game icons** — glossy,
warm-lit objects (dice, chips, gems, a rocket) on transparent backgrounds, dropped on
the gold-tinted tile gradient. Warm, tactile, slightly playful — never flat or corporate.

---

## ICONOGRAPHY

- **Game icons (primary brand iconography):** 21 pre-rendered **3D PNG icons** live in
  `assets/game-icons/` — one per casino Original (dice, mines, plinko, crash, blackjack,
  roulette, …). These are the real product assets. **Always use these PNGs**; never
  redraw them. They render at ~78px inside `GameCard`/drawer art zones with a drop shadow.
- **The chip logo:** the pixel poker-chip mark (`assets/logo/playstadium-chip-logo.png`,
  vector original in `brand/logos/originals/`). Rendered with `image-rendering: pixelated`
  to keep the retro pixel edges crisp. `assets/favicon.svg` is the favicon.
- **UI / system icons:** the system uses a small set of inline glyphs (search, close,
  chevrons) drawn at hairline weight to match Barlow. There is **no bundled icon font**.
  For new UI icons, use **[Lucide](https://lucide.dev)** (CDN) — a thin, rounded stroke
  set that matches the brand's weight — and keep strokes ~1.75px. *(Substitution flagged:
  the codebase ships ad-hoc inline SVGs rather than a named set; Lucide is the closest
  consistent match for filling gaps.)*
- **Emoji & unicode:** **not used** as iconography in product chrome. The only "icon font"
  moment is the ECWC LED face for literal scoreboards.

---

## INDEX — what's in this system

**Foundations**
- `styles.css` — the single entry point consumers link. `@import`s only.
- `tokens/` — `colors.css`, `typography.css`, `fonts.css`, `spacing.css`, `elevation.css`.
- `assets/` — `fonts/` (self-hosted woff2/ttf), `game-icons/` (21 3D PNGs),
  `logo/`, `favicon.svg`.
- `brand/logos/originals/` — vector + raster chip-logo masters.
- `guidelines/` — foundation specimen cards (Type, Colors, Spacing, Brand) for the
  Design System tab.

**Components** (`window.PlayStadiumDesignSystem_e4e367.<Name>`)
- `components/buttons/` — **Button** (primary / ghost / text / danger; sm/md/lg; block),
  **Chip** (preset/filter pill, active state).
- `components/data/` — **Badge**, **GameCard** (lobby tile), **Stat** (label + mono
  figure + delta), **WalletPill** (balance + week standing).
- `components/sportsbook/` — **OddsButton**, **EventRow** (matchup + markets),
  **BetSlip** (selections, stake, single/parlay).

**UI kits** (full interactive recreations)
- `ui_kits/playstadium-app/` — **the whole product**: player app (Casino + interactive
  Mines game, Sportsbook + bet slip, My Bets, Rewards, Leaderboard, Profile) and the
  operator console (Dashboard, Players, Risk, Settlement, Games & edge). Built with a
  **shadcn/ui-style component layer themed to the brand**. Open `index.html`. A second
  entry, **`auth.html`**, adds sign-in / create-account plus full **player & operator
  onboarding** flows (mirrors the real `auth` module — username+password, roles, demo
  logins, responsible-play limits, and the operator house-profile SetupWizard).
- `ui_kits/casino-lobby/` — header + wallet, featured hero, the 21 Originals grid,
  and a live bet drawer. Open `index.html`.
- `ui_kits/sportsbook/` — league rail, event board, and a docked bet slip. Open `index.html`.

**Templates** (copy-to-start Design Components)
- `templates/casino-lobby/CasinoLobby.dc.html`, `templates/sportsbook/Sportsbook.dc.html`.

**Meta**
- `SKILL.md` — Agent-Skills-compatible entry point.
- `readme.md` — this guide.

---

## Using it

Link the one stylesheet and read components off the global namespace:

```html
<link rel="stylesheet" href="styles.css" />
<script src="_ds_bundle.js"></script>
<script>
  const { Button, GameCard, WalletPill } = window.PlayStadiumDesignSystem_e4e367
</script>
```

Reach for **semantic tokens first** (`--surface-card`, `--text-body`, `--accent`,
`--status-up`) so designs re-theme cleanly. Keep gold small. Set numerals in
`var(--font-num)`. Up = green, down = red.

---

## CAVEATS

- **Font licensing — action needed before shipping to traffic.** *Slight Chance* +
  *Slight Chance Mono* are bundled under DJR's **Testing License** (desktop testing +
  0 web visitors). They're fine for this system and prototypes, but a **web/app license
  must be purchased from [djr.com](https://djr.com)** before serving real users.
- **Namespace** is `PlayStadiumDesignSystem_e4e367` (auto-generated). If the compiler regenerates a
  new hash, update the `const { … } = window.<Namespace>` lines in card/kit HTML.
- The casino lobby + sportsbook kits use **client-side fake outcomes** (random) for demo
  only — no real settlement.
- "PlayStadium" is the chosen brand over the working title "DimeBag-Bets"; you may still
  see the old name in the source repo.

> **Help me make this perfect:** Which directions should I push next — (1) more
> **components** (Input, Select, Toggle, Dialog, Toast, Avatar, Tabs)? (2) more **UI-kit
> screens** (My Bets, Rewards, Leaderboard, Profile, the operator console)? (3) a **slide
> template** for pitch/investor decks in this brand? Tell me your priority and I'll build it.
