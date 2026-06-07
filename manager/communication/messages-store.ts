/**
 * The player-messages store — persisted operator → player messages (DMs +
 * broadcasts). Factory is testable with an injected doc + clock; the singleton
 * persists under the shared 'dimebag' namespace. Holds messages only; the player
 * shell renders inboxes via messages.inboxFor.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import type { PlayerMessage } from './messages.js'

export interface MessagesDoc {
  seq: number
  messages: PlayerMessage[]
}

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

const MAX_MESSAGES = 500

export interface MessagesStore {
  /** Sent messages, newest first (stable ref). */
  messages(): PlayerMessage[]
  send(recipientId: string, recipientName: string, title: string, body: string): PlayerMessage
  subscribe(listener: () => void): () => void
  version(): number
}

export function createMessagesStore(doc: DocLike<MessagesDoc>, now: () => number = () => Date.now()): MessagesStore {
  const state = doc.load()
  const listeners = new Set<() => void>()
  let version = 0
  const save = (): void => {
    doc.save(state)
    version += 1
    for (const l of listeners) l()
  }

  return {
    messages: () => state.messages,

    send(recipientId, recipientName, title, body) {
      if (!body.trim()) throw new Error('a message needs a body')
      const m: PlayerMessage = {
        id: (state.seq += 1),
        time: now(),
        recipientId,
        recipientName,
        title: title.trim().slice(0, 80),
        body: body.trim().slice(0, 500),
      }
      state.messages.unshift(m)
      if (state.messages.length > MAX_MESSAGES) state.messages.length = MAX_MESSAGES
      save()
      return m
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
const doc = persistedDoc<MessagesDoc>(kv, 'manager.messages', { version: 1, initial: { seq: 0, messages: [] } })

/** The live, persisted messages store. */
export const messagesStore = createMessagesStore(doc)
