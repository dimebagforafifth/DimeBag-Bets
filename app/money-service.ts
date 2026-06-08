/**
 * The book's money service — the env-aware, server-ready money seam wired over the
 * LIVE org (CLAUDE.md §3). It is the sanctioned async path for moving a figure:
 *
 *   - With NO Supabase keys it runs `core` in-process over the live book — today's
 *     exact behaviour, just behind the async `MoneyService` interface.
 *   - With keys it becomes SERVER-AUTHORITATIVE: the SECURITY DEFINER RPCs compute and
 *     write the figure, and the browser can never fabricate it (RLS forbids a direct
 *     write). // TODO(api)
 *
 * Why a seam and not a rewrite: there is no central money chokepoint above `core` —
 * the 20 games + the sportsbook each call `core` directly and synchronously, and the
 * provably-fair RNG must stay untouched. Routing those through here would make play
 * async and reaches into other lanes (game logic / player UI), so it is NOT done here.
 * Instead this wires the service over real data and is the path operator money flows
 * (the free-play/grant path VIP uses, manager adjustments, settlement) adopt when the
 * app flips to `await bookMoney.*`. That async cutover is exactly what activates server
 * authority, so it rides the same env switch — keeping no-keys behaviour identical.
 */

import { createMoneyService, type AccountSource, type MoneyService } from '../persistence/index.js'
import { getBook, mutateBook } from './book-store.js'

/**
 * An `AccountSource` over the live org: read a member's `core` Account, and write a
 * mutation back IN PLACE (preserving the stable reference the UI holds) through
 * book-store's `mutateBook`, which persists + notifies — the same path operator
 * mutations already use. The local money service clones on read and hands back the
 * changed account here, so the figure lands on the real book exactly as `core` would.
 */
export const bookAccountSource: AccountSource = {
  get(id) {
    return getBook().members[id]?.account ?? null
  },
  set(account) {
    mutateBook((org) => {
      const m = org.members[account.id]
      if (m) Object.assign(m.account, account)
    })
  },
}

/**
 * THE book money service. Reads the ambient env at construction: local in-process when
 * unconfigured, Supabase RPC when keys are present (the `localSource` is ignored then —
 * the server is authoritative). One async interface either way.
 */
export const bookMoney: MoneyService = createMoneyService({ localSource: bookAccountSource })
