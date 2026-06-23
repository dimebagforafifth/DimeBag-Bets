# Vibe-Coded App Audit Checklist

A consolidated, deduplicated checklist distilled from a collection of Instagram Reel / TikTok transcripts about shipping AI-built ("vibe-coded") apps safely. Organized so each item is a discrete, agent-scannable task: every check has **what to look for** and **how to fix**.

Categories: [Security](#1-security) · [Cost](#2-cost) · [Performance](#3-performance) · [Legal & Compliance](#4-legal--compliance) · [Launch](#5-launch-readiness)

---

## 1. Security

### 1.1 Secrets & keys
- [ ] **No service-role / admin keys in client code.** Scan front-end bundles and source for privileged keys (e.g. Supabase `service_role`, any key that bypasses permissions). They must live only in server-side env vars.
- [ ] **No secrets logged.** Search the codebase for `console.log` / log statements that print `password`, `token`, `secret`, `apiKey`, or session data. Remove them.
- [ ] **`.env` not in Git history.** Adding it to `.gitignore` is not enough — check `git log` / history for committed `.env` files. If found, rotate all keys and scrub history.

### 1.2 Authentication & authorization
- [ ] **Object-level authorization (IDOR).** A logged-in user must only access their own data. Test: take user A's resource URL/ID and request it as user B — it must fail. Check that every data-fetching endpoint scopes by the authenticated user, not just by an ID in the request.
- [ ] **Row-Level Security enabled.** If RLS was disabled "to get it working," re-enable it and write explicit policies for every table. No table should be reachable just by knowing the database URL.
- [ ] **Session invalidation on logout.** After logout, old URLs/tokens must not grant access to protected pages or the backend. Verify sessions are actually torn down server-side.
- [ ] **Login rate limiting / throttling.** The login endpoint must throttle attempts (e.g. ~5 per IP per minute) to block credential stuffing / brute force.
- [ ] **Password reset links expire.** Reset tokens should be single-use and time-limited (~30 min).

### 1.3 Input handling & injection
- [ ] **Server-side validation, not just browser.** All validation must be enforced on the backend; client-side checks are bypassable by hitting the API directly.
- [ ] **Inputs sanitized & validated** before any DB query or execution — guard against SQL injection and XSS on all forms and user input.
- [ ] **No stored XSS.** Ensure user-supplied content rendered back to other users is escaped/sanitized (stored XSS is the highest-impact variant).
- [ ] **No ORM dynamic-condition misuse.** Review ORM queries for unsafe/dynamic conditions (raw interpolation, dynamic operators) that can be manipulated.

### 1.4 API & network
- [ ] **CORS locked down.** Only your own domain(s) should be allowed — no wildcard `*` on authenticated APIs.
- [ ] **CSRF protection.** Verify requests' origin so state-changing requests can't be forged from other sites.
- [ ] **Minimal API responses.** Endpoints should return only the fields the UI needs — no over-fetching that leaks extra user/system data to clients.
- [ ] **SSRF protection.** The backend must not blindly fetch arbitrary user-supplied URLs (prevents pointing it at internal systems/metadata endpoints).
- [ ] **HTTPS everywhere.** No data sent over plain HTTP.
- [ ] **Rate limiting on all API endpoints** (not only login) — especially AI-heavy ones (see also [2.1](#21-rate-limiting--abuse)).

### 1.5 Dependencies
- [ ] **Audit third-party packages.** Check for outdated/vulnerable dependencies (`npm audit` / Dependabot equiv.) and update.
- [ ] **Frontend doesn't silently swallow malformed/extra API fields** — unexpected fields can hide real bugs and turn into vulnerabilities.

---

## 2. Cost

### 2.1 Rate limiting & abuse
- [ ] **Global rate limiting** on AI-heavy workflows to prevent a viral spike from producing a runaway cloud bill.
- [ ] **Per-user token caps** on any user-facing AI agents, so a single user can't drain hundreds of dollars/day.

### 2.2 Database efficiency
- [ ] **No over-fetching queries.** Audit for `SELECT *` / pulling every column, image, or row when only a few fields are needed.
- [ ] **Indexes on hot query paths.** Ensure commonly-queried fields are indexed (balance against write overhead — don't blanket-index everything).
- [ ] **Connection management.** Check for DB connections opened per page/request and never closed (leaked/idle connections cost money and exhaust pools). Use pooling.
- [ ] **Batch writes.** Inserting rows one-at-a-time adds per-row overhead — batch bulk inserts.

### 2.3 Storage & background jobs
- [ ] **Clean the storage bucket.** Remove orphaned uploads — test files, failed-signup artifacts, duplicate upload attempts — you pay monthly rent on all of it.
- [ ] **No runaway background jobs.** Check logs for jobs stuck retrying in a loop thousands of times.

---

## 3. Performance

- [ ] **Compress responses.** Ensure JSON/responses are gzipped/compressed over the wire.
- [ ] **No accidental sequential/blocking calls.** Audit for serialized server calls that should be parallel/async — sequential code multiplies latency across all users.
- [ ] **Identify dependency bottlenecks.** Break down round-trip latency by network event; if one action takes ~90% of the time, that's the bottleneck to fix.
- [ ] **Batch writes** (also a cost item — see [2.2](#22-database-efficiency)).
- [ ] **Server-side rendering / caching.** The web server shouldn't rebuild identical HTML for every visitor — use SSG/caching where appropriate.
- [ ] **Token streaming for AI agents.** Stream response chunks to the user (like ChatGPT/Gemini) instead of waiting for the full completion — must be requested explicitly.

---

## 4. Legal & Compliance

- [ ] **Disclose AI use.** If the app uses AI, say so (landing page and/or privacy policy) — undisclosed AI can be treated as deceptive advertising (FTC).
- [ ] **Arbitration clause in Terms of Service** to limit class-action exposure.
- [ ] **Privacy "nutrition label" / data-collection disclosure.** List every data type collected, including third-party SDKs (Google Analytics, Meta Pixel) — required for App Store and CCPA compliance.
- [ ] **UGC / DMCA protection.** If users can upload content, register a DMCA designated agent (copyright.gov) and add a takedown clause to your ToS.
- [ ] **Cookie banner** if using product analytics / tracking cookies.

---

## 5. Launch Readiness

### 5.1 Reliability & observability
- [ ] **Specific error messages.** No generic "something went wrong" — distinct, actionable messages that build trust and aid debugging.
- [ ] **Frontend error handling.** Dedicated screens per error type plus a catch-all so users never see a raw stack trace.
- [ ] **Observability / audit logging.** Log meaningful actions so an agent (or you) can trace what happened when debugging future bugs. Core to maintainability.
- [ ] **Alerting.** Be notified immediately when something breaks in prod.
- [ ] **Safe rollback.** Have a deployment strategy (e.g. blue-green) that allows fast rollback to a prior version.

### 5.2 Growth & discoverability
- [ ] **Link preview image** (OG/social meta tags) so shared links render well.
- [ ] **Separate app and landing page** (e.g. app on a subdomain, marketing on the apex domain) to keep codebases isolated.
- [ ] **Onboarding checklist** so users reach the product's value quickly.
- [ ] **Product analytics** to see where users drop off (pair with the cookie banner above).
- [ ] **`sitemap.xml`** at the root + submit/index public pages via Google Search Console.

---

*Source: distilled from multiple short-form video transcripts on vibe-coding security/performance/cost/legal best practices. Each checkbox is intended to be a standalone task you can hand to an agent to scan a repo for.*
