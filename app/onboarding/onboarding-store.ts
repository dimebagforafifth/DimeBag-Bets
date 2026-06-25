/**
 * Player onboarding state — which users have finished the post-sign-up flow, and
 * the game favourites they picked (drives lobby personalisation). Persisted on the
 * same local store the responsible-play limits use, so a player only onboards once
 * and their picks survive reloads. Operator (manager) onboarding completion is
 * tracked separately by app/console/setup-store; this store is the player gate only.
 *
 * No money or core state lives here — it's pure UI/personalisation state, layered
 * on top of the public interfaces (the flow itself calls setLimits / fireTrigger).
 */

import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'

interface OnboardingDoc {
  /** user ids that have completed (or skipped) player onboarding. */
  done: Record<string, true>
  /** favourite game keys per user id — surfaced first in the lobby. */
  favourites: Record<string, string[]>
}

const store = createLocalStore({ namespace: 'dimebag' })
const DOC: Doc<OnboardingDoc> = persistedDoc<OnboardingDoc>(store, 'onboarding.player', {
  version: 1,
  initial: { done: {}, favourites: {} },
})

const state: OnboardingDoc = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOnboardingVersion(): number {
  return version
}

/** Has this user finished (or skipped) player onboarding? */
export function isPlayerOnboarded(userId: string | undefined): boolean {
  return !!userId && state.done[userId] === true
}

/** Mark player onboarding complete for a user (idempotent). */
export function completePlayerOnboarding(userId: string): void {
  if (state.done[userId]) return
  state.done[userId] = true
  DOC.save(state)
  notify()
}

/** The user's pinned game favourites (lobby personalisation). A stable empty list when unset. */
export function getFavourites(userId: string | undefined): string[] {
  return (userId && state.favourites[userId]) || []
}

/** Replace a user's favourites (the onboarding Interests step). */
export function setFavourites(userId: string, keys: string[]): void {
  state.favourites[userId] = [...new Set(keys)]
  DOC.save(state)
  notify()
}
