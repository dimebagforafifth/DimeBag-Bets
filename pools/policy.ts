/**
 * Operator policy for pools/leagues — a manager-gated, persisted config the pool-create path
 * reads as policy (allow/deny player-created pools, format + entry caps, optional rake). Holds
 * NO money: it only gates/clamps what a create is allowed to do; stakes still move through core.
 * localStorage by default, Supabase when keyed — byte-identical with no keys.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { getViewer } from '../app/viewer.js'
import { FORMAT_KINDS } from './formats/index.js'
import type { PoolKind } from './types.js'

export interface PoolsPolicy {
  /** May PLAYERS create pools? Operators always can. */
  allowPlayerPools: boolean
  /** Max entry fee (cents) a player-created pool may charge; 0 = no cap. */
  maxEntryCents: number
  /** Which formats players may create. */
  allowedFormats: PoolKind[]
  /** Cap on entrants for a player-created pool; null = unlimited. */
  maxEntries: number | null
  /** Default operator rake (bps) stamped on new pools. */
  rakeBps: number
  /** Ceiling on any pool's rake (bps) — a creator can't exceed it. */
  maxRakeBps: number
}

export const DEFAULT_POOLS_POLICY: PoolsPolicy = {
  allowPlayerPools: true,
  maxEntryCents: 50_000, // $500
  allowedFormats: [...FORMAT_KINDS],
  maxEntries: null,
  rakeBps: 0,
  maxRakeBps: 1_000, // 10%
}

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<PoolsPolicy> = persistedDoc<PoolsPolicy>(store, 'pools.policy', {
  version: 1,
  initial: DEFAULT_POOLS_POLICY,
})

let policy: PoolsPolicy = load()
let version = 0
const listeners = new Set<() => void>()

function load(): PoolsPolicy {
  const doc = DOC.load() ?? DEFAULT_POOLS_POLICY
  return { ...DEFAULT_POOLS_POLICY, ...doc }
}
function notify(): void {
  DOC.save(policy)
  version += 1
  for (const l of listeners) l()
}

export function subscribePoolsPolicy(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getPoolsPolicyVersion(): number {
  return version
}
export function getPoolsPolicy(): PoolsPolicy {
  return policy
}
export function canSetPoolsPolicy(): boolean {
  return getViewer().role === 'manager'
}

/** Are players allowed to create pools right now? Operators always may. */
export function poolCreationAllowed(creatorIsOperator: boolean): boolean {
  return creatorIsOperator || policy.allowPlayerPools
}

/** Update the policy (manager only). Validates every field. */
export function updatePoolsPolicy(patch: Partial<PoolsPolicy>): PoolsPolicy {
  if (getViewer().role !== 'manager') throw new Error('only the manager can change pool policy')
  const next: PoolsPolicy = { ...policy, ...patch }
  if (!Number.isInteger(next.maxEntryCents) || next.maxEntryCents < 0)
    throw new Error('max entry must be whole cents ≥ 0')
  if (!Number.isInteger(next.rakeBps) || next.rakeBps < 0 || next.rakeBps > 10_000)
    throw new Error('rake must be 0–10000 bps')
  if (!Number.isInteger(next.maxRakeBps) || next.maxRakeBps < 0 || next.maxRakeBps > 10_000)
    throw new Error('max rake must be 0–10000 bps')
  if (next.maxEntries !== null && (!Number.isInteger(next.maxEntries) || next.maxEntries < 1))
    throw new Error('max entries must be a positive integer or unlimited')
  for (const f of next.allowedFormats) {
    if (!FORMAT_KINDS.includes(f as (typeof FORMAT_KINDS)[number]))
      throw new Error(`unknown format "${f}"`)
  }
  policy = next
  notify()
  return next
}

export function __resetPoolsPolicy(): void {
  policy = { ...DEFAULT_POOLS_POLICY, allowedFormats: [...FORMAT_KINDS] }
  notify()
}
