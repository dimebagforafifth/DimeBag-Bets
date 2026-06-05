---
name: project-status
description: DimeBag-Bets current build position — phase, games shipped, work in progress
metadata:
  type: project
---

As of 2026-06-05, DimeBag-Bets is past **M0** (CLAUDE.md §8): shared `core/` credit-balance system + provably-fair games are playable on one shared balance.

**Six casino games built**, each a self-contained module under `games/` (engine + fair.ts + tests + ui/), registered in one place at [app/games.ts](app/games.ts): Mines, Crash, Dice, Limbo, Keno, Plinko. The app shell ([app/App.tsx](app/App.tsx)) owns a single in-memory `Account` (demo-player, creditLimit 1000) and routes between a Casino lobby and individual game pages. No backend/auth yet (that's Phase 1, when JD joins).

Two newer shared siblings to `core/`: [sound/engine.ts](sound/engine.ts) (synthesized Web Audio cues, mute persisted to localStorage, no assets) and [games/shared/WinPopup.tsx](games/shared/WinPopup.tsx). `core` gained `resolveAtMultiplier(account, wager, m)` — generic fractional settlement (profit = stake×(m−1)) for games like Plinko that pay a fraction/small multiple, not all-or-nothing.

Stack: TypeScript + Vite + React 18, vitest. `npm test` (141 tests), `npm run typecheck`, `npm run build` all green. No Supabase/Vercel wired yet.

**Consolidated onto main 2026-06-05:** all prior agent work (Plinko game, sound/ engine + SoundToggle, games/shared/WinPopup, core `resolveAtMultiplier` +tests, Stake-style UI polish + sound/WinPopup wiring across every game) is now committed via the `integrate-agent-work` branch merged into main. 141 tests / typecheck / build all green. main is ahead of origin/main (not pushed). Stale fully-merged branches still exist locally: phase0-core, phase0-crash, casino-split, games-dice-limbo-keno, integrate-agent-work.

sportsbook/ and docs/ are still empty stubs (.gitkeep only) — sportsbook is Phase 1+.
