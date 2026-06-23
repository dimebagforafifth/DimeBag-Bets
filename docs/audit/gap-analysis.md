# DimeBag-Bets — Extended Audit & Gap Analysis

Companion to [`checklist.md`](./checklist.md) and [`agent-tasks.md`](./agent-tasks.md) (see the [audit README](./README.md)). Where `checklist.md` is a generic, source-distilled list, **this doc is DimeBag-specific**: it covers common production issues *beyond* that checklist, scored against the **actual repo state as of 2026-06-23**, with a concrete fix for each in this codebase.

It deliberately does **not** repeat items already tracked elsewhere — for money-path / fairness / RLS-population work see [`docs/pending-issues.md`](../pending-issues.md); for the generic list see `checklist.md`. Items here are mostly *new* surface area.

## Status legend
- 🔴 **Missing** — not present; should be added.
- 🟡 **Partial** — foundation exists; needs completion, config, or automation.
- 🟢 **N/A by design** — intentionally out of scope (points-only model); recorded so it's a decision, not an oversight.

## Context that shapes this list
DimeBag-Bets is **points-based — no real money, no buy-in, no cash-out, no payments, no KYC** (CLAUDE.md §1). That removes a whole class of gambling/payment obligations (see [§8](#8-out-of-scope-by-design-points-only)). But points still have *value to players* (leaderboard, rewards, referrals), the app is **gambling-styled**, and it runs on **Supabase + Vercel** — so account security, anti-abuse, integrity, cost control, observability, and basic legal hygiene all still apply.

---

## Research basis (2026)

External research backs *why* these gaps matter — and **2026 data shows the problem accelerating**. AI-assisted / "vibe-coded" code ships vulnerabilities at high rates, developers **overestimate** its security, and attackers have built supply-chain tactics around AI's specific failure modes:

- **CVEs attributed to AI-generated code tripled in Q1 2026** — 6 (Jan) → 15 (Feb) → **35 (Mar 2026)** on Georgia Tech's "Vibe Security Radar," with the true count estimated **5–10× higher** (most AI tools leave no commit metadata) — [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/).
- A Q1-2026 assessment of **200+ vibe-coded apps found 91.5% had ≥1 vulnerability traceable to AI hallucination**; Escape.tech's scan of **1,400+ production** vibe-coded apps found **65% had security issues and 58% had ≥1 *critical*** vuln (400+ exposed secrets, 175 PII exposures) — [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-security-vibe-coding-202/), [OX Security](https://www.ox.security/blog/vibe-coding-security/).
- Veracode (100+ LLMs): **45%** of AI code introduces an OWASP Top 10 vuln — **86% failed to defend against XSS, 88% were vulnerable to log injection**; AI-assisted devs wrote **40% more** vulns while rating their code *more* secure (Stanford) — via [Kaspersky](https://www.kaspersky.com/blog/vibe-coding-2025-risks/54584/), [Kusari](https://www.kusari.dev/blog/ai-coding-assistants-in-2026-4x-faster-10x-riskier-the-hidden-security-cost).
- **GitGuardian State of Secrets Sprawl 2026**: **28.65M** new hardcoded secrets hit public GitHub in 2025 (**+34% YoY — the largest single-year jump ever**); **AI-assisted commits leak secrets at 3.2% vs a 1.5% baseline** — AI roughly *doubles* leak rate. *(DimeBag already has known secrets to rotate — `pending-issues.md`.)*
- **Slopsquatting** is now a named supply-chain class (CSA research note, Apr 2026): ~**20%** of AI package suggestions don't exist; attackers pre-register the hallucinated names (a fake `huggingface-cli` reached **30k downloads**) — [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/).
- Supabase **CVE-2025-48757**: 10.3% of scanned apps shipped public-readable tables (RLS off); top issues remain *tables without RLS, `service_role` exposure, and permissive `USING (true)` policies that protect writes but leave reads open* — and **legacy anon/`service_role` JWT keys are being deprecated by end of 2026** (migrate to `sb_publishable_`/`sb_secret_`, see [§2.7](#27-migrate-to-supabases-new-api-key-format)) — [Supabase retro](https://supabase.com/blog/supabase-security-2025-retro), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
- **Cost of waiting:** production-stage fixes cost **6–15×** more than design-time, and the average 2026 breach exceeds **$4.8M** — [A10 Networks](https://www.a10networks.com/blog/web-application-security-best-practices/). Latency matters commercially too: **+100ms ≈ −1% revenue** (Amazon); **53%** of mobile users abandon a load > 3s (Akamai); edge compute cuts latency **40–60%** — [SolidAppMaker](https://solidappmaker.com/web-performance-in-2026-best-practices-for-speed-security-core-web-vitals/).

### OWASP Top 10 (2025) → DimeBag gap mapping
The [OWASP Top 10 was refreshed in 2025](https://owasp.org/Top10/2025/); the notable moves line up with this doc:

| OWASP 2025 | Move | DimeBag items here |
|------------|------|--------------------|
| **A01** Broken Access Control | still #1 | IDOR/authz, RLS regression tests ([§3.7](#37-rls-regression-tests)), operator MFA ([§2.5](#25-operator-console-mfa--auth-policy)) |
| **A02** Security Misconfiguration | #5 → **#2** | Security headers ([§2.1](#21-http-security-headers)), env fail-open ([§3.5](#35-env-var-validation-at-startup)), Supabase RLS posture ([§4.7](#47-supabase-rls-performance--posture)) |
| **A03** Software Supply Chain Failures | new / expanded | CI security automation + slopsquatting ([§2.6](#26-ci-security-automation)) |
| **A05** Injection | #3 → #5 | Runtime validation ([§2.3](#23-runtime-schema-validation-zod)) |
| **A10** Mishandling of Exceptional Conditions | **new** | Fail-open prod fallback ([§3.5](#35-env-var-validation-at-startup)), error tracking ([§3.1](#31-error-tracking-sentry)) |

> The two biggest 2025 risers — **Security Misconfiguration (A02)** and **Supply Chain (A03)** — are precisely the areas a fast-moving, AI-built repo is weakest in, and where DimeBag's confirmed gaps cluster.

---

## Top priorities (start here)

| # | Item | Cat | Status | Why it's top |
|---|------|-----|--------|--------------|
| 1 | [Atomic + idempotent balance mutation](#11-idempotency--atomic-balance-mutation) | Sec/Integrity | 🔴 | Once balances are server-side, concurrent/replayed bets can double-spend `availableToWager`. |
| 2 | [HTTP security headers](#21-http-security-headers) | Security | 🔴 | One `vercel.json` block buys CSP/HSTS/anti-clickjacking. Cheapest high-value win. |
| 3 | [API edge rate limiting + bot protection](#22-rate-limiting-at-the-http-edge) | Sec/Cost | 🔴 | `api/fairness` & future player routes are unauthenticated and unthrottled — spam grows `fairness_seeds` and burns function quota. Needed *before* player logins. |
| 4 | [Runtime validation at trust boundaries (zod)](#23-runtime-schema-validation-zod) | Security | 🔴 | API bodies, the odds feed, and env are cast/trusted today; one malformed payload reaches pricing/balance. |
| 5 | [Error tracking + uptime monitoring](#31-error-tracking-sentry) | Reliability | 🔴 | You can't run a launch you can't see. No Sentry, no external uptime alerting today. |
| 6 | [CI security automation](#26-ci-security-automation) | Security | 🔴 | No dep-audit / Dependabot / CodeQL / secret-scan — and there are already known leaked secrets to rotate. |
| 7 | [Legal pages + data-rights path](#51-published-privacy-policy--terms) | Legal | 🔴 | Email + IP + gameplay are collected via Google OAuth; GDPR/CCPA apply even points-only. |

---

## 1. Integrity & money-safety (beyond what `pending-issues.md` tracks)

### 1.1 Idempotency & atomic balance mutation
- **Status:** 🔴 Missing
- **Now:** `core` mutates the account **in place** in a `ref` (`app/App.tsx`); wager ids come from an in-memory counter (`core/core.ts` `wagerSeq`, already flagged in `pending-issues.md`). There is no protection against a bet being submitted twice (double-click, network retry) or two bets racing the same `availableToWager`.
- **Risk at launch:** When the balance moves to Supabase, a double-submit or two concurrent tabs can each pass the `stake ≤ availableToWager` check before either writes, **double-spending** the hold. For a points economy with a leaderboard, that's an exploit.
- **Fix:**
  1. Make `placeWager` a **single atomic RPC** (extend the `0003_money_rpcs` / `service_resolve_wager` pattern): do the check-and-debit in one statement — `UPDATE accounts SET pending = pending + :stake WHERE id = :id AND (credit_limit + balance - pending) >= :stake RETURNING …` — and treat "0 rows" as rejected. No read-then-write window.
  2. Add an **idempotency key** (client-minted UUID per placement) with a `UNIQUE` constraint on the wager/transaction row; a retried request hits the constraint and returns the original result instead of placing twice.
  3. Mint wager ids from the DB (UUID / identity), closing the `wagerSeq` item too.

### 1.2 `fairness_seeds` growth & TTL
- **Status:** 🔴 Missing (becomes real once the durable vault is on)
- **Now:** `api/fairness.ts` `commit` writes one row per round to `fairness_seeds` (migration 0006). Nothing prunes it.
- **Risk:** Unbounded growth → storage cost + slower reads, and unthrottled `commit` (see [2.2](#22-rate-limiting-at-the-http-edge)) makes it a cheap amplification target.
- **Fix:** A `pg_cron` job to purge seeds past their useful life (e.g. `revealed_at < now() - interval '30 days'`, and unrevealed older than a sane cap). Pair with rate limiting on `commit`.

---

## 2. Security hardening (beyond `checklist.md` §1)

### 2.1 HTTP security headers
- **Status:** 🔴 Missing
- **Now:** `vercel.json` sets framework/build/crons but **no `headers`** — so no CSP, HSTS, `X-Content-Type-Options`, anti-clickjacking, `Referrer-Policy`, or `Permissions-Policy` are sent.
- **Risk:** Clickjacking of the operator console / bet actions; no defense-in-depth against injected script (the Supabase session lives in `localStorage`, so an XSS = token theft); MIME sniffing.
- **Fix:** Add a `headers` block to `vercel.json`. Starter (tune CSP against actual origins — Supabase URL, the odds API, and inline styles):
  ```jsonc
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co https://api.the-odds-api.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
    ]
  }]
  ```
  Start CSP in `Content-Security-Policy-Report-Only` to catch breakage before enforcing.

### 2.2 Rate limiting at the HTTP edge
- **Status:** 🔴 Missing
- **Now:** `api/poll-odds` and `api/run-promos` are guarded by `CRON_SECRET` ✅, but `api/fairness` (commit/reveal/resolveCrash) is **open and unthrottled**, and there's no rate-limiting layer for the player API routes that arrive with logins. The repo `throttle`/`limit` hits are unrelated (`creditLimit`, `player_limits`, ledger-flush throttle) — there is no request limiter.
- **Risk:** Quota/storage drain (commit spam → [1.2](#12-fairness_seeds-growth--ttl)), brute force once auth lands, scraping.
- **Fix:** Add a small limiter keyed by IP (and by user once authed). `@upstash/ratelimit` + Upstash/Vercel KV works on serverless; or a token-bucket in front of each `api/*` handler. Apply tightest limits to `api/fairness` `commit`. This makes the generic `checklist.md` rate-limit items concrete for this repo.

### 2.3 Runtime schema validation (zod)
- **Status:** 🔴 Missing (1 partial spot)
- **Now:** No validation lib is installed (only `import/validate.ts` does bespoke checks). `api/fairness.ts` trusts `req.nonce as number` / `req.clientSeed as string`; `sportsdata/vendors/theOddsApi.ts` casts vendor JSON `as ApiEvent[]` (already flagged in `pending-issues.md`); env vars are read ad hoc.
- **Risk:** A malformed body or hostile feed propagates `NaN`/`undefined` into pricing or the balance path; missing prod env fails late and silently.
- **Fix:** Add `zod`. Validate (a) every `api/*` request body, (b) the odds feed at the network boundary, (c) **env at startup** (see [3.5](#35-env-var-validation-at-startup)). Reject early with a generic 400/500 (keep the existing no-leak error style).

### 2.4 Bot protection on signup
- **Status:** 🔴 Missing
- **Now:** Email verification + Google OAuth are built (`auth/`); nothing stops scripted account creation.
- **Risk:** Fake accounts skew the **leaderboard**, farm **referrals**/**rewards** (modules present), and burn auth quota.
- **Fix:** Add Cloudflare Turnstile / hCaptcha on the email signup path; enable Supabase's CAPTCHA-on-auth setting. Combine with [2.2](#22-rate-limiting-at-the-http-edge).

### 2.5 Operator-console MFA & auth policy
- **Status:** 🟡 Partial
- **Now:** The operator console gates money RPCs via `book_members` / `_assert_operator` (migration 0007) ✅, but there's no MFA requirement for operators and no breached-password / min-length policy wired.
- **Risk:** The operator role can `adjust_balance` / `settle_week`; a single phished operator password is high-impact.
- **Fix:** Require Supabase MFA (TOTP) for any `book_members` operator/admin role; enable the "leaked password protection" + minimum-length options in Supabase Auth.

### 2.6 CI security automation
- **Status:** 🔴 Missing
- **Now:** CI runs typecheck/lint/test/build ✅ but **no** dependency audit, `dependabot.yml`, CodeQL/SAST, or secret scanning. `pending-issues.md` already lists secrets to rotate (SGO key, a dev GitHub token) — exactly what scanning would have caught.
- **Fix:** Add `.github/dependabot.yml` (npm, weekly); add `npm audit --audit-level=high` (or `osv-scanner`) as a CI step that **blocks merge on a known critical** (SCA is "non-negotiable in 2026"); enable GitHub **CodeQL** + **secret scanning + push protection** on the repo. Cheap, automated, and self-documenting.
- **Supply-chain / slopsquatting (OWASP A03):** `npm ci` from a committed `package-lock.json` ✅ is already the right baseline (reproducible, no surprise resolutions). Harden it: before adding *any* new dependency an agent suggests, confirm the package actually exists, is widely used, and isn't a typo of a real one — ~20% of AI-suggested packages are hallucinated and attackers pre-register those names. Consider lockfile-integrity / provenance checks in CI.

### 2.7 Migrate to Supabase's new API key format
- **Status:** 🟡 Partial (clock is ticking)
- **Now:** `.env.example` uses the legacy `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (JWT) keys. Supabase is **deprecating legacy JWT keys by end of 2026** in favor of `sb_publishable_…` (replaces anon) and `sb_secret_…` (replaces service_role).
- **Why it matters here:** the new keys add real safeguards DimeBag wants — **auto-revocation when a secret key is detected in a public repo** (directly relevant to the known-leaked-secret cleanup), asymmetric JWTs for safer rotation, and the **OpenAPI schema is no longer publicly readable** with a publishable key (today anyone with the anon key can enumerate every table/column).
- **Fix:** Plan the migration before the deadline: issue `sb_publishable_`/`sb_secret_` keys, update `.env(.example)` + the durable-vault/service-role paths in `api/fairness.ts` and `worker/`, and rotate the old keys out. Low effort now, forced later.

---

## 3. Reliability & operations (mostly new vs `checklist.md` §5)

### 3.1 Error tracking (Sentry)
- **Status:** 🔴 Missing
- **Now:** There's a React `app/ErrorBoundary.tsx` ✅ (catches render crashes for users) and API handlers return generic errors ✅ — but nothing **reports** exceptions anywhere. No Sentry/Rollbar/etc.
- **Fix:** Add Sentry for the React app **and** the Vercel functions/worker. Wire `ErrorBoundary` to `Sentry.captureException`. Scrub PII; keep sample rate modest to control cost.

### 3.2 Uptime & health monitoring
- **Status:** 🟡 Partial
- **Now:** The worker exposes `worker/health.ts` ✅, but nothing external pings it or alerts on failure; the Crash clock + odds poller run there unmonitored.
- **Fix:** Point an external monitor (BetterStack/UptimeRobot/Checkly) at the health endpoint and a key page; alert to the existing Slack. (You already DM FundedEdge alerts to Slack — reuse that channel pattern.)

### 3.3 Backups / PITR + tested restore
- **Status:** 🔴 Missing / unverified
- **Now:** 14 migrations define the schema; nothing documents backup/restore for the Supabase project that will hold balances and the ledger.
- **Fix:** Enable Supabase PITR (paid tier) or scheduled `pg_dump`; **do one test restore** and write the runbook into `docs/`. An unaudited balance store with no tested restore is the scary failure mode.

### 3.4 Feature flags / kill switch
- **Status:** 🔴 Missing
- **Now:** Games/economy are config-driven (`app/economy-config.ts`, house configs) but there's no runtime switch to disable a specific game, the live feed, or signups without a redeploy.
- **Risk:** If a pricing/integrity bug appears in one game, you want to dark it in seconds, not ship a build.
- **Fix:** A small flags table (or Vercel Edge Config) read by `app/games.ts` registry + the sportsbook feed gate; a `maintenance`/`signups_open` master switch.

### 3.5 Env-var validation at startup
- **Status:** 🔴 Missing
- **Now:** Env is read defensively (`getSupabaseEnv`) and falls back to demo/mock — great for dev, but a **prod** deploy missing `FAIRNESS_SECRET` / `CRON_SECRET` silently runs the dev fallback.
- **Fix:** A `lib/env.ts` zod schema parsed at server entry (`api/*`, `worker/`) that **hard-fails** when `NODE_ENV=production` and a required secret is absent. Keeps dev's zero-config ergonomics, removes the silent-prod-fallback foot-gun.

### 3.6 Migration apply/verify in CI
- **Status:** 🟡 Partial
- **Now:** Migrations exist but are "**not yet applied to a remote**"; nothing checks they apply cleanly.
- **Fix:** A CI job that spins ephemeral Postgres and runs all migrations (and, ideally, the RLS tests below) so a broken migration can't merge.

### 3.7 RLS regression tests
- **Status:** 🔴 Missing
- **Now:** RLS policies exist (0002, 0007) but no automated test proves a player can't read another tenant's rows.
- **Fix:** pgTAP or a seeded integration test that asserts cross-tenant/cross-user reads/writes are denied. This is the safety net for the "pre-player-auth checklist" in `pending-issues.md`.

---

## 4. Performance, latency & cost (beyond `checklist.md` §2–3)

### 4.1 Bundle-size budget & route splitting
- **Status:** 🟡 Partial
- **Now:** Vite splits a `vendor` chunk and games are lazy-loaded ✅, but there are **21 games + a large operator console**; no size budget guards regressions.
- **Fix:** Set `build.rollupOptions` size warnings / a CI bundle-size check (e.g. `size-limit`); confirm the operator console and each game are route-split so a player never downloads the admin bundle.

### 4.2 Core Web Vitals / Lighthouse CI
- **Status:** 🔴 Missing
- **Fix:** Add Lighthouse CI (or Vercel Speed Insights) with budgets for LCP/CLS/INP on the lobby, a game, and the sportsbook. "Fast" is a stated core principle (CLAUDE.md §2) — make it measured, not assumed.

### 4.3 Long-list virtualization
- **Status:** 🟡 Partial / verify
- **Now:** Leaderboard, ledger, and bet-history surfaces can grow large.
- **Fix:** Confirm these paginate or virtualize (`@tanstack/react-virtual`) rather than rendering thousands of rows; pair with **cursor pagination** on the queries (ties into `checklist.md`'s over-fetch item).

### 4.4 Realtime subscription hygiene
- **Status:** 🟡 Partial / verify
- **Now:** Supabase realtime drives live odds + the Crash multiplier; poll cadences already have floors ✅ (cost-aware).
- **Fix:** Verify every `subscribe` has a matching unsubscribe on unmount (leaked channels = concurrent-connection cost and memory). Cap concurrent channels per client.

### 4.5 Billing & budget alerts
- **Status:** 🔴 Missing
- **Now:** Odds spend is disciplined (mock default, SGO only behind `SGO_LIVE`) ✅, but there are no **spend alerts** on Supabase or Vercel.
- **Fix:** Set billing/usage alerts (and spend caps where available) on both, routed to Slack. This is the "$5,000 surprise bill" item from the source reels, made concrete.

### 4.6 Static caching headers
- **Status:** 🟡 Partial
- **Now:** Vite content-hashes assets and Vercel serves them immutable by default ✅.
- **Fix:** Add an explicit `Cache-Control: no-cache` for `index.html` (and `s-maxage` for any cacheable API) so returning players never boot a stale shell after a deploy.

### 4.7 Supabase RLS performance & posture
- **Status:** 🟡 Partial (perf + audit)
- **Now:** The schema is RLS-heavy (migrations 0002, 0007, …) — correct for safety, but RLS has well-known performance and correctness foot-guns that bite at scale.
- **Fixes (each a quick audit):**
  - **Wrap auth calls in a subselect.** `auth.uid()` / `auth.jwt()` used bare in a policy is re-evaluated **per row**; `(select auth.uid())` lets Postgres evaluate it **once per statement** — a large speed/cost win on big tables (ledger, bets). Supabase documents this as a top RLS performance practice.
  - **Audit for permissive `USING (true)` SELECT policies** — the #1 Supabase data-exposure pattern (writes protected, reads wide open). Ties into the [RLS regression tests](#37-rls-regression-tests).
  - **Index the columns RLS filters on** (e.g. `user_id`/tenant) so policies don't force scans.
  - **If Supabase Storage is used,** verify object paths carry an identity prefix (`{user_id}/…`), policies parse the right folder, and signed URLs are short-lived — flat paths + long-lived URLs are a common leak.

---

## 5. Privacy, legal & compliance (beyond `checklist.md` §4)

### 5.1 Published Privacy Policy + Terms
- **Status:** 🔴 Missing
- **Now:** `profile/privacy.ts` is profile-visibility settings, **not** a legal policy. No Privacy Policy or ToS page exists, yet Google OAuth collects email, and IP/gameplay are processed.
- **Fix:** Add `/privacy` and `/terms` routes/pages. Cover data collected, processors (Supabase, Vercel, Google, odds API), retention, and contact. Include the `checklist.md` legal items (arbitration clause, AI disclosure if any AI features ship).

### 5.2 GDPR/CCPA data rights (export + delete)
- **Status:** 🔴 Missing
- **Fix:** A self-serve "export my data" + "delete my account" path (account-level cascade across `player_profile`, ledger refs, referrals, etc.). Supabase makes the queries easy; the policy/runbook is the work.

### 5.3 Age gate + "not real money" prominence
- **Status:** 🟡 Partial
- **Now:** The `<meta>` description and brand say points-only ✅, and a `responsible-play/` module + `ResponsiblePlayGate` + player limits (migration 0013) exist ✅. But there's no explicit **age confirmation** and the "entertainment only / no real money" disclaimer isn't guaranteed front-and-center.
- **Fix:** Add a one-time 18+ (or 21+) confirmation at signup and a persistent "play-money, no cash value" disclaimer in the footer/onboarding. Surface the existing responsible-play limits in onboarding. This reduces app-store "social casino" and consumer-protection risk if the model ever broadens.
- **2026 legal context (why this is cheap insurance):** US states turned hard against *dual-currency sweepstakes casinos* in 2025–2026 — **13 states had banned them by April 2026** (California, NY, NJ, Nevada, etc.), with a wave of class actions calling them illegal gambling. Crucially, the legal line is the **prize / chance / consideration** test: those operators got hit because their "sweeps coins" are **redeemable for cash** (prize) and gold coins are **purchasable** (consideration). **DimeBag sits on the safe side precisely because points are neither purchasable nor redeemable** — keep it that way. **Treat "never add purchase or redemption of points" as a hard product invariant**; adding either would re-introduce *consideration* or *prize* and pull the app across the gambling line. — [iGB](https://igamingbusiness.com/legal-compliance/2025-sweepstakes-casinos-year-in-review/), [California ban](https://rg.org/news/gambling-industry/california-bans-social-casinos-sweepstakes-model-law).

### 5.4 Promo email compliance
- **Status:** 🟡 Partial / verify
- **Now:** `api/run-promos.ts` + a promotions/communication manager surface exist.
- **Fix:** If any promo emails go out, ensure one-click unsubscribe + physical address (CAN-SPAM) and honor opt-outs. If not sending email yet, note it as a precondition before enabling.

---

## 6. SEO & discoverability (beyond `checklist.md` §5 launch)

### 6.1 Open Graph / Twitter card + share image
- **Status:** 🔴 Missing
- **Now:** `index.html` has `description` + `theme-color` ✅ but **no `og:*` / `twitter:card`** tags and no share image (`public/` holds only `favicon.svg`).
- **Fix:** Add OG/Twitter meta to `index.html` and a `public/og.png`. (This is `checklist.md` launch item "preview image," concretized.)

### 6.2 `robots.txt` (+ sitemap)
- **Status:** 🔴 Missing
- **Now:** No `robots.txt` or `sitemap.xml` in `public/`.
- **Fix:** Add `public/robots.txt` (disallow the operator/console paths, allow public pages) and a minimal `sitemap.xml` for public routes; submit via Search Console. Note: an SPA needs prerendering/meta for crawlers to see anything useful — decide if SEO matters before investing.

---

## 7. Accessibility & UX quality

### 7.1 Accessibility automation
- **Status:** 🟡 Partial (already strong)
- **Now:** ~509 `aria-*`/`role` usages across 139 components — accessibility is clearly being done by hand ✅.
- **Fix:** Lock it in with automated checks: `eslint-plugin-jsx-a11y` in the existing ESLint config + an `axe`/Playwright pass in CI on a few key screens; spot-check keyboard nav and color contrast on the dark theme.

---

## 8. Out of scope by design (points-only)

Recorded so these are **considered decisions, not gaps** — revisit only if the model ever moves toward real money.

- 🟢 **KYC / AML / identity verification** — no real money in or out (CLAUDE.md §1, §10).
- 🟢 **PCI-DSS / card data handling** — no payments.
- 🟢 **Payment-processor webhook signature verification** — no processor.
- 🟢 **Geofencing / per-jurisdiction gambling licensing** — non-redeemable points; still add the [age gate](#53-age-gate--not-real-money-prominence) for store/consumer-protection safety.
- 🟢 **Withdrawal fraud / chargeback handling** — no withdrawals.

> ⚠️ The trigger that flips **all five** to required is **making points purchasable or redeemable** (see the [legal invariant in §5.3](#53-age-gate--not-real-money-prominence)). If that ever happens, this whole section becomes the highest-priority workstream, alongside re-checking everything in [§5](#5-privacy-legal--compliance-beyond-checklistmd-4).

---

## How to run this as tasks
Each numbered item is sized to be a single PR. To audit current state automatically, the [`agent-tasks.md`](./agent-tasks.md) category scans still apply — this doc is the **gap list those scans should confirm and close**. Suggested sequencing = the [Top priorities](#top-priorities-start-here) table, then §2→§3→§4→§5→§6→§7.

## Sources (2026 research)

- [CSA — Vibe Coding's Security Debt: the AI-Generated CVE Surge (2026)](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
- [CSA — Vibe Coding Security Crisis: Credential Sprawl & SDLC Debt](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-security-vibe-coding-202/)
- [CSA — Slopsquatting: AI Code Hallucinations Fuel Supply-Chain Attacks (Apr 2026)](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/)
- [Kusari — AI Coding Assistants in 2026: 4× Faster, 10× Riskier](https://www.kusari.dev/blog/ai-coding-assistants-in-2026-4x-faster-10x-riskier-the-hidden-security-cost)
- [OX Security — Why 62% of AI-Generated Code Ships With Vulnerabilities](https://www.ox.security/blog/vibe-coding-security/)
- [Kaspersky — Security risks of vibe coding and LLM assistants (2025)](https://www.kaspersky.com/blog/vibe-coding-2025-risks/54584/)
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [Supabase — Security Retro 2025](https://supabase.com/blog/supabase-security-2025-retro) · [Supabase — Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Supabase — RLS performance & best practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) · [Supabase — Going into prod checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Vercel — Production checklist](https://vercel.com/docs/production-checklist) · [Vercel billing demystified](https://www.edge-cases.com/nextjs/vercel-billing-demystified) · [Vercel bill shock: $700→$120](https://journeywithibrahim.medium.com/vercel-bill-shock-from-700-to-120-ec24ee9755c3)
- [A10 Networks — Web App Security Best Practices 2026](https://www.a10networks.com/blog/web-application-security-best-practices/) · [SolidAppMaker — Web Performance in 2026](https://solidappmaker.com/web-performance-in-2026-best-practices-for-speed-security-core-web-vitals/)
- [iGamingBusiness — How 2025 became the year US states turned against sweepstakes casinos](https://igamingbusiness.com/legal-compliance/2025-sweepstakes-casinos-year-in-review/) · [California bans social casinos using sweepstakes model](https://rg.org/news/gambling-industry/california-bans-social-casinos-sweepstakes-model-law)

*Verified against the repo on 2026-06-23. Research current as of June 2026. Re-verify statuses before acting — the codebase moves fast.*
