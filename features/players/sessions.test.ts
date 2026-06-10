// @vitest-environment happy-dom
/** The synthesized player access log is stable and flags shared / suspicious IPs. */
import { describe, it, expect } from 'vitest'
import { listPlayers } from '../../app/book-store.js'
import {
  allSessions,
  sharedIps,
  suspiciousPlayerIds,
  lastActiveFor,
  __resetSessions,
} from './sessions.js'

describe('player sessions / IP log', () => {
  it('builds a stable, newest-first access log for the roster', () => {
    __resetSessions()
    const a = allSessions()
    expect(a).toBe(allSessions()) // cached, stable reference
    expect(a.length).toBeGreaterThan(0)
    for (let i = 1; i < a.length; i++) expect(a[i - 1].at).toBeGreaterThanOrEqual(a[i].at)
  })

  it('flags an IP shared across players and marks those players suspicious', () => {
    __resetSessions()
    const shared = sharedIps()
    expect(shared.size).toBeGreaterThan(0)
    const suspicious = suspiciousPlayerIds()
    const onShared = new Set(
      allSessions()
        .filter((e) => shared.has(e.ip))
        .map((e) => e.playerId),
    )
    expect(onShared.size).toBeGreaterThanOrEqual(2)
    for (const id of onShared) expect(suspicious.has(id)).toBe(true)
  })

  it('lastActiveFor returns a timestamp for an active player', () => {
    __resetSessions()
    expect(typeof lastActiveFor(listPlayers()[0].id)).toBe('number')
  })
})
