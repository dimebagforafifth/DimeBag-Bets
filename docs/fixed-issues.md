# Fixed Issues — Debug Reference

A log of bugs found during the full-repo review and the fixes applied. Each
entry records the symptom, root cause, the fix, and where it lives, so a future
regression can be traced back quickly.

> Commit: `Fix review findings: dice EV exploit, crash auto-cashout race, +polish`
> Status at fix time: 149 tests / typecheck / build all green (was 141; +8 regression tests).

---

## C1 — Dice: payout mispriced at extreme targets (player-positive EV exploit)

- **Severity:** Critical (exploitable money bug)
- **Files:** `games/dice/fair.ts`, tests in `games/dice/fair.test.ts`
- **Symptom:** Certain targets produced a long-run EV > 1 for the player (the
  house lost), and the opposite extreme charged a near-100% edge.
- **Root cause:** `winChance()` **clamped** the win chance to the band
  `[MIN_WIN_CHANCE=0.01, MAX_WIN_CHANCE=98]` and the payout multiplier was
  derived from that clamped value — but `isWin()` settled against the **raw,
  unclamped** target. The priced probability and the settled probability
  disagreed whenever the target fell outside the band. Example: bet "under 99.5"
  → true win prob 99.5%, but chance clamps to 98 → multiplier `100·0.99/98 ≈
  1.0102×`; EV `= 0.995 × 1.0102 ≈ 1.005` → repeatable player profit.
- **Fix:** Added `effectiveTarget(target, direction)` derived from the same
  clamped `winChance`, and `isWin()` now compares the roll against that effective
  target. Priced odds and settled odds are now always the same number. Inside
  the band `effectiveTarget === target`, so normal play is unchanged.
- **Regression test:** `effectiveTarget` describe block in `fair.test.ts` —
  asserts the clamp moves the settled target, and a 20,000-roll simulation
  confirms EV ≤ 1 at a clamped low target.

---

## C2 — Crash: auto-cashout loses to the crash on a lagged frame

- **Severity:** Critical (money-integrity bug)
- **Files:** `games/crash/engine.ts` (new `frameDecision`), `games/crash/index.ts`
  (export), `games/crash/ui/CrashGame.tsx` (tick loop), tests in
  `games/crash/engine.test.ts`
- **Symptom:** A player's auto-cashout target could be silently graded a loss
  even though the curve passed it.
- **Root cause:** The `requestAnimationFrame` `tick()` checked `m >= crashPoint`
  (loss) **before** the auto-cashout `m >= cashoutAt` (win). Because `m` is
  driven by rAF, a dropped/slow frame (background tab, GC, slow device) can jump
  `m` from below the target to at/above the crash point in one step. The crossed
  cashout target should have paid, but the crash branch resolved first. Invisible
  to tests because the logic lived entirely in the untested rAF loop.
- **Fix:** Extracted a pure, deterministic
  `frameDecision(m, crashPoint, cashoutAt)` that evaluates the auto-cashout
  **before** the crash. A valid target (`1 < cashoutAt < crashPoint`) is always
  crossed before the crash, so it pays. The UI tick now delegates to it.
- **Regression test:** `frameDecision` describe block in `engine.test.ts` —
  includes the "dropped frame past BOTH target and crash" case
  (`frameDecision(2.5, 2.0, 1.99)` → `cashout at 1.99`).

---

## M3 — Dice & Limbo: post-round win/loss display could drift

- **Severity:** Medium
- **Files:** `games/dice/engine.ts`, `games/dice/ui/DiceGame.tsx`,
  `games/limbo/engine.ts`, `games/limbo/ui/LimboGame.tsx`
- **Symptom:** Editing the bet field after a round resolved retroactively changed
  the displayed "won/lost" figure, so the screen no longer matched what `core`
  actually credited.
- **Root cause:** The round objects didn't store the stake; the UI recomputed
  amounts from the live `bet` state.
- **Fix:** Added `stake` to `DiceRound` and `LimboRound` (set from
  `opts.stake`), and the UIs now render from `round.stake`.

---

## M4 — Limbo: win chance overstated for off-grid targets

- **Severity:** Medium
- **Files:** `games/limbo/engine.ts`
- **Symptom:** For a target not on the 0.01 grid the displayed win chance was
  higher than the true clearance probability.
- **Root cause:** `result` is floored to two decimals, but win chance and the
  win check used the continuous target.
- **Fix:** `playLimbo` quantizes the target to the 0.01 grid
  (`Math.round(opts.target * 100) / 100`) before the win check, payout, and
  `winChanceFor`, so all three derive from the same number. Validation still runs
  on the raw target so out-of-range inputs are rejected.

---

## M5 — Lobby: five of six games shared one icon

- **Severity:** Medium (UI; "the interface is the product", CLAUDE.md §2)
- **Files:** `app/App.tsx` (`GameIcon`)
- **Symptom:** Mines, Dice, Limbo, Keno, and Plinko all rendered the same gem
  icon in the casino hub; only Crash was distinct.
- **Root cause:** `GameIcon` only special-cased `crash` and fell back to the gem
  for everything else.
- **Fix:** Rewrote `GameIcon` as a switch with distinct inline SVGs for `dice`
  (pipped die), `limbo` (rising arrow), `keno` (dot grid), `plinko` (peg triangle
  + ball); Mines keeps the gem (default), Crash keeps the rocket.

---

## L1 — Keno: off-by-one "next nonce" display

- **Severity:** Low
- **Files:** `games/keno/ui/KenoGame.tsx`
- **Symptom:** While a finished round was on screen, the fairness panel showed the
  wrong nonce for the upcoming bet.
- **Root cause:** `nextNonce={nonceRef.current + (round ? 0 : 1)}` — but `play()`
  always increments the nonce before the next bet.
- **Fix:** `nextNonce={nonceRef.current + 1}` unconditionally (the panel already
  substitutes the actual round nonce when a round is shown).

---

## L2 — Keno: stale `availableToWager` during the reveal animation

- **Severity:** Low
- **Files:** `games/keno/ui/KenoGame.tsx`
- **Symptom:** During the ~1.3s draw reveal the bet panel's available figure was
  stale (the balance had already moved inside `playKeno`).
- **Root cause:** `onBalanceChange()` was only called after the reveal finished.
- **Fix:** Call `onBalanceChange()` immediately after the bet is placed (a second
  bet is still blocked by `revealing`); the result chime and history still land
  when the draw ends.

---

## L3 — Bet "2×" chip could show a negative stake

- **Severity:** Low
- **Files:** `games/dice/ui/DiceGame.tsx`, `games/limbo/ui/LimboGame.tsx`,
  `games/keno/ui/KenoGame.tsx`, `games/plinko/ui/PlinkoGame.tsx`
- **Symptom:** With `available < 0` (deeply negative balance near the credit
  limit) the `2×` chip computed a negative bet value. It was caught downstream by
  `betInvalid`, but the input visibly showed a nonsensical value.
- **Root cause:** `setBet((b) => Math.min(available, b * 2))`.
- **Fix:** `setBet((b) => Math.max(1, Math.min(available, b * 2)))` in all four
  games.

---

## H1 (partial) — Misleading provably-fair label

- **Severity:** High (claim correctness) — **only the label was fixed here**; the
  real commit-reveal mechanism is a backend task (see `pending-issues.md`).
- **Files:** all six game UIs (`mines`, `crash`, `dice`, `limbo`, `keno`,
  `plinko`)
- **Symptom:** The fairness panel showed "committed when you bet", implying a
  pre-bet commitment that doesn't exist — the server seed is generated at play
  time client-side and revealed afterward.
- **Root cause:** Placeholder copy overstated the guarantee.
- **Fix:** Replaced the placeholder with the honest "generated when you bet"
  (CLAUDE.md §4 — honest by default). The underlying commit-reveal guarantee
  still has to be implemented server-side; tracked in `pending-issues.md`.

---

## Deliberately NOT changed

### M2 — Crash curve floors but crash point rounds (rounding asymmetry)

- **Decision:** Left as-is on purpose.
- **Why:** The crash point uses `Math.round` to match Stake's **published**
  algorithm, and `games/crash/fair.test.ts` encodes the published worked example
  (`crashPointFromInt(2_747_600_321) → 1.55×`). Flooring the crash point would
  diverge from the published formula and break that vector for a purely cosmetic
  gain. There is no money impact: `cashOut` requires `atMultiplier < crashPoint`
  and the live multiplier is the floored curve value, so the player can never
  cash out at or above the committed crash point. The floor-vs-round difference
  is presentation only.
