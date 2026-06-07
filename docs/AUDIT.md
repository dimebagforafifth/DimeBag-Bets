# DimeBag-Bets — Reliability & Security Audit + Project Inventory
*Branch: `audit/reliability-security` · Date: 2026-06-07 · Scope: reliability, security, leftovers (NOT money/balance or game-outcome logic — owned by a separate audit).*

Baseline before any change: **130 test files, 1011 tests green, `tsc --noEmit` clean.**
After changes: **130 test files, 1013 tests green, typecheck clean.**

---

## 1. FIX SUMMARY

### Headline
The codebase is in **excellent reliability/security shape**. No exposed secrets, no debug/dead code in production paths, no unguarded `JSON.parse`, no TODO/FIXME leftovers. React effects clean up their timers/listeners, realtime games (Crash) cancel their animation frames on unmount, stores use `useSyncExternalStore`, persistence degrades gracefully, and event listeners self-remove. Most candidate issues turned out to be **safe-by-design** (graceful degradation), **safe under React 18** (setState-after-unmount is a no-op), or **not in the wired production path**.

One genuine, in-scope defect class was found and fixed: **outbound network calls had no timeout**, so a hung connection leaves a promise pending forever — the classic "disconnect handling" gap named in scope.

### Issues found & fixed

**1. Webhook dispatch could hang forever on a dead endpoint** — `manager/communication/webhooks.ts`
A slow or dead Discord/Telegram webhook left the POST promise pending indefinitely (the operator's "send" never resolves). Added an `AbortController` timeout (`DEFAULT_WEBHOOK_TIMEOUT_MS = 10s`); a timed-out request now aborts and is reported as a failed channel, slotting into the existing per-channel `.catch()` so one dead hook still can't sink the others.

```diff
-async function post(fetchImpl, url, payload) {
-  const res = await fetchImpl(url, { method:'POST', headers:{…}, body: JSON.stringify(payload) })
-  return { ok: res.ok, status: res.status }
-}
+async function post(fetchImpl, url, payload, timeoutMs) {
+  const controller = new AbortController()
+  const timer = setTimeout(() => controller.abort(), timeoutMs)
+  try {
+    const res = await fetchImpl(url, { method:'POST', headers:{…}, body: JSON.stringify(payload), signal: controller.signal })
+    return { ok: res.ok, status: res.status }
+  } finally { clearTimeout(timer) }
+}
```
`dispatch()` gained an optional `timeoutMs` (defaulted, backward-compatible) threaded into both channel posts.

**2. Live-feed poll could stall indefinitely on a hung vendor** — `sportsdata/httpFeed.ts` (`fetchJsonSlate`, the production live-feed default)
The HTTP odds/scores poll had no timeout, so a half-open connection could hang a poll forever. Added an `AbortController` timeout (`DEFAULT_FETCH_TIMEOUT_MS = 12s`); a stalled poll now aborts and surfaces as a failed poll, which the feed already handles correctly (keeps the last good slate, downgrades health to `reconnecting`).

```diff
-export function fetchJsonSlate(url, init?) {
-  return async () => {
-    const res = await fetch(url, init)
-    if (!res.ok) throw new Error(`odds feed responded ${res.status}`)
-    return (await res.json()) as ApiEvent[]
-  }
-}
+export function fetchJsonSlate(url, init?, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
+  return async () => {
+    const controller = new AbortController()
+    const timer = setTimeout(() => controller.abort(), timeoutMs)
+    try {
+      const res = await fetch(url, { ...init, signal: controller.signal })
+      if (!res.ok) throw new Error(`odds feed responded ${res.status}`)
+      return (await res.json()) as ApiEvent[]
+    } finally { clearTimeout(timer) }
+  }
+}
```

### Tests added
- `manager/communication/webhooks.test.ts` — "times out a hung webhook instead of waiting forever" (injects a fetch that only rejects on abort; asserts the channel reports `ok:false` rather than hanging).
- `sportsdata/httpFeed.test.ts` — "aborts a hung request after the timeout instead of stalling the feed" (stubs `globalThis.fetch` to hang-until-aborted; asserts the slate fetch rejects).

Neither touches money/balance or game-outcome logic.

### Flagged but intentionally NOT changed (with reasoning)

| # | Where | Why flagged | Why not fixed here |
|---|-------|-------------|--------------------|
| F1 | Game UIs `videopoker`, `threecardpoker`, `pump` — reveal `setTimeout`s not cleared on unmount | Other games clear their timers; these don't | **Not a real bug under React 18** (setState-after-unmount is a no-op; timers are sub-second then GC'd). The only effect is a sound playing ~0.5s after navigating away. The timers also fire `signalReveal()` — clearing them would *change* ledger-release timing (it would fall back to the safety timer). `useSettleOnExit` already settles the money correctly. Consistency-only; left for the owning team to align if desired. |
| F2 | `sportsbook/ui/Sportsbook.tsx` `place()` — no in-flight guard | Casino games use a `resolving` lock; the bet slip doesn't | Low risk: `store.place()` is **synchronous** and the slip is cleared immediately, so React 18's discrete-event flush closes the double-click window before a second `place()` can see a non-empty slip. A guard would be belt-and-suspenders, not a fix. |
| F3 | `persistence/store.ts` — quota-exceeded `setItem` swallowed silently | Operator gets no warning if storage fills | **By design** (documented: "callers keep their in-memory copy"). The right enhancement is a user-facing "storage full" banner — a feature, not a one-line fix — listed in WHAT'S NEXT. |
| F4 | `sportsdata/vendors/theOddsApi.ts` `mergeScores` — `Number(row.score)` can yield `NaN` | Malformed vendor score → NaN into grading | This is input validation **at the grading boundary** (money/outcome — the other audit's lane) and is **not wired to production**. Recommend a finite-number guard when the live feed is wired; deferred to the grading owner. |
| F5 | `sportsdata/vendors/theOddsApi.ts` — API key in URL query string | Keys in URLs can leak via logs/proxies | This is **The Odds API's required auth scheme** (key is operator-provided via config, never hardcoded). Not fixable on our side; the right control is to keep the key server-side / proxy in production (WHAT'S NEXT). |
| F6 | `sportsbook/ui/live/*` (`FeedStatus`, `OddsTick`, `KickoffCountdown`, `LiveBadge`) | Appear unused — the Sportsbook renders its own inline `FeedStatusPill` | Dead-but-harmless (not imported into any production path). Wire them in or delete; no reliability impact. |
| F7 | `app/settlement-store.ts` — settlement history has no size cap | `book-ledger` (1000) and `audit` (2000) are capped; settlement history grows unbounded | Growth is ~1 record/week (slow). Capping financial settlement records risks **destroying accounting history an operator needs** — a retention-policy decision, not a bug. Flagged for product. |

---

## 2. WHAT'S BUILT — plain-language inventory

> Legend: **[Complete]** logic + UI + tests, wired in · **[Partial]** some pieces missing · **[Stub]** skeleton/placeholder.

### Shared credit/balance core — the money engine
- **[Complete]** `core/` — The single ledger every game and the sportsbook runs through. Tracks each account's credit limit, running figure (balance), and at-risk (pending); enforces "you can only bet what you can afford"; places, grades (win/loss/push/void), and settles wagers; squares up weekly and resets. Money is integer **cents** throughout (`games/shared/money.ts`). Includes a provably-fair primitive (`core/fair.ts`) and a `grant()` bonus primitive. Thoroughly tested. *Owned by the separate money/fairness audit — not modified here.*

### Casino games — 20 playable, all on the shared balance
All 20 are **[Complete]**: each has engine logic, a provably-fair seed module, a clean UI, tests, and is registered in the lobby (`app/games.ts`). They share one balance and one settlement flow.
- **Mines, Crash, Dice, Limbo, Keno, Plinko** — the originals. Crash is the realtime one (a multiplier climbs on an animation loop; cash out before it busts) and is correctly built (cleans up on unmount, settles your bet if you leave mid-flight).
- **Wheel, Hi-Lo, Chicken Road, Dragon Tower, Pump, Coin Flip, Diamonds, Cases** — more provably-fair originals.
- **Roulette, Blackjack, Baccarat, Sic Bo, Three Card Poker, Video Poker** — table/card games with fixed house edges.
- Most single-edge games support a **manager-adjustable house edge (RTP)**.
- **[Partial] Slots** (`games/slots/`) — engine and house-edge config exist, but it is **not in the lobby registry**, so it can't be played yet. One line in `app/games.ts` wires it in.

### Sportsbook — full book, currently on simulated data
- **[Complete]** Core book (`sportsbook/`): game/markets model, American/decimal odds math, moneyline/spread/total grading, parlays (with push/void re-pricing and a 299:1 cap), futures/outrights, player props, live in-play pricing + win-probability, and **cash-out** of open bets. Auto-settles tickets the moment a game finals.
- **[Complete]** Manager line management (`sportsbook/book/overlay.ts`): suspend a market, move a line, set the vig — applied on top of the raw feed and reflected to players live.
- **[Complete]** Trading desk (`sportsbook/trading/*` + `TradingDesk.tsx`): operator tools for de-vigging, fair pricing, exposure/hedge analysis, value/Kelly, arbitrage detection, line-move suggestions.
- **[Complete]** Bet types (`sportsbook/bets/*`): singles, parlays, round-robins, teasers, boosts. (Teasers are gated in the UI until the engine carries them end-to-end.)
- **⚠️ Data source: MOCK.** The live board runs on `sportsbook/mockFeed.ts`, a scripted simulator that walks games upcoming → live → final on a 5s timer and loops. **[Complete-but-not-wired]** A real feed exists — `sportsdata/httpFeed.ts` + `sportsdata/vendors/theOddsApi.ts` (The Odds API v4 client, with ETag caching, quota tracking, live-score merge). Wiring it is a one-line swap where the store is created; **the API key is operator-config, never hardcoded.**

### Bet slip & history
- **[Complete]** Bet slip (`sportsbook/ui/Sportsbook.tsx`): add picks, single/parlay/round-robin, live re-pricing, and **line-move re-confirmation** (if a price moves while it's in your slip you must accept the new line before placing — CLAUDE.md §4).
- **[Complete]** History: a player-facing "My Bets" dashboard (`app/MyBets.tsx`) over a **durable, persisted transaction ledger** (`app/book-ledger.ts` + `ledger/`), a per-game session ledger (`app/Ledger.tsx`), plus sportsbook ticket history in the slip aside.

### Loyalty / VIP / progression
- **[Complete]** `vip/` — pure VIP logic: rank ladder (none → bronze … diamond) derived from lifetime wagered, idempotent reward claims, free-play accrual, leaderboard. No money moves except via core.
- **[Complete]** `app/vip-store.ts` — persists ranks/free-play, accrues on each settled wager, auto-grants rewards.
- **[Complete]** `manager/loyalty/` — operator UI to configure the ladder (thresholds + rewards per rank).

### Manager / agent console (the operator product)
A full operator suite (`manager/` + `app/ManagerConsole.tsx` and panels). Each sub-feature is **[Complete]**:
- **Branding / white-label** (`manager/branding/`) — custom brand name, logo, accent color, money display format, timezone; applied app-wide.
- **Communication** (`manager/communication/`) — book-wide announcements (with severity + expiry), in-app player DMs/broadcasts, and outbound Discord/Telegram **webhooks** (now with a timeout — see fixes).
- **AI Copilot** (`manager/copilot/`) — read-only advisory: ranks risk/promo/comms recommendations from a reporting snapshot. Rules-based today, swappable for an LLM behind the same interface; never writes.
- **Promotions** (`manager/promotions/`) — one-off, bulk (downline), and **scheduled/recurring** bonuses (once/daily/weekly), all granted via `core.grant`; campaign log. A client-side runner fires due bonuses every 60s while a tab is open (production would move this to a backend cron; the runner is correctly no-op under tests).
- **Reporting & analytics** (`manager/reporting/`) — mirrors every settled wager + bonus into a durable, capped (50k) log; turnover, hold, per-game/per-player, engagement/churn/retention, CSV export.
- **Risk, Settlement, Games, Audit panels** (`app/RiskPanel`, `SettlementHistory`, `GamesPanel`, `AuditPanel`) — live exposure + alert thresholds; weekly square-up history with mark-collected + CSV/PDF export; per-game enable/disable; an append-only audit trail of every manual operator change.
- **Blocked on org schema** (`manager/BLOCKED-ON-ORG.md`): a **referral program** (needs `Member.referredBy`) and **off-platform direct messages** (needs `Member.contact`) are built on the manager side but wait on two org fields.

### Org hierarchy, ledger, persistence
- **[Complete]** `org/` — the Manager → Sub-agent → Agent → Player pyramid: credit waterfall, tier rules, betting locks, move/remove with full guards, and cascade-up weekly settlement. Each member holds their own `core.Account`.
- **[Complete]** `ledger/` — append-only durable transaction history wrapping core's place/resolve/settle (before/after figures, outcome, actor, reason).
- **[Complete]** `persistence/` — a swappable key/value seam: in-memory (tests/SSR) + namespaced `localStorage`, with versioned-document migration. Degrades to memory if storage is unavailable; corrupt entries read as absent. Designed to swap to Supabase with no upstream changes.

### App shell & sound
- **[Complete]** `app/App.tsx` — the unified shell: one shared balance in the header, nav across Casino / Sportsbook / My Bets / Leaderboard / Management, per-player sportsbook stores with careful lifecycle teardown, and an `ErrorBoundary` (wired in `main.tsx`) so a render crash shows a recovery screen, not a blank page.
- **[Complete]** `sound/` — Web Audio synthesis (no audio assets), mute toggle persisted, gracefully no-ops without an AudioContext.

### Auth / accounts / players — **the biggest gap**
- **[Stub] No authentication.** There is no login, no password, no session, no roles. The app seeds one demo org on first load and persists it to the local browser, keyed by manager id (one org per browser). "Switching accounts" is a player-picker dropdown; the audit trail records the actor as a hardcoded `'operator'`. This is intentional for the current phase, but **real auth + multi-tenant + role-gating is the #1 prerequisite for a sellable, multi-operator product** (it lands in the backend phase per CLAUDE.md §8).

---

## 3. WHAT'S NEXT — prioritized roadmap

### (A) Critical — blockers for any real, multi-user deployment
1. **Real authentication & accounts.** Login/session, password or OAuth, and a server-side identity. Today everything is one browser, one seeded org, actor = `'operator'`. Nothing multi-user is safe until this exists. (Supabase auth per the stack in CLAUDE.md §6.)
2. **Server-side balance & settlement (move off localStorage).** The figure, tickets, ledger, settlements, and audit log all live in the browser's `localStorage`. That means data is per-browser, loss-prone (quota/clear-cache), and trivially editable by the client. Promote `core` + the durable ledger to a Supabase-backed service behind the existing `persistence` seam. This also resolves the silent quota-drop (F3) and the unbounded settlement history (F7).
3. **Wire the real sports feed and keep the API key server-side.** Swap `mockFeed` for `httpFeed` + `theOddsApi`; the key must live in a server/proxy (it's a query-string param the vendor requires — F5), never shipped to the browser. Add the finite-score guard (F4) so malformed vendor data can't poison grading. The fetch-timeout work in this audit is the first step.
4. **Authorize manager actions.** Credit edits, figure adjustments, settlements, and game toggles are powerful and currently ungated. Once auth exists, gate every operator mutation by role server-side (the client UI already routes through `auditedMutate`, so the audit trail is ready).

### (B) Important — to make it a sellable manager product
5. **Operator-visible storage/data-health signals.** Surface "storage full / save failed" (F3) and feed-degraded states to the operator, not just to logs.
6. **Multi-tenant org isolation.** The persistence namespace is a single `dimebag` per browser; real multi-operator needs per-tenant isolation (server-enforced once auth lands).
7. **Unblock the two org-schema features** (referral program, off-platform DMs) by adding `Member.referredBy` and `Member.contact` — manager side is built and waiting (`manager/BLOCKED-ON-ORG.md`).
8. **Harden the live path further.** Retry/backoff and an `AbortSignal` on `stop()` for in-flight polls (the generation token already prevents stale overwrites; this just reclaims resources during long outages). Real-time push (Supabase realtime) for the Crash multiplier and live odds, per CLAUDE.md.
9. **Backend cron for scheduled promotions.** The 60s client runner only fires while a tab is open; move recurring bonuses server-side.
10. **Sportsbook bet-placement in-flight guard** (F2) — cheap belt-and-suspenders once bets may round-trip to a server (async placement reopens the double-submit window that the current synchronous path closes).

### (C) Nice-to-have — polish
11. Align the game-UI reveal timers (F1) for consistency, via a shared "tracked timeout" helper that preserves `signalReveal` semantics.
12. Wire in or remove the unused `sportsbook/ui/live/*` components (F6).
13. Remote error reporting (Sentry/Datadog) behind the existing `ErrorBoundary`, replacing console-only logging.
14. Finish teasers end-to-end (engine → UI; currently gated) and wire Slots into the lobby.
15. Replace the PDF-export `alert()` fallback in `SettlementHistory` with an inline, non-blocking notice.
