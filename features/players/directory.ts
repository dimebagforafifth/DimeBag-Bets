/**
 * Player directory + segmentation for Player Admin. Turns the live org roster into the
 * row view-model the admin table renders (status, segment, balance, credit cap, last
 * active), and derives a marketing/risk SEGMENT for each player with an operator override.
 *
 * Segment is derived from credit line + standing (real, from the core account) plus
 * recency and a per-player engagement level (both SYNTHESIZED for now — see the seams in
 * sessions.ts and below), and an operator can pin it by hand (persisted). No agent/hierarchy
 * is read or shown: players only.
 */

import type { Member, Org } from '../../org/index.js'
import { membersByRole } from '../../org/index.js'
import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { rngFor } from './rng.js'
import { lastActiveFor } from './sessions.js'

export const SEGMENTS = ['VIP', 'New', 'Casual', 'Dormant'] as const
export type Segment = (typeof SEGMENTS)[number]

const DORMANT_MS = 14 * 86_400_000
const VIP_CREDIT = 1_000_000 // 10k coins line
const VIP_BALANCE = 100_000 // 1k coins up

/** Pure segment derivation from a player's signals (testable). */
export function deriveSegment(member: Member, lastActive: number | null, now: number): Segment {
  if (lastActive == null || now - lastActive > DORMANT_MS) return 'Dormant'
  if (member.account.creditLimit >= VIP_CREDIT || member.account.balance >= VIP_BALANCE) return 'VIP'
  // SEAM / TODO(api): `engagement` is a stable synthesized proxy keyed by player id. Replace
  // with a real engagement metric (bet count / turnover over a window) when that feed lands.
  const engagement = rngFor(`seg:${member.id}`)() // stable 0..1
  if (engagement < 0.25) return 'New'
  return 'Casual'
}

/* ----------------------- operator override (persisted) ------------------ */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<Record<string, Segment>> = persistedDoc<Record<string, Segment>>(
  store,
  'players.segments',
  { version: 1, initial: {} },
)
let overrides: Record<string, Segment> = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function commit(): void {
  DOC.save(overrides)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeSegments(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getSegmentsVersion(): number {
  return version
}

export function getSegmentOverride(id: string): Segment | null {
  return overrides[id] ?? null
}
export function setSegmentOverride(id: string, seg: Segment | null): void {
  const next = { ...overrides }
  if (seg == null) delete next[id]
  else next[id] = seg
  overrides = next
  commit()
}

/** The segment shown/used: an operator override wins, else the derived one. */
export function effectiveSegment(member: Member, now = Date.now()): Segment {
  return overrides[member.id] ?? deriveSegment(member, lastActiveFor(member.id), now)
}

/* --------------------------- the row view-model ------------------------- */

export interface PlayerRow {
  id: string
  name: string
  segment: Segment
  active: boolean
  locked: boolean
  balance: number
  creditLimit: number
  maxWager: number | null
  lastActive: number | null
}

/** Build admin rows for every player, optionally filtered by a name query + segment. */
export function playerRows(org: Org, query = '', segment: Segment | 'all' = 'all'): PlayerRow[] {
  const now = Date.now()
  const q = query.trim().toLowerCase()
  return membersByRole(org, 'player')
    .map((p) => ({
      id: p.id,
      name: p.name,
      segment: effectiveSegment(p, now),
      active: p.active,
      locked: !!p.account.bettingLocked,
      balance: p.account.balance,
      creditLimit: p.account.creditLimit,
      maxWager: p.account.maxWager ?? null,
      lastActive: lastActiveFor(p.id),
    }))
    .filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
    .filter((r) => (segment === 'all' ? true : r.segment === segment))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Reset segment overrides (tests). */
export function __resetSegments(): void {
  overrides = {}
  commit()
}
