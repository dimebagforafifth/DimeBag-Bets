/**
 * The social core's shared types (CLAUDE.md §1 — the moat a real-money book can't build:
 * a book is more fun with your friends in it). Friends/follows, an activity feed of shared
 * bet slips, reactions + comments, and the tail/fade flow.
 *
 * A feed card (`SharedSlip`) is a SNAPSHOT of a slip a player chose to share — the same
 * `SlipLeg[]` + `SlipMode` the book places, so a one-tap "tail" can copy it straight into
 * the real placement path (→ core). No money lives here; the social store carries only the
 * snapshot + reactions/comments. Credits/balance only.
 */

import type { ComponentType } from 'react'
import type { Account } from '../core/index.js'
import type { Role } from '../org/index.js'
import type { SlipLeg, SlipMode } from '../app/book/slip.js'
import type { BookBetStatus } from '../app/book/bets-store.js'

/** A short reaction on a shared slip — one per (player, emoji). */
export interface Reaction {
  playerId: string
  emoji: string
}

/** A short comment on a shared slip. */
export interface Comment {
  id: string
  playerId: string
  playerName: string
  text: string
  at: number
}

/** How a shared slip came to be — a tail/fade of someone else's slip (for the "X tailed
 *  Y" badge). Undefined for an originally-placed slip. */
export interface SlipOrigin {
  kind: 'tail' | 'fade'
  ofSlipId: string
  ofPlayerName: string
}

/**
 * A shared bet slip — one activity-feed card. Embeds the slip snapshot (legs/mode/stake/
 * price/result) so it renders fully and can be tailed without a separate lookup, plus the
 * social layer (who shared it, its privacy, reactions, comments).
 */
export interface SharedSlip {
  id: string
  /** The player whose slip this is. */
  playerId: string
  playerName: string
  legs: SlipLeg[]
  mode: SlipMode
  /** Per-leg stake (singles) or the one parlay stake — integer cents. */
  stakeCents: number
  /** Combined price (parlay) or the single leg's decimal. */
  decimal: number
  /** The slip's result as shared (open while live; won/lost/… once settled). */
  status: BookBetStatus
  sharedAt: number
  /** Public slips appear in followers' feeds; private ones are hidden (owner-only). */
  visibility: 'public' | 'private'
  reactions: Reaction[]
  comments: Comment[]
  origin?: SlipOrigin
}

/** The reactions a player can leave — a small, clean set (no custom emoji clutter). */
export const REACTION_EMOJIS = ['🔥', '💰', '😂', '👀'] as const

/* ─────────────────────── section registry seam ──────────────────────────────
 * There is no dynamic player-section registry in the app shell yet (sections are
 * hardcoded in app/App.tsx + auth/roles.ts). Rather than edit those SHARED files, this
 * module exports a `communitySection` DESCRIPTOR (social/index.ts) describing how to mount
 * the section; the wiring pass adds the ~3 shell lines. See the // SEAM in social/index.ts.
 */

/** Props the app shell passes a player-facing section (mirrors how RewardsSection /
 *  BookView are mounted: the current player's id, name, and core Account). */
export interface PlayerSectionProps {
  viewerId: string
  viewerName: string
  account: Account
  /** Optional: let the shell refresh the figure after a tail/fade moves it (like
   *  BookView's onBalanceChange). Omitted in standalone/tests. */
  onBalanceChange?: () => void
}

/** A self-describing player section a module exposes for the shell/wiring to mount. */
export interface PlayerSectionDescriptor {
  /** Stable section id (also the nav key). */
  id: string
  /** Nav label. */
  label: string
  /** Roles that may reach it. */
  roles: Role[]
  Component: ComponentType<PlayerSectionProps>
}
