# Manager features blocked on the `org` schema

Two manager-side features from the brief can't be built without one small addition
each to `org`'s `Member` (the player-identity record). The manager layer owns the
feature; the **org workstream owns the field**. Each section below is a ready-to-
implement spec: the field to add, then the manager build that follows.

Neither needs a new money path — both still settle/credit through `core` (bonuses
via `core.grant`). Neither changes the tree shape.

---

## 1. Referral program

**Why blocked:** there is no way to record *who referred whom*. `Member`
(`org/types.ts`) has `id, role, name, parentId, account, active` — no referrer link.

### Org workstream adds (one optional field)
```ts
// org/types.ts — Member
/** The member who referred this player (set once, at signup). Player-only. */
referredBy?: string   // a Member id
```
Optional + backward-compatible (older books simply have it `undefined`). A setter
alongside the others is ideal:
```ts
// org/org.ts
export function setReferredBy(org: Org, id: string, referrerId: string): void
//   throws if id/referrerId unknown, if id is not a player, or if already set.
```

### Manager build that follows (in `manager/promotions/referral/`)
- A **referral-code store** (persisted, `manager/referral`): `code → referrerId`
  (generate a short code per agent/player who can refer).
- **Attribution:** when a player is recruited with a referral code, call
  `setReferredBy(org, newPlayerId, referrerId)`.
- **Reward trigger:** subscribe to `core.onWagerResolved`; on a referee's **first
  settled wager**, `grant()` a configurable bonus to **both** the referee and their
  `referredBy` referrer (reusing the bonus/grant path already built). One-time per
  referee (track in the referral store).
- **UI:** a Referral panel — issue/share codes, list referrals + their status
  (signed up → first bet → rewarded), and set the two reward amounts.

Everything except `referredBy` + `setReferredBy` is already expressible with the
existing `core.grant` + `onGrant` + persistence primitives.

---

## 2. Off-platform direct messages (email / SMS / Discord / Telegram DM)

**Why blocked:** in-app DMs are **built** (`manager/communication/messages*`), but
delivering a message to a player *off-platform* needs a contact handle, and `Member`
has none (only `id` + `name`).

### Org workstream adds (one optional field)
```ts
// org/types.ts — Member
/** Player contact handles for off-platform delivery (all optional). */
contact?: {
  email?: string
  phone?: string
  discord?: string   // user id or webhook
  telegram?: string  // chat id
}
```
Optional + backward-compatible. A guarded setter (`setContact(org, id, patch)`)
keeps writes going through `org`, like the other member mutations.

### Manager build that follows (extends `manager/communication`)
- The existing **`dispatch`** (webhooks.ts) already POSTs to Discord/Telegram via an
  injected fetch — point a per-player send at `member.contact.discord/telegram`
  instead of the book-wide webhook config.
- Email/SMS need an outbound provider behind the same injected-fetch seam (a new
  `sendEmail`/`sendSms` adapter, mirroring `sportsdata/httpFeed`). These are real
  external services with their own auth + likely a server proxy (CORS / secret
  keys) — note for deployment.
- **UI:** the "Message a player" composer gains a "deliver off-platform" option that
  lights up only for channels the target has a `contact` handle for.

The in-app inbox path (built) is unchanged; this only adds outbound delivery once a
contact handle exists.

---

## Summary for the org workstream

| Add to `org` `Member` | Unblocks | Manager work already staged |
|---|---|---|
| `referredBy?: string` (+ `setReferredBy`) | Referral program | bonus/grant path, persistence, `onWagerResolved` trigger |
| `contact?: {…}` (+ `setContact`) | Off-platform DMs | `dispatch` (Discord/Telegram), the messages composer |

Both are additive, optional, and backward-compatible — no migration, no tree
change, no new money path.
