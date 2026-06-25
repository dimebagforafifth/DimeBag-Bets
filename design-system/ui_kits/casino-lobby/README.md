# Casino Lobby — Stadium UI Kit

A high-fidelity, interactive recreation of the Stadium casino lobby, built entirely
from the design-system primitives. Open `index.html`.

## What it demonstrates
- **`Header.jsx`** — sticky app header: the `Stadium.io` wordmark (Slight Chance),
  section nav, search, and the live **WalletPill** (balance + week standing).
- **`Lobby.jsx`** — `FeaturedHero` (a floating 3D icon, eyebrow badges, Stats and
  CTAs) + `OriginalsGrid` (responsive grid of **GameCard**s).
- **`GameDrawer.jsx`** — a faked-but-believable bet flow: pick a stake with
  **Chip** presets, place a bet, watch it settle with a multiplier and update the
  wallet. Built from **Button**, **Chip**, **Stat**, **Badge**.
- **`App.jsx`** — wires it together; **`games.js`** holds the 21 Originals + icons.

## Composition
Everything reuses the bundled components from `window.PlayStadiumDesignSystem_e4e367`
(via `../../_ds_bundle.js`) — no primitive is re-implemented here. Styling is the
shared token layer from `../../styles.css`. This is a recreation of the lobby
direction, not production code.

## Notes
- The 3D game icons are the real assets in `../../assets/game-icons/`.
- Bet outcomes are random client-side fakes for demo purposes only.
