# DimeBag-Bets

A **points-based — not real money — sports betting and casino app** with a deliberately clean, fast, uncluttered interface. Everything runs on a single shared credit/balance core: one login, one balance across every game and the sportsbook. Points are a closed loop — they can't be bought with real money and can't be cashed out, so there's **no licensing, no payment processing, and no KYC**. Points may be shown with a "$", but they carry **no monetary value**.

---

## Highlights

- **One shared balance.** Every game and the sportsbook reads and writes the same account through `core` — no module tracks its own points.
- **Standard credit-bookie money model.** An account is `{ creditLimit, balance, pending }`; a wager follows a strict place → grade → adjust lifecycle, squared up weekly.
- **Integer-cents accounting.** Money is stored as integer cents (1/100 of a point) so even a 1.01× win on $10 settles to the penny instead of rounding to zero.
- **Provably fair.** Game outcomes derive deterministically from `(serverSeed, clientSeed, nonce)` via HMAC-SHA256, with a SHA-256 server-seed commitment shown before the round and `verify*` functions the player can re-run afterward.
- **13 casino games**, each a self-contained module that plugs into the shared core.
- **Transparent house edge.** Most games default to a **1% edge (99% RTP)**; the edge is stated honestly per game rather than buried.
- **Clean interface as the product.** Whitespace-first, one primary action per screen, restrained palette, minimal motion.
- **TypeScript + React + Vite**, tested with Vitest.

---

## Games

Thirteen casino games, all on the one shared balance. House edge is fixed where the game's geometry dictates it, and configurable (with the listed default) otherwise. "Top multiplier" is the theoretical maximum a game can pay.

| Game | House edge | RTP | Top multiplier |
| --- | --- | --- | --- |
| Mines | 1% | 99% | 5,148,297× (12 mines, full clear) |
| Crash | 1% | 99% | 1,000,000× (capped) |
| Dice | 1% | 99% | 9,900× (at 0.01% win chance) |
| Limbo | 1% | 99% | 1,000,000× (capped) |
| Plinko | 1% | ~98% | 1,000× (16 rows, high risk) |
| Keno | 1% | 99% | High (10-of-10 at high risk) |
| Wheel | 1% | 99% | 49.50× (50 segments, high risk) |
| HiLo | 1% | 99% | Unbounded (product of step multipliers) |
| Roulette | 2.70% | 97.30% | 36× (straight-up) |
| Blackjack | ~0.5% | ~99.5% | 2.5× (blackjack, 3:2) |
| Dragon Tower | 2% | 98% | 256,901.12× (Master, 9 rows) |
| Pump | 2% | 98% | 3,203,384.80× (Expert, 10 pops) |
| Chicken Road | 2% | 98% | 386.90× (Daredevil, 10 lanes) |

> Edges marked configurable (Mines, Crash, Dice, Limbo, Keno, Wheel, HiLo, Dragon Tower, Pump, Chicken Road) ship with the default shown above. Roulette's 2.70% is inherent to the single-zero European wheel (37 pockets vs. a 36-pocket fair price), and Blackjack's ~0.5% follows from standard Vegas rules — neither has an edge knob. Every figure was back-checked against real Stake / casino values; see [docs/odds.md](docs/odds.md).

---

## Sportsbook

A transparent points sportsbook is **in development**: moneyline / spread / total markets, single and parlay tickets (parlays re-price when a leg pushes or voids, capped at 299-to-1), live in-play pricing, cash-out, and auto-settlement against official results — all settling through the same shared balance. It currently runs against a mock odds/scores feed pending the live data API.

---

## Tech stack

- **Language / tooling:** TypeScript + Vite
- **Frontend:** React 18
- **Tests:** Vitest
- **Crypto:** `@noble/hashes` for the provably-fair HMAC-SHA256 / SHA-256 scheme

---

## Getting started

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

Type-check without emitting:

```bash
npm run typecheck
```

Build for production:

```bash
npm run build
```

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `vite` | Start the dev server |
| `npm test` | `vitest run` | Run the test suite once |
| `npm run test:watch` | `vitest` | Run tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` | Type-check without emitting |
| `npm run build` | `vite build` | Production build |
| `npm run preview` | `vite preview` | Preview the production build |

---

## Repo layout

```
DimeBag-Bets/
├── core/         shared credit/balance money model + provably-fair primitives
├── games/        the 13 casino game modules (each with a ui/ view) + shared/ helpers
├── sportsbook/   sportsbook module (markets, odds, settlement, live, mock feed)
├── sportsdata/   sports data feed layer (provider abstraction)
├── ledger/       transaction history across every game and the book
├── persistence/  storage abstraction (memory / localStorage / Supabase later)
├── app/          the unified app shell — owns the one shared account and routing
├── sound/        shared audio engine + sound toggle
├── org/          organisation / management (admin + house-config) layer
├── memory/       project status notes
├── docs/         architecture, money model, provably-fair, and odds write-ups
└── CLAUDE.md     project brief & build guide
```

Each game is a self-contained module that declares its own identity (`meta`) and ships its own view (`Component`). Adding a game is a single entry in `app/games.ts`; the hub, routing, and shared balance need no other changes.

---

## Docs

- [Architecture](docs/architecture.md) — modules, the app shell, and how games plug into the shared core
- [Money model](docs/money-model.md) — the `{ creditLimit, balance, pending }` account and the place → grade → adjust lifecycle
- [Provably fair](docs/provably-fair.md) — the HMAC-SHA256 scheme, seed commitments, and per-game verification
- [Odds](docs/odds.md) — house edges, RTP, and the multiplier math behind each game
- [Trading](docs/trading.md) — the sportsbook's bookmaker toolkit: devig, price-making, exposure, value/Kelly, arbitrage & hedging
