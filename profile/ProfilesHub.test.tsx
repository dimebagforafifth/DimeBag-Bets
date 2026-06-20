/**
 * Profile v2 surface tests (happy-dom). Covers the brief's required cases against a STUBBED
 * projection source (known values): the profile renders the projection's figures + cumulative-P&L
 * graph; a followers-only block is hidden from a non-follower and flips on follow; discovery lists
 * rank correctly; head-to-head shows each player's own projection. Read-only — nothing moves money.
 */

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProfileView } from './ui/ProfileView.js'
import { Discover } from './ui/Discover.js'
import { HeadToHead } from './ui/HeadToHead.js'
import { ProfilesHub } from './ui/ProfilesHub.js'
import { resetProfileProjectionSource, setProfileProjectionSource } from './projection.js'
import { __resetPrivacy, resetPrivacySource, setBlockVisibility } from './privacy.js'
import { follow, resetFollowGraphSource } from './follow-graph.js'
import { __resetFollows } from '../social/follows-store.js'
import { __resetCommunitySettings, resetCommunitySettingsSource } from './community-settings.js'
import { fakeSource, mkStats } from './testkit.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = 1_700_000_000_000
let host: HTMLElement
let root: Root

function resetAll(): void {
  resetProfileProjectionSource()
  resetFollowGraphSource()
  resetPrivacySource()
  resetCommunitySettingsSource()
  __resetFollows()
  __resetPrivacy()
  __resetCommunitySettings()
}

beforeEach(() => {
  resetAll()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  resetAll()
})

const text = (): string => host.textContent ?? ''
const single = [{ id: 'o1', name: 'Ava' }]

describe('ProfileView', () => {
  it('renders the projection’s figures and a cumulative-P&L graph', () => {
    const stats = mkStats('o1', {
      name: 'Ava',
      lifetime: { net: 5000, roi: 0.2, wins: 6, losses: 4, winRate: 60, bets: 10, wagered: 25000 },
      units: 4,
      pnl: [
        { time: 1, cumulative: 1000 },
        { time: 2, cumulative: -500 },
        { time: 3, cumulative: 5000 },
      ],
    })
    setProfileProjectionSource(fakeSource({ o1: stats }))
    act(() =>
      root.render(
        <ProfileView ownerId="o1" viewerId="o1" now={NOW} players={single} onPick={() => {}} />,
      ),
    )

    expect(text()).toContain('Ava')
    expect(text()).toContain('+$50.00') // net
    expect(text()).toContain('+20.0%') // roi
    expect(text()).toContain('+4.00u') // units

    const line = host.querySelector('.prof-chart-line')
    expect(line).toBeTruthy()
    const d = line!.getAttribute('d') ?? ''
    expect((d.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(2) // a multi-point curve
    expect(host.querySelector('.prof-chart-final')?.textContent).toContain('+$50.00') // final === net
  })

  it('hides a followers-only block from a non-follower, and reveals it once they follow', () => {
    const stats = mkStats('o1', {
      name: 'Ava',
      lifetime: { net: 5000, winRate: 60, wins: 6, losses: 4 },
    })
    setProfileProjectionSource(fakeSource({ o1: stats }))
    setBlockVisibility('o1', 'stats', 'followers')

    const renderAs = (viewer: string) =>
      act(() =>
        root.render(
          <ProfileView
            ownerId="o1"
            viewerId={viewer}
            now={NOW}
            players={single}
            onPick={() => {}}
          />,
        ),
      )

    renderAs('stranger')
    expect(text()).toContain('Followers only')
    expect(text()).not.toContain('Win rate') // the stats block (and its labels) are hidden
    expect(host.querySelector('.prof-tier')).toBeNull() // tier is stats-derived → also hidden

    act(() => follow('stranger', 'o1'))
    renderAs('stranger')
    expect(text()).toContain('Win rate') // now a follower → block visible
    expect(text()).not.toContain('Followers only')
    expect(host.querySelector('.prof-tier')).toBeTruthy() // tier visible to a follower
  })
})

describe('Discover', () => {
  const map = {
    p1: mkStats('p1', { name: 'P1', week: { roi: 0.3, decided: 5, net: 3000 } }),
    p2: mkStats('p2', { name: 'P2', week: { roi: 0.5, decided: 5, net: 5000 } }),
    p3: mkStats('p3', { name: 'P3', week: { roi: 0.1, decided: 5, net: 1000 } }),
  }

  it('ranks the leaderboard by the metric (ROI this week)', () => {
    setProfileProjectionSource(fakeSource(map))
    act(() => root.render(<Discover viewerId="me" now={NOW} onOpenProfile={() => {}} />))

    const names = [...host.querySelectorAll('.prof-board-name')].map((n) => n.textContent)
    expect(names).toEqual(['P2', 'P1', 'P3'])
  })

  it('keeps a stats-private player off a non-follower’s leaderboard (privacy)', () => {
    setProfileProjectionSource(fakeSource(map))
    setBlockVisibility('p2', 'stats', 'private') // the top-ROI player goes private
    act(() => root.render(<Discover viewerId="me" now={NOW} onOpenProfile={() => {}} />))

    const names = [...host.querySelectorAll('.prof-board-name')].map((n) => n.textContent)
    expect(names).not.toContain('P2')
    expect(names).toEqual(['P1', 'P3'])
  })
})

describe('HeadToHead', () => {
  it('shows each player’s own projection and marks the leader', () => {
    const a = mkStats('a', { name: 'Ava', lifetime: { net: 5000 } })
    const b = mkStats('b', { name: 'Ben', lifetime: { net: -1000 } })
    setProfileProjectionSource(fakeSource({ a, b }))
    act(() =>
      root.render(
        <HeadToHead
          viewerId="a"
          now={NOW}
          players={[
            { id: 'a', name: 'Ava' },
            { id: 'b', name: 'Ben' },
          ]}
        />,
      ),
    )

    const rows = [...host.querySelectorAll('.prof-h2h-row')]
    const netRow = rows.find((r) => r.querySelector('.prof-h2h-metric')?.textContent === 'Net')!
    expect(netRow.querySelector('.prof-h2h-a')?.textContent).toContain('$50.00')
    expect(netRow.querySelector('.prof-h2h-b')?.textContent).toContain('$10.00')
    expect(netRow.querySelector('.prof-h2h-a')?.className).toContain('is-leader')
  })
})

describe('ProfilesHub', () => {
  it('renders the three tabs and lands on the viewer’s profile', () => {
    setProfileProjectionSource(
      fakeSource({ me: mkStats('me', { name: 'Me', lifetime: { net: 5000 } }) }),
    )
    act(() => root.render(<ProfilesHub viewerId="me" />))
    expect(text()).toContain('Profile')
    expect(text()).toContain('Discover')
    expect(text()).toContain('Head-to-Head')
    expect(text()).toContain('Me')
  })
})
