// @vitest-environment happy-dom
/**
 * ProfileStatsCard renders the projection end-to-end and respects privacy: a followers-only
 * profile shows the gated message to a non-follower.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { rebuild, __resetProjection } from './projection-store.js'
import { setVisibility, __resetPrivacy } from './privacy.js'
import { __resetFollows } from '../social/follows-store.js'
import { __resetFollowEdges } from './follow-graph.js'
import { ProfileStatsCard } from './ProfileStatsCard.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
function render(node: React.ReactNode): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

beforeEach(() => {
  __resetProjection() // seed ON by default → seeded players have stats
  __resetPrivacy()
  __resetFollows()
  __resetFollowEdges()
  rebuild(Date.now())
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
})

describe('ProfileStatsCard', () => {
  it('renders a public profile’s stats (window controls present)', () => {
    const host = render(<ProfileStatsCard playerId="p-marco" name="Marco" viewerId="p-marco" />)
    expect(host.textContent).toContain('Marco')
    expect(host.textContent).toContain('All-time') // window control
    expect(host.textContent).toContain('Net')
  })

  it('hides a followers-only profile from a non-follower', () => {
    setVisibility('p-marco', 'stats', 'followers')
    const host = render(<ProfileStatsCard playerId="p-marco" name="Marco" viewerId="stranger" />)
    expect(host.textContent).toContain('followers only')
    expect(host.textContent).not.toContain('Net')
  })
})
