# Odds & House Edge

The complete odds and house-edge reference for every DimeBag-Bets casino game. Every multiplier in the app is computed from these formulas, and every number below was back-checked against real Stake / casino values — Dragon Tower and Pump match Stake's published top multipliers to the cent.

All games settle through the shared `core` money model: a wager is placed, then resolved at a payout multiplier, and the figure adjusts. RTP (return to player) is simply `1 − house edge`.

---

## At a glance

"Top multiplier" is the theoretical maximum a game can pay.

| Game | House edge | RTP | Payout formula | Top multiplier |
|---|---|---|---|---|
| **Mines** | 1% | 99% | `(1 − edge) × C(n, revealed) / C(n − mines, revealed)` | 5,148,297× (12 mines, full clear) |
| **Crash** | 1% | 99% | `max(1, round(2³² / (int + 1) × (1 − edge), 2dp))` | 1,000,000× (capped) |
| **Dice** | 1% | 99% | `100 × (1 − edge) / winChance%` | 9,900× (at 0.01% win chance) |
| **Limbo** | 1% | 99% | `max(1, ⌊(1 − edge) / float × 100⌋ / 100)`; win if result ≥ target | 1,000,000× (capped) |
| **Plinko** | 1% | ~98% | Binomial drop over `rows` pegs; per-slot multipliers from Stake's tables | 1,000× (16 rows, high risk) |
| **Keno** | 1% | 99% | Paytable computed so `Σ P(hits) × mult = (1 − edge)` | High (10-of-10, high risk) |
| **Wheel** | 1% | 99% | Per-segment multipliers computed to mean `(1 − edge)` | 49.50× (50 segments, high risk) |
| **HiLo** | 1% | 99% | Step `= max(1, (1 − edge) / P(win))`; cumulative `= Π` steps | Unbounded (no hard cap) |
| **Roulette** | 2.70% | 97.30% | `36 / count_numbers` (fair price on a 37-pocket wheel) | 36× (straight-up) |
| **Blackjack** | ~0.5% | ~99.5% | Blackjack 3:2 → 2.5×, win 2×, push 1×, loss 0× | 2.5× (blackjack) |
| **Dragon Tower** | 2% | 98% | `(1 − edge) × (tiles / safe)^level` | 256,901.12× (Master, 9 rows) |
| **Pump** | 2% | 98% | `(1 − edge) × C(25, pumps) / C(25 − pops, pumps)` | 3,203,384.80× (Expert, 15 pumps) |
| **Chicken Road** | 2% | 98% | `(1 − edge) / survival^lane` | 386.90× (Daredevil, 10 lanes) |

> RTP is flat across every win chance, target, or pick count within a game — the edge is baked into the multiplier, not into hidden losing outcomes. Plinko, Keno, and Wheel realize their RTP after rounding, so the live figure can sit a hair below the nominal `1 − edge`.

---

## The 1% Stake-standard games

Mines, Crash, Dice, Limbo, Plinko, Keno, Wheel, and HiLo all run at a **1% house edge (99% RTP)** — the Stake-standard rate. The edge is applied as a flat `(1 − edge)` scalar so that, mathematically, every choice the player makes has the same expected value.

**Mines** — On a 25-tile board, each safe reveal grows the multiplier. The closed form is:

```
multiplier = (1 − edge) × C(n, revealed) / C(n − mines, revealed)
```

A single-mine board cleared to the last safe tile pays `0.99 × C(25, 24) = 24.75×`; the game's overall ceiling is a full clear at 12 mines, `0.99 × C(25, 12) = 5,148,297×`. Multipliers round floor-to-2-decimals by default (slightly house-favorable).

**Crash** — The crash point is derived from the first 32 bits of an HMAC-SHA256 block, treated as an unsigned integer:

```
crashPoint = max(1, round(2³² / (int + 1) × (1 − edge), 2dp))
```

The `(1 − edge)` factor scales the whole distribution, giving a flat 99% RTP. The result is clamped to a maximum of 1,000,000×. (The round manager can layer additional spread on top of the 1% base edge.)

**Dice** — A uniform roll in `[0, 100)` decides the outcome, with the payout set to hit the configured edge:

```
multiplier = 100 × (1 − edge) / winChance%
```

`winChance%` ranges from 0.01% to 98%. At the floor of 0.01%, the multiplier is `100 × 0.99 / 0.01 = 9,900×`. Every win chance carries an identical edge.

**Limbo** — A float from the provably-fair stream produces a result; the player wins if it meets their target:

```
result = max(1, ⌊(1 − edge) / float × 100⌋ / 100)
win if result ≥ target, paying the target multiplier
```

Because `P(result ≥ t) = (1 − edge) / t`, the expected value is a flat `1 − edge` regardless of the target chosen. Results are capped at 1,000,000×.

**Plinko** — A ball drops through `rows` of pegs (8–16), each peg a 50/50 left/right flip. The landing slot is the count of right-flips and is binomially distributed; the per-slot multiplier comes straight from **Stake's published payout tables** (low / medium / high risk). The realized RTP (~0.97–0.99 depending on rows and risk) is shown honestly rather than tuned. A 16-row high-risk board tops out at 1,000×.

**Keno** — Ten numbers are drawn from 40; the player picks 1–10. The paytable is **computed per round** from hypergeometric hit probabilities so that `Σ P(hits) × mult = (1 − edge)` by construction. Only higher hit-counts pay, weighted by the selected risk level. Risk shapes volatility, not edge.

**Wheel** — A spin lands uniformly on one of N segments (10 / 20 / 30 / 40 / 50). The multiplier table is **built to an exact mean of `(1 − edge)`** before rounding; the risk level controls the distribution's shape (high risk = a single jackpot pocket, medium = a ladder, low = gentle). A 50-segment high-risk wheel has one 49.50× pocket scaled so the mean is 0.99.

**HiLo** — Cards are drawn independently from a 52-card deck. Each higher/lower guess earns a step multiplier:

```
step = max(1, (1 − edge) / P(win))
P(higher) = (13 − rank + 1) × 4 / 52,  P(lower) = rank × 4 / 52
```

The cumulative multiplier is the product of step multipliers across a streak. The step is clamped to a minimum of 1× so a guess never reduces the running payout, and there is no hard cap on the cumulative figure.

---

## The 2% games — Dragon Tower & Pump

Dragon Tower and Pump run at a **2% house edge (98% RTP)**, matching Stake's rates for these titles. Both top multipliers were verified to the cent against Stake's published values.

**Dragon Tower** — A 9-row tower. Each row has `tiles` tiles split into `safe` eggs and `(tiles − safe)` skulls. Picking an egg climbs a level:

```
multiplier = (1 − edge) × (tiles / safe)^level
```

Five difficulties trade safety for ceiling (top = a perfect 9-row climb):

| Difficulty | Tiles / safe per row | Top multiplier (9 rows) |
|---|---|---|
| Easy | 4 / 3 | 13.05× |
| Medium | 3 / 2 | 37.67× |
| Hard | 2 / 1 | 501.76× |
| Expert | 3 / 1 | 19,289.34× |
| Master | 4 / 1 | **256,901.12×** |

Master clears at `0.98 × 4⁹ = 256,901.12×`, matching Stake to the cent.

**Pump** — A 25-cell grid where `pops` cells are pop-positions. Cells are pumped in fixed order; each safe pump multiplies the figure by `(25 − i) / (25 − pops − i)`. The closed form is:

```
multiplier = (1 − edge) × C(25, pumps) / C(25 − pops, pumps)
```

Four difficulties (top = clearing every safe cell, i.e. `25 − pops` pumps):

| Difficulty | Pops | Max pumps | Top multiplier |
|---|---|---|---|
| Easy | 1 | 24 | 24.50× |
| Medium | 3 | 22 | 2,254× |
| Hard | 5 | 20 | 52,067.40× |
| Expert | 10 | 15 | **3,203,384.80×** |

Expert at 15 pumps reaches `0.98 × C(25, 15) / C(15, 15) = 3,203,384.80×`, exact to the live game.

---

## Roulette — European single-zero

Roulette uses a **European single-zero wheel: 37 pockets (0–36)** with a uniform spin. Every bet is priced fairly against a 36-pocket wheel:

```
payout = 36 / count_numbers
```

A straight-up bet on one number returns 36×; an even-money bet covering 18 numbers returns 2×. Because the wheel has 37 pockets but pays as if it had 36, the RTP is `36 / 37 = 97.30%` on **every** bet regardless of coverage. The **2.70% edge is inherent to the wheel geometry** — there is no manager edge knob.

---

## Chicken Road — InOut Games style

Chicken Road runs at a **2% house edge (98% RTP)**, matching the real InOut Games title. A chicken crosses `lanes` lanes, each with a fixed survival probability; reaching a lane multiplies the figure:

```
lane i multiplier = (1 − edge) / survival^i
```

Since `P(reach lane i) = survival^i`, the payout exactly inverts the risk, giving a flat `1 − edge` at every lane. Four difficulties (top = surviving every lane):

| Difficulty | Survival / lane | Lanes | Top multiplier |
|---|---|---|---|
| Easy | 90% | 20 | 8.06× |
| Medium | 80% | 15 | 27.85× |
| Hard | 70% | 12 | 70.80× |
| Daredevil | 55% | 10 | **386.90×** |

Easy's final lane pays `0.98 / 0.9²⁰ = 8.06×`; Daredevil's 10th lane reaches `0.98 / 0.55¹⁰ = 386.90×`, the game's overall ceiling. The edge here is manager-configurable.

---

## Blackjack — 3:2 Vegas rules

Blackjack follows **standard Vegas rules**, yielding roughly a **0.5% house edge (~99.5% RTP)**:

- **Blackjack pays 3:2** → 2.5× return
- Regular win → 2×, push → 1× (stake returned), loss → 0×
- Dealer **hits on totals below 17 and stands on all 17s** (soft 17 included)
- Player may hit, stand, or **double down on the opening two cards** (double places an equal second wager)

There is no configurable edge — the ~0.5% follows from the rule set.

---

## Configurable edge & honest RTP

A few things worth stating plainly:

- **The edge is manager-configurable per game** for the parametric games (Mines, Crash, Dice, Limbo, Keno, Wheel, HiLo, Dragon Tower, Pump, Chicken Road) — each defaults to its Stake-standard rate but can be re-tuned by the admin layer.
- **Keno and Wheel compute their multipliers** to hit the configured edge with a Stake-like volatility shape — they are *not* copied tables. Keno builds its paytable fresh each round from hypergeometric probabilities; Wheel builds a table whose mean is exactly `1 − edge`. Risk levels shape the distribution, never the edge.
- **Plinko, Roulette, and Blackjack have fixed edges** baked into their tables or rules and expose no edge knob. Plinko uses Stake's published tables verbatim; Roulette's 2.70% is fixed by the 37-pocket wheel; Blackjack's ~0.5% follows from Vegas rules.

Every figure in this document was back-checked against real Stake and casino values — including Dragon Tower's 256,901.12× and Pump's 3,203,384.80×, both confirmed to the cent.

---

## Automated verification

These numbers aren't just back-checked by hand — they're **enforced by a test**: [`games/house-edge.audit.test.ts`](../games/house-edge.audit.test.ts) recomputes the realized return-to-player for every game from each game's *own* exported probability and multiplier functions, and fails if the edge ever drifts. It checks the two shapes of game directly:

- **Laddered cash-outs** (Mines, Pump, Dragon Tower, Chicken Road, HiLo): `multiplier × P(reach that cash-out) = 1 − edge` at *every* reachable point.
- **Single-outcome** (Dice, Limbo, Crash, Keno, Wheel, Plinko, Roulette): `Σ P(outcome) · payout(outcome) = 1 − edge`.

Measured realized RTP (run `npx vitest run games/house-edge.audit.test.ts`):

| Game | Realized RTP | Notes |
|---|---|---|
| Mines, Dice, Limbo, Crash, HiLo | **99.000%** | exact to < 10⁻⁹ (HiLo within round-2 granularity) |
| Pump, Dragon Tower, Chicken Road | **98.000%** | exact (Chicken Road within round-2 granularity) |
| Roulette | **97.297%** | inherent 1/37 |
| Keno | **98.85 – 99.16%** | flat 99% target, ± rounding across picks × risk |
| Wheel | **98.77 – 99.12%** | flat 99% target, ± rounding across risk × segments |
| Plinko | **98.91 – 99.16%** | Stake's published tables (no single configured edge) |

Rounding only ever favours the house on the floored games (Mines, Dice), and stays inside the rounding granularity on the round-2 games. Blackjack is excluded — its RTP depends on player strategy, so it's covered by its own rules tests rather than a closed-form edge.
