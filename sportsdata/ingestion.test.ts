import { describe, it, expect } from 'vitest'
import { createIngestionPoller } from './ingestion.js'
import { createMockProvider, makeProvider, MOCK_SLATE } from './vendors/index.js'
import type { GameEvent } from '../sportsbook/index.js'

const noTimers = { setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }

describe('createIngestionPoller', () => {
  it('pulls a vendor, normalizes to GameEvent[], and hands it to onSlate', async () => {
    const slates: GameEvent[][] = []
    const poller = createIngestionPoller({
      provider: createMockProvider(),
      onSlate: (e) => slates.push(e),
      ...noTimers,
    })
    await poller.refresh()
    expect(slates).toHaveLength(1)
    // normalized internal events, not vendor DTOs
    expect(slates[0][0]).toHaveProperty('selections')
    expect(slates[0].find((e) => e.id === 'mock-epl-ars-mci')?.status).toBe('final')
    expect(poller.getHealth().status).toBe('live')
  })

  it('reports vendor quota usage after each pull', async () => {
    const seen: Array<{ vendor: string; remaining: number | null }> = []
    const provider = makeProvider({
      name: 'spy',
      fetchOdds: async () => [],
      usage: () => ({ remaining: 250, used: 50 }),
    })
    const poller = createIngestionPoller({
      provider,
      onSlate: () => {},
      onUsage: (vendor, quota) => seen.push({ vendor, remaining: quota?.remaining ?? null }),
      ...noTimers,
    })
    await poller.refresh()
    expect(seen).toEqual([{ vendor: 'spy', remaining: 250 }])
  })

  it('keeps the last slate and degrades health on a failed pull', async () => {
    let fail = false
    const provider = makeProvider({
      name: 'flaky',
      fetchOdds: async () => {
        if (fail) throw new Error('vendor 503')
        return MOCK_SLATE
      },
    })
    let errors = 0
    const poller = createIngestionPoller({
      provider,
      onSlate: () => {},
      onError: () => (errors += 1),
      ...noTimers,
    })
    await poller.refresh() // ok → live
    expect(poller.getHealth().status).toBe('live')
    fail = true
    await poller.refresh() // fails → reconnecting (had data before), onError fired
    expect(errors).toBe(1)
    expect(poller.getHealth().status).toBe('reconnecting')
  })
})
