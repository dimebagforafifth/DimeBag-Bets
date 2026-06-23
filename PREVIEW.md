# DimeBag-Bets - Work Preview

This is the quick tour of what you can inspect locally and how the main work
areas relate to each other. Points are display-only and have no cash value.

## Run Locally

```bash
npm install
npm run dev
```

Then open the Vite URL, usually `http://localhost:5173`.

Main verification commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Player Surfaces

| Surface                       | What to look for                                                                |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Casino                        | 21 registered games, lazy-loaded from the lobby                                 |
| Sportsbook                    | Contract-native book UI, odds cache connection, tickets, parlays, bet placement |
| My Bets                       | Player bet history split across casino and sportsbook activity                  |
| Rewards                       | VIP/reward accrual from real wagers                                             |
| Leaderboard                   | Player standings                                                                |
| Profile / Community / Pick'em | Registry-driven player sections                                                 |
| Responsible play              | Limits, cooldowns, and play gates around wager surfaces                         |

## Operator Surfaces

| Area                       | What it covers                                         |
| -------------------------- | ------------------------------------------------------ |
| Management console         | Role-gated launcher and book operations                |
| Players/members            | Manager, agent, sub-agent, and player hierarchy        |
| Risk/exposure              | Open exposure, standings, and operational views        |
| Catalog/control            | Game availability and house-edge controls              |
| Cashier/ledger/settlements | Adjustments, durable entries, weekly runs, and exports |
| CRM/growth/reporting       | Customer and performance workflows                     |

## Core Systems

| System         | Notes                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| `core/`        | Source of truth for credit limit, balance, pending holds, and wager settlement |
| `ledger/`      | Append-only transaction/audit helpers that mirror core money movements         |
| `sportsdata/`  | Provider adapters and odds/scores feed seams                                   |
| `persistence/` | Memory/local storage abstraction and versioned documents                       |
| `supabase/`    | Migrations and server-side foundation for auth, tenancy, RPCs, and settlement  |
| `api/`         | Edge-portable handlers for fairness and bet resolution work                    |

## Branch Map

| Branch                        | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `main`                        | Integration target and CI source                               |
| `integration/consolidate`     | Casino, sportsbook, and player-facing consolidation            |
| `integration/console`         | Operator console shell and feature registry                    |
| `feat/console-money-desk`     | Cashier, ledger, figures, settlements, and shared desk helpers |
| `feat/player-engagement`      | Bet builder, activity ticker, glossary, and responsible play   |
| `feat/auth-and-roles`         | Auth and role-gated routes                                     |
| `feat/server-data-foundation` | Supabase persistence foundation                                |

Branch names above are a working map, not a guarantee that every branch is current
with `main`.

## Best First Checks

1. Open the app and verify the role-specific navigation.
2. Place a casino bet and confirm the header figure plus My Bets update.
3. Place a sportsbook ticket and confirm it shares the same account.
4. Open Management and inspect the console registry/feature tiles.
5. Run the verification commands before making behavior changes.
