import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { ALL_PLAYERS, inboxFor, type PlayerMessage } from './messages.js'
import { createMessagesStore, type MessagesDoc } from './messages-store.js'

const m = (o: Partial<PlayerMessage>): PlayerMessage => ({
  id: 1,
  time: 0,
  recipientId: 'p1',
  recipientName: 'P1',
  title: 't',
  body: 'b',
  ...o,
})

describe('inboxFor', () => {
  it('returns a player’s DMs plus broadcasts', () => {
    const list = [m({ id: 1, recipientId: 'p1' }), m({ id: 2, recipientId: 'p2' }), m({ id: 3, recipientId: ALL_PLAYERS })]
    expect(inboxFor(list, 'p1').map((x) => x.id)).toEqual([1, 3])
  })
})

describe('createMessagesStore', () => {
  function fresh(kv = createMemoryStore(), now: () => number = () => 11) {
    const doc = persistedDoc<MessagesDoc>(kv, 'msg', { version: 1, initial: { seq: 0, messages: [] } })
    return { kv, store: createMessagesStore(doc, now) }
  }

  it('sends newest-first and rejects an empty body', () => {
    const { store } = fresh()
    const a = store.send('p1', 'P1', 'Hi', 'hello')
    expect(a).toMatchObject({ id: 1, time: 11, recipientId: 'p1' })
    store.send(ALL_PLAYERS, 'All players', '', 'broadcast')
    expect(store.messages().map((x) => x.recipientId)).toEqual([ALL_PLAYERS, 'p1'])
    expect(() => store.send('p1', 'P1', 'x', '   ')).toThrow(/needs a body/)
  })

  it('persists across a reload', () => {
    const kv = createMemoryStore()
    fresh(kv).store.send('p1', 'P1', 't', 'keep me')
    expect(fresh(kv).store.messages()).toHaveLength(1)
  })
})
