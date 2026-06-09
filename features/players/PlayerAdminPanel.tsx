import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch, PlayerProfile } from '../../org/ui/PlayerLookup.js'
import { getBook, getBookVersion, subscribeBook, getCurrentPlayerId, mutateBook } from '../../app/book-store.js'
import './players.css'

/**
 * Player Admin — accounts & standing (CLAUDE.md §2). Adapts the existing player lookup
 * (org/ui/PlayerLookup): search any player, then their account + play-history profile
 * with the quick lock lever. Player-centric — no agent tree. Renders only the body.
 */
export function PlayerAdminPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [selected, setSelected] = useState<string | null>(getCurrentPlayerId())
  const member = selected ? org.members[selected] : null
  const run = (fn: () => void) => mutateBook(() => fn())

  return (
    <div className="feat">
      <PlayerSearch org={org} onSelect={setSelected} />
      {member && member.role === 'player' ? (
        <PlayerProfile org={org} member={member} currentPlayerId={getCurrentPlayerId()} run={run} />
      ) : (
        <p className="feat-empty">Search a player to view their account and play history.</p>
      )}
    </div>
  )
}
