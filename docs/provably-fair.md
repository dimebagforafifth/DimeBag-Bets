# Provably-Fair RNG

Every casino game in DimeBag-Bets settles against a **provably-fair** random outcome. The outcome of a round is fixed the moment the round is created — before you touch a single tile — and is derived deterministically from three inputs you can inspect afterward. Nothing you click during a round can change what was already decided.

This document explains the scheme, how a few representative games turn it into outcomes, and exactly how you can re-derive any past round to confirm it was never tampered with.

The crypto lives in one shared place — `core/fair.ts` — and is never copied into a game. Each game imports the same primitives, so there is a single algorithm to trust.

---

## The three inputs

| Input | Who sets it | When it's revealed | Purpose |
|---|---|---|---|
| **Server seed** | The house (per bet) | After the round, once rotated | The secret randomness source. Committed up front as a SHA-256 hash. |
| **Client seed** | You, the player | Known to you the whole time | Lets you inject your own entropy so the house can't pick a server seed that targets a known client seed. |
| **Nonce** | Increments per bet | Known the whole time | Distinguishes consecutive bets under the same seed pair. |

### The commitment (why the house can't cheat)

Before a round runs, the house publishes the **SHA-256 hash of the server seed**, not the seed itself:

```ts
// core/fair.ts
export function hashServerSeed(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)))
}
```

Because SHA-256 is one-way, the hash commits the house to that exact server seed without revealing it. After the round (when the seed is rotated), the house reveals the server seed, and you can confirm `sha256(serverSeed)` equals the hash you were shown earlier. The house cannot swap the seed after seeing your result — the hash wouldn't match.

You set the client seed, so the house cannot reverse-engineer a server seed that produces a favorable house outcome against a client seed it doesn't yet know.

---

## From seeds to a float stream

All randomness flows from a single HMAC-SHA256 construction:

```
HMAC-SHA256(serverSeed, "clientSeed:nonce:cursor")
```

```ts
// core/fair.ts
export function hmacBlock(serverSeed, clientSeed, nonce, cursor = 0): Uint8Array {
  return hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(`${clientSeed}:${nonce}:${cursor}`))
}
```

Each call returns a 32-byte block. The **cursor** lets one bet consume more than 32 bytes of randomness (block 0, block 1, …) without changing the algorithm — useful for games that need many draws.

### The float stream

Games that need a sequence of `[0, 1)` draws (Mines, Keno, Dragon Tower, Pump) read the **float stream**. Each 32-byte block is consumed four bytes at a time, and each group of four bytes becomes one float:

```
float = Σ  byte[i] / 256^(i+1)   for i = 0..3
```

```ts
// core/fair.ts
export function* floatStream(serverSeed, clientSeed, nonce) {
  let cursor = 0
  for (;;) {
    const block = hmacBlock(serverSeed, clientSeed, nonce, cursor)
    for (let i = 0; i < block.length; i += 4) {
      let float = 0
      for (let j = 0; j < 4; j++) float += block[i + j] / 256 ** (j + 1)
      yield float
    }
    cursor += 1
  }
}
```

When the stream exhausts a block it advances the cursor and pulls the next one, so it never runs dry.

### The single integer draw

Crash needs just one number, so it reads the **first 32 bits** of the first block as an unsigned integer in `[0, 2^32)`:

```ts
// core/fair.ts
export function firstUint32(serverSeed, clientSeed, nonce): number {
  const b = hmacBlock(serverSeed, clientSeed, nonce, 0)
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0
}
```

The implementation is isomorphic (via `@noble/hashes`): the same bytes come out in the browser, Node, and Deno. The exact derivation that runs client-side today can run server-authoritatively later with no rewrite.

---

## How games derive their outcomes

The key property across every game: **the layout is fixed at round creation.** It is a pure function of `(serverSeed, clientSeed, nonce)` plus a game-specific difficulty parameter where relevant. It does not depend on which tiles you click, when you cash out, or how you play.

### Mines — Fisher-Yates pick-and-remove

Mines turns the float stream into a set of mine positions on a 25-tile board. Starting from a pool of all tile indices, it draws `mineCount` times; each draw picks a pool index `floor(float × pool.length)` and removes it:

```ts
// games/mines/fair.ts
const pool = Array.from({ length: totalTiles }, (_, i) => i)
const mines: number[] = []
const floats = floatStream(serverSeed, clientSeed, nonce)
for (let k = 0; k < mineCount; k++) {
  const float = floats.next().value
  const index = Math.floor(float * pool.length)
  mines.push(pool.splice(index, 1)[0])
}
return mines.sort((a, b) => a - b)
```

Because positions are removed from the pool as they're picked, no tile is ever chosen twice. The result is a sorted list of mine indices.

### Keno — the same Fisher-Yates draw

Keno draws its 10 winning numbers from the board using the identical float-stream pick-and-remove primitive that Mines uses, so there is one shuffle algorithm shared across games.

### Dragon Tower — per-row skulls

Dragon Tower lays out **9 rows independently**. Each row gets a fresh pool of that difficulty's `tiles` slots, and `badTiles(difficulty)` skull positions are drawn from it. Crucially, all rows pull from the **same continuous float stream**, so the draws across rows never collide:

```ts
// games/dragon-tower/fair.ts
const floats = floatStream(serverSeed, clientSeed, nonce)
const layout: number[][] = []
for (let r = 0; r < ROWS; r++) {
  const pool = Array.from({ length: tiles }, (_, i) => i)
  const skulls: number[] = []
  for (let k = 0; k < skullsPerRow; k++) {
    const index = Math.floor(floats.next().value * pool.length)
    skulls.push(pool.splice(index, 1)[0])
  }
  layout.push(skulls.sort((a, b) => a - b))
}
```

`deriveTower` returns one sorted array of skull indices per row (bottom row first).

### Pump — pop cells

Pump derives a set of **pop positions** from its 25-cell grid. From a pool of all 25 cells it draws `pops` positions with the same Fisher-Yates pick-and-remove:

```ts
// games/pump/fair.ts
const pool = Array.from({ length: CELLS }, (_, i) => i)   // CELLS = 25
const out: number[] = []
const floats = floatStream(serverSeed, clientSeed, nonce)
for (let k = 0; k < pops; k++) {
  const index = Math.floor(floats.next().value * pool.length)
  out.push(pool.splice(index, 1)[0])
}
return out.sort((a, b) => a - b)
```

The cells are pumped in fixed order (0, 1, 2, …); the balloon pops the first time a pumped cell is a pop position.

### Crash — the crash point

Crash takes the single 32-bit integer draw and maps it to a crash multiplier. The house edge lives entirely in the `(1 − edge)` factor, which shifts only the probability distribution — never the rising-multiplier curve you see on screen:

```
crashPoint = max(1, round(2^32 / (int + 1) × (1 − edge), 2dp))
```

```ts
// games/crash/fair.ts
const raw = (2 ** 32 / (int + 1)) * (1 - totalEdge(config))
return Math.min(MAX_CRASH_MULTIPLIER, Math.max(1, round2(raw)))
```

The result is clamped to a minimum of `1` and a maximum of `MAX_CRASH_MULTIPLIER` (1,000,000). The default edge is the 1% base (`BASE_EDGE = 0.01`), with an optional manager spread that defaults to `0`.

### Summary of derivation inputs

| Game | Draw type | Outputs | Extra parameter |
|---|---|---|---|
| Mines | Float stream (Fisher-Yates) | Sorted mine indices | `mineCount` |
| Keno | Float stream (Fisher-Yates) | Drawn numbers | — |
| Dragon Tower | Float stream, per row | Skull indices for 9 rows | `difficulty` |
| Pump | Float stream (Fisher-Yates) | Sorted pop-cell indices | `difficulty` |
| Crash | First `uint32` | Crash multiplier | house `config` |

All `derive*` functions are deterministic in `(serverSeed, clientSeed, nonce)` plus the game-specific parameter shown above.

---

## How to verify a past round

Once a round is over and the server seed has been rotated and revealed, you can recompute the entire outcome yourself. Each game ships a `verify*` function that re-derives the layout and compares it against what you observed.

1. **Collect the round's data.** You need: the **revealed server seed**, your **client seed**, the **nonce**, any game-specific parameter (mine count / difficulty / house config), and the **outcome you saw** (the mine layout, tower skulls, pop set, or crash point).

2. **Check the commitment.** Compute `hashServerSeed(serverSeed)` and confirm it equals the SHA-256 hash that was published **before** the round. If it matches, the house used exactly the server seed it committed to — it could not have changed it after seeing your play.

3. **Re-derive the outcome.** Feed the seeds and parameters into the game's `verify*` function. It internally re-runs the same `derive*` you've seen above and compares the result to your `expected` value:

   | Game | Verify call |
   |---|---|
   | Mines | `verifyMines(serverSeed, clientSeed, nonce, mineCount, expected)` |
   | Keno | `verifyDraw(serverSeed, clientSeed, nonce, expected)` |
   | Dragon Tower | `verifyTower(serverSeed, clientSeed, nonce, difficulty, expected)` |
   | Pump | `verifyPops(serverSeed, clientSeed, nonce, difficulty, expected)` |
   | Crash | `verifyCrashPoint(serverSeed, clientSeed, nonce, expected, config)` |

   Each returns `true` when the re-derived layout matches what you saw. The comparison is order-independent where it should be — for example, Mines, Pump, and each Dragon Tower row sort both arrays and compare element-by-element, so a match doesn't depend on the order positions were drawn. Crash returns a strict equality check on the 2-decimal crash point.

   ```ts
   // games/mines/fair.ts
   export function verifyMines(serverSeed, clientSeed, nonce, mineCount, expected, totalTiles = 25): boolean {
     const derived = deriveMines(serverSeed, clientSeed, nonce, mineCount, totalTiles)
     return (
       derived.length === expected.length &&
       derived.every((tile, i) => tile === [...expected].sort((a, b) => a - b)[i])
     )
   }
   ```

4. **Confirm the result.** A `true` return means the outcome was an honest function of the three published inputs. If step 2 matched and the `verify*` call returns `true`, the round was fair: the layout was fixed at creation and was never influenced by how you played.

---

## The design — and where this build stands today

The scheme above is built to be **server-authoritative**:

- The **layout is decided at round creation** from `(serverSeed, clientSeed, nonce)`. Player clicks reveal tiles; they do not generate them.
- The **server seed is committed as a hash before the round** and only revealed after, so once it's committed the house is locked into a single outcome it cannot retroactively change.
- The **client seed is yours**, so the house cannot pick a server seed tailored to a known client seed.
- The **same derivation runs everywhere** (browser, Node, Deno) and is reproducible offline, so you never have to trust a black box — you can rerun the math yourself.

### ⚠️ Current limitation (be honest about it)

In the current build there is **no server.** The whole app runs in the browser, so the "server" seed is **generated client-side, fresh for each round, and revealed in the same moment its hash is shown.** That means the commit-reveal here *demonstrates the scheme* — every round is internally consistent and re-derivable — but it does **not yet** enforce the trust guarantee against a remote house, because there's no independent party committing the seed ahead of time. A determined client could read or replace the seed before the round, since both live in the same place.

The math is deliberately *isomorphic* so this gap closes without a rewrite: the true guarantee lands when the backend (per CLAUDE.md §6, Supabase) **commits one server seed per player server-side before any bets**, reuses it across nonces, and only reveals it on rotation. Until that ships, treat "provably fair" as **provably-fair-by-construction, not yet server-enforced** — and don't claim otherwise to players.
