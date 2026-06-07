import { describe, it, expect } from 'vitest'
import { isLiveApi, isUpcomingApi, filterSlate, combineFeeds } from './feedTools.js'
import type { ApiEvent } from '../types.js'
import type { GameEvent, SportsbookFeed } from '../../sportsbook/index.js'

const apiEvent = (id: string, over: Partial<ApiEvent> = {}): ApiEvent => ({
  id,
  sport_title: 'NBA',
  home_team: 'A',
  away_team: 'B',
  commence_time: 't',
  bookmakers: [],
  ...over,
})

describe('live / upcoming predicates', () => {
  it('detects live by score, upcoming by absence', () => {
    const live = apiEvent('g1', { scores: [{ name: 'A', score: 10 }] })
    const pre = apiEvent('g2')
    const done = apiEvent('g3', { completed: true, scores: [{ name: 'A', score: 100 }] })
    expect(isLiveApi(live)).toBe(true)
    expect(isUpcomingApi(live)).toBe(false)
    expect(isUpcomingApi(pre)).toBe(true)
    expect(isLiveApi(pre)).toBe(false)
    expect(isLiveApi(done)).toBe(false) // completed
  })

  it('honours an explicit status', () => {
    expect(isLiveApi(apiEvent('g', { status: 'live' }))).toBe(true)
    expect(isUpcomingApi(apiEvent('g', { status: 'upcoming' }))).toBe(true)
  })
})

describe('filterSlate', () => {
  it('narrows a fetchSlate to matching events', async () => {
    const slate = async () => [
      apiEvent('live', { scores: [{ name: 'A', score: 1 }] }),
      apiEvent('pre'),
    ]
    expect(await filterSlate(slate, isLiveApi)()).toHaveLength(1)
    expect((await filterSlate(slate, isUpcomingApi)())[0].id).toBe('pre')
  })
})

/** A tiny manual feed for combine tests. */
function fakeFeed(initial: GameEvent[]): SportsbookFeed & { push(events: GameEvent[]): void; started: boolean } {
  let slate = initial
  let started = false
  const listeners = new Set<(e: GameEvent[]) => void>()
  return {
    snapshot: () => slate,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    start() {
      started = true
    },
    stop() {
      started = false
    },
    push(events: GameEvent[]) {
      slate = events
      listeners.forEach((l) => l(slate))
    },
    get started() {
      return started
    },
  } as SportsbookFeed & { push(events: GameEvent[]): void; started: boolean }
}

const ge = (id: string, status: GameEvent['status'] = 'live'): GameEvent => ({
  id,
  sport: 'Basketball',
  league: 'NBA',
  home: 'A',
  away: 'B',
  startsAt: 't',
  status,
  selections: [],
})

describe('combineFeeds', () => {
  it('unions snapshots by id, later feeds winning on a clash', () => {
    const a = fakeFeed([ge('shared', 'upcoming'), ge('onlyA')])
    const b = fakeFeed([ge('shared', 'live'), ge('onlyB')])
    const combined = combineFeeds(a, b) // b listed last → wins on 'shared'
    const snap = combined.snapshot()
    expect(snap.map((e) => e.id).sort()).toEqual(['onlyA', 'onlyB', 'shared'])
    expect(snap.find((e) => e.id === 'shared')!.status).toBe('live')
  })

  it('re-emits the merged slate when any child updates, and fans out start/stop', () => {
    const a = fakeFeed([ge('a')])
    const b = fakeFeed([ge('b')])
    const combined = combineFeeds(a, b)
    let pushed: GameEvent[] = []
    combined.subscribe((e) => (pushed = e))
    combined.start()
    expect((a as unknown as { started: boolean }).started).toBe(true)
    ;(b as unknown as { push(e: GameEvent[]): void }).push([ge('b'), ge('b2')])
    expect(pushed.map((e) => e.id).sort()).toEqual(['a', 'b', 'b2'])
    combined.stop()
    expect((a as unknown as { started: boolean }).started).toBe(false)
  })

  it('is idempotent on repeated start (no duplicate emissions)', () => {
    const a = fakeFeed([ge('a')])
    const combined = combineFeeds(a)
    let count = 0
    combined.subscribe(() => (count += 1))
    combined.start()
    combined.start() // second start must not double-wire
    ;(a as unknown as { push(e: GameEvent[]): void }).push([ge('a'), ge('a2')])
    expect(count).toBe(1) // exactly one emission, not two
  })
})
