# DimeBag-Bets - Plain-English Overview

Start here if you want the nontechnical map of what the project is, what is
already built, and what needs a decision before the next big push.

## What It Is

DimeBag-Bets is a points-based betting app: casino games, sportsbook tickets,
player rewards, and operator tools all tied to one shared player figure.

The points are not money. They cannot be bought, cashed out, or redeemed. The app
uses familiar betting language and dollar-style formatting because that makes the
interface easier to read, not because it handles real funds.

## What Is Built

| Area               | Current shape                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Casino             | 21 playable games, each isolated in its own module and mounted from one registry              |
| Sportsbook         | Odds/ticket flow, parlays, live cache wiring, bet history, and settlement paths               |
| Money core         | Shared credit limit, balance, pending holds, wager resolution, and weekly reset               |
| Player app         | Casino, sportsbook, rewards, my bets, leaderboard, profile/community/pick'em surfaces         |
| Management         | Role-gated operator console with player, risk, catalog, cashier, ledger, and settlement tools |
| Backend foundation | Supabase schema/migrations, auth adapter, role membership, and server-side settlement pieces  |
| Automation         | CI runs typecheck, lint, tests, and production build on pull requests                         |

## The Central Rule

No feature owns its own money.

Every casino game and sportsbook ticket runs through `core/`, so the app can keep
one player figure and one audit story instead of a pile of disconnected balances.

## Decisions Still Needed

1. **Balance storage model**

   Choose whether production balance reads should use a stored running figure or
   rebuild from the ledger. The running figure matches the current code path and
   is simpler. Ledger-derived balance gives a stronger audit trail but needs more
   backend work.

2. **Live odds provider**

   Confirm the provider terms for a non-real-money points app before enabling
   live odds in production.

3. **Server-authoritative play**

   Finish routing player bet resolution through the backend grader so the browser
   never supplies final payout authority.

## Suggested Next Work

| Priority | Work                                                | Why it matters                                         |
| -------- | --------------------------------------------------- | ------------------------------------------------------ |
| 1        | Wire Supabase persistence/auth into the player flow | Makes balances, sessions, and memberships real         |
| 2        | Finish server-side bet resolution for all games     | Closes the biggest fairness/money-integrity gap        |
| 3        | Validate live odds data at the network boundary     | Prevents malformed provider data from reaching pricing |
| 4        | Confirm odds provider terms and enable live odds    | Turns the sportsbook from demo feed to real feed       |
| 5        | Record weekly settlements durably                   | Preserves an audit trail when figures reset            |

## Where Things Live

| Path                                        | Plain-English meaning                      |
| ------------------------------------------- | ------------------------------------------ |
| `core/`                                     | The shared money engine                    |
| `games/`                                    | Casino games                               |
| `sportsbook/` and `app/book/`               | Betting engine and sportsbook UI           |
| `sportsdata/`                               | Odds/scores feed adapters                  |
| `app/`                                      | Main app shell and player-facing surfaces  |
| `auth/`                                     | Login, session, and role access            |
| `org/`, `console/`, `features/`, `manager/` | Operator console and book-management tools |
| `ledger/`                                   | Transaction history helpers                |
| `persistence/`                              | Storage abstraction                        |
| `supabase/`                                 | Database/backend foundation                |
| `docs/`                                     | Deep-dive documentation                    |

## Read More

- [README](README.md) - setup, scripts, and repo map.
- [Work Preview](PREVIEW.md) - current surfaces and branch map.
- [Docs Index](docs/README.md) - all deeper documentation by topic.
- [Pending Issues](docs/operations/pending-issues.md) - open risks and follow-ups.

Recommended first move: choose the production balance storage model, then wire
that path through Supabase before expanding live play.
