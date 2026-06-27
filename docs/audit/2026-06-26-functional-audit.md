# PlayStadium.io — Functional & Design-Parity Audit
*Generated 2026-06-26. Multi-agent audit (8 subsystems) with an adversarial verification pass on every "this is a mockup" claim. Status labels reflect the verified verdict where verification corrected the first pass.*

## Status legend
- **wired-real** — performs a real mutation/derivation through `core` / ledger / persisted store.
- **demo-inmemory** — real logic, but state lives only in browser `localStorage` (per-device, resets if cleared). This is the whole app today.
- **placeholder-mock** — looks functional but has no real effect (dead control, hardcoded data, unconsumed output).
- **broken** — a real defect or a half-wired path that never reaches the user.
- **dead-unused** — fully implemented and tested but never called by the running app.

---

## Headline verdict

**The money spine is genuinely solid. The big risk is that nothing is server-backed yet, and a handful of controls look functional but aren't.**

1. **All 21 casino games + the sportsbook route real wagers through the shared `core` balance.** No game tracks its own points or fakes a payout; `availableToWager` actually blocks over-staking. (verified)
2. **~50 manager console commands are real mutations** (settlement, cashier, credit/limits/suspend, add-player, agent admin & permissions, trading desk, scores grading, casino enable/disable, branding, comps/VIP/loyalty, billing, competitions, pools, challenges, import). Money moves only through `core`.
3. **BUT the app runs 100% on a demo/`localStorage` adapter — no Supabase at runtime.** No keys are configured, so every "save" is per-browser, per-device, and resets if storage clears. **There is no shared/global state**: the leaderboard ranks only the local browser's seeded players; two devices do not see each other's data.
4. **Demo seeding is ON by default** — profiles, rewards, and the community feed render fabricated history (e.g. player `p-marco` with $68,400 wagered) so screens don't look empty. Real activity layers on top.
5. **A short list of controls are genuinely placeholder/broken** and would be exposed in a manager demo (below).

For a single-machine manager demo this is mostly fine. For **real users testing across devices**, the lack of a shared backend (#3) and the live demo seed (#4) are the two things that will read as "not real."

---

## What's genuinely real (reassuring)

| Area | Status | Note |
|---|---|---|
| Core credit/balance + `availableToWager` gating | wired-real | `core/core.ts`; single source of truth |
| All 21 games place→grade→adjust through core | wired-real | each `games/*/engine.ts` |
| Sportsbook placement/settlement/cash-out + parlay re-pricing | wired-real | `app/book/placement.ts` |
| ~50 manager console tiles (money, standing, config) | wired-real / demo-inmemory | real logic over the in-memory book |
| Manager reporting / analytics / console figures / copilot | wired-real | derived from real wager events, not invented |
| My Bets, Ledger, Activity ticker, exposure, book-ledger | wired-real | from durable book-ledger + core events |
| VIP leaderboard & badge, rewards mechanics, boosts, splits, referrals, gamification, pick'em, pools | wired-real | accrue from real core settlement |

---

## What is NOT real / broken — the fix list

### High priority (a demo will hit these)

1. **Profile "Current streak" renders `2 losss` (triple-s).** — **broken**
   `profile/ui/ProfileView.tsx:340-341` appends `'s'` to pluralize, so a loss streak becomes `loss`+`s` = `losss`. Same naive pluralization at `records/ui/ProfileSection.tsx:210` and `records/share.ts:38`. *Trivial fix.*

2. **Manager messaging never reaches players.** — **broken (half-wired)**
   `CommunicationPage` authors + persists announcements and DMs, but **no player-facing banner/inbox exists** — `activeAnnouncements()` / `inboxFor()` have zero consumers in `app/`. The manager thinks messages went out; players never see them. (`manager/README.md` itself lists this as "Shell bindings to wire.")

3. **Casino Edge slider for Sic Bo / Roulette (EU/US) does nothing.** — **placeholder-mock**
   `app/casino-edge/edge-bands-store.ts:84-92` persists the override and shows a new RTP, but **payouts never read it** (those games use fixed odds tables). Single-edge games (Dice, Mines, etc.) ARE wired. So the same panel is half-real — a manager could "lower the house edge" on roulette and nothing changes.

4. **No self-serve Operator sign-up.** — **placeholder-mock**
   The design has a Player/Operator toggle at sign-up; live sign-up always creates a player (`auth/Login.tsx`). A prospective manager has no way to register as one — operators exist only via seed logins. Matters if managers self-onboard in the demo.

### Medium priority

5. **Sessions tile** — shows only the current session; login/device/IP history is a flagged "Needs backend" placeholder (`features/control/SessionsPanel.tsx`).
6. **Bonus lifecycle triggers don't auto-fire** — ✅ FIXED (2026-06-27, branch `feat/launch-prep-batch`). `signup` was already wired (onboarding); `first-bet`, `daily`, and `losing-streak` now fire automatically + idempotently from real core wager/settlement events inside `armBonusEngine()` (markers persisted per player / UTC-day / streak), all through the existing `fireTrigger → core.grant` path. Tests in `bonus/engine.test.ts`. (The console "Run trigger" still uses demo amounts by design — it's a manual test tool.)
7. **Boosts & Referrals ship off/empty** — engines are real but off-by-default with no seeded rules, so nothing fires in a demo until an operator configures them. Referrals also has no player-side claim at signup.
8. **Scheduled promotions only fire while a manager's browser tab is open** (`manager/promotions/schedule-runner.ts`) — no server cron.
9. **Player onboarding dropped the agent/referral-code step** — a recruited player can't attach to an agent's desk at signup.
10. **No "Forgot password?"** on the sign-in screen — ✅ FIXED (2026-06-27, branch `feat/launch-prep-batch`): added `requestPasswordReset` to the auth adapter (Supabase `resetPasswordForEmail`; demo = simulated success), exposed via `useAuth`, and a "Forgot password?" link + inline email→confirmation view in `auth/Login.tsx`.

### Cross-cutting (not a balance bug, but real for live users)

11. **Games grade themselves client-side.** The authoritative server grader (`games/grade.ts`) and the resolve RPC (`api/resolve-bet.ts`, `service_resolve_wager`) are **implemented and tested but never called** (dead-unused). Money still flows through `core`, but the winning multiplier is browser-supplied — a determined client could control its own outcome. Fine for a trusted demo; a gap before untrusted real users.

12. **The whole Supabase server-authoritative layer is built but unwired** (dead-unused): money RPCs (migration 0003), `service_resolve_wager` (0007), `reconcile_balance` / ledger-derived balance (0015). All real SQL + a tested PostgREST client, but the 21 games + sportsbook call `core` synchronously and never hit the server. Going live = drop in keys, apply migrations, **and** cut play over to the async money service (the env switch alone does not make play server-authoritative).

---

## Design-system features the overhaul left behind (the explicit asks)

| Feature | Status | Where it lives in the design system | What's needed |
|---|---|---|---|
| **"Hot" tag on game cards** | placeholder-mock | `design-system/.../CasinoScreens.jsx:13` + per-game `hot` in `data.js`; `casino-lobby/games.js` | Add `hot`/`category` to `GameDef` (`app/games.ts`) + each game meta; render a corner flag in `components/brand/GameCard.tsx` |
| **Game filter (category + Hot)** | placeholder-mock | `CasinoScreens.jsx:26-31,80` (`cat` state + `<Tabs>`); `CATEGORIES` in `data.js:35` | Same metadata, then a segmented control in the lobby head filtering `ordered` |
| **"Live wins" rotating feed under the hero** | demo-inmemory | `CasinoScreens.jsx:62-72` (`.psa-ticker` marquee) | Restyle `app/ActivityTicker.tsx` as a horizontal marquee + seed/fallback so it's never empty (today it renders *nothing* on a fresh book) |
| **Management pinned/separated at bottom (managers)** | placeholder-mock | `Shell.jsx:123-129` (`psa-console-cta`, gold, below the nav) | Pull `management` out of the `sideGroups` loop; render a distinct pinned CTA above `.psa-side-foot`, gated by `canManage` |
| **"Add points" control next to the balance** | placeholder-mock | `Shell.jsx:74` (`psa-wallet-deposit`, cosmetic) | Add an action slot to `components/brand/WalletPill.tsx`. Behavior is a product decision (closed-loop points); backing `core.grant()` already exists operator-side |
| Hero "live playing" pill (minor) | placeholder-mock | `casino-lobby/Lobby.jsx:11-12` | Optional: reuse the existing `BrandBadge variant="live"` |
| Legacy `sportsbook/ui/Sportsbook.tsx` (futures/round-robin) | dead-unused | — | The live book is `app/book/BookView.tsx`; the old tree is unmounted. Decide keep-and-port or delete |

---

## Before real users (pre-demo checklist)
- [x] Flip demo seeds off — ✅ DONE (2026-06-27, branch `feat/launch-prep-batch`): all four lanes (`records/store.ts`, `profile/projection-store.ts`, `rewards/players.ts`, `social/seed.ts`) default OFF in production via the `VITE_DEMO_SEEDS` gate (`app/demo-seeds.ts`); seeds stay on in dev. Ensure `VITE_DEMO_SEEDS` is unset/`off` in the prod build.
- [ ] Decide single-machine demo vs multi-device → if multi-device, the Supabase persistence cutover (#12) is required.
- [ ] Fix the profile streak bug (#1) and the dead edge knobs (#3) — most visible "this is broken" moments.
- [ ] Decide whether managers self-onboard (#4) or are provisioned.
