# DimeBag-Bets — Work Preview

A points-based (non–real-money) **sports betting + casino** web app with a deliberately
clean interface, plus a graphite-and-gold **operator console** for running the book.
Everything runs on one shared credit/balance `core` (integer **coins/cents**, closed
loop — no real money, no payments, no KYC).

> **How to read this file:** it's a guided index of everything built so far and how to
> see each surface live. Money is points only; a "$" is just display formatting.

---

## Run it locally

```bash
npm install
npm run dev      # Vite dev server (http://localhost:5173 by default)
npm test         # vitest — full suite
npx tsc --noEmit # typecheck
npm run build    # production build
```

The app shell has a top nav: **Casino · Sportsbook · My Bets · Leaderboard · Management**.
Casino/Sportsbook/My Bets/Leaderboard are player surfaces; **Management** is the operator
console (role-gated to managers).

---

## What's built

### Shared money core (`core/`)
The contract everything goes through: `placeWager → resolveWager → adjust`, `settleWeek`,
`grant`/`adjustBalance`, with `balance`/`pending`/`availableToWager` and per-account credit
limits. All amounts are **integer cents** (`games/shared/money.ts`). No module tracks its
own points.

### Casino games (`games/`)
Provably-fair, on the shared core, each a vertical slice (logic + clean UI): **Mines,
Crash, Plinko, Slots, Dice, Limbo, Keno, Blackjack, Roulette, Baccarat, Hi-Lo, Wheel,
Cases, Coinflip, Diamonds, Dragon Tower, Chicken Road, Pump, Sic Bo, Three-Card Poker,
Video Poker**, with a shared sound engine, win popups, and an anti-spoiler ledger feed.

### Sportsbook (`sportsbook/`)
Odds/ticket engine (`priceTicket`/`placeTicket`/`gradeTicket`), a live mock feed, live
UI components (badges, odds ticks, kickoff countdown, feed status), and **same-game
parlays** priced through the existing engine.

### Player engagement (player surfaces)
- **Bet builder / same-game parlays** — combine markets on one game, priced + placed
  through the existing bet path.
- **Live activity ticker** — read-only feed of recent bets/wins.
- **Glossary tooltips** — one reusable info-dot + a single glossary, applied across
  casino + sportsbook.
- **Responsible-play tools** — player self-set limits, cooldowns, and session reminders
  that actually block over-limit play.

### Manager console — app launcher (`app/ManagerConsole.tsx`)
The Management section redesigned from tab-pills into a clean **app launcher**: one
backdrop, square purpose-coloured app tiles grouped into Operations · Catalog ·
Insight & Growth; click a tile to open that tool. (Branch `integration/consolidate`.)

### Operator console — app grid (`console/`, `features/`)
A separate graphite-and-gold **VANTAGE** operator console: a shell (`console/shell`) with
a top bar + figures strip + responsive tile grid driven by a `FeatureManifest` registry
(`console/registry`), and feature panels organised by section under `features/operations`,
`features/players`, `features/catalog`, `features/control`. (Branch `integration/console`.)

### Money-desk lane (`features/figures|cashier|transactions|settlements`, `features/_desk`)
Four operator feature modules that wrap the core/ledger/settlement logic — coins only,
every mutation routed through the sanctioned wrappers:
- **Weekly Sheet** — per-player by-day win/loss, filter chips, sort, CSV export, bulk settle.
- **Cashier Desk** — Grant/Deduct/Set with live balance preview + batch confirm (audited).
- **Ledger** — full durable coin ledger; filter by player/type/date; CSV/JSON export.
- **Settlement Run** — schedule + who's-up/down preview + lock + settle + archive.

Plus a shared `features/_desk` lib (pure helpers + UI primitives) with unit tests.
(Branch `feat/console-money-desk`.)

---

## Branch map (where the work lives)

| Branch | What's on it |
|---|---|
| `integration/consolidate` | Casino + sportsbook + player features + manager-console app-launcher |
| `integration/console` | Operator console: shell + registry + section feature panels |
| `feat/console-money-desk` | Money-desk lane (figures / cashier / transactions / settlements) + this preview |
| `feat/player-engagement` | Bet builder/SGP, activity ticker, glossary, responsible-play |
| `feat/console-shell` | Operator-console shell + empty registry (phase 1) |
| `feat/auth-and-roles` | Auth + route role-gating |
| `feat/server-data-foundation` | Supabase persistence foundation |
| _(plus other feature/audit branches from parallel work)_ | |

## Status
Full test suite green on `feat/console-money-desk`: **183 files / 1241 tests**, `tsc`
clean, production build OK.
