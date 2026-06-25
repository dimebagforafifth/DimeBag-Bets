---
name: playstadium-design
description: Use this skill to generate well-branded interfaces and assets for PlayStadium.io (a points-based casino + sportsbook — "Chip Gold & Carbon"), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out
and create static HTML files for the user to view. If working on production code, you can
copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to
build or design, ask some questions, and act as an expert designer who outputs HTML
artifacts _or_ production code, depending on the need.

## Quick map
- `readme.md` — the full design guide: brand context, content voice, visual foundations,
  iconography, and the component/UI-kit index. **Read this first.**
- `styles.css` — the single global entry point. Link it, then read components from
  `window.PlayStadiumDesignSystem_e4e367`.
- `tokens/` — colors, typography, fonts, spacing, elevation (CSS custom properties).
- `assets/` — self-hosted fonts, the 21 3D game-icon PNGs, the pixel chip logo, favicon.
- `components/` — Button, Chip, Badge, GameCard, Stat, WalletPill, OddsButton, EventRow,
  BetSlip (each with `.jsx`, `.d.ts`, `.prompt.md`).
- `ui_kits/` — `casino-lobby/` and `sportsbook/` full interactive recreations.
- `templates/` — copy-to-start Design Components for the lobby + sportsbook.
- `guidelines/` — foundation specimen cards.

## Non-negotiables
- One **gold** accent on deep **carbon**; gold is never a large fill.
- Every numeral in `var(--font-num)` (Slight Chance Mono). Up = green, down = red.
- No emoji in product chrome. Use the real `assets/game-icons/` PNGs — never redraw them.
- Points, not money: "figure," "stake," "week" — avoid real-money words except as UI formatting.
- **Font licensing:** Slight Chance is bundled under DJR's Testing License — a web/app
  license must be bought from djr.com before shipping to real traffic.
