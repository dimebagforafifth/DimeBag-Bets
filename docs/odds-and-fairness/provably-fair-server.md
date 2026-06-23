# Server-side provably-fair authority

_Integrity lane (CLAUDE.md §6). Moves the server-seed **commit-reveal** off the client so the
platform — not the operator, not the player — is the trusted party that mints and holds the
seed. The fairness **math is unchanged**: outcomes still come from `core/fair.ts`
(HMAC-SHA256 / client-seed / nonce) and stay independently verifiable._

## The gap this closes

Today every game mints its own server seed in the browser (`randomServerSeed()` in each
game's `engine.ts`), commits the hash, plays, and reveals — all in one client process. A
modified client (or an operator running one) could pick a favourable server seed before
play. There is no independent authority.

## The pieces

| File                         | Role                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/fairness-authority.ts` | Isomorphic authority. `SeedVault` = `commit()` → `{commitId, serverSeedHash}` (the hash, never the seed), `reveal(commitId)` → `{serverSeed, ...}`. Two implementations + `resolveCommit` + `verifyServerSeed`. |
| `api/fairness.ts`            | Vercel serverless route. Pure `handleFairness(req, vault)` core (Supabase-edge-portable) + a thin Node adapter. Actions: `commit`, `reveal`, `resolveCrash`.                                                    |
| `games/shared/fair.ts`       | Client seam (`fairnessClient`) games use instead of `randomServerSeed()`. Hits `/api/fairness`; falls back to an in-process authority when there's no server (local dev / tests / SSR).                         |

## The flow

```
            ┌─────────── before play ───────────┐
 client ──▶ POST /api/fairness {action:'commit'} ──▶ { commitId, serverSeedHash }
            (the hash is the commitment — seed withheld)

            ┌─────────── play ──────────────────┐
 client plays with its own clientSeed + nonce; money moves ONLY through core (integer cents)

            ┌─────────── after play ────────────┐
 client ──▶ POST /api/fairness {action:'reveal', commitId} ──▶ { serverSeed }
            player checks  sha256(serverSeed) === serverSeedHash  (verifyServerSeed)
            and re-derives the outcome with the game's published verify* helper
```

`resolveCrash` is the stronger variant: the **server** reveals the seed _and_ derives the
crash point (`crashPointFromSeeds`) in one authoritative step, so the result never depends on
the client computing it.

## Works now, no Supabase required

The default authority is **`createDerivedVault`** — stateless. The server seed is a pure
function of a server-only master secret and the commit id:

```
serverSeed = HMAC-SHA256(FAIRNESS_SECRET, `server-seed:${commitId}`)
```

So nothing is stored between the commit call and the reveal call — `reveal` recomputes the
same seed. That survives serverless cold starts (every invocation is a fresh process) with
**no database**. Set `FAIRNESS_SECRET` in production; with it unset a flagged dev fallback
secret is used so local/points-only play just works. `resolveMasterSecret().isDevFallback`
lets a deploy refuse to ship on the fallback.

Why it's safe: the client never sees the secret (can't predict the seed); the commit returns
the hash immediately for a server-chosen `commitId` (the operator can't swap it after seeing
the bet); and the outcome also depends on the player's `clientSeed` + `nonce`, supplied only
at play time (the server can't grind commit ids for a favourable result at commit).

When the backend is provisioned, swap in **`createStoredVault(store)`** (durable per-round
CSPRNG seeds + an audit trail) backed by a Supabase table — same `SeedVault` interface, no
caller change. This is off by default, preserving the byte-for-byte-identical-without-keys
invariant.

## Which games use it

- **Crash** — wired (`games/crash/ui/CrashGame.tsx`). The round's server seed now comes from
  the authority (`fairnessClient.commit()` → `reveal()`) instead of `randomServerSeed()` in
  the browser, and the fairness panel verifies the revealed seed against the hash the platform
  committed **before** play ("Platform commitment ✓"). The crash-point math and the live
  animation are untouched.
- **All other games** — adopt the same seam by replacing their in-engine `randomServerSeed()`
  with `fairnessClient.commit()` / `reveal()`. Left as a follow-up so this pass keeps the ~460
  game tests green and stays out of the payout/visual lanes.

## Open seams (follow-ups, by design)

- **Server-timed Crash clock.** Genuine end-to-end authority withholds the crash point until
  the round resolves, which needs the **server to run the round clock** and stream the result
  (the realtime / Supabase-realtime lane). Until then Crash takes the reveal at bet time for
  its client-timed clock (marked `INTERIM` in `start()`); `resolveCrash` is already built and
  tested as the path that lane plugs into.
- **Anti-grind on standalone `reveal`.** A standalone reveal is fully safe only once a wager's
  `clientSeed` + `nonce` are bound on the **server** at placement — i.e. when money is
  server-authoritative (the Supabase money-RPC lane). Today money is client-side localStorage,
  so the authority hardens the seed origin and adds server reveal/verify; the last grind gap
  closes when wagers are server-bound.

## Config

```
# Server-only secret for the provably-fair authority. Unset → a flagged dev fallback (local
# points-only play). Set a strong random value in production.
FAIRNESS_SECRET=<random-string>
```
