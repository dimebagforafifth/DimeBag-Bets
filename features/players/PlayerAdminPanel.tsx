import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch, PlayerProfile } from '../../org/ui/PlayerLookup.js'
import {
  getBook,
  getBookVersion,
  subscribeBook,
  getCurrentPlayerId,
  mutateBook,
} from '../../app/book-store.js'
import { ScopeBar, inScope, ALL_SCOPE } from '../_desk/scope.js'
import './players.css'

/**
 * Player Admin — accounts & standing (CLAUDE.md §2). Adapts the existing player lookup
 * (org/ui/PlayerLookup): search any player (scoped to the whole book or one agent's
 * roster), then their account + play-history profile with the quick lock lever.
 */
export function PlayerAdminPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [scope, setScope] = useState(ALL_SCOPE)
  const [selected, setSelected] = useState<string | null>(getCurrentPlayerId())
  const member = selected ? org.members[selected] : null
  const run = (fn: () => void) => mutateBook(() => fn())

  return (
    <div className="feat">
      <ScopeBar org={org} value={scope} onChange={setScope} />
      <PlayerSearch org={org} onSelect={setSelected} restrictTo={inScope(org, scope)} />
      {member && member.role === 'player' ? (
        <PlayerProfile org={org} member={member} currentPlayerId={getCurrentPlayerId()} run={run} />
      ) : (
        <p className="feat-empty">Search a player to view their account and play history.</p>
      )}
    </div>
  )
}
