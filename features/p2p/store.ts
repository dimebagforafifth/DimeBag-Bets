/**
 * The app-wide singletons the Challenges section and its seed share — one account book and one
 * challenge store (mirroring how social/ keeps module-level stores). Tests that want isolation
 * use the `createChallengeStore` / `createAccountBook` factories directly; the live section uses
 * these singletons and registers the viewer's REAL core account into the book on mount.
 */

import type { Account } from '../../core/index.js'
import { createAccountBook, createChallengeStore } from './challenge-store.js'

/** playerId → live core Account (seed players + the live viewer). */
export const accountBook = createAccountBook()

/** The shared challenge store, backed by the account book above. */
export const challenges = createChallengeStore(accountBook)

/** Register a player's real core account so challenges they're a party to can escrow via core. */
export function registerAccount(playerId: string, account: Account): void {
  accountBook.set(playerId, account)
}
