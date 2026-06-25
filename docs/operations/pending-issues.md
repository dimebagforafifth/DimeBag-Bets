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

## Dice — exact tie settles as a loss (no push) — ✅ FIXED (2026-06)

- **Severity:** Low
- **Where:** `games/dice/fair.ts`, `games/dice/engine.ts`, `games/dice/ui/DiceGame.tsx`
- **Was:** `isWin` used strict `>` / `<`, so an exact tie (`roll === target`) lost
  with no push, against CLAUDE.md §4.
- **Fix shipped:** added `gradeRoll()` (three-way win/push/loss) + a `DiceOutcome`
  type; `playDice` now settles a tie as `'push'` through core (stake returned, hold
  released). The board + history pill + sound reflect the push. Covered by new tests
  in `fair.test.ts` / `engine.test.ts`.

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

## Crash `manualCash` recomputes the multiplier independently of the tick — ✅ FIXED (2026-06)

- **Severity:** Low
- **Where:** `games/crash/ui/CrashGame.tsx` (`manualCash`)
- **Was:** `manualCash` recomputed `multiplierAt(performance.now() - …)` at click
  time rather than using the value the last frame painted, so the settled multiplier
  jittered a few ms past what the player saw.
- **Fix shipped:** the animation loop writes each frame's multiplier to a `liveRef`;
  `manualCash` now cashes out at `liveRef.current` — exactly the value on screen.
  What-you-see-is-what-you-get. (`liveRef` reset to 1 at round start.)

---

## Repo hygiene before the second engineer ramps up — ✅ FIXED (2026-06)

- **Severity:** Low (process)
- **Was:** `README.md` was a one-line stub, `docs/` was empty, there was no
  LICENSE, no CI workflow, and no ESLint/Prettier config.
- **Fix shipped:** real `README.md` (setup + `npm` scripts), `eslint.config.js`
  + `.prettierrc.json`/`.prettierignore`, and `.github/workflows/ci.yml` running
  `typecheck` + `lint` + `test` + `build` on every push to `main` and every PR —
  the guardrail for the two-person, shared-`core` workflow (CLAUDE.md §9). `docs/`
  is now populated. Added a proprietary `LICENSE` (All Rights Reserved) and set
  `"license": "UNLICENSED"` in `package.json` to match (`private: true` product).

---

## Full-repo review (2026-06) — security, auth & follow-ups

A line-by-line review of the money paths + a pattern audit of the whole repo. The
codebase is high quality (0 real `any`, 0 XSS/`eval`, clean timer teardown, integer-cents
everywhere, all money through `core`). Findings + this session's work below.

### Shipped this session

- **Server-authoritative grading (H1, money path).** `games/grade.ts` (`gradeBet`) derives
  the outcome + payout multiplier on the SERVER from the revealed seed using each game's
  published math; `api/resolve-bet.ts` (`handleResolveBet`) reveals + grades, edge-portable
  like `api/fairness.ts`; migration `0007`'s service-role `service_resolve_wager` settles it.
  **Covers all 21 games** (dice, limbo, crash, plinko, keno, wheel, slots, cases, coinflip,
  diamonds, roulette, sicbo, mines, pump, chickenroad, hilo, dragon-tower, baccarat,
  videopoker, threecardpoker, blackjack), each tested for parity against the client fair math
  in `games/grade.test.ts`. **Hardened 2026-06-25:** the `mines` and `keno` cases now reject
  duplicate / out-of-range reveals & picks (a tampered client could otherwise repeat a safe
  tile or pick to inflate the payout) — the server enforces the same invariants the client
  board does. TODO(api): (1) wire the client place→resolve to POST to `api/resolve-bet.ts`
  instead of calling `resolveWager`/`resolveAtMultiplier` with a client multiplier — each
  game engine now carries a `TODO(server-grade)` at that call site (mines/plinko/keno done;
  apply the same to the rest); (2) add request-body schema validation on `api/resolve-bet.ts`
  (zod) — tracked under gap-analysis G4 / the zod validation work, not this grader task.
- **Multi-user authorization (migration `0007_member_auth.sql`).** Adds `book_members`
  (auth user → book/role/member) + `_assert_operator`, and re-gates the operator-only money
  RPCs (`grant_bonus`, `adjust_balance`, `settle_week`, `resolve_wager`). **Backward-compatible:**
  a single-operator book (no memberships) falls back to ownership, so today's deployment is
  unchanged. TODO(api): populate `book_members` at login (from the org claim) and set the
  tenant claim before individual player logins go live.
- **OAuth + Google sign-in + email verification.** `auth/supabaseAdapter.ts` now does
  `signInWithOAuth({provider:'google'})`, maps `email`/`email_confirmed_at`, and reports a
  pending-verification state from `signUp`; `auth/Login.tsx` shows a Google button + a
  "check your email" screen; client created with `detectSessionInUrl` for the callback.
  TODO(ops): in the Supabase dashboard — enable the Google provider (client id/secret), add
  the deployed origin to the allowed redirect URLs (`SUPABASE_AUTH_REDIRECT_URL`), turn on
  email confirmation, and customize the confirmation email template.

### ⚠️ Pre-player-auth security checklist (before any individual player logins)

1. **Populate `book_members`** so `_assert_operator` enforces roles (else a self-hosted book
   with memberships could still mis-scope). Until then the single-operator fallback holds.
2. **Route player resolves through the server grader** (`api/resolve-bet.ts` →
   `service_resolve_wager`), never `resolve_wager` with a client multiplier.
3. **Set the tenant JWT claim at login** (`active_tenant()` in 0004) and add the multi-user
   read policies' membership rows.
4. **Rotate leaked secrets** (SGO API key, any dev GitHub token seen in transcripts).
5. **Confirm The Odds API terms** allow a non-real-money app before enabling live odds.

### Open code findings (not yet fixed)

- **External feed not schema-validated** — `sportsdata/vendors/theOddsApi.ts` casts vendor
  JSON `as ApiEvent[]` / `as OddsApiScoreEvent[]` with no runtime validation (`Number(score)`
  is the only guard). Add a validation layer (e.g. zod) at the network boundary before live
  odds — malformed/hostile feed data could propagate `NaN`/`undefined` into pricing.
- **`org.ts:738` weekly roll-up bypasses core + ledger** — `parent.balance += child.balance`
  directly (zero-sum but unaudited). Route through `adjustBalance` / the ledger.
- **`regradeTicket` cap recomputation** (`sportsbook/engine.ts`) — uses the CURRENT
  `account.maxPayout` for both the prior and corrected effect; a cap changed between grade and
  re-grade computes the back-out against the wrong cap.

---

## Production-readiness gaps (2026-06-23 audit)

The **top 7** items from the extended, repo-scored audit in
[`docs/audit/gap-analysis.md`](audit/gap-analysis.md) (which also covers reliability,
perf/cost, SEO, and a11y, plus the OWASP Top 10:2025 mapping and current 2026 research).
Each item below is a summary — the full rationale + fix is in that doc.

### G1 — Idempotency & atomic balance mutation
- **Severity:** High (money/points integrity; Critical once balances persist)
- **Where:** `core/core.ts` (in-place mutation + `wagerSeq`), `app/App.tsx` (ref), `supabase/migrations/0003_money_rpcs.sql`
- **Problem:** No protection against a double-submitted or concurrent bet. Once the balance
  moves to Supabase, two requests can each pass `stake ≤ availableToWager` before either writes
  → **double-spend** of the hold.
- **Intended fix:** Make `placeWager` a single atomic RPC (`UPDATE … WHERE available ≥ stake
  RETURNING …`, 0 rows = rejected); add a client-minted **idempotency key** with a `UNIQUE`
  constraint; mint wager ids from the DB. See gap-analysis §1.1.

### G2 — HTTP security headers — ✅ FIXED (2026-06-24)
- **Severity:** Medium (defense-in-depth; cheap, high-value — OWASP A02, now #2)
- **Where:** `vercel.json`
- **Fix shipped:** Added a route-wide `headers` block with CSP in
  `Content-Security-Policy-Report-Only`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, and a restrictive `Permissions-Policy`. The starter CSP is tuned for the
  current app surface: same-origin app assets, Google Fonts already imported by CSS, Supabase
  HTTP/WebSocket traffic, and the known odds provider APIs. Added `vercel-config.test.ts` so the
  hardening block does not disappear silently.
- **Follow-up:** Review report-only CSP violations after deploy, then promote it to enforcing
  `Content-Security-Policy` once any remaining production-only origins are accounted for.

### G3 — Rate limiting + bot protection at the HTTP edge
- **Severity:** High (do before individual player logins; abuse + cost)
- **Where:** `api/fairness.ts` (open + unthrottled), future player API routes; `auth/`
- **Problem:** `commit` can be spammed to grow `fairness_seeds` and burn function quota; no
  brute-force protection once auth is live; no signup bot protection (skews leaderboard / farms
  referrals).
- **Intended fix:** Add an IP/user rate limiter (e.g. `@upstash/ratelimit` + Vercel KV) on
  `api/*`, tightest on `fairness:commit`; add Turnstile/hCaptcha + Supabase CAPTCHA on signup.
  See gap-analysis §2.2, §2.4.

### G4 — Runtime schema validation at trust boundaries (zod)
- **Severity:** Medium-High (extends the existing "external feed not schema-validated" finding)
- **Where:** `api/fairness.ts` (`req.nonce as number`), `sportsdata/vendors/theOddsApi.ts`
  (casts vendor JSON), env reads
- **Problem:** API bodies, the odds feed, and env vars are trusted/cast — one malformed payload
  reaches pricing or the balance path; a missing prod secret fails late.
- **Intended fix:** Add `zod`; validate every `api/*` body, the feed at the network boundary, and
  **env at startup** (hard-fail in prod). Folds in the open feed-validation finding above. See
  gap-analysis §2.3, §3.5.

### G5 — Error tracking + uptime monitoring
- **Severity:** Medium (launch readiness — OWASP A10, new for 2025)
- **Where:** `app/ErrorBoundary.tsx` (catches but doesn't report), `worker/health.ts` (unmonitored)
- **Problem:** Exceptions are caught for users but reported nowhere; the worker's health endpoint
  has no external watcher/alert.
- **Intended fix:** Add Sentry (React app + Vercel functions + worker), wire `ErrorBoundary` to
  `captureException`; point an external monitor at `worker/health.ts` + a key page, alerting to
  the existing Slack. See gap-analysis §3.1, §3.2.

### G6 — CI security automation
- **Severity:** Medium (cheap; catches the issues vibe-coded repos leak most — OWASP A03)
- **Where:** `.github/workflows/ci.yml` (no audit/scan), repo settings
- **Problem:** CI runs typecheck/lint/test/build but no dependency audit, Dependabot, CodeQL, or
  secret scanning — and there are already known leaked secrets to rotate (SGO key, dev GH token).
- **Intended fix:** Add `.github/dependabot.yml`; add `npm audit`/`osv-scanner` as a
  merge-blocking step; enable CodeQL + secret scanning + push protection; verify new deps aren't
  slopsquats. See gap-analysis §2.6.

### G7 — Published Privacy Policy + Terms + data-rights path
- **Severity:** Medium (pre-launch legal hygiene; GDPR/CCPA apply even points-only)
- **Where:** no `/privacy` or `/terms` routes; `profile/privacy.ts` is profile-visibility, not legal
- **Problem:** Google OAuth collects email; IP/gameplay are processed — but there's no published
  policy and no data export / account-deletion path.
- **Intended fix:** Add `/privacy` + `/terms` pages (data, processors, retention, arbitration,
  AI disclosure) and a self-serve export/delete flow. Keep points **non-purchasable and
  non-redeemable** (legal invariant — gap-analysis §5.3). See gap-analysis §5.1, §5.2.

---

## Tracked elsewhere / not bugs

- **M2 (crash floor vs round):** intentionally not changing — see
  `fixed-issues.md` "Deliberately NOT changed". Preserves Stake's published
  algorithm; no money impact.
