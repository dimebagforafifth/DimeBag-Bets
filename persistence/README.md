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

### Adoption (shell workstream — one-line swap per store, safe to do now)

The document stores currently call `createLocalStore({ namespace: 'dimebag' })`
(`app/book-store.ts`, `app/settings-store.ts`, the manager stores, …). To put
documents on Supabase, swap each to `createStore({ namespace: 'dimebag' })`. Because
`createStore` === localStorage with no keys, adopting it changes nothing until the
operator drops the keys in. (Those call sites are the shell/feature lanes, not this
one, so this layer only provides the selector — it does not edit them.)

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

### Adoption (shell/games lanes — later, gated by auth)

Games/sportsbook today call `core.placeWager(account, …)` directly. To go
server-authoritative, route those through a shared `MoneyService` instead and `await`
the returned authoritative account. That's a larger, cross-lane change owned by the
shell + game lanes; this foundation makes it a drop-in (the local service preserves
today's behaviour until keys + auth are in place). Not done here by design.

## Tests

`vitest run persistence` — KV round-trips (incl. the Supabase write-through cache and
hydrate), the local + Supabase money services, server-side settlement rollup, and the
explicit *client-cannot-overwrite-its-own-balance* guarantee (direct `PATCH` refused;
only the RPC moves the figure).
