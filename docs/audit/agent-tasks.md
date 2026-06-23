# Audit Agent Tasks

Discrete, self-contained agent prompts derived from [`checklist.md`](./checklist.md). Each task is one category and can be dispatched independently / in parallel. Each agent scans the repo (no changes), reports findings as `[PASS] / [FAIL] / [N/A] / [NEEDS REVIEW]` per item, and cites `file:line` evidence.

**Shared instructions (prepend to any task):**
> Read-only audit. Do not modify code. For each checklist item, return a status — `[PASS]`, `[FAIL]`, `[N/A]` (feature not present), or `[NEEDS REVIEW]` (can't determine) — a one-line justification, and `file:line` evidence where applicable. End with a prioritized summary of `[FAIL]` items (highest impact first) and a suggested fix prompt for each.

---

## Task 1 — Security Audit

Scan the repository for these security issues:

**Secrets & keys**
1. Privileged/admin keys (e.g. Supabase `service_role`, any permission-bypassing key) present in client-side or front-end code. Must be server-side env vars only.
2. Log statements (`console.log`, logger calls) that print `password`, `token`, `secret`, `apiKey`, or session data.
3. `.env` committed to Git history (check history, not just `.gitignore`). Flag for key rotation if found.

**Auth & authorization**
4. Object-level authorization (IDOR): every data-fetching endpoint scopes by the authenticated user, not just a client-supplied ID.
5. Row-Level Security enabled with explicit per-table policies (flag any disabled RLS).
6. Sessions invalidated server-side on logout (old tokens/URLs must not work after logout).
7. Login endpoint has rate limiting / throttling (~5 attempts per IP per minute).
8. Password reset tokens are single-use and time-limited (~30 min).

**Input handling & injection**
9. Validation enforced server-side, not only in the browser.
10. User input sanitized/validated before DB queries or execution (SQLi, XSS).
11. Stored XSS: user content rendered to other users is escaped.
12. ORM queries free of unsafe dynamic/raw-interpolated conditions.

**API & network**
13. CORS restricted to own domains (no wildcard `*` on authenticated APIs).
14. CSRF protection / origin verification on state-changing requests.
15. API responses return only fields the UI needs (no over-fetch leakage).
16. SSRF: backend does not fetch arbitrary user-supplied URLs.
17. HTTPS enforced everywhere.
18. Rate limiting on all API endpoints (not just login).

**Dependencies**
19. Outdated/vulnerable third-party packages (`npm audit` equivalent).
20. Frontend doesn't silently swallow malformed/extra API fields.

---

## Task 2 — Cost Audit

Scan the repository for cost / resource-waste issues:

1. Global rate limiting on AI-heavy workflows (runaway-bill protection).
2. Per-user token caps on user-facing AI agents.
3. Over-fetching queries: `SELECT *` or pulling every column/image/row when few are needed.
4. Indexes on commonly-queried fields (note over-indexing risk on write-heavy tables).
5. DB connections opened per page/request and never closed; confirm pooling is used.
6. Bulk inserts batched rather than row-at-a-time.
7. Storage bucket cleanliness: orphaned test uploads, failed-signup artifacts, duplicate uploads.
8. Background jobs stuck retrying in a loop (inspect job/cron config and logs).

---

## Task 3 — Performance Audit

Scan the repository for performance issues:

1. Responses compressed (gzip/brotli) over the wire.
2. Accidental sequential/blocking server calls that should be parallel/async.
3. Dependency bottlenecks: identify any single action dominating round-trip latency.
4. Bulk writes batched (cross-ref cost item).
5. SSR/SSG/caching used instead of rebuilding identical HTML per visitor.
6. Token streaming implemented for AI agent responses (chunked, not full-wait).

---

## Task 4 — Legal & Compliance Audit

Scan the repo + public-facing content (landing page, privacy policy, ToS) for:

1. AI-use disclosure present (landing page and/or privacy policy).
2. Arbitration clause in Terms of Service.
3. Data-collection disclosure / privacy label covering all collected data types and third-party SDKs (Google Analytics, Meta Pixel, etc.).
4. UGC/DMCA: designated agent registered + takedown clause in ToS (only if users can upload content).
5. Cookie banner present if analytics/tracking cookies are used.

> Note: flag presence/absence only; surface for human/legal review rather than asserting compliance.

---

## Task 5 — Launch Readiness Audit

Scan the repository for launch-readiness gaps:

**Reliability & observability**
1. Specific, actionable error messages (no generic "something went wrong").
2. Frontend error handling: per-type error screens + catch-all (no raw stack traces to users).
3. Observability / audit logging of meaningful actions.
4. Alerting configured for prod failures.
5. Safe rollback strategy (e.g. blue-green / versioned deploys).

**Growth & discoverability**
6. Link preview image / OG social meta tags.
7. App and landing page separated (e.g. app on subdomain, marketing on apex).
8. Onboarding checklist / flow.
9. Product analytics instrumented (pair with cookie banner from Task 4).
10. `sitemap.xml` at root + public pages submitted to Google Search Console.

---

*Dispatch tip: Tasks 1–3 and 5 are repo scans (parallelizable). Task 4 also needs the deployed site / legal docs. Run each with the shared read-only instructions block prepended.*
