# DimeBag-Bets — Project Brief & Build Guide
*(CLAUDE.md — place at the repo root. Claude Code reads this automatically as standing context. Read this before any task; it is the single source of truth for what we're building and how.)*

---

> [!IMPORTANT]
> **Handoff note for Joe — please read at the start of your next session (added 2026-06-16).**
>
> Since you were away, the repo got a full review + fixes, issue tracking, provider research, and a first Supabase schema. New things to look at:
> - `docs/operations/fixed-issues.md` — bugs found & fixed (incl. a dice EV exploit and a crash auto-cashout race).
> - `docs/operations/pending-issues.md` + GitHub issues #2–#8 — open items for Phase 1+.
> - `docs/research/research-live-data-providers.md` — which sportsbook odds API + live-casino option to use (with a manual fill-in table for sales-gated data).
> - `supabase/migrations/…_init_core_and_sportsbook.sql` — initial DB schema (money core + provider-agnostic sportsbook), **not yet applied to a remote**.
>
> **Balance model (decided):** `accounts.balance` is **ledger-derived** — a cache rebuilt from `sum(balance_delta)` over the `ledger` table. The ledger is the source of truth; the RPCs write to ledger first, then recompute `accounts.balance` from it. `reconcile_balance()` in `0015_ledger_derived_balance.sql` can fix any cache drift. Do not write to `accounts.balance` directly outside of that recompute path.
>
> **Action needed from you — Google login (added 2026-06-19):** Google sign-in + email verification are now built in the code (`auth/supabaseAdapter.ts`, `auth/Login.tsx`), but need **Supabase dashboard config** to go live: enable the **Google provider** (client id/secret), add the deployed origin to the **allowed redirect URLs** (`SUPABASE_AUTH_REDIRECT_URL`), and turn on **email confirmation** + customize the template. The code path is ready and waiting for those keys; until then the app runs on the demo adapter exactly as before. (See `docs/operations/pending-issues.md` → "Full-repo review" for the rest of this session's work: server-side bet grading, the multi-user authz migration `0007`, and the pre-player-auth checklist.)
>
> *(Remove this block once you've read it and made the call.)*

---

## 0. How to use this file (for Claude Code)

- This is the **guiding context for the entire project.** Follow it on every task.
- When a request and this file conflict, ask before deviating.
- **Build order matters:** the shared `core` (money model) comes first, games second, sportsbook later, interface rolled up last. Don't jump ahead.
- **Every feature is a vertical slice:** a little logic + a clean minimal UI so it's always testable. Never build a headless backend with nothing on screen, and never ship a throwaway UI.
- Write small, runnable pieces with simple tests. Prove the money math before building on it.

---

## 1. What DimeBag-Bets Is

A **points-based (non–real-money) sports betting + casino games web app** with a deliberately **clean, fast, uncluttered interface.**

- **Points, not money.** Closed loop: points can't be bought with real money and can't be cashed out. This means **no licensing, no payment processing, no KYC.** Points may be displayed with a "$" but carry no monetary value.
- **One app, many ways to play:** a sportsbook plus casino games (starting with Mines and Crash), all on a single shared balance.
- **The interface is the product.** Most books bury the bet under clutter; DimeBag-Bets does the opposite.

---

## 2. Core Principles (non-negotiable)

1. **Clean above all.** Whitespace-first, one primary action per screen, tight type scale, restrained palette, minimal purposeful motion. If a feature can't be added without clutter, give it its own view or cut it. This principle **overrides the others** when they conflict.
2. **Backend-first, but UI is never a bottleneck.** Logic comes first within each feature, but every feature ships with a clean, minimal, working interface.
3. **Modular, one shared system.** Each feature lives in its own folder, but they all use one shared credit/balance `core`. **No module tracks its own points.**
4. **Honest by default.** Settlement rules, limits, and how the figure works are shown to the player, not buried.
5. **Fast.** Instant loads; odds/multipliers update live without the screen jumping.

---

## 3. The Money Model — Shared Credit/Balance System (THE contract)

This is a **standard credit-bookie system** — simple but complete. It lives in `core/` and **everything** (every game + the sportsbook) goes through it. Nothing keeps separate points.

### Per account
- **`creditLimit`** — how far a player may go down; the most they can owe before settling.
- **`balance`** (the "figure") — running standing. Wins push it positive; losses pull it down. **Positive = won beyond credit (book owes player); negative = owed by player**, never past the credit limit.
- **`pending`** — total of wagers currently at risk (placed but not yet graded).
- **`availableToWager`** = `creditLimit + balance − pending`. A wager is only accepted if it fits inside this.

### Wager lifecycle (the shared flow every module calls)
1. **Place** — validate `stake ≤ availableToWager`; if ok, accept the wager and add `stake` to `pending`.
2. **Grade** — when resolved, mark the outcome: **Win, Loss, Push, or Void.**
3. **Adjust** — release the hold (`pending −= stake`) and:
   - **Win:** `balance += profit` (profit = `stake × (payoutMultiplier − 1)`).
   - **Loss:** `balance −= stake`.
   - **Push / Void:** no change to balance (stake effectively returned).

### Weekly settlement
- At the end of each week, accounts square up: negative balances pay in, positive balances get paid, then **every balance resets to zero** for the new week.

### Suggested shape (adapt as needed, keep the contract stable)
```
Account { id, creditLimit, balance, pending }
availableToWager(account) -> creditLimit + balance - pending

placeWager(account, stake) -> Wager        // throws if stake > available
resolveWager(wager, outcome, payoutMultiplier) // outcome: 'win'|'loss'|'push'|'void'
settleWeek(account) -> void                 // pay out / collect, reset balance to 0
```
> Keep this interface **generic**: a wager has a stake; a resolution returns an outcome + payout multiplier; the balance adjusts. Do **not** bake game-specific assumptions (Mines tiles, Crash multipliers, parlays) into `core` — those live in the modules and express themselves through `payoutMultiplier` and `outcome`.

---

## 4. House Rules (settlement logic) — model on the real industry standard

These are DimeBag-Bets' house rules, modeled on what major regulated sportsbooks (DraftKings, FanDuel) and casino books publish. The **sportsbook** uses all of them; the **casino games** (Mines, Crash) mainly use the win/loss/push/void grading. Keep them in plain language in-app.

- **Bet acceptance:** a bet locks at the odds/line shown when confirmed. Line moves don't change an accepted bet; if the line moves mid-placement, re-confirm. Obvious ("palpable") errors — clearly wrong prices/lines — may be voided or re-settled at the correct price.
- **Official games (sportsbook):** a bet only stands if the game goes far enough to be official — e.g. NFL: full game; NBA: 43 of 48 minutes; MLB: official game (5 innings / 4½ if home leads) for moneyline, full 9 (8½) for run line/totals; NHL/soccer: full regulation. Otherwise **void, stake returned**.
- **Pushes:** an exact tie on a spread/total returns the stake (no win/loss). Half-point lines can't push. A push leg in a parlay drops out and the parlay re-prices on the rest.
- **Voids/cancellations:** postponed-and-not-replayed-in-week, abandoned-before-official, and player non-starters (for player props) all void affected bets; stake returned.
- **Settlement:** graded from official results/stats as soon as available; reflected immediately in the player's figure; squared up weekly.
- **Parlays:** every leg must win; one loss loses the parlay. A void/push leg drops out and the parlay re-prices on the remaining legs (down to a straight bet if only one is left). Max parlay price ~299-to-1. Related contingencies can't be combined.
- **Live betting:** short acceptance delay; if a scoring event hits while a bet is pending, it may be rejected or re-offered at new odds; bets confirmed before the event stand.
- **Limits & max payout:** per-bet/per-market limits (stakes may be scaled back); a max payout cap (typically per day). The **credit limit** is the hard cap on how far a player can be down.
- **Disputes:** official results are the source of truth; settlement may pause pending documentation; uncovered cases follow standard industry practice.

---

## 5. Architecture & Folder Structure

A modular monorepo. Each feature is self-contained in its own folder; shared logic lives in `core`. This is what makes the eventual roll-up clean.

```
DimeBag-Bets/
├── CLAUDE.md          ← this file
├── core/              ← shared credit/balance system (Section 3). Everything imports this.
├── games/
│   ├── mines/         ← standalone Mines (Section 7)
│   └── crash/         ← standalone Crash (Section 7)
├── sportsbook/        ← sportsbook module (later phases)
├── app/               ← the unified clean interface shell (Phase 2)
└── docs/              ← white papers, cost map, charts
```

**Rules:**
- Games are **modular in code but not independent in data** — every module reads/writes the one shared balance via `core` and uses the place → grade → adjust flow.
- Shared logic goes in `core`, never copied into a game.
- **Roll up incrementally** (one module under the app shell at a time), never one big-bang merge.

---

## 6. Tech Stack

- **Language/tooling:** TypeScript + Vite (rolls cleanly into the React frontend; no rewrite later).
- **Frontend:** React — the clean UI shell all modules roll up into.
- **Backend / data layer:** **Supabase** — one service covering database, auth, realtime, and storage (don't add separate auth/realtime services).
- **Hosting:** Vercel.
- **Realtime:** Supabase realtime (for live odds + the Crash multiplier). Don't add Pusher/Ably.
- **Sports data:** a sports odds/scores API (added in Phase 3 for the sportsbook).
- **Provably-fair RNG:** our own cryptographic seed logic for Mines/Crash — not a paid service.
- **No payments / KYC** — points-based.

---

## 7. The Games (Phase 0 builds)

Both are simple, self-contained, and **plug into `core`** (place wager → resolve → adjust). Build **Mines first** (pure logic), then **Crash** (has a realtime wrinkle).

### Mines
- A grid (e.g. 5×5) with a set number of hidden mines.
- Player places a wager (through `core`), then reveals tiles one at a time.
- Each safe reveal raises a **multiplier** (higher with more mines / more safe picks).
- Player can **cash out** anytime → resolve as a **win** at the current multiplier.
- Hitting a mine → resolve as a **loss** (lose the stake).
- **Provably fair:** mine positions derived from a seed the player can verify after the round.

### Crash
- A **multiplier rises** from 1.00× over time.
- Player places a wager (through `core`) before the round, then **cashes out** before it "crashes."
- Cash out in time → **win** at the multiplier when they cashed out.
- Crash before they cash out → **loss**.
- **Server-authoritative & provably fair:** the crash point is decided server-side from a verifiable seed so it can't be gamed by the client. This is the part that's harder than Mines — fine if it lands when JD is back.

---

## 8. Build Pipeline (order of work)

Backend-first, modular, ~3 months, two people. **Points-based throughout.**

- **Phase 0 — Shared system + first games (now → JD home, ~1.5 weeks; solo):** set up the folder structure + `core` (the credit/balance system, with tests), then build **Mines** and **Crash** against it as vertical slices (logic + clean minimal UI).
- **Phase 1 — Backend core & sportsbook (with JD):** harden accounts/auth, the balance system as a proper service, transaction history, settlement; add the sportsbook backend (odds model, bet types, grading) — all on one balance.
- **Phase 2 — Roll-up & interface (JD leads heavier Claude work):** bring modules under one app shell (one at a time), build the clean interface (Home, Game view, Account, games hub). One login, one balance across everything.
- **Phase 3 — Live & polish:** live odds/scores feed + realtime, automatic settlement, refinement, subtle animation.
- **Phase 4 — Launch & iterate:** onboarding, first players, feedback loop.

**Team:** "You" build the Phase 0 groundwork solo now. **JD** (more fluent in Claude) comes home in ~1.5 weeks and leads the heavier build from Phase 1 on.

**Milestones:** M0 = credit/balance core + Mines + Crash playable on it · M1 = hardened backend + sportsbook via API · M2 = rolled-up app, one balance, clean interface · M3 = live odds + auto settlement · M4 = first players.

---

## 9. Engineering Guardrails (watch-outs)

- **Build `core` before any game** — it's the linchpin that keeps the roll-up clean.
- **Keep the `core` interface generic** (Section 3) so Crash's live multiplier and the sportsbook's parlays/pushes fit without reshaping it.
- **No module tracks its own points** — everything goes through the shared balance.
- **Mines before Crash** — Crash's realtime + server-authoritative piece is the hard part; don't let it block the simpler win.
- **The sportsbook is the schedule risk** — it depends on the live data feed and lands in the back half; keep earlier phases tight.
- **Roll up incrementally**, never one big merge.
- **Two people, one repo:** use branches / pull requests, especially around `core`.
- **Clean UI from the first slice** — follow the principles in Section 2 from day one.
- **Skeleton loaders are required** — every main section and every lazy/async surface gets a content-shaped skeleton (Section 11); never ship a spinner-on-blank or a loading flash. Enforced by `app/skeletons/coverage.test.ts`.

---

## 10. Out of Scope (for now)

Real money, payments, KYC, licensing; native mobile apps; social features (leaderboards, group play) — all deferred to post-MVP. Don't build these unless asked.

---

## 11. UI Loading States — Skeleton Loaders (required)

Every main UI piece must show a **skeleton loader** — a content-shaped placeholder — while a real load is in flight (a lazy chunk now; async data, e.g. Supabase, later). Never a spinner-on-blank, never a layout-shifting flash. This is **enforced by `app/skeletons/coverage.test.ts`** (it fails CI if a section has no skeleton).

- **Primitives:** `components/brand/Skeleton.tsx` — `<Skeleton>`, `<SkeletonText>`, `<SkeletonCircle>`, `<SkeletonRegion>`. The brand gold-on-carbon shimmer; respects `prefers-reduced-motion`. Never hand-roll a loading box.
- **Section shapes + mapper:** `app/skeletons/` holds one content-shaped archetype per surface and a `sectionSkeleton(key)` mapper. The shell wraps the active section in `<Suspense fallback={sectionSkeleton(activeSection)}>`, so a section's skeleton engages automatically the moment its render suspends — present today, auto-active when a section's data goes async.

**Whenever you add or edit UI, incorporate this:**
- **New top-level section?** Add a `sectionSkeleton` mapping shaped like it (the coverage test fails until you do). `GenericSectionSkeleton` is a stopgap, not the goal.
- **New lazy/async surface** (a `React.lazy` view, a suspending data hook)? Wrap it in `<Suspense>` with a content-shaped skeleton — not a spinner, not blank.
- **Match the real layout's footprint** so content landing causes no layout shift (CLS). Keep the loading state distinct from the empty state (no data) and the error state.
- **Only on real loads** — never add an artificial delay to make instant, in-memory content flash a skeleton.

---

*First task when starting: scaffold the folder structure in Section 5 and build the `core` credit/balance system in Section 3 with simple tests. Then build Mines (Section 7) against it. Do not start a game before `core` works.*