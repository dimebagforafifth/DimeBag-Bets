# The Money Model — Shared Credit/Balance Core

The `core/` module is the single source of truth for points in DimeBag-Bets. Every game and the sportsbook places, grades, and settles wagers through it. **No module tracks its own points** — they all read and write one shared account via this contract.

This document specifies that contract: the account shape, the place → grade → adjust lifecycle, exactly how the figure moves on each outcome, and how the week squares up.

---

## Points are integer cents

Money is stored everywhere as **integers** — the smallest unit (cents / points). Points may be displayed with a "$" but carry no monetary value: a closed loop, no buy-in, no cash-out.

Storing integers keeps low-multiplier wins honest to the penny instead of drifting on floats. Fractional profits are converted back to integers with `Math.round` (round half up), so:

| Settlement | Calculation | Stored profit |
|---|---|---|
| `99 × 1.5` win | `99 × (1.5 − 1) = 49.5` | `+50` |
| `99` at `m = 0.4` | `99 × (0.4 − 1) = −59.4` | `−59` |
| `99` at `m = 0.5` | `99 × (0.5 − 1) = −49.5` | `−49` |

The UI layer keeps the same convention via `games/shared/money.ts` (`CENTS = 100`, i.e. 1/100 of a point), so a `1.01×` win on `$10` correctly settles `+$0.10`.

---

## The Account

An account is three fields. There is no game-specific state here — Mines tiles, Crash multipliers, and parlays live in their modules and express themselves only through a generic `stake`, an `outcome`, and a `payoutMultiplier`.

```ts
interface Account {
  id: string
  creditLimit: number  // how far the player may go down (the most they can owe)
  balance: number      // "the figure": running standing
  pending: number      // total of wagers currently at risk (placed, not yet graded)
}
```

| Field | Meaning |
|---|---|
| `creditLimit` | How far down the player may go — the most they can owe before settling. |
| `balance` | The **figure**: running standing. Wins push it positive (book owes player); losses pull it down (player owes book), never past the credit limit. |
| `pending` | Total of wagers currently at risk: placed but not yet graded. |

### How much can be wagered right now

```
availableToWager(account) = creditLimit + balance − pending
```

A wager is only accepted if it fits inside this. The credit limit is already baked into the formula, so callers never check it separately.

```ts
function availableToWager(account: Account): number {
  return account.creditLimit + account.balance - account.pending
}
```

### Outcomes

A wager grades into exactly one of four outcomes:

```ts
type Outcome = 'win' | 'loss' | 'push' | 'void'
```

---

## The wager lifecycle: place → grade → adjust

Every module calls the same three-step flow.

### 1. Place — `placeWager(account, stake, id?)`

Validates the stake and holds it in `pending`. Returns an **open** `Wager`. It throws if the stake is:

- not a whole number of points (must be an integer),
- non-positive (`stake <= 0`), or
- larger than `availableToWager(account)`.

On success it does `account.pending += stake` and returns:

```ts
{ id, accountId: account.id, stake, status: 'open' }
```

### 2 & 3. Grade + Adjust — `resolveWager(account, wager, outcome, payoutMultiplier?)`

A single call grades the wager and moves the figure. It **always releases the hold first** (`pending −= stake`), then adjusts `balance` per the outcome:

| Outcome | Balance move | Notes |
|---|---|---|
| `win` | `balance += profit`, where `profit = round(stake × (payoutMultiplier − 1))` | Requires `payoutMultiplier > 1`, else it throws. |
| `loss` | `balance −= stake` | The full stake is lost. |
| `push` | unchanged | Stake effectively returned. |
| `void` | unchanged | Stake effectively returned. |

The core rule is **`profit = stake × (payoutMultiplier − 1)`**: a `2.5×` win on a `100`-point stake adds `150` to the figure (the original stake was never deducted, since it sat in `pending`, not `balance`).

`resolveWager` throws on a double-resolve, on an account/wager mismatch, or on a `win` without a valid `payoutMultiplier > 1`. After resolving, the wager is marked `status: 'resolved'` with its `outcome` set.

---

## Fractional settlement — `resolveAtMultiplier(account, wager, m)`

Some settlements aren't all-or-nothing: a slot pays a fraction, a Plinko slot pays a small multiple, a sportsbook cash-out pays partway. `resolveAtMultiplier` settles a wager at an arbitrary return multiplier `m ≥ 0` — the player gets back `stake × m`, and the figure moves by the same generic rule:

```
profit = round(stake × (m − 1))
```

The outcome is tagged automatically from `m`:

| Range | Effect on figure | Tagged outcome |
|---|---|---|
| `m > 1` | positive (win) | `win` |
| `m = 1` | zero (push) | `push` |
| `m < 1` | negative (partial loss) | `loss` |

It releases the hold (`pending −= stake`) like `resolveWager`, and throws on a double-resolve, account/wager mismatch, or a non-finite / negative `m`. `resolveWager` remains the all-or-nothing win/loss/push/void path; `resolveAtMultiplier` is the generic one — both keep the money math in one place.

---

## Weekly settlement — `settleWeek(account)`

At the end of each week the account squares up — negative balances pay in, positive balances get paid — and then **resets to zero** for the new week.

It requires **no open wagers**: if `pending !== 0` it throws (`grade all wagers first`). Otherwise it simply sets `account.balance = 0`.

---

## The contract is generic

Nothing game-specific lives in `core`. A wager is a `stake`; a resolution is an `Outcome` plus a `payoutMultiplier` (or a bare multiplier `m`); the balance adjusts. Mines, Crash, Dice, the sportsbook's parlays and pushes — all of them map onto this same surface, which is why the eventual roll-up stays clean.

### Public API

Import from `core` — never copy this logic into a module.

```ts
import {
  availableToWager,
  placeWager,
  resolveWager,
  resolveAtMultiplier,
  settleWeek,
  onWagerResolved,
} from 'core'
import type { Account, Wager, Outcome, WagerStatus, ResolveEvent } from 'core'
```

`onWagerResolved(listener)` subscribes to every resolution (a `ResolveEvent` carrying `stake`, `outcome`, `payoutMultiplier`, and signed `profit`), so a ledger can record across all games without touching them. It returns an unsubscribe function, and a throwing listener can never break settlement.

---

## Usage example

A complete round against the real API — place a 100-point wager and settle it as a `2.5×` win:

```ts
import { placeWager, resolveWager, availableToWager } from 'core'
import type { Account } from 'core'

const account: Account = {
  id: 'demo',
  creditLimit: 1_000,
  balance: 0,
  pending: 0,
}

availableToWager(account) // 1000 + 0 − 0 = 1000

const wager = placeWager(account, 100)
// account.pending === 100
// availableToWager(account) === 900

resolveWager(account, wager, 'win', 2.5)
// hold released: pending → 0
// profit = round(100 × (2.5 − 1)) = 150
// account.balance === 150
```

A fractional cash-out on a fresh wager via `resolveAtMultiplier`:

```ts
import { placeWager, resolveAtMultiplier } from 'core'

const w = placeWager(account, 100)
resolveAtMultiplier(account, w, 0.4)
// profit = round(100 × (0.4 − 1)) = −60  (a partial loss)
// w.outcome === 'loss'
```

And squaring up at week's end (only once nothing is pending):

```ts
import { settleWeek } from 'core'

settleWeek(account) // account.balance → 0
```
