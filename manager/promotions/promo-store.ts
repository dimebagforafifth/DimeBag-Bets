/**
 * The promotions campaign log — a persisted record of every bonus the operator has
 * sent (who, type, per-player, total, when), so the Promotions page shows history.
 * It records intent/metadata only; the money moved through `core.grant` (see
 * send.ts) and is reflected in the figure + the analytics feed. Factory is testable
 * with an injected doc; the singleton persists under the shared 'dimebag' namespace.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import type { BonusType } from './promotions.js'

export interface PromoCampaign {
  id: number
  time: number
  targetId: string
  targetName: string
  type: BonusType
  note?: string
  /** Cents each player received. */
  perPlayer: number
  /** How many players were credited. */
  players: number
  /** Cents across all players. */
  total: number
}

export interface PromoLogDoc {
  seq: number
  campaigns: PromoCampaign[]
}

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

const MAX_CAMPAIGNS = 500

export interface PromoStore {
  /** Sent campaigns, newest first (stable ref). */
  campaigns(): PromoCampaign[]
  add(c: Omit<PromoCampaign, 'id' | 'time'> & { time?: number }): PromoCampaign
  subscribe(listener: () => void): () => void
  version(): number
}

export function createPromoStore(doc: DocLike<PromoLogDoc>, now: () => number = () => Date.now()): PromoStore {
  const state = doc.load()
  const listeners = new Set<() => void>()
  let version = 0
  const notify = (): void => {
    version += 1
    for (const l of listeners) l()
  }
  return {
    campaigns: () => state.campaigns,
    add(c) {
      const full: PromoCampaign = { ...c, id: (state.seq += 1), time: c.time ?? now() }
      state.campaigns.unshift(full) // newest first
      if (state.campaigns.length > MAX_CAMPAIGNS) state.campaigns.length = MAX_CAMPAIGNS
      doc.save(state)
      notify()
      return full
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
const doc = persistedDoc<PromoLogDoc>(kv, 'manager.promos', { version: 1, initial: { seq: 0, campaigns: [] } })

/** The live, persisted campaign log. */
export const promoStore = createPromoStore(doc)
