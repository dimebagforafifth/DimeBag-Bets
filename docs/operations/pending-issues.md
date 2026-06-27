# Pending Issues — To Fix in Future Phases

Open items from the full-repo review that were **not** fixed yet, mostly because
they depend on the backend (Supabase) that arrives in Phase 1. Ordered by
priority. Each entry records what's wrong, why it's deferred, and the intended
fix so it can be picked up cleanly.

See `fixed-issues.md` for what has already been resolved.

---

## Launch Blockers — Backend / External Setup Required

These are the remaining pre-launch items. Everything else in this file is already
done or deferred to Phase 1+. Pick these up once Supabase, OAuth, and hosting are wired.

| # | Item | What to do |
|---|------|------------|
| 1 | **Apply Supabase migrations** | Run `supabase db push` against the remote project. Migrations 0001–0015 are all in `supabase/migrations/`. Balance is ledger-derived (0015). |
| 2 | **Google OAuth in Supabase dashboard** | Enable Google provider (client id + secret), add deployed origin to allowed redirect URLs (`SUPABASE_AUTH_REDIRECT_URL`), enable email confirmation. Code is already done (`auth/supabaseAdapter.ts`, `auth/Login.tsx`). |
| 3 | **Atomic placeWager — prevent double-spend (G1)** | ✅ **Migration authored** — `supabase/migrations/0016_atomic_place_wager.sql` (branch `feat/launch-prep-batch`, 2026-06-27): single atomic `UPDATE … WHERE available >= stake RETURNING`, `wagers.idempotency_key` + partial UNIQUE with `ON CONFLICT DO NOTHING` replay-safety, DB-minted id. **Still to do:** apply it (`supabase db push`) and pass a client-minted UUID from `money/rpc.ts` / `persistence/supabase/*` (mirror in the fake-server). See `docs/operations/note-0016-atomic-place-wager.md`. |
| 4 | **CSP: promote report-only → enforcing** | After first real Vercel deploy, check the CSP violation report in Vercel logs. Once clean, change `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in `vercel.json`. |
| 5 | **Error tracking — Sentry (G5)** | ✅ **Local seam DONE** (branch `feat/launch-prep-batch`, 2026-06-27): `app/error-report.ts` (`reportError` + pluggable `setErrorSink` + `installGlobalErrorReporting`), wired into `app/ErrorBoundary.tsx` + `app/main.tsx`. **Still to do (needs a vendor):** create a Sentry project, add `VITE_SENTRY_DSN`, register the SDK as the sink via `setErrorSink(...)` — no caller changes needed. |
| 6 | **Edge rate limiting — auth routes (G3)** | `api/fairness.ts` already has in-memory rate limiting. For auth routes and the HTTP edge, add Upstash Ratelimit + Vercel KV. |
| 7 | **Self-serve data export / delete** | Needed for GDPR/CCPA. Privacy policy currently directs users to email. Build account settings UI with export + delete once Supabase auth is live. |

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

## M1 — `settleWeek` discards the settlement instead of recording it — ✅ RESOLVED (2026-06-27)

- **Severity:** Medium (becomes High once balances persist)
- **Status:** ✅ Resolved on branch `feat/launch-prep-batch` (verified green; pending commit & merge).
- **Fix shipped:** Investigated — `settleWeek` ALREADY emits/returns an auditable `SettlementRecord`
  (accountId, closing balance, direction, week, timestamp) before zeroing, with the pending guard
  intact. The real gap was `org.ts` `settleOrgWeek`, which rolled child balances up by raw mutation;
  it now routes each member transfer through `core.adjustBalance` and records a per-member settlement
  via a new `recordSettlement()` helper (zero-sum, audited). Tests in `core/core.test.ts` + `org/org.test.ts`.
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

## `core` wager id counter is not persistence-safe — ✅ FIXED (2026-06-27)

- **Severity:** Low (until the backend lands)
- **Where:** `core/core.ts` (`wagerSeq` / `nextWagerId`)
- **Problem:** Wager ids come from a module-global counter that resets on reload
  and isn't safe across multiple instances / a server process — ids can collide.
- **Intended fix:** when wagers are persisted, mint ids from the database (or a
  UUID) rather than an in-memory sequence.
- **Fix shipped (branch `feat/launch-prep-batch`, 2026-06-27):** the in-memory `wagerSeq` counter is
  replaced by `crypto.randomUUID()` (with a `getRandomValues` / `Math.random` fallback) in
  `core/core.ts`; the injectable factory + explicit-id override still work. The DB-side mint lands
  with migration `0016` for the server path.

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

### Open code findings (updated 2026-06-27)

- **External feed not schema-validated** — `sportsdata/vendors/theOddsApi.ts` casts vendor
  JSON `as ApiEvent[]` / `as OddsApiScoreEvent[]` with no runtime validation (`Number(score)`
  is the only guard). Add a validation layer (e.g. zod) at the network boundary before live
  odds — malformed/hostile feed data could propagate `NaN`/`undefined` into pricing. *(NB: a zod
  layer now exists in `sportsdata/vendors/validation.ts` — re-verify this finding is already closed.)*
- **`org.ts` weekly roll-up bypasses core + ledger** — ✅ FIXED (2026-06-27, branch
  `feat/launch-prep-batch`): `settleOrgWeek` now moves each child→parent figure via
  `core.adjustBalance` and records a per-member settlement (zero-sum, audited) instead of the raw
  `parent.balance += child.balance` mutation. Tests in `org/org.test.ts`.
- **`regradeTicket` cap recomputation** (`sportsbook/engine.ts`) — ✅ FIXED (2026-06-27, branch
  `feat/launch-prep-batch`): the cap in force at first grade is pinned on the ticket
  (`gradedMaxPayout`) and used to back out the prior effect, while the current cap applies to the
  corrected effect. Regression tests in `sportsbook/engine.test.ts`.

---

## Production-readiness gaps (2026-06-23 audit)

The **top 7** items from the extended, repo-scored audit in
[`docs/audit/gap-analysis.md`](audit/gap-analysis.md) (which also covers reliability,
perf/cost, SEO, and a11y, plus the OWASP Top 10:2025 mapping and current 2026 research).
Each item below is a summary — the full rationale + fix is in that doc.

### G1 — Idempotency & atomic balance mutation — ✅ MIGRATION AUTHORED (2026-06-27)
- **Severity:** High (money/points integrity; Critical once balances persist)
- **Where:** `core/core.ts` (in-place mutation + `wagerSeq`), `app/App.tsx` (ref), `supabase/migrations/0003_money_rpcs.sql`
- **Problem:** No protection against a double-submitted or concurrent bet. Once the balance
  moves to Supabase, two requests can each pass `stake ≤ availableToWager` before either writes
  → **double-spend** of the hold.
- **Intended fix:** Make `placeWager` a single atomic RPC (`UPDATE … WHERE available ≥ stake
  RETURNING …`, 0 rows = rejected); add a client-minted **idempotency key** with a `UNIQUE`
  constraint; mint wager ids from the DB. See gap-analysis §1.1.
- **Fix shipped (branch `feat/launch-prep-batch`, 2026-06-27):** `supabase/migrations/0016_atomic_place_wager.sql`
  redefines `place_wager` as a single atomic `UPDATE accounts SET pending = pending + p_stake WHERE id = …
  AND (credit_limit + balance - pending) >= p_stake RETURNING …` (0 rows = reject), adds
  `wagers.idempotency_key` + a partial UNIQUE index with `ON CONFLICT DO NOTHING` replay-safety, and
  mints the id in-DB; core's `wagerSeq` is also replaced with `crypto.randomUUID()`. **Not yet applied**
  (no remote) and callers must pass a UUID — see `docs/operations/note-0016-atomic-place-wager.md`.

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

### G5 — Error tracking + uptime monitoring — 🟡 LOCAL SEAM DONE (2026-06-27)
- **Severity:** Medium (launch readiness — OWASP A10, new for 2025)
- **Where:** `app/ErrorBoundary.tsx` (catches but doesn't report), `worker/health.ts` (unmonitored)
- **Problem:** Exceptions are caught for users but reported nowhere; the worker's health endpoint
  has no external watcher/alert.
- **Intended fix:** Add Sentry (React app + Vercel functions + worker), wire `ErrorBoundary` to
  `captureException`; point an external monitor at `worker/health.ts` + a key page, alerting to
  the existing Slack. See gap-analysis §3.1, §3.2.
- **Fix shipped (branch `feat/launch-prep-batch`, 2026-06-27):** the client-side reporting seam is built —
  `app/error-report.ts` (`reportError`, a pluggable `setErrorSink`, and `installGlobalErrorReporting()`
  for window `error`/`unhandledrejection`), wired into `app/ErrorBoundary.tsx` and installed in
  `app/main.tsx`. **Still open:** register an actual vendor (Sentry DSN via `setErrorSink`) and external
  uptime monitoring on `worker/health.ts`.

### G6 — CI security automation
- **Severity:** Medium (cheap; catches the issues vibe-coded repos leak most — OWASP A03)
- **Where:** `.github/workflows/ci.yml` (no audit/scan), repo settings
- **Problem:** CI runs typecheck/lint/test/build but no dependency audit, Dependabot, CodeQL, or
  secret scanning — and there are already known leaked secrets to rotate (SGO key, dev GH token).
- **Intended fix:** Add `.github/dependabot.yml`; add `npm audit`/`osv-scanner` as a
  merge-blocking step; enable CodeQL + secret scanning + push protection; verify new deps aren't
  slopsquats. See gap-analysis §2.6.

### G7 — Published Privacy Policy + Terms + data-rights path — ✅ FIXED (2026-06-25)
- **Severity:** Medium (pre-launch legal hygiene; GDPR/CCPA apply even points-only)
- **Fix shipped:** Added `public/privacy.html` and `public/terms.html` (standalone static pages
  served at `/privacy` and `/terms` via vercel.json rewrites). Cover: data collected (email,
  gameplay, IP), sub-processors (Supabase, Vercel, Google), retention, export/deletion request
  path (email), cookie/localStorage disclosure, children policy, AI disclosure, and the core
  legal invariant that points have no monetary value and cannot be purchased or redeemed.
- **Remaining:** self-serve export/delete UI (needs Supabase backend — deferred to Phase 1).

---

## Tracked elsewhere / not bugs

- **M2 (crash floor vs round):** intentionally not changing — see
  `fixed-issues.md` "Deliberately NOT changed". Preserves Stake's published
  algorithm; no money impact.
