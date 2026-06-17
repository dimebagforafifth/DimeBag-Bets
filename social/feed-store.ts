/**
 * The activity feed — shared bet slips, with reactions + comments and a per-slip privacy
 * flag. The surface that makes the platform feel alive (Rebet/Stake-social): a player
 * shares a slip (or keeps it private), friends react and comment, and one-tap tail it.
 *
 * An in-memory external store (subscribe / version), like app/book/bets-store. A feed card
 * is a SharedSlip snapshot — no money moves here (tail/fade do, through core; see tail.ts).
 *  // SEAM (persistence): swap the in-memory array for a persistedDoc over createStore later.
 */

import type { SlipLeg, SlipMode } from '../app/book/slip.js'
import type { BookBetStatus } from '../app/book/bets-store.js'
import type { Comment, Reaction, SharedSlip, SlipOrigin } from './types.js'

let slips: SharedSlip[] = [] // newest first
let seq = 0
let cseq = 0
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeFeed(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function feedVersion(): number {
  return version
}

export interface ShareSlipInput {
  playerId: string
  playerName: string
  legs: SlipLeg[]
  mode: SlipMode
  stakeCents: number
  decimal: number
  status?: BookBetStatus
  sharedAt: number
  visibility?: 'public' | 'private'
  origin?: SlipOrigin
  reactions?: Reaction[]
  comments?: Comment[]
}

/** Share a slip to the feed (default public). Returns the created card. */
export function shareSlip(input: ShareSlipInput): SharedSlip {
  seq += 1
  const slip: SharedSlip = {
    id: `share-${seq}`,
    playerId: input.playerId,
    playerName: input.playerName,
    legs: input.legs,
    mode: input.mode,
    stakeCents: input.stakeCents,
    decimal: input.decimal,
    status: input.status ?? 'open',
    sharedAt: input.sharedAt,
    visibility: input.visibility ?? 'public',
    reactions: input.reactions ?? [],
    comments: input.comments ?? [],
    ...(input.origin ? { origin: input.origin } : {}),
  }
  slips = [slip, ...slips]
  notify()
  return slip
}

export function getSlip(id: string): SharedSlip | undefined {
  return slips.find((s) => s.id === id)
}

/** Every shared slip, newest first (stable ref between mutations). */
export function allSlips(): SharedSlip[] {
  return slips
}

function mutate(id: string, fn: (s: SharedSlip) => SharedSlip): void {
  let changed = false
  slips = slips.map((s) => {
    if (s.id !== id) return s
    changed = true
    return fn(s)
  })
  if (changed) notify()
}

/**
 * Set a slip's visibility. ONLY the owner may change it — a non-owner viewer is refused
 * (throws), so privacy can't be flipped by anyone else. Public → appears in followers'
 * feeds; private → owner-only.
 */
export function setVisibility(slipId: string, viewerId: string, visibility: 'public' | 'private'): void {
  const slip = getSlip(slipId)
  if (!slip) return
  if (slip.playerId !== viewerId) throw new Error('only the owner can change a slip’s privacy')
  if (slip.visibility === visibility) return
  mutate(slipId, (s) => ({ ...s, visibility }))
}

/** Toggle a player's reaction emoji on a slip (add if absent, remove if present). */
export function toggleReaction(slipId: string, playerId: string, emoji: string): void {
  mutate(slipId, (s) => {
    const has = s.reactions.some((r) => r.playerId === playerId && r.emoji === emoji)
    return {
      ...s,
      reactions: has
        ? s.reactions.filter((r) => !(r.playerId === playerId && r.emoji === emoji))
        : [...s.reactions, { playerId, emoji }],
    }
  })
}

/** Counts per emoji on a slip, e.g. { '🔥': 3, '💰': 1 }. */
export function reactionCounts(slip: SharedSlip): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of slip.reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1
  return counts
}

/** Add a comment to a slip. Returns the created comment (empty text is ignored). */
export function addComment(
  slipId: string,
  playerId: string,
  playerName: string,
  text: string,
  at: number,
): Comment | null {
  const body = text.trim()
  if (!body) return null
  cseq += 1
  const comment: Comment = { id: `c-${cseq}`, playerId, playerName, text: body, at }
  mutate(slipId, (s) => ({ ...s, comments: [...s.comments, comment] }))
  return comment
}

/**
 * The feed for a viewer: every PUBLIC slip from a player the viewer follows, plus the
 * viewer's own slips (public or private), newest first. Private slips of others never
 * appear. `followeeIds` is the viewer's following list (from follows-store) — passed in so
 * the feed store stays decoupled from the graph.
 */
export function feedFor(viewerId: string, followeeIds: readonly string[]): SharedSlip[] {
  const follows = new Set(followeeIds)
  return slips.filter(
    (s) =>
      s.playerId === viewerId || (s.visibility === 'public' && follows.has(s.playerId)),
  )
}

/** Wipe the feed (tests + a fresh demo). */
export function __resetFeed(): void {
  slips = []
  seq = 0
  cseq = 0
  notify()
}
