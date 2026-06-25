// @vitest-environment happy-dom
/**
 * The player-onboarding store: one-time completion + favourite game picks, keyed by
 * the auth user id and persisted on the shared local store. These guard the gate
 * (main.tsx) and the lobby personalisation (App.tsx) — a user onboards once, and
 * their picks survive a reload.
 */
import { describe, expect, it } from 'vitest'
import {
  isPlayerOnboarded,
  completePlayerOnboarding,
  getFavourites,
  setFavourites,
  getOnboardingVersion,
} from './onboarding-store.js'

describe('player onboarding store', () => {
  it('reports a fresh user as not onboarded, then onboarded after completion', () => {
    const u = 'user-fresh-1'
    expect(isPlayerOnboarded(u)).toBe(false)
    completePlayerOnboarding(u)
    expect(isPlayerOnboarded(u)).toBe(true)
  })

  it('treats an undefined user id as not onboarded (the loading/no-session case)', () => {
    expect(isPlayerOnboarded(undefined)).toBe(false)
    expect(getFavourites(undefined)).toEqual([])
  })

  it('completion is idempotent and bumps the version only on a real change', () => {
    const u = 'user-idem-2'
    completePlayerOnboarding(u)
    const v1 = getOnboardingVersion()
    completePlayerOnboarding(u) // already done → no change, no notify
    expect(getOnboardingVersion()).toBe(v1)
    expect(isPlayerOnboarded(u)).toBe(true)
  })

  it('stores and de-dupes a user’s favourite picks', () => {
    const u = 'user-favs-3'
    expect(getFavourites(u)).toEqual([])
    setFavourites(u, ['mines', 'crash', 'mines', 'plinko'])
    expect(getFavourites(u)).toEqual(['mines', 'crash', 'plinko'])
  })

  it('keeps favourites per-user (no leakage between users)', () => {
    setFavourites('user-a-4', ['dice'])
    setFavourites('user-b-4', ['keno', 'wheel'])
    expect(getFavourites('user-a-4')).toEqual(['dice'])
    expect(getFavourites('user-b-4')).toEqual(['keno', 'wheel'])
  })

  it('bumps the subscribe version when favourites change', () => {
    const before = getOnboardingVersion()
    setFavourites('user-ver-5', ['limbo'])
    expect(getOnboardingVersion()).toBeGreaterThan(before)
  })
})
