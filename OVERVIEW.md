# DimeBag-Bets — Plain-English Overview

> A quick, no-jargon guide to what this project is, what's been built, and what
> you can work on next. Read this first.

---

## 🎯 What it is

A **points-based betting app** — sports betting + casino games — that looks and
feels like Stake.com but uses **points with no real-money value**.

- **One login, one balance.** Every game and the sportsbook share the same wallet.
- **Points can't be bought or cashed out.** Because there's no real money, there's
  **no licensing, no KYC, no payment processing** to deal with.
- **The clean interface is the whole point.** Most betting sites bury the bet under
  clutter — this one does the opposite.

**Built with:** TypeScript + React + Vite. Tested with Vitest. Will run on Supabase
(backend) and Vercel (hosting).

---

## 📊 Current health

| Check | Status |
| --- | --- |
| Tests | ✅ 2,074 passing |
| Type-check | ✅ clean |
| Build | ✅ clean |
| Security audit | ✅ only 1 low-severity issue (waiting on a Vite upstream fix) |

The repo is in **great shape**. It's a working, tested demo — what it's missing is a
real backend.

---

## 🏗️ What's already built

### The 13 casino games
All playable, all on the shared balance, all provably fair:

> Mines · Crash · Dice · Limbo · Plinko · Keno · Wheel · HiLo · Roulette ·
> Blackjack · Dragon Tower · Pump · Chicken Road

House edges (1–2%) were matched to Stake's real published numbers to the penny.

### The money engine (`core/`)
The heart of the app. Every game and the sportsbook run through it. An account is
just `{ creditLimit, balance, pending }`, and every bet follows the same lifecycle:

```
Place  →  Grade  →  Adjust
(hold)   (win/loss   (pay out or
          /push/void) collect)
```

Money is stored as **integer cents**, so nothing rounds away to zero.

### The operator back-office (42 console tiles)
A full "pay-per-head" bookie console: a **Manager → Master Agent → Agent → Player**
hierarchy with commission splits, agent performance reports, customer admin,
collections, weekly settlement, risk/exposure dashboards, and CRM.

### The sportsbook plumbing
The live odds pipeline is **built and tested** — it can pull from TheOddsAPI (works
today), SportsGameOdds, or a built-in mock feed. It just isn't switched on yet (see
below).

### A first database schema + a public demo
- A first **Supabase schema** exists (money + sportsbook tables) but **hasn't been
  applied anywhere yet**.
- A **static demo** auto-publishes to GitHub Pages so the app is viewable online.

---

## ❓ Two decisions that need YOU

Before the backend gets wired up, two calls are waiting on you:

1. **How should the balance be stored?**
   - **Option A — Simple:** keep a running balance number (matches how the code
     works today).
   - **Option B — Auditable:** rebuild the balance from a list of every transaction
     (stronger paper trail, more work).
   - *Pick one before building the "save the balance" path.*

2. **Is The Odds API okay to use?** Confirm their terms allow a **non-real-money**
   app before turning on live odds.

---

## 🚀 What you can work on next

Ordered from easiest to biggest.

### Quick wins
- [ ] **Turn on live odds** — it's a one-line swap in `App.tsx`; the pipeline is
      already built and tested.
- [ ] **Fix the Crash "manual cash-out" jitter** — make it use the last frame's
      value instead of recomputing.
- [ ] **Make Dice ties a push** — right now an exact tie loses; the house rules say
      the stake should be returned.
- [ ] **Repo hygiene** — add automated CI checks, a code formatter config, and a
      fuller README.

### Phase 1 — the backend (the big next step)
- [ ] **Wire up Supabase** — apply the schema, connect the app, make balances and
      logins real.
- [ ] **Real provably-fair commitment** — move the secret seed to the server and
      show its fingerprint *before* the bet (the crypto is already written, it just
      needs to move server-side).
- [ ] **Record weekly settlements** — right now the weekly reset wipes the balance
      without saving a record; it needs an audit entry.

### Phase 1–2 — the sportsbook
- [ ] **Get a real odds API key** and flip live odds on.
- [ ] **Auto-rules enforcement** — the logic exists; it needs hooking to the live
      exposure feed.
- [ ] **Finish the OddsPapi adapter** — currently a stub if you want a 2nd provider.

### Phase 3+ — bigger lifts
- [ ] **Server-authoritative Crash** — decide the crash point on the server, not the
      browser.
- [ ] **Analysis / CLV + IP tracking** — deferred until the live feed + auth land.
- [ ] **Simulated live dealer** — driven by the provably-fair core, for the points
      MVP.

---

## 🗂️ Where things live

```
DimeBag-Bets/
├── core/         the shared money engine — everything runs through this
├── games/        the 13 casino games (each self-contained)
├── sportsbook/   markets, odds, settlement, live pricing
├── sportsdata/   the odds-feed providers (TheOddsAPI, mock, etc.)
├── org/          the bookie / agent management layer
├── app/          the app shell — owns the one shared balance + routing
├── supabase/     database schema (not applied to a server yet)
├── docs/         deep-dive write-ups (architecture, odds, fairness, trading)
└── CLAUDE.md     the full project brief
```

---

## 📖 Where to read more

- **`CLAUDE.md`** — the full project brief and the rules of the build.
- **`docs/architecture.md`** — how the pieces fit together.
- **`docs/money-model.md`** — the balance/credit system in detail.
- **`docs/provably-fair.md`** — how players can verify game outcomes.
- **`docs/pending-issues.md`** — the open to-do list with full context.
- **`docs/fixed-issues.md`** — bugs already found and fixed.

---

## 👉 Suggested first move

Make the **balance decision** (Option A or B above), then **wire up Supabase** so the
app has a real backend. Everything else builds on top of that.
