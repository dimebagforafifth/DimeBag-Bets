/**
 * Map an authenticated user to their book member — their account/org node — so the
 * app can route a session to the right figure and role.
 *
 * We READ the existing org/account store (book-store) and never define our own table.
 *
 * // TODO(api): when Agent 1's `accounts` table carries the auth↔account link (a
 * user_id column / profile row), resolve through its store selector
 * (e.g. getAccountForUser(userId)) instead of matching on member id. For now an auth
 * user id IS a book member id — the demo identities are seeded with member ids
 * ('mgr', 'a-e', 'p-marco', …). A user with no matching node returns null and is
 * treated as an unlinked player (no account yet → the app's "no player" state).
 */

import { getBook } from '../app/book-store.js'
import type { Member } from '../org/index.js'

export function memberForUser(userId: string | null | undefined): Member | null {
  if (!userId) return null
  return getBook().members[userId] ?? null
}
