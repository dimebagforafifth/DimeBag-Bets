# DimeBag-Bets — Management Surface (the operator/bookie back office)

_What the manager/agent side of the book can do today. Branch `integration/manager-all`. Verified 2026-06-11: 192 test files / 1299 tests green, tsc + lint clean. Points/dollars, play-money only — no buy-in, no cash-out._

---

## A. What changed in the latest build (the PPH agent back-office)

Eleven commits (`d2b216e`..`755a864`) turned the console from a manager+player tool into a full pay-per-head (PPH) agent back office on the 4-tier org **Manager → Master Agent → Agent → Player**.

**New capabilities**
- **Agent model in the core org** — every agent/master can carry a **commission split**; new rollup helpers (`agentOf`, `rosterOf`, `agentPlayerNet`, `agentCommission`, `agentPerformance`, `allAgents`).
- **Add Customer** — onboard a Player, Agent, or Master Agent under any eligible parent (replaced the old "everything lands under the manager" stub).
- **Agent Admin** — set each agent's allowance (credit budget they hand down), commission %, and suspend/activate.
- **Agent Performance** — win/loss, roster size, exposure, and commission per agent.
- **Customer Admin** — one grid for every player: inline + bulk credit-line edit, status (active/lock), move a player between agents, and a login **status + reset** action (the password is never shown — auth lives in Supabase).
- **Collections** — per-agent collect/pay worklist with commission and remit-up.
- **Rules** — house rules / grading & settlement policy, shown plainly.
- **Agent scoping everywhere** — a shared "Scope" dropdown on Pending, Player Performance, Limits, Manual Ticket, Player Admin, Cashier Desk, Notes, and the Weekly Sheet, so a manager can drill into one agent's book (a master sees their agents' rosters; an agent sees only their players).
- **Dollars** terminology throughout (dropped the coins/points framing).

**Two decisions baked in**
- **Commission is a reported figure, not a points movement** — it's shown in Agent Performance + Collections and squared operator↔agent in the real world; the weekly close still resets every figure to zero. (No change to core settlement.)
- **Analysis/CLV + IP Tracker are deferred** until the Phase-3 odds-close feed / auth-backend IP capture land — not built as hollow placeholders.

---

## B. The whole management surface — every console tile (42)

The console is reached from the **Management** tab and is a grid in four sections. Tiles marked **★** are new or rebuilt in the latest phase.

### Operations (12) — the money & the book
| Tile | What it does |
|---|---|
| Weekly Figures | Dollars won/lost per player + the settle figure |
| **Weekly Sheet ★** | Per-player by-day win/loss, rolled up under each agent, scope + CSV export + bulk settle |
| Pending Bets | Open tickets awaiting grade (agent-scoped) |
| Live Activity | Real-time bet ticker over the session feed |
| Settlements | Weekly dollar reconcile |
| Settlement Run | Preview up/down, lock, settle, archive the week |
| **Collections ★** | Per-agent collect/pay worklist + commission + remit-up |
| Transactions / Ledger | Full dollar ledger — filter, link, export |
| Risk & Exposure | Hold, exposure, winners & losers |
| Alerts | Exposure spikes, big wins, large positions |
| Settle Period | Reconcile & close out the week (the actual money action) |

### Players (16) — customers & agents
| Tile | What it does |
|---|---|
| Player Admin | Look up an account: standing + full play history |
| **Customer Admin ★** | Grid: inline/bulk credit edit, status, move-between-agents, login reset |
| **Add Customer ★** | Onboard a Player / Agent / Master Agent under an eligible parent |
| **Agents ★** | The Manager → Master → Agent → Player tree |
| **Agent Admin ★** | Allowance, commission split & suspend |
| **Agent Performance ★** | Win/loss, roster & commission by agent |
| Cashier / Cashier Desk | Issue & adjust balances; Grant/Deduct/Set with batch confirm |
| Limits | Per-player wager caps (agent-scoped) |
| Player Performance | Top & bottom movers (agent-scoped) |
| Messaging | Broadcast & DM players |
| VIP Program | Rank ladder, leaderboard & free play |
| Loyalty | Tune rank thresholds & rewards |
| Segments | New / casual / VIP / dormant |
| Notes & Tags | Operator CRM per player (agent-scoped) |
| Promotions | Free-play & point bonuses |

### Catalog (5) — what's on offer
| Tile | What it does |
|---|---|
| Sportsbook Lines | The Trading Desk: markets, odds, holds — move a line, set vig, suspend/pull a market, devig, exposure, price props/parlays |
| Casino Admin | Game config & RTP |
| Manual Ticket | Write a bet by hand (agent-scoped) |
| Scores | Results & auto/manual grading |
| Rewards | Missions, wheel, XP |

### Control (9) — the operator's own settings
| Tile | What it does |
|---|---|
| Analytics | Book health & trends |
| Roles & Access | Manager roles & permissions |
| Sessions | Logins, device & IP review (IP reserved for the auth backend) |
| Settings | Tenant configuration |
| **Rules ★** | House rules, grading & settlement policy |
| Branding | White-label name, logo & accent |
| Copilot | Advisory insights on your book |
| Setup | New-book wizard & house presets |
| Operator Manual | How every part of the console works |

---

## C. The engine underneath the tiles

**The money model (`core/`)** — one shared credit/balance system every game + the sportsbook flows through. Per account: `creditLimit`, `balance` (the "figure"), `pending`. `availableToWager = creditLimit + balance − pending`. Wager lifecycle: place → grade (win/loss/push/void) → adjust. Weekly settlement squares up and resets to zero. No module tracks its own points.

**The org hierarchy (`org/`)** — the bookie pyramid, four tiers with one placement rule (a parent must be a strictly higher tier). Every member carries its own `core` account. Capabilities:
- **Build the book:** `addPlayer` / `addAgent` / `addSubAgent` under an eligible parent; `reassign` (move with downline, tier- and credit-checked); `renameMember`; `removeMember`; `setActive` (suspend).
- **Credit waterfall (allowances):** `allocatedCredit` / `availableCredit` — an agent can't be granted more than the parent has left, nor cut below what they've handed down. `setCreditLimit`.
- **Per-player levers:** `setMaxWager`, `setMinWager`, `setMaxPayout`, `setBettingLocked`; `setBookBettingLocked` (freeze a whole agent's book).
- **Agent economics (new):** `setCommissionPct`, `agentPerformance`, `agentCommission`, `agentPlayerNet`, `rosterOf`, `agentOf`, `allAgents`.
- **Rollups & settlement:** `bookFigure`, `bookPending`, `playerCount`, `settlementStatement` (preview), `settleOrgWeek` (roll up bottom-up, zero the book).

**Auth & roles (`auth/`)** — a swappable adapter (local demo today, Supabase when keys land). Role-gating decides who sees the console vs. the play tabs. Money never lives here. New: `auth/credentials.ts` gives the operator a **redacted** login status + a password-reset trigger — the password is never read or shown.

**Live state stores (`app/`)** — `book-store` (the one shared org, persisted), `manager-actions` (audited money path), `ledger-store`, `vip-store`, `settlement-store`.

---

## D. Known gaps / deferred

- **Analysis/CLV** and **IP Tracker** — need a stored closing-line feed and IP capture (Phase 3 / auth backend). Deferred, not faked.
- **Commission at settlement** — reported only; not a points movement (by decision).
- **Sessions** tile — login/device list and IP are stubbed pending the Supabase auth backend.
- Everything runs on the local demo data + mock odds feed until the backend keys + real odds API are wired (both are one-line seams).
