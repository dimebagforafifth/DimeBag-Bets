# records/ — verified records + public profiles

The switching-cost moat: a permanent, tamper-proof, braggable record of every settled pick,
plus a public profile that shows it off. The longer a player plays, the more they'd lose by
starting over elsewhere.

## What it is

A **read-only projection** of settled activity. `records/` derives everything from the durable,
append-only ledger of core resolutions (`app/book-ledger`) — it owns no money path, subscribes
read-only, and exposes **no mutator**. A record is always a fresh function of what the ledger
currently says.

- `record.ts` — the pure engine: `periodStats` (W/L, ROI, pushes), `streaks`, `highlights`
  (biggest win/loss), per-period windows, `fingerprint`, `buildRecord`.
- `clv.ts` — closing-line-value, **honestly gated** (see below).
- `badges.ts` — `deriveBadges`: every badge is a function of the record (never hand-awarded).
- `share.ts` — `shareableSummary`: exportable text, anchored to the platform + fingerprint.
- `seed.ts` — deterministic demo histories for the seeded org players (mock default).
- `store.ts` — read-only bridge from the live ledger to records (`getRecord`, subscriptions).
- `ui/ProfileSection.tsx` — the registered **Profile** player section.

## What the profile shows

VIP tier (computed off the **verified** lifetime wagered) + progress · lifetime & per-period
(24h/7d/30d) net, ROI, W–L, win rate, wagered, bets · current/longest streaks · biggest
win/loss · Casino vs Sportsbook split · by-game table · CLV beat-rate (gated) · earned badges ·
recent results · a **Share record** button (copies an anchored summary) · a player switcher for
public profiles.

## Integrity guarantees

1. **Derived only from settled, audited outcomes.** Inputs are `kind:'resolve'` ledger entries
   that core itself produced (win/loss/push/void + payout multiplier). Nothing is hand-entered.
2. **No write path.** The module exports no money/ledger/org mutator (asserted in
   `integrity.test.ts`). `buildRecord` is pure and does not mutate its inputs.
3. **Tamper-evident.** `integrity.fingerprint` is a sha256 over the contributing settled rows —
   recompute it from the same ledger entries to verify the record.
4. **Inflation impossible at the module level.** Every stat traces to a ledger row; there is no
   setter to add a win — a win requires a real settled bet through core. A losing history cannot
   be made positive (tested).

## Where production needs server-side enforcement (SEAMs)

- **Server-authoritative ledger.** The module-level guarantees become a real trust boundary only
  when the ledger lives server-side (the Supabase money-RPC lane) so the client can't fabricate
  settled entries locally. Until then this hardens the projection; the source must be secured.
- **CLV closing-line capture.** Real CLV needs a de-vigged **closing** price per settled ticket,
  which the production ledger does not capture today — so `clvSummary` reports `available:false`
  with a note rather than faking it. Production lights it up by snapshotting the closing fair
  probability into the ledger at settlement (server-side); feed it via `store.realClv`.
- **Demo seeding off in production.** `seed.ts` populates demo profiles (mock default). A real,
  keyed deployment calls `__setRecordsSeed(false)` so records derive purely from the server
  ledger; `integrity.demoSeeded` flags any record that still includes seeded rows.

## Registration

The Profile section self-registers with `app/player-sections` (a new additive registry). The
**wiring pass** mounts the registry into the app shell/nav (render `playerSectionsFor(role)` as
tabs + routes, extend auth `allowedSections`). This module never edits the shell.
