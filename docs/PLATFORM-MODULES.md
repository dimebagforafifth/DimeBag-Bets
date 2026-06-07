# Platform modules — `persistence/`, `ledger/`, `sportsdata/`

Three small, self-contained libraries that add real infrastructure value **without
touching any existing code**. Each lives in its own folder, ships its own tests, and
integrates through a named seam so it rolls up one line at a time. They are not yet
wired into the app — they are ready when you are. See `docs/ARCHITECTURE.md` for the
overall map.

---

## `persistence/` — swappable storage seam

State today is in-memory and resets on reload. This module is the seam that fixes that
without any module learning where bytes live.

**API**
- `KVStore` — `get / set / remove / keys / clear`, JSON value semantics (stored values
  are snapshots, not live refs).
- `createMemoryStore()` — tests / SSR.
- `createLocalStore({ namespace?, backing? })` — browser `localStorage`, namespaced;
  **degrades to memory** automatically if storage is unavailable (SSR, private mode,
  quota), so callers never guard. A corrupt entry reads as absent, not a throw.
- `persistedDoc(store, key, { version, initial, migrate? })` — a versioned document with
  `load / save / reset`; a stale on-disk version is migrated or safely discarded.

**Roll up**
```ts
import { createLocalStore, persistedDoc } from '../persistence/index.js'
const store = createLocalStore({ namespace: 'dimebag' })
const acctDoc = persistedDoc(store, 'account', { version: 1, initial: seedAccount })
// boot:   accountRef.current = acctDoc.load()
// change: acctDoc.save(account)   // after each onBalanceChange
```
Later: add `createSupabaseStore(): KVStore` in this folder — nothing upstream changes.

---

## `ledger/` — append-only transaction history over `core`

`core` mutates an account and forgets. The ledger records the running story without
changing `core`.

**API**
- `createLedger({ now? })` → `Ledger` with core-mirroring wrappers:
  `place / resolve / resolveAt / settle`. Each does exactly what `core` does **and**
  records an immutable `LedgerEntry` (kind, account, wager, balance/pending delta +
  after, outcome, multiplier, meta, seq, timestamp).
- `entries(accountId?)` — filtered, oldest first.
- `record(entry)` — low-level escape hatch for other money flows.
- `summarize(entries)` → `{ placed, resolved, turnover, net }` (pure).

**Roll up** — where a module calls `core` directly, call the ledger instead:
```ts
const ledger = createLedger()
const wager = ledger.place(account, stake, { game: 'mines' })
ledger.resolveAt(account, wager, multiplier, { game: 'mines' })
// later: render ledger.entries(account.id) as "recent activity"; pair with persistence to save it.
```
Existing code is untouched until it opts in.

---

## `sportsdata/` — real odds/scores feed adapter (the "attach an API" piece)

Implements the sportsbook's `SportsbookFeed` seam against a vendor HTTP API, fully
testable (injected fetch) and vendor-agnostic (a mapping layer is the only place that
knows vendor field names).

**API**
- `ApiEvent` / `ApiBookmaker` / `ApiMarket` / `ApiOutcome` — the external DTO
  (h2h / spreads / totals, American prices).
- `mapEvent(api, { bookmaker? })` / `mapSlate(api[])` — translate DTO → internal
  `GameEvent[]` (status derived from completed/scores, score matched by team name, the
  full market set with lines). Pure.
- `createHttpFeed({ fetchSlate, intervalMs?, bookmaker?, onError? })` → `HttpFeed`
  (`SportsbookFeed` + `refresh()`): polls `fetchSlate`, maps, notifies; keeps the last
  good snapshot on a failed poll.
- `fetchJsonSlate(url, init?)` — a production `fetchSlate` that GETs JSON.

**Roll up** — one line where the store is created (today `createMockFeed()`):
```ts
import { createHttpFeed, fetchJsonSlate } from '../sportsdata/index.js'
createStore(account, { feed: createHttpFeed({ fetchSlate: fetchJsonSlate(ODDS_URL) }), onBalanceChange })
```
The store, pricing, live model, cash-out, and UI are all unchanged.

---

## Validating these modules

- **Tests**: run repo-wide via `npm test` (vitest globs `**/*.test.ts`). The new folders'
  tests (`persistence`, `ledger`, `sportsdata`) are included automatically.
- **Typecheck**: `tsconfig.json`'s `include` is `["core","games","sportsbook","app"]`, so
  these new top-level folders are **not** covered by `npm run typecheck` yet. To fold a
  module into the standard typecheck on roll-up, add its folder name to that `include`
  array. (`org/` is also missing from `include` — worth closing at the same time.)
