---
name: project-status
description: DimeBag-Bets current build position — phase, games shipped, work in progress
metadata:
  type: project
---

As of 2026-06-05, DimeBag-Bets is past **M0** (CLAUDE.md §8): shared `core/` credit-balance system + provably-fair games are playable on one shared balance.

**Casino games built**, each a self-contained module under `games/` (engine + fair.ts + tests + ui/), registered in one place at [app/games.ts](app/games.ts): Mines, Crash, Dice, Limbo, Keno, Plinko, Wheel, Hilo, ChickenRoad, **Dragon Tower**, **Pump**. The app shell ([app/App.tsx](app/App.tsx)) owns a single in-memory `Account` (demo-player, creditLimit 1000) and routes between a Casino lobby and individual game pages. No backend/auth yet (that's Phase 1, when JD joins).

**Dragon Tower + Pump (added 2026-06-05)** were built from verified Stake research, modeled on Mines' module shape. Both use a **2% house edge (98% RTP)** with a `round2` half-up rounding policy (Stake rounds, not floors) — matched to Stake's published numbers to the cent. Dragon Tower: 9 rows, difficulties Easy/Medium/Hard/Expert/Master (tile/egg splits 4-3 / 3-2 / 2-1 / 3-1 / 4-1), mult = 0.98×(tiles/safe)^level (Master top = 256,901.12×). Pump: a one-track Mines — 25 cells, pops 1/3/5/10 by difficulty, mult = 0.98×C(25,j)/C(25−pops,j) (Expert top = 0.98×C(25,15) = 3,203,384.80×). Per-game house config (`TowerHouseConfig`/`PumpHouseConfig`) keeps the vig settable later, like Mines.

Two newer shared siblings to `core/`: [sound/engine.ts](sound/engine.ts) (synthesized Web Audio cues, mute persisted to localStorage, no assets) and [games/shared/WinPopup.tsx](games/shared/WinPopup.tsx). `core` gained `resolveAtMultiplier(account, wager, m)` — generic fractional settlement (profit = stake×(m−1)) for games like Plinko that pay a fraction/small multiple, not all-or-nothing.

Stack: TypeScript + Vite + React 18, vitest. `npm test` = 221 tests green; `npm run build` green. **`npm run typecheck` currently has pre-existing errors in chickenroad + hilo** (unused imports; a `'active'` vs `'cleared'` status comparison bug in ChickenRoadGame.tsx) — introduced by concurrent work, NOT from Dragon Tower/Pump, which typecheck clean. No Supabase/Vercel wired yet.

**Consolidated onto main 2026-06-05:** all prior agent work (Plinko game, sound/ engine + SoundToggle, games/shared/WinPopup, core `resolveAtMultiplier` +tests, Stake-style UI polish + sound/WinPopup wiring across every game) is now committed via the `integrate-agent-work` branch merged into main. 141 tests / typecheck / build all green. main is ahead of origin/main (not pushed). Stale fully-merged branches still exist locally: phase0-core, phase0-crash, casino-split, games-dice-limbo-keno, integrate-agent-work.

**Odds audit (2026-06-05):** every game's house edge was back-checked against Stake's real published values and confirmed accurate — **1%** for Mines, Dice, Limbo, Crash, Plinko, Keno, Wheel, HiLo; **2%** for Dragon Tower & Pump; Roulette is European single-zero (37 pockets, 36/count payout → 2.70%); Blackjack uses 3:2 / dealer-stands-soft-17 / double (no split). The one correction made: **Chicken Road edge 1% → 2%**, to match the real InOut Games "Chicken Road" (98% RTP). Keno & Wheel COMPUTE multipliers to hit the correct 1% edge with a Stake-like shape rather than copying Stake's exact (non-public) paytables.

sportsbook/ is now under active development (markets/odds/live/mockFeed with tests). docs/ still a stub.

**Update 2026-06-16 (branch `claude/repo-overview-onboarding-e9rwo3`, work done while JD/Joe was away):**
- Full repo review + fixes: dice EV-exploit (clamp/settlement mismatch), crash auto-cashout race (new pure `frameDecision`), limbo target quantization, stake-on-round display, keno nonce/balance-timing, 2× chip clamp, honest provably-fair labels, distinct lobby icons. Now **149 tests** / typecheck / build green. See [docs/fixed-issues.md](../docs/fixed-issues.md).
- [docs/pending-issues.md](../docs/pending-issues.md) + **GitHub issues #2–#8** track open items (real server-authoritative commit-reveal, `settleWeek` ledger, dice ties/grid, modulo bias, wager-id persistence, crash manualCash jitter, repo hygiene).
- [docs/research-live-data-providers.md](../docs/research-live-data-providers.md): deep research on sportsbook odds APIs (recommend **The Odds API** free→paid, self-grade through `core`) and live-casino (recommend a **simulated dealer** driven by the provably-fair core for the points MVP). Includes pros/cons/cost/docs tables + a manual fill-in tracker for sales-gated data.
- First Supabase schema: [supabase/migrations/20260616120000_init_core_and_sportsbook.sql](../supabase/migrations/20260616120000_init_core_and_sportsbook.sql) — money core (accounts/wagers/transactions/weekly_settlements) + provably-fair game_rounds + provider-agnostic sportsbook (sports/events/markets/selections/bet_slips/bet_legs, keyed by `(source, external_id)`), with RLS. **Not applied to any remote yet.** Supabase still not a dependency / not wired into the app.

**OPEN QUESTION FOR JOE (also flagged at top of CLAUDE.md):** before building the balance-write path, decide whether `accounts.balance` is **maintained directly** (matches `core`'s in-place mutation) or **rebuilt from the `transactions` ledger** (stronger audit). Also confirm The Odds API ToS for non-real-money use and whether a live-dealer studio onboards a non-redeemable points app.

sportsbook/ source module is still an empty stub (.gitkeep only) — the sportsbook backend itself is Phase 1+; only its DB schema exists so far.
