# DimeBag-Bets

DimeBag-Bets is a points-only sportsbook and casino app. It uses dollar-style
display for familiarity, but the balance has no cash value: no buy-ins, no
cash-out, no payments, and no KYC path.

The product idea is simple: one login, one shared balance, a clean betting
interface, and operator tooling for running a book. Casino games, sportsbook
tickets, rewards, and management all settle through the same credit/balance
core.

## Current Scope

- **21 casino games** in `games/`, registered through one `app/games.ts` catalog.
- **Sportsbook** with odds contracts, tickets, same-game/parlay flow, live cache
  wiring, and settlement through `core`.
- **Shared money engine** in `core/`: account credit limit, balance, pending
  holds, wager placement, resolution, and weekly settlement.
- **Durable ledger path** for player bet history, sportsbook/casino activity, and
  management reporting.
- **Operator console** with role-gated management, players, risk, catalog, growth,
  cashier, ledger, and settlement surfaces.
- **Responsible-play, VIP/rewards, leaderboard, profile, community, and pick'em**
  player surfaces.
- **Supabase foundation** for auth, persistence, RPCs, tenant/member auth, and
  server-side fairness/settlement work.

## Important Product Rule

All value is points only.

Points may be formatted with `$` because that is the clearest betting UI, but they
cannot be purchased, redeemed, withdrawn, or transferred for real money.

## Getting Started

```bash
npm install
npm run dev
```

The Vite dev server usually opens at `http://localhost:5173`.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Scripts

| Script                 | What it does                           |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Start the Vite dev server              |
| `npm test`             | Run the Vitest suite once              |
| `npm run test:watch`   | Run Vitest in watch mode               |
| `npm run typecheck`    | Type-check without emitting            |
| `npm run lint`         | Run ESLint                             |
| `npm run format`       | Format the repo with Prettier          |
| `npm run format:check` | Check formatting without writing       |
| `npm run build`        | Type-check and build production assets |
| `npm run preview`      | Preview the production build           |
| `npm run poll:once`    | Poll odds once through the feed lane   |
| `npm run poll:loop`    | Run the odds poller loop               |
| `npm run dev:snapshot` | Capture a development snapshot         |

## Repo Map

| Path                           | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `app/`                         | App shell, routing, player sections, sportsbook UI  |
| `auth/`                        | Login/session adapter and role-based access         |
| `core/`                        | Shared account, wager, settlement, fairness helpers |
| `games/`                       | Self-contained casino game modules                  |
| `sportsbook/`                  | Ticket engine, markets, pricing, grading            |
| `sportsdata/`                  | Odds/scores provider adapters                       |
| `ledger/`                      | Append-only money/event history helpers             |
| `persistence/`                 | Swappable storage primitives                        |
| `org/`, `console/`, `manager/` | Operator hierarchy and management surfaces          |
| `features/`                    | Console feature modules                             |
| `supabase/`                    | Database migrations and backend setup docs          |
| `docs/`                        | Architecture, money model, odds, fairness, ops docs |
| `memory/`                      | Working project notes                               |

## Read Next

- [Plain-English Overview](OVERVIEW.md) - status, decisions, and next work.
- [Work Preview](PREVIEW.md) - surfaces and branches at a glance.
- [Docs Index](docs/README.md) - all deep-dive docs grouped by topic.
- [Architecture](docs/architecture.md) - how the app is organized.
- [Money Model](docs/money-model.md) - balance, pending holds, and settlement.
- [Provably Fair](docs/provably-fair.md) - seed commitments and verification.
- [Pending Issues](docs/pending-issues.md) - known follow-ups and deferred fixes.

## License

Proprietary — All Rights Reserved. See [LICENSE](LICENSE). Not open source; no
use, copying, or distribution is permitted without written authorization.
