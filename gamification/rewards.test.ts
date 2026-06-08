import { describe, it, expect } from 'vitest'
import { onGrant, type Account, type GrantEvent } from '../core/index.js'
import { payFreePlay } from './rewards.js'

const acct = (): Account => ({ id: 'p', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('payFreePlay → core.grant', () => {
  it('credits the account as free-play and emits a grant event (the VIP path)', () => {
    const a = acct()
    const events: GrantEvent[] = []
    const off = onGrant((e) => events.push(e))
    const paid = payFreePlay(a, 250, { source: 'mission', detail: 'm1' })
    off()
    expect(paid).toBe(250)
    expect(a.balance).toBe(250)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ accountId: 'p', cents: 250 })
    expect(events[0].meta).toMatchObject({ kind: 'free-play', module: 'gamification', source: 'mission' })
  })

  it('is a clean no-op for a zero/negative reward (never throws)', () => {
    const a = acct()
    expect(payFreePlay(a, 0, { source: 'wheel' })).toBe(0)
    expect(payFreePlay(a, -5, { source: 'wheel' })).toBe(0)
    expect(a.balance).toBe(0)
  })
})
