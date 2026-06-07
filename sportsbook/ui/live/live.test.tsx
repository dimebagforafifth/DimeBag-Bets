// @vitest-environment happy-dom
/**
 * The live board primitives (CLAUDE.md §2) render correctly against the data the
 * mock feed produces — the LIVE/FINAL/kickoff badge, the score, the price-move
 * tick, the kickoff countdown, and the feed-status chip. These are the single
 * source of truth the sportsbook screen now wires in. Pure props in, so we feed
 * them mock-feed-shaped events and the real feed's health.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMockFeed, type GameEvent } from '../../index.js'
import { LiveBadge, LiveScore } from './LiveBadge.js'
import { OddsTick } from './OddsTick.js'
import { KickoffCountdown } from './KickoffCountdown.js'
import { FeedStatus } from './FeedStatus.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const render = (node: React.ReactNode) => act(() => root.render(node))

/** An upcoming event straight off the mock feed's slate. */
const upcoming = (): GameEvent => createMockFeed().snapshot()[0]
/** A live/final variant — the exact shape the mock feed emits as a game progresses. */
const live = (): GameEvent => ({ ...upcoming(), status: 'live', clock: 'Q3', score: { home: 88, away: 80 }, progress: 0.6 })
const final = (): GameEvent => ({ ...upcoming(), status: 'final', score: { home: 101, away: 99, official: true } })

describe('LiveBadge', () => {
  it('shows the kickoff label for an upcoming game', () => {
    const e = upcoming()
    render(<LiveBadge event={e} />)
    const badge = host.querySelector('.live-badge')!
    expect(badge.classList.contains('is-upcoming')).toBe(true)
    expect(badge.textContent).toBe(e.startsAt)
  })

  it('shows a pulsing LIVE chip with the game clock while live', () => {
    render(<LiveBadge event={live()} />)
    const badge = host.querySelector('.live-badge')!
    expect(badge.classList.contains('is-live')).toBe(true)
    expect(badge.querySelector('.live-dot')).not.toBeNull()
    expect(badge.textContent).toMatch(/LIVE/)
    expect(badge.textContent).toMatch(/Q3/)
  })

  it('shows FINAL when the game is over', () => {
    render(<LiveBadge event={final()} />)
    const badge = host.querySelector('.live-badge')!
    expect(badge.classList.contains('is-final')).toBe(true)
    expect(badge.textContent).toBe('FINAL')
  })
})

describe('LiveScore', () => {
  it('renders away–home to match the board layout, and nothing before kickoff', () => {
    render(<LiveScore event={live()} />)
    const score = host.querySelector('.live-score')!
    // away (80) first, then home (88)
    expect(score.textContent).toBe('80–88')

    render(<LiveScore event={upcoming()} />)
    expect(host.querySelector('.live-score')).toBeNull() // no score yet
  })
})

describe('OddsTick', () => {
  it('flashes ▲ when the price rises and ▼ when it falls', () => {
    render(<OddsTick value={2.0} format={(v) => v.toFixed(2)} />)
    let tick = host.querySelector('.odds-tick')!
    expect(tick.textContent).toBe('2.00')
    expect(tick.querySelector('.tick-arrow')).toBeNull() // first render: no move

    render(<OddsTick value={2.5} format={(v) => v.toFixed(2)} />)
    tick = host.querySelector('.odds-tick')!
    expect(tick.classList.contains('tick-up')).toBe(true)
    expect(tick.querySelector('.tick-arrow')?.textContent).toBe('▲')

    render(<OddsTick value={1.8} format={(v) => v.toFixed(2)} />)
    tick = host.querySelector('.odds-tick')!
    expect(tick.classList.contains('tick-down')).toBe(true)
    expect(tick.querySelector('.tick-arrow')?.textContent).toBe('▼')
  })
})

describe('KickoffCountdown', () => {
  it('counts down from a real ISO kickoff time', () => {
    const iso = new Date(Date.now() + 90 * 60 * 1000).toISOString() // 90 minutes out
    render(<KickoffCountdown kickoff={iso} />)
    expect(host.querySelector('.kickoff-countdown')?.textContent).toMatch(/Starts in/)
  })

  it('renders nothing for a non-ISO label (the mock feed ships a display string)', () => {
    // The mock slate's `startsAt` is "Today 7:30 PM" — a label, not a timestamp —
    // so a live countdown waits on the feed carrying an ISO commence time.
    render(<KickoffCountdown kickoff={upcoming().startsAt} />)
    expect(host.querySelector('.kickoff-countdown')).toBeNull()
  })
})

describe('FeedStatus', () => {
  it('reflects the mock feed health channel: idle, then connecting on start', () => {
    const feed = createMockFeed()
    render(<FeedStatus health={feed.getHealth!()} />)
    expect(host.querySelector('.feed-status')?.classList.contains('is-idle')).toBe(true)
    expect(host.querySelector('.feed-label')?.textContent).toBe('Idle')

    feed.start()
    render(<FeedStatus health={feed.getHealth!()} />)
    expect(host.querySelector('.feed-status')?.classList.contains('is-connecting')).toBe(true)
    expect(host.querySelector('.feed-label')?.textContent).toBe('Connecting…')
    feed.stop()
  })

  it('shows a Live chip with freshness, and an Offline chip when reconnecting/down', () => {
    render(<FeedStatus health={{ status: 'live', lastUpdated: Date.now() }} />)
    expect(host.querySelector('.feed-status')?.classList.contains('is-live')).toBe(true)
    expect(host.querySelector('.feed-label')?.textContent).toBe('Live')
    expect(host.querySelector('.feed-ago')?.textContent).toMatch(/ago|just now/)

    render(<FeedStatus health={{ status: 'reconnecting', lastUpdated: null }} />)
    expect(host.querySelector('.feed-status')?.classList.contains('is-reconnecting')).toBe(true)
    expect(host.querySelector('.feed-label')?.textContent).toBe('Reconnecting…')
  })

  it('supports the simple boolean API + quota for a feed with no health channel', () => {
    render(<FeedStatus connected={false} quotaRemaining={4200} />)
    expect(host.querySelector('.feed-status')?.classList.contains('is-error')).toBe(true)
    expect(host.querySelector('.feed-label')?.textContent).toBe('Offline')
    expect(host.querySelector('.feed-quota')?.textContent).toMatch(/4,200 reqs left/)
  })
})
