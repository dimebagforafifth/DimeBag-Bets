# DimeBag-Bets — Architecture & Roll-Up Guide

DimeBag-Bets is a **points-based** (non–real-money) sportsbook + casino app built as a
**modular monorepo**. Each feature lives in its own folder, but every feature — every casino
game and the sportsbook — reads and writes **one shared balance** through `core/`. That single
rule is what keeps the eventual roll-up clean: modular in code, **not** independent in data.

> **The contract in one line:** *No module tracks its own points. Everything goes through `core`.*

---

## 1. Folder tree

```
DimeBag-Bets/
├── CLAUDE.md              ← project brief & build guide (source of truth)
├── core/                  ← shared credit/balance money model + provably-fair primitives
│   ├── types.ts           ←   Account, Outcome, Wager shapes
│   ├── core.ts            ←   availableToWager / placeWager / resolveWager / settleWeek
│   ├── fair.ts            ←   HMAC-SHA256 float stream, server-seed commitment
│   └── index.ts           ←   public surface
├── games/                 ← 13 self-contained game modules (each with a ui/ subfolder)
│   ├── shared/            ←   common helpers (money.ts, Rules.tsx, WinPopup.tsx, NumberInput.tsx)
│   ├── mines/             ←   each game: fair.ts / multiplier.ts / index.ts (meta) / ui/
│   ├── crash/
│   ├── dice/
│   ├── limbo/
│   ├── keno/
│   ├── plinko/
│   ├── wheel/
│   ├── hilo/
│   ├── chickenroad/
│   ├── dragon-tower/
│   ├── pump/
│   ├── roulette/
│   └── blackjack/
├── sportsbook/            ← markets, odds, live pricing, parlay engine, store, mock feed
├── sportsdata/            ← sports data feed layer (provider abstraction)
├── ledger/                ← transaction history across every game and the book
├── persistence/           ← storage abstraction (memory / localStorage / Supabase later)
├── app/                   ← the unified clean interface shell
│   ├── App.tsx            ←   owns the one shared Account; routes the sections
│   ├── games.ts           ←   the GAMES registry + GameProps contract
│   └── theme.css
├── sound/                 ← SoundToggle.tsx, engine.ts, index.ts, sound.css
├── org/                   ← Management section (admin / house-config layer)
├── memory/                ← agent work notes (project status tracking)
└── docs/                  ← this file and other white papers
```

**Rules of the layout**

- Games are **modular in code but not independent in data** — every module settles through `core`.
- Shared logic lives in `core` (or `games/shared` for UI helpers), **never** copied into a game.
- Roll up **incrementally**, one module under the shell at a time — never one big-bang merge.

---

## 2. The shared money model (`core/`)

Everything settles through one **credit-bookie** balance. An `Account` has exactly three fields:

| Field         | Meaning                                                                 |
|---------------|-------------------------------------------------------------------------|
| `creditLimit` | How far down the player may go (the most they can owe before settling). |
| `balance`     | The *figure* — running standing. Wins push it positive, losses negative.|
| `pending`     | Total of wagers currently at risk (placed but not yet graded).          |

The amount a player can stake is derived, never stored separately:

```ts
availableToWager(account) = account.creditLimit + account.balance - account.pending
```

### Wager lifecycle: place → grade → adjust

```ts
placeWager(account, stake) -> Wager
//   validates stake is a positive integer AND stake ≤ availableToWager,
//   then account.pending += stake, returns an open Wager.

resolveWager(wager, outcome, payoutMultiplier)
//   releases the hold (account.pending -= wager.stake), then:
//     win   → profit = round(stake × (payoutMultiplier - 1)); balance += profit
//     loss  → balance -= stake
//     push  → balance unchanged (stake returned)
//     void  → balance unchanged (stake returned)
```

The four outcome types are a union: `'win' | 'loss' | 'push' | 'void'`.

For games that resolve at an arbitrary return multiplier `m` (e.g. partial settlements),
`resolveAtMultiplier` generalizes the same math:

```ts
profit = round(stake × (m - 1))
//   m > 1 → win     (positive profit)
//   m = 1 → push    (zero)
//   m < 1 → loss    (negative profit — a partial loss)
```

### Weekly settlement

```ts
settleWeek(account)
//   requires no open wagers (throws unless account.pending === 0),
//   then resets account.balance = 0 to square up for the new week.
```

### Money is integer points (cents)

Points are stored as **integers — the smallest unit**. Fractional profits are rounded with
`Math.round` so a low-multiplier win settles to the penny instead of vanishing
(e.g. `99 × 1.5 = 148.5 → 149`; `99 × (−0.5) = −49.5 → −49`). The UI layer keeps the same
convention via `games/shared/money.ts` (`CENTS = 100`, i.e. 1/100 of a point), so a `1.01×`
win on `$10` correctly settles `+$0.10`.

> **Keep `core` generic.** A wager has a stake; a resolution returns an outcome + payout
> multiplier; the balance adjusts. No game-specific assumptions (Mines tiles, Crash
> multipliers, parlays) live in `core` — those express themselves through `outcome` and
> `payoutMultiplier`.

---

## 3. Game modules (`games/*`)

Every game is a self-contained module. It declares its own identity (`meta`) and ships its own
view (`Component`), and stays unaware of the other games and of the shell. A typical module holds:

- **`fair.ts`** — derives the round outcome deterministically from
  `(serverSeed, clientSeed, nonce)` (plus a difficulty parameter for Tower/Pump) and exposes a
  `verify*` function so a player can re-derive and confirm the result.
- **`multiplier.ts` / `payouts.ts` / `engine.ts`** — the game's pricing math.
- **`index.ts`** — exports a `*Meta` constant (`key`, `name`, `tagline`, `accent`).
- **`ui/`** — the clean, minimal React view.

All payout math ultimately flows back into `core`'s `resolveWager` / `resolveAtMultiplier`.

### Provably-fair primitives (`core/fair.ts`)

Games share one cryptographic scheme:

- **Commitment:** the server seed's `SHA-256` is shown *before* the round via `hashServerSeed()`.
- **Stream:** `HMAC-SHA256(serverSeed, \`${clientSeed}:${nonce}:${cursor}\`)` produces a float
  stream — each `[0,1)` float consumes a 4-byte chunk as `Σ byte[i] / 256^(i+1)`, advancing the
  cursor per 32-byte block.
- **Derivation:** grid games (Mines, Dragon Tower, Pump) use Fisher-Yates pick-and-remove over a
  pool; Crash reads the first 32 bits of the initial block as an unsigned int.
- **Verification:** each game's `verify*` function re-derives the outcome from the seeds and
  compares it against what the player observed.

### Game catalog

| Game         | House edge | RTP    | Top multiplier (example)                         |
|--------------|-----------:|-------:|--------------------------------------------------|
| Mines        | 1%         | 99%    | 5,148,297× (12 mines, full clear)                |
| Crash        | 1%         | 99%    | 1,000,000× (capped)                              |
| Dice         | 1%         | 99%    | 9,900× (at 0.01% win chance)                      |
| Limbo        | 1%         | 99%    | 1,000,000× (capped)                              |
| Plinko       | 1%         | ~98%   | 1000× (16 rows, high risk)                        |
| Keno         | 1%         | 99%    | High (10-of-10 at high risk)                     |
| Wheel        | 1%         | 99%    | 49.50× (50 segments, high risk)                  |
| HiLo         | 1%         | 99%    | Unbounded (product of step multipliers)          |
| Roulette     | 2.70%      | 97.30% | 36× (straight-up, single number)                 |
| Blackjack    | ~0.5%      | ~99.5% | 2.5× (blackjack pays 3:2)                        |
| Dragon Tower | 2%         | 98%    | 256,901.12× (Master, 4/1 per row, 9 rows)        |
| Pump         | 2%         | 98%    | 3,203,384.80× (Expert, 10 pops, 15 pumps)        |
| Chicken Road | 2%         | 98%    | 386.90× (Daredevil, 55%/lane, 10 lanes)          |

Most games expose a **configurable edge** (default 1%, or 2% for the Stake-modeled grid games);
Roulette's 2.70% and Blackjack's ~0.5% are inherent to the game's geometry/rules rather than a
knob. RTP for the computed-paytable games (Keno, Wheel) is exactly `(1 − edge)` before rounding.

### Shared game helpers (`games/shared/`)

| File             | Purpose                                                               |
|------------------|-----------------------------------------------------------------------|
| `money.ts`       | `CENTS = 100`, `formatMoney`, `toCents`, `toDollars`.                  |
| `Rules.tsx`      | The collapsible "How to play" panel.                                  |
| `WinPopup.tsx`   | Shows the multiplier + winnings on a win.                             |
| `NumberInput.tsx`| Text field accepting decimal input without reformatting mid-type.     |

---

## 4. The sportsbook (`sportsbook/`)

The sportsbook is **in-progress development** and settles through the same shared balance.

- **Markets** (`markets.ts`): three kinds — `moneyline`, `spread`, `total`. Picks are
  `home`/`away` (moneyline/spread) or `over`/`under` (total). Events move through
  `upcoming → live → final`; betting is open only while `upcoming`. The initial slate seeds six
  games (NBA, NFL, EPL, NHL), each with six standard selections.
- **Odds** (`odds.ts`): stored internally as **American** odds, converted to decimal multipliers
  for settlement. Implied probability is `1 / decimalFromAmerican(american)`.
- **Tickets** (`engine.ts`): a ticket is a `single` (one selection) or a `parlay` (≥2 selections,
  all must win). Two legs from the same event **cannot** be parlayed (related contingencies).
  Parlay decimal is the product of leg decimals, **capped at 300** (`MAX_PARLAY_DECIMAL`,
  i.e. 299-to-1). A losing leg loses the parlay; a push/void leg **drops out** and the parlay
  re-prices on the rest (down to a straight bet if one remains).
- **Grading** (`gradeSelection`): no/unofficial result → `void` (stake returned); moneyline tie,
  or spread/total landing exactly on the line → `push`; otherwise `win`/`loss`.
- **Live** (`live.ts`): a transparent in-play model blends opening implied probability with a
  score-driven model by game progress — `p = (1 − r)·pre + r·pModel` — and applies a
  `LIVE_MARGIN = 0.06`. Lines stay fixed while live prices move with the score.
- **Cash-out** (`cashOutValue`): `stake × Π(leg factors) × (1 − CASHOUT_MARGIN)` with
  `CASHOUT_MARGIN = 0.05`, clamped ≥ 0.
- **Store + feed** (`store.ts`, `provider.ts`, `mockFeed.ts`): the `SportsbookFeed` interface
  (`snapshot`/`subscribe`/`start`/`stop`) is backed today by a timer-driven **mock feed** —
  a stand-in for the live odds/scores API. The store **auto-settles**: when the feed reports an
  event final, any open ticket whose every leg is final is graded against the official scores and
  the figure adjusts, firing an `onBalanceChange` callback. It places/resolves through `core`.

Ticket status lifecycle: `open → won | lost | push | void | cashed`.

---

## 5. The app shell (`app/`)

The shell owns **one** shared `Account` and routes between three sections.

### One account, held in a ref

`App.tsx` holds the account in a ref (`{ id, creditLimit: 100000, balance: 100_000_000, pending: 0 }`).
`core` mutates the account **in place**, so the shell keeps it in a ref and forces a re-render on
demand via a reducer. The header shows **Balance** (`formatMoney(account.balance)`) and
**To-Wager** (`formatMoney(availableToWager(account))`) plus a `SoundToggle`; both figures
re-render whenever a game calls `onBalanceChange()`.

### Sections

```ts
type Section = 'casino' | 'sportsbook' | 'management';
```

- **Casino** — a lobby that maps the `GAMES` registry to cards (icon, name, tagline, `Play >`).
  Clicking a card opens that game's page with a back crumb, the game `Component`, and a `Ledger`.
- **Sportsbook** and **Management** — their state (live feed, open bets) **survives** section
  switches because the `SportsbookStore` is created once at the shell level (`sbStoreRef`), not
  per-switch. It settles against the shared account and pings the header to re-render.

### The `GAMES` registry — adding a game is *one* entry

Each game exports its `*Meta` from `index.ts`. `app/games.ts` composes the registry by spreading
that meta with the game's `Component`:

```ts
export const GAMES = [
  { ...minesMeta, Component: MinesGame },
  { ...crashMeta, Component: CrashGame },
  // …one line per game
];
```

Adding a game later is **one entry here** — the hub, routing, and shared balance need no other
changes. `findGame(key)` looks a game up for routing.

### The `GameProps` contract

Every game view receives exactly this from the shell:

```ts
interface GameProps {
  account: Account;             // the one shared account
  onBalanceChange: () => void;  // signal the shell to re-render the figure
}
```

The shell renders `<game.Component account={account} onBalanceChange={refresh} />`. Games may
optionally accept a per-game `houseConfig` from the Management/admin layer. After any settlement
through `core`, a game calls `onBalanceChange()` and the header figures update.

---

## 6. Tech stack

| Concern        | Choice                                  |
|----------------|-----------------------------------------|
| Language/tools | TypeScript `^5.5.4` + Vite              |
| Frontend       | React `^18.3.1`                         |
| Tests          | vitest `^2.0.5` (`test` = `vitest run`) |

`core` ships with simple tests (`core.test.ts`) proving the money math — `availableToWager`,
the full place→grade→adjust flow, fractional rounding, partial losses, and weekly settlement —
before anything builds on top of it.

---

## 7. Incremental roll-up (M0 → M4)

Backend-first, modular, one module under the shell at a time. Points-based throughout.

| Milestone | Phase                          | What lands                                                                 |
|-----------|--------------------------------|----------------------------------------------------------------------------|
| **M0**    | Phase 0 — Shared system + games| `core` (credit/balance, tested) + Mines + Crash playable on it.            |
| **M1**    | Phase 1 — Backend core + book  | Hardened accounts/auth, balance as a service, history, settlement, sportsbook backend (odds, bet types, grading) — all on one balance. |
| **M2**    | Phase 2 — Roll-up & interface  | Modules brought under the app shell (one at a time); the clean interface — one login, one balance across everything. |
| **M3**    | Phase 3 — Live & polish        | Live odds/scores feed + realtime, automatic settlement, subtle animation. |
| **M4**    | Phase 4 — Launch & iterate     | Onboarding, first players, feedback loop.                                  |

**Guardrails that keep the roll-up clean**

- Build `core` before any game — it's the linchpin.
- Keep the `core` interface generic so Crash's live multiplier and the sportsbook's
  parlays/pushes fit without reshaping it.
- No module tracks its own points — everything goes through the shared balance.
- Roll up incrementally, never one big merge.
