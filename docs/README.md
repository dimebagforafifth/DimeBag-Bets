# Documentation Index

This folder holds deeper notes for the DimeBag-Bets codebase. Use the root
[README](../README.md) for setup and the [Overview](../OVERVIEW.md) for
nontechnical status.

Docs are grouped by topic:
[`architecture/`](architecture/) ·
[`odds-and-fairness/`](odds-and-fairness/) ·
[`operations/`](operations/) ·
[`research/`](research/) ·
[`audit/`](audit/).

## Architecture — [`architecture/`](architecture/)

| Doc                                                       | Use it for                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Architecture](architecture/architecture.md)             | Repo structure, app shell, game registry, and rollout guardrails         |
| [Money model](architecture/money-model.md)               | Credit limit, balance, pending holds, wager lifecycle, weekly settlement |
| [Platform modules](architecture/PLATFORM-MODULES.md)     | `persistence/`, `ledger/`, and `sportsdata/` integration seams           |
| [Management surface](architecture/management-surface.md) | Operator/management UI structure                                         |

## Fairness, Odds, and Sportsbook — [`odds-and-fairness/`](odds-and-fairness/)

| Doc                                                                       | Use it for                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Provably fair](odds-and-fairness/provably-fair.md)                       | Client-visible fairness model and verification concepts           |
| [Provably fair server](odds-and-fairness/provably-fair-server.md)         | Server-authoritative commit/reveal direction                      |
| [Odds](odds-and-fairness/odds.md)                                         | Casino RTP, house edge, and multiplier math                       |
| [Trading](odds-and-fairness/trading.md)                                   | Bookmaker tooling, devig, exposure, Kelly, arbitrage, and hedging |
| [Live odds](odds-and-fairness/live-odds.md)                               | Live odds behavior and operational notes                          |
| [Odds polling](odds-and-fairness/odds-polling.md)                         | Feed polling lane                                                 |
| [Sportsbook upgrade report](odds-and-fairness/sportsbook-upgrade-report.md) | Sportsbook feature gap/status report                            |

## Research — [`research/`](research/)

Longer-form research write-ups.

| Doc                                                                          | Use it for                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Betting app design research](research/betting-app-design-research.md)       | Visual language, motion, IA, mobile patterns, responsible design |
| [Live data provider research](research/research-live-data-providers.md)      | Sportsbook odds API + live-casino provider options and tradeoffs |
| [VPS vs serverless research](research/research-vps-vs-serverless.md)         | Hosting/runtime tradeoffs for the backend                        |

## Operations and Follow-Up — [`operations/`](operations/)

| Doc                                                            | Use it for                                           |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| [Provisioning](operations/provisioning.md)                     | Environment and deployment setup                     |
| [PPH console gap report](operations/pph-console-gap-report.md) | Pay-per-head/operator-console gap analysis           |
| [Pending issues](operations/pending-issues.md)                 | Known risks, deferred work, and pre-launch checklist |
| [Fixed issues](operations/fixed-issues.md)                     | Bugs already found and corrected                     |

## Research — [`research/`](research/)

Longer-form research write-ups.

| Doc                                                                     | Use it for                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Betting app design research](research/betting-app-design-research.md)   | Visual language, motion, IA, mobile patterns, responsible design |
| [Live data provider research](research/research-live-data-providers.md)  | Sportsbook odds API + live-casino provider options and tradeoffs |
| [VPS vs serverless research](research/research-vps-vs-serverless.md)     | Hosting/runtime tradeoffs for the backend                        |

## Audit — [`audit/`](audit/)

Security and gap-analysis pass; start at the [audit README](audit/README.md).

> **Note on the published demo:** the live GitHub Pages site is built fresh by
> `.github/workflows/deploy-pages.yml` and force-pushed to the `gh-pages` branch.
> Nothing in this `docs/` folder is part of that build, so it is plain
> documentation only.
