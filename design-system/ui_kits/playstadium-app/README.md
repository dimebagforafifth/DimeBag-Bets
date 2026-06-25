# PlayStadium — Full App UI Kit (shadcn/ui themed)

A high-fidelity, **interactive** recreation of the whole PlayStadium product — the
player app *and* the operator console — built with a **shadcn/ui-style component
layer re-skinned onto the brand** ("Chip Gold & Carbon"). Open `index.html`.

Structure and feature coverage are lifted from the product codebase
([`dimebagforafifth/DimeBag-Bets`](https://github.com/dimebagforafifth/DimeBag-Bets)):
the header/nav, the points wallet, the casino Originals, the contract-native
sportsbook, My Bets, Rewards/VIP, Leaderboard, Profile + responsible play, and the
6-section operator console (Dashboard · Daily ops · Players · Risk · Growth · Settings).

## What it demonstrates
- **Shell** (`Shell.jsx`) — shadcn-style **sidebar** that swaps between the player app
  and the console, a topbar with the live **wallet** (Balance / This week, Slight Chance
  Mono) and an account menu (VIP tier, sound, sign-out, enter console).
- **Casino** (`CasinoScreens.jsx`) — featured hero, live-wins ticker, category tabs, the
  21 Originals grid (real 3D PNG art), promo strip with image slots, and an **interactive
  Mines game** (pick a stake, reveal gems for a climbing multiplier, cash out, per-round
  ledger).
- **Sportsbook** (`Sportsbook.jsx`) — league rail, event board with tappable American
  odds, and a docked **bet slip** (singles / parlay, stake, potential payout, place →
  debits the shared balance). Collapses to a sheet on narrow screens.
- **Account** (`AccountScreens.jsx`) — **My Bets** (figures, by-side, lifetime stats,
  history table), **Rewards** (VIP ladder + reward cards), **Leaderboard** (podium +
  standings), **Profile** (stats + responsible-play limits with a slider/switch).
- **Console** (`ConsoleScreens.jsx`) — **Dashboard** (figures, 7-day handle chart, live
  activity, the full role-gated feature registry), **Players & agents** (roster table),
  **Risk & exposure** (vs-cap bars), **Settlement & ledger** (money desk), **Games & edge**
  (per-game enable + RTP).

## Auth & onboarding (`auth.html`)
A second entry point — sign-in / create-account plus the full **player** and **operator**
onboarding flows, built to mirror the real `DimeBag-Bets/auth` module so Claude Code can
wire it 1:1:
- **Login** (`Auth.jsx`) — username + password for everyone (the repo's model), a
  player/operator account-type pick on sign-up, inline + form-level validation, password
  reveal + strength, a Google button (real-backend note, like `canUseOAuth=false` in demo),
  and the three demo logins (`operator` / `agent` / `marco`, pw `demo`). Sign-in to an
  existing account drops straight into the app; sign-up routes to onboarding.
- **Player onboarding** (`OnboardingPlayer.jsx`) — welcome → handle → agent/referral code
  → game interests → **responsible-play limits** (per-bet / session-loss / session-time,
  the real `PlayerLimits` fields) → **welcome free play** ($25.00, the balanced preset) → done.
- **Operator onboarding** (`OnboardingManager.jsx`) — the real **SetupWizard**: book basics
  → **house profile** (Conservative / Balanced / Aggressive, faithful RTP + credit + exposure
  + settlement + starter promos from `app/console/presets.ts`) → review → invite your desk
  (org hierarchy) → done.
- `AuthApp.jsx` orchestrates the split-screen brand pane + flow routing; a "jump to" menu
  (top-right) lets you hit any flow directly. The app's account menu → **Sign out** returns
  here, and finishing any flow opens `index.html` — so the whole thing round-trips.

All client-side fakes (no real auth/persistence); the field names, roles
(`manager/agent/player`), copy, and config values match the repo for an easy handoff.

## About "shadcn/ui"
The product repo doesn't ship shadcn — the user asked to **rebuild the UI with it**, so
`theme.css` + `ui.jsx` are a from-scratch, no-build recreation of shadcn/ui's New-York
component vocabulary (Button, Card, Badge, Tabs, Table, Input, Avatar, Progress, Switch,
Dropdown, Dialog/Sheet, Tooltip…). shadcn's CSS-variable theme (`--background`, `--card`,
`--primary`, `--muted`, `--border`, `--ring`, …) is **mapped to the brand tokens** in
`../../styles.css`, so it reads as an authentic shadcn app wearing the PlayStadium skin.
For production, swap this layer for real `shadcn/ui` components and copy these same
variable mappings into `globals.css`.

## Composition
- **Fonts:** Slight Chance (wordmark + hero), Barlow Condensed (headings/eyebrows),
  Barlow (body/UI), Slight Chance Mono (every numeral) — all from `../../styles.css`.
- **Icons:** `icons.jsx` is a thin (1.75) lucide-style set for UI chrome. Game tiles use
  the real PNGs in `../../assets/game-icons/`.
- **Data:** `data.js` holds all mock data (games, events, roster, bets, leaderboard,
  ledger, rewards, exposure). Points only — no real money, no settlement.

## Files
`index.html` · `theme.css` (shadcn tokens + components) · `shell.css` · `screens.css` ·
`icons.jsx` · `ui.jsx` · `data.js` · `Shell.jsx` · `CasinoScreens.jsx` · `Sportsbook.jsx`
· `AccountScreens.jsx` · `ConsoleScreens.jsx` · `App.jsx`

## Notes & placeholders
- **Imagery:** the kit uses the assets we have (3D game icons, chip logo). Marketing
  banners are shown as labelled **image slots** (the dashed gold placeholders on the
  Casino promo row) ready for real art — see the design-system caveat about image
  generation.
- Bet/round outcomes are client-side fakes for demo only.
