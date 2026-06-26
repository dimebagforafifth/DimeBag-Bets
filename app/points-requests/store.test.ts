import { describe, it, expect } from 'vitest'
import { createPointsRequestsStore, type PointsRequestsDoc } from './store.js'

function memDoc() {
  let state: PointsRequestsDoc = { seq: 0, requests: [] }
  return { load: () => state, save: (v: PointsRequestsDoc) => void (state = v) }
}

describe('points-requests store', () => {
  it('files a pending request and validates the amount', () => {
    const s = createPointsRequestsStore(memDoc(), () => 1000)
    const r = s.create('p1', 'Marco', 5000, '  need a top-up  ')
    expect(r.status).toBe('pending')
    expect(r.note).toBe('need a top-up') // trimmed
    expect(s.pending()).toHaveLength(1)
    expect(s.forPlayer('p1')).toHaveLength(1)
    expect(s.forPlayer('p2')).toHaveLength(0)
    expect(() => s.create('p1', 'Marco', 0, '')).toThrow()
    expect(() => s.create('p1', 'Marco', -100, '')).toThrow()
    expect(() => s.create('p1', 'Marco', 1.5, '')).toThrow()
  })

  it('decides only pending requests, and records the granted amount on approve', () => {
    const s = createPointsRequestsStore(memDoc(), () => 1000)
    const r = s.create('p1', 'Marco', 5000, '')
    s.decide(r.id, 'approved', 'operator')
    expect(s.pending()).toHaveLength(0)
    const after = s.list()[0]
    expect(after.status).toBe('approved')
    expect(after.grantedAmount).toBe(5000)
    expect(after.decidedBy).toBe('operator')
    // deciding an already-decided request is a no-op
    s.decide(r.id, 'denied', 'operator')
    expect(s.list()[0].status).toBe('approved')
  })

  it('notifies subscribers on change', () => {
    const s = createPointsRequestsStore(memDoc(), () => 1000)
    let hits = 0
    const off = s.subscribe(() => (hits += 1))
    s.create('p1', 'Marco', 5000, '')
    expect(hits).toBe(1)
    off()
    s.create('p1', 'Marco', 1000, '')
    expect(hits).toBe(1) // unsubscribed
  })
})
