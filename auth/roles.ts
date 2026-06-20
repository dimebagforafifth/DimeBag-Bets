/**
 * Role → route access (CLAUDE.md §4, §5). The app shell gates its sections on these:
 * a **player** plays (casino / sportsbook / my bets / leaderboard) but never reaches
 * the management console; an **agent / sub-agent** reaches the org console + the
 * manager suite; a **manager** (the operator / super-user) reaches everything, which
 * also lets the demo operator play-as any player for support.
 *
 * This is the single source of truth for both the visible nav and the render guard,
 * so access can't drift between "what's shown" and "what's reachable".
 */

import type { Role } from '../org/index.js'

/** The app's top-level sections. (community/profile/pickem are the round-2 player
 *  sections registered via app/player-sections — added here so the Section state +
 *  render guard accept them and they're reachable by players. players/pools/limits are
 *  the round-3 Community & Contests sections; 'profile' stays additively alongside the
 *  richer 'players' hub.) */
export type Section =
  | 'casino'
  | 'sportsbook'
  | 'rewards'
  | 'mybets'
  | 'leaderboard'
  | 'community'
  | 'profile'
  | 'pickem'
  | 'challenges'
  | 'competitions'
  | 'gamification'
  | 'players'
  | 'pools'
  | 'limits'
  | 'management'

export const ALL_SECTIONS: Section[] = [
  'casino',
  'sportsbook',
  'rewards',
  'mybets',
  'leaderboard',
  'community',
  'profile',
  'pickem',
  'challenges',
  'competitions',
  'gamification',
  'players',
  'pools',
  'limits',
  'management',
]
const PLAYER_SECTIONS: Section[] = [
  'casino',
  'sportsbook',
  'rewards',
  'mybets',
  'leaderboard',
  'community',
  'profile',
  'pickem',
  'challenges',
  'competitions',
  'gamification',
  'players',
  'pools',
  'limits',
]
const STAFF_SECTIONS: Section[] = ['management', 'leaderboard']

/** The sections a role may reach. */
export function allowedSections(role: Role): Section[] {
  switch (role) {
    case 'player':
      return PLAYER_SECTIONS
    case 'agent':
    case 'subagent':
      return STAFF_SECTIONS
    case 'manager':
      return ALL_SECTIONS
  }
}

/** Whether a role may reach a specific section. */
export function canReach(role: Role, section: Section): boolean {
  return allowedSections(role).includes(section)
}

/** Whether a role may open the management console (everyone but a player). */
export function canManage(role: Role): boolean {
  return role !== 'player'
}

/** The section a role lands on by default (first allowed). */
export function defaultSection(role: Role): Section {
  return allowedSections(role)[0]
}
