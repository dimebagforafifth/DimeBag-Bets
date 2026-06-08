/**
 * Map an authenticated user to their book account/member — so the app can route a
 * session to the right figure and role. This is the auth↔account link, resolved through
 * the accounts SELECTOR (never a table auth defines itself).
 *
 * `accountIdForUser` is that selector: an auth user id → the id of their account, within
 * the ACTIVE tenant's book (book-store is tenant-scoped, so this is automatically the
 * right operator's book — two tenants never resolve into each other). `accountForUser`
 * returns the linked `core` Account; `memberForUser` returns the org node.
 *
 * Local (demo): an auth user id IS the member/account id — the demo identities are
 * seeded with member ids ('mgr', 'a-e', 'p-marco', …). A user with no account returns
 * null and is treated as an unlinked player (the app's "no player" state).
 *
 * // TODO(api): when Supabase auth is wired, resolve `accountIdForUser` through the
 * `accounts` table's `user_id` column (a profile row) — `select id from accounts where
 * user_id = auth.uid()` — instead of matching on member id. The accounts selector
 * (persistence/money) and RLS (supabase/migrations) already scope rows to the owner.
 */

import { getBook } from '../app/book-store.js'
import type { Account } from '../core/index.js'
import type { Member } from '../org/index.js'

/**
 * The accounts selector: which account id this auth user maps to in the active tenant's
 * book, or null if they have no account yet. The single seam the Supabase `user_id`
 * lookup swaps into.
 */
export function accountIdForUser(userId: string | null | undefined): string | null {
  if (!userId) return null
  // TODO(api): Supabase → look up accounts.user_id; today user id ≡ account/member id.
  return getBook().members[userId] ? userId : null
}

/** The linked `core` Account for an auth user (their figure), or null if unlinked. */
export function accountForUser(userId: string | null | undefined): Account | null {
  const id = accountIdForUser(userId)
  return id ? (getBook().members[id]?.account ?? null) : null
}

/** The org member (account + role + tree position) for an auth user, or null if unlinked. */
export function memberForUser(userId: string | null | undefined): Member | null {
  const id = accountIdForUser(userId)
  return id ? (getBook().members[id] ?? null) : null
}
