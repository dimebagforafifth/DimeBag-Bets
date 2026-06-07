/**
 * The communication store — persists book-wide announcements + the webhook config.
 * Factory is testable with an injected doc + clock; the singleton persists under the
 * shared 'dimebag' namespace. It holds messages/config only — sending happens in
 * webhooks.ts, rendering in the player shell (a binding, see README).
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import type { Announcement, AnnouncementDraft } from './announcements.js'
import { EMPTY_WEBHOOKS, type WebhookConfig } from './webhooks.js'

export interface CommsDoc {
  seq: number
  announcements: Announcement[]
  webhooks: WebhookConfig
}

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

const MAX_ANNOUNCEMENTS = 200

export interface CommsStore {
  /** Announcements, newest first (stable ref). */
  announcements(): Announcement[]
  publish(draft: AnnouncementDraft): Announcement
  setActive(id: number, active: boolean): void
  webhooks(): WebhookConfig
  setWebhooks(patch: Partial<WebhookConfig>): void
  subscribe(listener: () => void): () => void
  version(): number
}

export function createCommsStore(doc: DocLike<CommsDoc>, now: () => number = () => Date.now()): CommsStore {
  const state = doc.load()
  if (!state.webhooks) state.webhooks = { ...EMPTY_WEBHOOKS } // tolerate an older doc
  const listeners = new Set<() => void>()
  let version = 0
  const save = (): void => {
    doc.save(state)
    version += 1
    for (const l of listeners) l()
  }

  return {
    announcements: () => state.announcements,

    publish(draft) {
      if (!draft.body.trim()) throw new Error('an announcement needs a message')
      const t = now()
      const a: Announcement = {
        id: (state.seq += 1),
        time: t,
        title: draft.title.trim().slice(0, 80),
        body: draft.body.trim().slice(0, 500),
        severity: draft.severity,
        active: true,
        expiresAt: draft.ttlMs > 0 ? t + draft.ttlMs : 0,
      }
      state.announcements.unshift(a)
      if (state.announcements.length > MAX_ANNOUNCEMENTS) state.announcements.length = MAX_ANNOUNCEMENTS
      save()
      return a
    },

    setActive(id, active) {
      const a = state.announcements.find((x) => x.id === id)
      if (a && a.active !== active) {
        a.active = active
        save()
      }
    },

    webhooks: () => state.webhooks,
    setWebhooks(patch) {
      state.webhooks = { ...state.webhooks, ...patch }
      save()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version: () => version,
  }
}

const kv = createLocalStore({ namespace: 'dimebag' })
const doc = persistedDoc<CommsDoc>(kv, 'manager.comms', {
  version: 1,
  initial: { seq: 0, announcements: [], webhooks: { ...EMPTY_WEBHOOKS } },
})

/** The live, persisted communication store. */
export const commsStore = createCommsStore(doc)
