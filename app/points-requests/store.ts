/**
 * Points requests — the closed-loop "Get points" flow. A player asks for more points;
 * an operator approves (which credits their figure through core via app/manager-actions
 * adjustFigure) or denies. This store holds ONLY the request records (no money path): the
 * operator panel orchestrates the actual grant, then marks the request decided. Persisted
 * under the shared 'dimebag' namespace, mirroring manager/communication's stores.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'

export type PointsRequestStatus = 'pending' | 'approved' | 'denied'

export interface PointsRequest {
  id: number
  /** Epoch ms requested. */
  time: number
  playerId: string
  playerName: string
  /** Requested amount in points-cents (positive whole number). */
  amount: number
  note: string
  status: PointsRequestStatus
  /** Who decided it + when (set on approve/deny). */
  decidedBy?: string
  decidedAt?: number
  /** The amount actually granted on approval (an operator may grant less than asked). */
  grantedAmount?: number
}

export interface PointsRequestsDoc {
  seq: number
  requests: PointsRequest[]
}

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

const MAX_REQUESTS = 500

export interface PointsRequestsStore {
  /** All requests, newest first (stable ref). */
  list(): PointsRequest[]
  /** Pending requests, newest first. */
  pending(): PointsRequest[]
  /** A player's own requests, newest first. */
  forPlayer(playerId: string): PointsRequest[]
  /** File a new request (status 'pending'). Throws on a non-positive / non-integer amount. */
  create(playerId: string, playerName: string, amount: number, note: string): PointsRequest
  /** Mark a pending request decided. The money move is done by the caller (operator panel)
   *  BEFORE calling this, so a failed grant never flips the record to approved. */
  decide(id: number, status: 'approved' | 'denied', by: string, grantedAmount?: number): void
  subscribe(listener: () => void): () => void
  version(): number
}

export function createPointsRequestsStore(
  doc: DocLike<PointsRequestsDoc>,
  now: () => number = () => Date.now(),
): PointsRequestsStore {
  const state = doc.load()
  const listeners = new Set<() => void>()
  let version = 0
  const save = (): void => {
    doc.save(state)
    version += 1
    for (const l of listeners) l()
  }

  return {
    list: () => state.requests,
    pending: () => state.requests.filter((r) => r.status === 'pending'),
    forPlayer: (playerId) => state.requests.filter((r) => r.playerId === playerId),

    create(playerId, playerName, amount, note) {
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('request a positive whole number of points')
      }
      const r: PointsRequest = {
        id: (state.seq += 1),
        time: now(),
        playerId,
        playerName,
        amount,
        note: note.trim().slice(0, 240),
        status: 'pending',
      }
      state.requests.unshift(r)
      if (state.requests.length > MAX_REQUESTS) state.requests.length = MAX_REQUESTS
      save()
      return r
    },

    decide(id, status, by, grantedAmount) {
      const r = state.requests.find((x) => x.id === id)
      if (!r || r.status !== 'pending') return
      r.status = status
      r.decidedBy = by
      r.decidedAt = now()
      if (status === 'approved') r.grantedAmount = grantedAmount ?? r.amount
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
const doc = persistedDoc<PointsRequestsDoc>(kv, 'player.points-requests', {
  version: 1,
  initial: { seq: 0, requests: [] },
})

/** The live, persisted points-requests store. */
export const pointsRequestsStore = createPointsRequestsStore(doc)
