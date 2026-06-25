# Sportsbook — PlayStadium UI Kit

A high-fidelity sportsbook screen built from the design-system primitives. Open
`index.html`.

## What it demonstrates
- **Nav header** — pixel chip logo + wordmark, Casino / Sportsbook / My bets nav,
  and the shared **WalletPill** points balance (top-right).
- **League rail** — horizontal pill rail (NBA / Soccer / NFL / …) filtering the board.
- **Event list** — **EventRow**s with live scores, start times, and tappable
  **OddsButton** market columns (Spread / Total / Money, or 1X2).
- **Docked bet slip** — **BetSlip** stays sticky on the right; tap odds to add picks,
  set a points stake, toggle Single / Parlay, and place a bet that debits the shared
  balance (fake, demo only).

## Composition
Everything reuses bundled components from `window.PlayStadiumDesignSystem_e4e367` (via
`../../_ds_bundle.js`); data lives in `events.js`. Styling is the shared token layer
from `../../styles.css`.

## Responsive
- **≥900px:** `1fr 320px` — event list + sticky slip.
- **<900px:** the slip un-docks to full width below the list; top nav collapses.
- **<560px:** `EventRow` stacks (markets drop below the matchup, full-width odds).

## Notes
- Points only — no buy-in, no cash-out. Bet outcomes are not settled (demo).
- Casino + sportsbook share one points balance.
