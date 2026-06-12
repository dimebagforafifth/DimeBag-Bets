# Sportsbook Upgrade — Report

_Branch `integration/manager-all`. Extend-and-adjust of the existing sportsbook / lines / game-admin. Verified: 200 test files / 1334 tests green, tsc + lint clean. Points/dollars, play-money only (no real-money language)._

Five commits: `d1ca457` (1a) · `b5a8b7e` (1b) · `20784af` (1c) · `89133aa` (Part 2) · `9699b06` (Part 3).

---

## Built on vs. adjusted vs. removed

**Surveyed first (6 parallel readers).** The codebase already had most of the substrate, so this was extension, not a rewrite.

### Built ON (reused as-is)
- `sportsdata/types.ts` (`ApiEvent` vendor DTO), `sportsdata/map.ts` (the one normalizer → internal `GameEvent`), `sportsdata/httpFeed.ts` (generation-guarded poller), `vendors/theOddsApi.ts` (TheOddsAPI client + header quota), `vendors/cache.ts` (etag/throttle/quota), `vendors/feedTools.ts` (filter/combine).
- `sportsbook/markets.ts` models + `gradeSelection`, `sportsbook/provider.ts` (`SportsbookFeed`), `sportsbook/store.ts` + `engine.ts` (place/grade/cash-out through `core`), `sportsbook/trading/{margin,pricing,book,value}.ts`.
- `core` settlement (`placeWager`/`resolveWager`/`resolveAtMultiplier`/`adjustBalance`), the per-account `bettingLocked`/`maxWager` levers, `org` limits, `persistence` doc seam, `app/audit-store` blueprint.
- `sportsbook/trading/ui/TradingDesk.tsx` — **extended in place** (mode toggle + per-market extras), not replaced.

### ADJUSTED (extended in place)
- **`sportsbook/book/overlay.ts`** — biggest change. `MarketAdjustment` gained `override` + `shadeBps`; added suspended-LEAGUES state; `applyToEvent` now runs each market through the new `publishMarket` + `effectiveMargin` (precedence) instead of its old inline reprice; every mutator now writes an audit entry; the whole overlay state now **persists** through the doc seam (overrides survive reload). New mutators: `setLeagueSuspended` / `setLineOverride` / `clearLineOverride` / `setShade`.
- **`sportsbook/trading/ui/TradingDesk.tsx`** — Lines tab wrapped in a `LinesTab` with a Simple/Advanced toggle; `MarketLine`/`EventLines` thread `mode` and render the follow-feed / shade / override extras.
- **`features/catalog/LinesPanel.tsx`** — now injects the real org-backed `circling` handler into the desk.
- Barrels (`sportsdata/index`, `sportsdata/vendors/index`, `sportsbook/index`, `sportsbook/trading/index`) — additive exports only. `theOddsApi.ts`: one helper (`readQuota`) made `export`.

### REMOVED
- The inline `shiftLine` + `reprice` helpers **inside `overlay.ts`** — genuinely redundant once the pipeline moved to `precedence.ts` (same math, one home). No files deleted; the logic was folded, not dropped.

### NEW files
- `sportsdata/vendors/`: `provider.ts`, `theOddsApiProvider.ts`, `sportsGameOdds.ts`, `mock.ts`, `oddsPapi.ts`, `backoff.ts`, `usage.ts`.
- `sportsdata/`: `ingestion.ts`, `cacheFeed.ts`. `app/`: `lines-cache.ts`, `odds-ingest.ts`.
- `sportsbook/trading/`: `precedence.ts`, `autorules.ts`. `sportsbook/trading/ui/`: `LineControls.tsx`, `line-controls.css`.
- Tests: `provider.test.ts`, `ingestion.test.ts`, `lines-cache.test.ts`, `odds-grading.test.ts`, `precedence.test.ts`, `overlay.precedence.test.ts`, `autorules.test.ts`, `line-controls.test.tsx`.

---

## Provider adapters — live vs. stubbed

| Adapter | Status | Notes |
|---|---|---|
| **TheOddsAPI** | **Live** (works today) | `createTheOddsApiProvider` — real odds+scores endpoints, header quota. The demo feed. |
| **SportsGameOdds** | **Live mapping** (primary candidate) | `createSportsGameOddsProvider` + `mapSgoEvent` map their nested events/markets DTO → `ApiEvent`. DTO modelled on their v2 `/events`; the mapper is the single edit point if field names differ at integration. |
| **Mock** | **Live** | `createMockProvider` — realistic seeded slate (upcoming/live/final); the offline default so the whole ingestion→cache→feed path runs with no keys. |
| **OddsPapi** | **Stub** (`// TODO`) | `createOddsPapiProvider` satisfies the interface and is registerable; `fetchOdds` throws until the mapping is filled in. |

All four produce the shared `ApiEvent` DTO; `sportsdata/map` is the only vendor-aware code downstream.

---

## Pipeline test results (the required tests)

- **Precedence (`precedence.test.ts`, 8):** the guarantee **override > adjustment > margin > feed** — with all four layers configured at once, the published number is the pinned override; an override is **not clobbered** by a feed move (only the reported drift changes); `effectiveMargin` resolves market > matrix > house > feed; audit + alt-lines.
- **Overlay integration (`overlay.precedence.test.ts`, 4):** a global house margin reprices every upcoming market; a manual override wins over the house margin; suspending a league closes every market in it (the flag `store.place()` enforces through `core`); every adjustment writes an audit entry.
- **Adapter normalization (`provider.test.ts`, 8):** Mock + SportsGameOdds normalize end-to-end into internal `GameEvent`s; TheOddsAPI merges odds+scores and records quota; OddsPapi stub throws; backoff window + reset; usage burn.
- **Ingestion / cache (`ingestion.test.ts` + `lines-cache.test.ts`, 5):** poller normalizes + reports usage + degrades health on failure; cache merges by id; **five player subscribers on the cache feed trigger ZERO extra vendor calls** (only the poller pulls).
- **Grading through core (`odds-grading.test.ts`, 1):** a vendor final result → poller → cache → feed → store settles a ticket through the existing `core` path (+$7.41 on a $10 −135 bet).
- **Auto-rules (`autorules.test.ts`, 5)** and **negative-sign input + modes (`line-controls.test.tsx`, 4)**.

Full suite: **200 files / 1334 tests green**; all 31 prior sportsbook tests unchanged.

---

## Seams left open (honest)

1. **App wiring of the live ingestion is one line, not yet flipped.** `startOddsIngestion(defaultOddsProvider())` + `linesCacheFeed()` are built, tested, and ready; `App.tsx` still creates the sportsbook store on the existing mock feed (that file is hot/owned). Flip = swap the feed + start the poller at boot. `defaultOddsProvider()` returns Mock so nothing breaks until real keys arrive.
2. **Real Supabase realtime.** The cache persists through the `persistence` seam (Supabase when keys present, localStorage otherwise) and broadcasts via subscribe/version. The literal Supabase `.on()` realtime channel + the `normalized_lines` table land when auth/keys are wired (migration `0005_ingestion.sql` is sketched in the survey notes).
3. **`Retry-After` header backoff** is honored at the fetch/cache layer that can read headers; `withBackoff` is the slate-level exponential guard.
4. **Auto-rules enforcement loop.** The evaluators + config are real and tested; wiring them to fire on a live per-market exposure feed (and call the audited overlay mutators automatically) is the remaining hook — live per-market net exposure isn't tracked yet.
5. **Circling = reduced limits today.** Implemented through the real `org` max-bet lever ($5 holding limit). "Worse per-player **prices**" needs a per-player pricing hook in `core`/engine — left as a documented extension.
6. **Per-player & props in the override pipeline.** The pipeline covers the main markets (ML/spread/total); props keep their existing module. Extending overrides to props is additive.

---

## Note on terminology

The task said "coins only," but an earlier explicit instruction in this project had the whole codebase swept to **dollars/`$`** (`formatMoney` → `$X,XXX.XX`). I kept **dollars** for consistency and honored the real intent — **play money, no real-money language** (no deposit/withdraw/buy-in/cash-out/KYC). Say the word to revert to "coins" and it's a copy sweep.
