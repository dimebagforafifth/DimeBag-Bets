# `persistence/` — the storage seam + Supabase backend

A tiny, swappable storage boundary (CLAUDE.md §6) so any module saves/loads state
without knowing where the bytes live. Two concerns live here:

1. **Documents** — the synchronous `KVStore` (memory / localStorage / Supabase) and
   the versioned `persistedDoc` on top of it. Opaque JSON blobs (settings, tickets,
   the org snapshot, manager docs).
2. **Money** — `money/`, the **server-authoritative** path: place / grade / adjust /
   settle / grant computed in a trusted place, behind one async `MoneyService`.

Everything defaults to the **current behaviour** (localStorage + in-process `core`)
and only switches to Supabase when `SUPABASE_URL` / `SUPABASE_ANON_KEY` are present.
No keys → byte-for-byte what the app shipped before.

## Documents: `createStore` vs `createLocalStore`

`createLocalStore({ namespace })` is unchanged. The new env-aware
`createStore({ namespace })` returns the **Supabase-backed** `KVStore` when keys are
set and localStorage otherwise — same synchronous interface, so nothing upstream
changes. The Supabase adapter is a **write-through cache**: reads/writes hit an
in-memory snapshot synchronously (identical semantics), and every mutation mirrors to
localStorage (offline safety net) + the server (background). `await store.ready` for
the first server reconciliation; the app never blocks on it.

### Adoption — DONE for the 7 book stores

The book document stores (`app/book-store`, `settings`, `settlement`, `vip`, `edge`,
`audit`, `book-ledger`) now call `createStore({ namespace: 'dimebag' })`. With no keys
this is byte-for-byte localStorage; with keys those documents move to Supabase
automatically. The manager stores still call `createLocalStore` directly — they are
the manager-console lane, but they are **already tenant-scoped** (see below) because the
scoping lives in the persistence primitive, not the call site. They can swap to
`createStore` themselves whenever that lane wants document sync. `auth/demoAdapter`
deliberately stays on `createLocalStore` — it's the local demo provider; real auth has
its own `auth/supabaseAdapter`.

## Multi-tenancy: `tenant.ts`

Each manager is a fully isolated **book** (tenant). `persistence/tenant.ts` holds the
active tenant; **every** store resolves its namespace through it
(`createLocalStore`/`createStore` call `tenantNamespace(base)`), so two operators never
share a keyspace — locally each book's keys are `dimebag~t~<tenant>:…`, and under
Supabase the namespace + `tenant_id`/RLS keep books apart
(`supabase/migrations/0004_tenancy.sql`).

```ts
import { setActiveTenant } from '../persistence/index.js'
setActiveTenant(session.user.tenantId)   // at boot, from the signed-in operator
```

The **default tenant** returns the namespace unchanged (`'dimebag'`), so the single demo
book and every existing key/test are identical until a real tenant is set. The active
tenant is read at store-creation time (stores are module singletons), so set it at boot
before stores initialise; switching books in a running tab means a reload. (`AuthUser`
carries an optional `tenantId`; the demo leaves it undefined → the default book.)

## Money: `createMoneyService`

```ts
import { createMoneyService } from '../persistence/index.js'

const money = createMoneyService({ localSource })   // localSource: AccountSource over the org
await money.place(accountId, stake)                  // → { account, wager }, authoritative
await money.resolve(accountId, wagerId, 'win', 2.5)
await money.settle(accountId)
```

- **No keys** → `createLocalMoneyService`, which runs `core` in-process: the exact
  current authority model, just behind an async seam.
- **Keys present** → `createSupabaseMoneyService`, which calls the SECURITY DEFINER
  RPCs (`supabase/migrations/0003_money_rpcs.sql`). The browser only *requests* a
  mutation; RLS forbids it from writing `balance` itself.

The provably-fair RNG stays in `core`/games — this validates the *ledger write*, not
the dice.

### Adoption — `bookMoney` is wired over the live book

`app/money-service.ts` exports **`bookMoney`**, the env-aware `MoneyService` wired over
the live org (via an `AccountSource` that reads a member's account and writes changes
back through `mutateBook`). No keys → runs `core` in-process (today's behaviour); keys →
server-authoritative via the RPCs.

Going fully server-authoritative is inherently **async** (a network round-trip), so the
cutover — operator money (`grant`/`adjust`/`settle`) and eventually play switching from
`core.*` to `await bookMoney.*` — rides the same env switch and is what activates server
authority. Games/sportsbook keep their existing **sync** `core` path until then (there's
no central money chokepoint above `core`, and the provably-fair RNG must stay untouched),
so no-keys behaviour is unchanged. Those call sites live in the game/console/shell lanes;
flipping them is their adoption step, made drop-in by this wiring.

## Tests

`vitest run persistence` — KV round-trips (incl. the Supabase write-through cache and
hydrate), the local + Supabase money services, server-side settlement rollup, and the
explicit *client-cannot-overwrite-its-own-balance* guarantee (direct `PATCH` refused;
only the RPC moves the figure).
