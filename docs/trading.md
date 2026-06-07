# Sportsbook Trading & Odds Toolkit

`sportsbook/trading/` is the **bookmaker's odds engine** — the price-making, risk, and value math that sits on top of the sportsbook's American↔decimal conversions (`sportsbook/odds.ts`). It's a layer of **pure functions on plain numbers**: no event/ticket coupling, no state, so it's trivially testable and the live store or the `org/Management` admin layer can adopt it piece by piece during roll-up.

```ts
import {
  marketReport, fairProbabilities,        // read a market: vig & true probs
  makePrices, twoWayPrices,               // set a market: probs → posted prices
  exposure, suggestLineMove,              // manage the book: risk & line moves
  expectedValue, kellyFraction,           // value & staking
  arbitrage, marketSafety,                // arb / leak detection
  hedgeToLock, maxBookStake,              // hedging & stake limits
} from 'sportsbook/trading'
```

Everything works in **decimal** odds (a decimal of `2.50` returns `stake × 2.50` — exactly the `payoutMultiplier` the money model settles a win at). American-input wrappers exist where handy.

---

## 1. Reading a market — margin & devig (`margin.ts`)

A posted market's prices carry the book's margin: the implied probabilities (`1/decimal`) sum to more than 1. That sum is the **overround**; the excess is the **margin** (the juice). To recover the book's true view you **devig** — strip the margin so the probabilities sum to 1.

| Function | Returns |
|---|---|
| `overround(decimals)` | Σ(1/decimal); fair = 1, vig > 1 |
| `bookMargin(decimals)` | overround − 1 |
| `theoreticalHold(decimals)` | 1 − 1/overround |
| `fairProbabilities(decimals, method)` | devigged probabilities (sum = 1) |
| `fairDecimalOdds(decimals, method)` | no-vig decimal prices |
| `marketReport(decimals, method)` | overround + margin + hold + fair probs/odds |

Three devig **methods** distribute the margin differently across favourites vs longshots:

- **`proportional`** — `p_i = q_i / Σq`. Simple normalisation; the default.
- **`power`** — solve `Σ q_iᵏ = 1` (root `k > 1` when vig is present), then `p_i = q_iᵏ`. Corrects the favourite–longshot bias (takes more margin off longshots).
- **`shin`** — Shin's model: assumes a fraction `z` of informed money and solves for it. Sits between the other two; favoured by sharp books.

```ts
marketReport([1.4, 3.0])
// { overround: 1.0476, margin: 0.0476, hold: 0.0455,
//   fairProbabilities: [0.6818, 0.3182], fairDecimals: [1.4667, 3.1429] }

fairProbabilitiesAmerican([-110, -110])   // [0.5, 0.5] — even market, vig removed
```

---

## 2. Setting a market — price-making (`pricing.ts`)

The inverse of devigging: take the book's **fair probabilities** (from a model, or devigged from a sharp source) and a **target margin**, and post the prices. The margin is applied so the overround lands on `1 + targetMargin`.

| Function | Use |
|---|---|
| `makePrices(fairProbs, targetMargin, method)` | full set → `{ impliedProbability, fairProbability, decimal, american }[]` |
| `twoWayPrices(homeProb, targetMargin, method)` | two-way convenience → `[home, away]` |
| `pricedOverround(priced)` | the overround a priced set carries (a check) |

Methods mirror devig: `proportional` (scale each prob by `1+m`), `additive` (`+ m/n` each), `power` (loads more margin onto longshots — the realistic book shape).

```ts
makePrices([0.6, 0.4], 0.05, 'proportional')
// [ { fairProbability: 0.6, impliedProbability: 0.63, decimal: 1.587, american: -170 },
//   { fairProbability: 0.4, impliedProbability: 0.42, decimal: 2.381, american: +138 } ]
// pricedOverround === 1.05
```

`makePrices(..., 'proportional')` is the exact inverse of `devigProportional` — round-trip a market and you get your fair probabilities back.

---

## 3. Managing the book — risk & exposure (`book.ts`)

The book collects every stake up front; when an outcome wins it pays those backers `stake × decimal`. So its net P&L if outcome *i* wins is `totalStake − stake_i × decimal_i`.

| Function | Returns |
|---|---|
| `exposure(positions)` | per-outcome net P&L, `worstCase`, `bestCase`, `worstOutcome`, `balanced` |
| `balancedStakeFractions(decimals)` | the hedge that flattens the book (∝ 1/decimal) |
| `expectedHold(positions, trueProbs)` | expected book P&L ÷ total stake |
| `suggestLineMove(positions, step)` | shorten the over-exposed side, lengthen the rest (overround preserved) |

```ts
const positions = [
  { name: 'Home', decimal: 2.0, stake: 1500 },
  { name: 'Away', decimal: 2.0, stake: 500 },
]
exposure(positions)
// worstCase: -1000 if Home wins (liability 1000); worstOutcome: 'Home'; balanced: false
suggestLineMove(positions)
// { shorten: 'Home', moves: [Home 2.0 → 1.96, Away 2.0 → 2.04] }   // deter more Home money
```

---

## 4. Value & staking (`value.ts`)

Given a fair probability and the price on offer:

| Function | Meaning |
|---|---|
| `expectedValue(p, decimal)` | EV per unit staked = `p·decimal − 1` |
| `edge(p, decimal)` / `isValueBet(p, decimal)` | the edge and whether it's +EV |
| `breakEvenProbability(decimal)` | win rate a price needs = `1/decimal` |
| `kellyFraction(p, decimal, mult?)` | optimal bankroll fraction `= EV/(decimal−1)`, clamped ≥ 0 |
| `kellyStake(p, decimal, bankroll, mult?)` | the Kelly stake in points |
| `closingLineValue(betDecimal, closeFairProb)` | EV measured vs the closing line |

```ts
expectedValue(0.55, 2.0)   // +0.10  (a value price)
kellyFraction(0.55, 2.0)   // 0.10   → stake 10% of bankroll (use mult 0.5 for half-Kelly)
closingLineValue(2.1, 0.5) // +0.05  → you beat the close
```

---

## 5. Arbitrage & market safety (`arbitrage.ts`)

When implied probabilities sum to **less than 1**, a bettor can back every outcome for a guaranteed profit — an arb. The book never wants to post one.

```ts
arbitrage([2.1, 2.1])
// { isArbitrage: true, overround: 0.952, returnMultiple: 1.05,
//   profitMargin: 0.05, stakeFractions: [0.5, 0.5] }

marketSafety([2.1, 1.8], [0.5, 0.5])
// { safe: false, arbable: false, valueOutcomes: [0] }  // leaking +EV on side 0
```

`marketSafety` is the one-call guard before posting: unsafe if arbable, or — given the book's fair probabilities — if any outcome is priced +EV for the bettor.

---

## 6. Hedging & stake limits (`hedge.ts`)

| Function | Use |
|---|---|
| `hedgeToLock(openStake, openDecimal, hedgeDecimal)` | stake on the other side to lock equal profit |
| `evaluateHedge(openStake, openDecimal, hedgeStake, hedgeDecimal)` | net P&L each way + the guaranteed floor (for a partial hedge) |
| `maxBookStake(liabilityCap, decimal, currentLiability?)` | largest stake the book can take under a liability cap |

```ts
hedgeToLock(100, 3.0, 2.0)   // { hedgeStake: 150, lockedProfit: 50 }  (50 either way)
maxBookStake(1000, 3.0)      // 500  — a 500 stake at 3.0 risks exactly 1000
```

---

## Design notes

- **Composes, doesn't fork.** Reuses `sportsbook/odds.ts` for American↔decimal and chains internally (`arbitrage` → `overround` + `balancedStakeFractions`; `marketSafety` → `expectedValue`).
- **Decimal-first**, integer-cents-friendly: stakes/returns are plain numbers, so settle through `core` unchanged (see [money-model.md](money-model.md)).
- **Numerically hardened**: the power/Shin solvers bracket-and-bisect with early stop; edge cases (heavy favourites, lopsided books, unnormalised inputs) are guarded and tested.
- **Tested**: every function has known-value tests (e.g. Kelly 10% at p=0.55/d=2.0; the −110/−110 overround; a [2.1, 2.1] arb), and the devig/pricing math was cross-checked against an independent from-first-principles oracle.

> Roll-up: the live store can devig a sharp feed → `makePrices` to post a line → `exposure` / `suggestLineMove` to trade the book; the `org/Management` desk can surface `marketReport` and `marketSafety`. None of that requires changing these functions.
