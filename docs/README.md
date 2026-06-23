# Documentation Index

This folder holds deeper notes for the DimeBag-Bets codebase. Use the root
[README](../README.md) for setup and the [Overview](../OVERVIEW.md) for
nontechnical status.

## Core Architecture

| Doc                                         | Use it for                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| [Architecture](architecture.md)             | Repo structure, app shell, game registry, and rollout guardrails         |
| [Money model](money-model.md)               | Credit limit, balance, pending holds, wager lifecycle, weekly settlement |
| [Platform modules](PLATFORM-MODULES.md)     | `persistence/`, `ledger/`, and `sportsdata/` integration seams           |
| [Management surface](management-surface.md) | Operator/management UI structure                                         |

## Fairness, Odds, and Sportsbook

| Doc                                                            | Use it for                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Provably fair](provably-fair.md)                              | Client-visible fairness model and verification concepts           |
| [Provably fair server](provably-fair-server.md)                | Server-authoritative commit/reveal direction                      |
| [Odds](odds.md)                                                | Casino RTP, house edge, and multiplier math                       |
| [Trading](trading.md)                                          | Bookmaker tooling, devig, exposure, Kelly, arbitrage, and hedging |
| [Live odds](live-odds.md)                                      | Live odds behavior and operational notes                          |
| [Odds polling](odds-polling.md)                                | Feed polling lane                                                 |
| [Live data provider research](research-live-data-providers.md) | Provider options and tradeoffs                                    |
| [Sportsbook upgrade report](sportsbook-upgrade-report.md)      | Sportsbook feature gap/status report                              |

## Operations and Follow-Up

| Doc                                                 | Use it for                                           |
| --------------------------------------------------- | ---------------------------------------------------- |
| [Provisioning](provisioning.md)                     | Environment and deployment setup                     |
| [PPH console gap report](pph-console-gap-report.md) | Pay-per-head/operator-console gap analysis           |
| [Pending issues](pending-issues.md)                 | Known risks, deferred work, and pre-launch checklist |
| [Fixed issues](fixed-issues.md)                     | Bugs already found and corrected                     |

## Generated Site Files

The `docs/assets/`, `docs/index.html`, `docs/404.html`, `.nojekyll`, and
`favicon.svg` files are static build output for the GitHub Pages demo. Treat them
as generated artifacts unless you are intentionally updating the published demo.
