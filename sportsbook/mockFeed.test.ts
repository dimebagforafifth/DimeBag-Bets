import { describe, it, expect } from 'vitest'
import { createMockFeed, stateAt } from './mockFeed.js'
import { EVENTS } from './markets.js'

const script = {
  final: { home: 100, away: 90 },
  liveAfter: 2,
  finalAfter: 6,
  periods: 4,
  periodLabel: 'Q' as const,
}

describe('stateAt progression', () => {
  it('is upcoming before kickoff', () => {
    expect(stateAt(script, 0).status).toBe('upcoming')
    expect(stateAt(script, 1).status).toBe('upcoming')
  })

  it('is live with a climbing score during the game', () => {
    const mid = stateAt(script, 4) // halfway between live(2) and final(6)
    expect(mid.status).toBe('live')
    expect(mid.score).toEqual({ home: 50, away: 45 }) // 50% of the final
    expect(mid.clock).toMatch(/^Q[1-4]$/)
  })

  it('is final at the scripted score once the game ends', () => {
    const end = stateAt(script, 6)
    expect(end.status).toBe('final')
    expect(end.score).toEqual({ home: 100, away: 90 })
    expect(stateAt(script, 99).status).toBe('final') // stays final
  })
})

describe('createMockFeed', () => {
  it('snapshots the whole slate, all upcoming at the start', () => {
    const feed = createMockFeed()
    const slate = feed.snapshot()
    expect(slate).toHaveLength(EVENTS.length)
    expect(slate.every((e) => e.status === 'upcoming')).toBe(true)
  })

  it('lets listeners subscribe and unsubscribe without a timer', () => {
    const feed = createMockFeed()
    let calls = 0
    const off = feed.subscribe(() => (calls += 1))
    off()
    feed.stop() // no-op when never started
    expect(calls).toBe(0)
  })
})
