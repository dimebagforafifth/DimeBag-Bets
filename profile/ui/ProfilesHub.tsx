/**
 * Players hub — the Profile v2 player section. Three surfaces behind tabs: Profile (the rich
 * read-only profile), Discover (players to follow + the scoped leaderboard + follow-by-sport),
 * and Head-to-Head. It subscribes to the composite profile store so it re-renders as the ledger,
 * live bets, follows, privacy, or the community scope change. Read-only throughout — no money.
 */

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { listProfiles } from '../projection.js'
import { profilesVersion, subscribeProfiles } from '../store.js'
import { ProfileView } from './ProfileView.js'
import { Discover } from './Discover.js'
import { HeadToHead } from './HeadToHead.js'
import '../profile.css'

type Tab = 'profile' | 'discover' | 'h2h'
const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'discover', label: 'Discover' },
  { key: 'h2h', label: 'Head-to-Head' },
]

export function ProfilesHub({ viewerId }: { viewerId: string }): ReactNode {
  useSyncExternalStore(subscribeProfiles, profilesVersion, profilesVersion)
  const now = Date.now() // live, so rolling windows stay current as bets settle
  const players = listProfiles()

  const [tab, setTab] = useState<Tab>('profile')
  const defaultOwner = players.some((p) => p.id === viewerId) ? viewerId : (players[0]?.id ?? '')
  const [ownerId, setOwnerId] = useState<string>(defaultOwner)
  // The roster can change (seed/org); fall back if the picked owner is gone.
  const validOwner = players.some((p) => p.id === ownerId) ? ownerId : defaultOwner

  const openProfile = (id: string): void => {
    setOwnerId(id)
    setTab('profile')
  }

  if (!players.length) {
    return (
      <div className="prof-hub">
        <p className="prof-empty">No players to show yet.</p>
      </div>
    )
  }

  return (
    <div className="prof-hub">
      <nav className="prof-tabs" aria-label="Players">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`prof-tab ${tab === t.key ? 'is-on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'profile' && validOwner && (
        <ProfileView
          ownerId={validOwner}
          viewerId={viewerId}
          now={now}
          players={players}
          onPick={setOwnerId}
        />
      )}
      {tab === 'discover' && <Discover viewerId={viewerId} now={now} onOpenProfile={openProfile} />}
      {tab === 'h2h' && <HeadToHead viewerId={viewerId} now={now} players={players} />}
    </div>
  )
}
