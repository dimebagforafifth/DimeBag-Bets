# Pending Issues — To Fix in Future Phases

Open items from the full-repo review that were **not** fixed yet, mostly because
they depend on the backend (Supabase) that arrives in Phase 1. Ordered by
priority. Each entry records what's wrong, why it's deferred, and the intended
fix so it can be picked up cleanly.

See `fixed-issues.md` for what has already been resolved.

---

## H1 — Real provably-fair commit-reveal (server-authoritative)

- **Severity:** High
- **Status:** Deferred to Phase 1 (needs the backend). The misleading UI label
  was already corrected (see `fixed-issues.md` H1).
- **Where:** all game engines (`mines`, `crash`, `dice`, `limbo`, `keno`,
  `plinko`); `core/fair.ts`
- **Problem:** The server seed is generated at play time **client-side** and
  revealed immediately. There is no commitment before the bet, so the
  "provably fair" guarantee is not actually enforced — a real scheme publishes
  `hash(serverSeed)` to the player *before* accepting the wager.
- **Intended fix:** Move seed generation and the crash point / roll / draw
  derivation to a Supabase edge function. Commit `hash(serverSeed)` to the
  client before the wager is accepted; reveal the seed only after the round
  settles; rotate the server seed and persist `(serverSeedHash, clientSeed,
  nonce)`. `core/fair.ts` is already isomorphic (`@noble/hashes`), so the exact
  derivation moves server-side with no rewrite.
- **Done when:** the client never sees the server seed before settlement, and a
  player can verify a finished round against a hash they were shown beforehand.

---

## M1 — `settleWeek` discards the settlement instead of recording it

- **Severity:** Medium (becomes High once balances persist)
- **Status:** Deferred to Phase 1 (needs persistence / transaction history).
- **Where:** `core/core.ts` (`settleWeek`)
- **Problem:** The doc comment says accounts "pay in / get paid" then reset, but
  the function only zeroes `balance` — no payout amount is recorded anywhere.
  Fine for the in-memory Phase 0 demo, but silent data loss once accounts are
  durable.
- **Intended fix:** Before zeroing, write a settlement record (account id, week,
  closing balance, direction paid in / paid out, timestamp) to the transaction
  ledger. Keep `settleWeek` refusing to run while wagers are pending (already
  enforced). Consider returning the settlement record for the caller to persist.
- **Done when:** every weekly reset leaves an auditable record of what was
  squared up.

---

## Dice — exact tie settles as a loss (no push)

- **Severity:** Low
- **Where:** `games/dice/fair.ts` (`isWin`)
- **Problem:** `isWin` uses strict `>` / `<`, so an exact tie (`roll === target`
  on the 0.01 grid) loses with no push. CLAUDE.md §4 says exact ties should push
  (stake returned). Probability is ~1/10000 per round and it favors the house
  slightly beyond the stated edge.
- **Decision needed:** either document "ties lose" as a deliberate house rule, or
  add a push path (return the stake, no figure change) to match §4.

---

## Strict-inequality vs grid: ~0.01% extra house edge in Dice

- **Severity:** Low (informational)
- **Where:** `games/dice/fair.ts`
- **Problem:** Win chance is priced continuously (e.g. 50%) but the roll lives on
  a 0.01 grid and the win check is strict, so the realized probability is off by
  one grid step (e.g. `P(roll > 50) = 49.99%`). A tiny, pre-existing house-favor
  bias, unrelated to C1 (which was about the clamp).
- **Intended fix (optional):** decide on a consistent convention (`>=` vs `>`, or
  price against the grid) if textbook-exact RTP is wanted. Negligible in
  practice.

---

## Quantization (modulo) bias in seeded selection

- **Severity:** Low (informational; not exploitable)
- **Where:** `games/mines/fair.ts`, `games/keno/fair.ts` (`floor(float * n)`),
  and any future `floor(float * n)` selection
- **Problem:** Mapping a 32-bit float onto a non-power-of-two pool size skews
  some outcomes by ~1e-9. This matches Stake's shipped scheme and is far below
  any detectable/exploitable level.
- **Intended fix (optional):** use rejection sampling on the integer draw if
  strict uniformity is ever required.

---

## `core` wager id counter is not persistence-safe

- **Severity:** Low (until the backend lands)
- **Where:** `core/core.ts` (`wagerSeq` / `nextWagerId`)
- **Problem:** Wager ids come from a module-global counter that resets on reload
  and isn't safe across multiple instances / a server process — ids can collide.
- **Intended fix:** when wagers are persisted, mint ids from the database (or a
  UUID) rather than an in-memory sequence.

---

## Crash `manualCash` recomputes the multiplier independently of the tick

- **Severity:** Low
- **Where:** `games/crash/ui/CrashGame.tsx` (`manualCash`)
- **Problem:** `manualCash` reads its own `multiplierAt(performance.now() - …)`
  rather than the value the last frame computed. A click in the exact frame the
  curve crosses the crash point resolves based on a sub-millisecond clock read.
  The guard `m >= crashPoint` makes it safe (no illegal cash-out), but the
  outcome near the crash point is jitter-dependent.
- **Intended fix:** drive the displayed `live` value and the manual/auto/crash
  decisions from a single per-frame `m`, and have `manualCash` act on the latest
  ticked state (reuse `frameDecision`).

---

## Repo hygiene before the second engineer ramps up

- **Severity:** Low (process)
- **Problem:** `README.md` is a one-line stub, `docs/` was empty (now has these
  two files), there is no LICENSE, no CI workflow, and no ESLint/Prettier config.
- **Intended fix:** add a real README (setup + `npm` scripts), an ESLint/Prettier
  config, and a CI workflow running `npm test` + `npm run typecheck` +
  `npm run build` on PRs — useful guardrails for the two-person, shared-`core`
  workflow (CLAUDE.md §9).

---

## Tracked elsewhere / not bugs

- **M2 (crash floor vs round):** intentionally not changing — see
  `fixed-issues.md` "Deliberately NOT changed". Preserves Stake's published
  algorithm; no money impact.
