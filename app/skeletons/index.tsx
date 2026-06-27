/**
 * Skeleton registry for the shell — maps an active section key to the section-shaped
 * skeleton that mirrors its layout. This is the single place the shell reaches for a
 * loading placeholder, so every section's <Suspense> boundary shows the right shape.
 *
 * Coverage is enforced by app/skeletons/coverage.test.ts: every shell Section + every
 * registered player section must have an entry here. A key with no entry falls back to
 * GenericSectionSkeleton (never blank), but the test fails so the author adds a real one.
 */

import type { ReactNode } from 'react'
import {
  LobbySkeleton,
  TableSkeleton,
  BetsSkeleton,
  FeedSkeleton,
  FormSkeleton,
  BookSkeleton,
  DashboardSkeleton,
  ConsoleSkeleton,
  GenericSectionSkeleton,
} from './sections.js'

export {
  LobbySkeleton,
  GameSkeleton,
  TableSkeleton,
  BetsSkeleton,
  FeedSkeleton,
  FormSkeleton,
  BookSkeleton,
  DashboardSkeleton,
  ConsoleSkeleton,
  GenericSectionSkeleton,
} from './sections.js'

/** Section key → a factory for the skeleton that mirrors that section's layout. */
const SECTION_SKELETON: Record<string, () => ReactNode> = {
  // NAV sections (auth/roles Section set)
  casino: () => <LobbySkeleton />,
  sportsbook: () => <BookSkeleton />,
  rewards: () => <DashboardSkeleton label="Loading rewards" />,
  mybets: () => <BetsSkeleton />,
  leaderboard: () => <TableSkeleton label="Loading the leaderboard" />,
  management: () => <ConsoleSkeleton />,
  // Player-section registry keys
  community: () => <FeedSkeleton />,
  players: () => <TableSkeleton label="Loading players" />,
  profile: () => <FormSkeleton />,
  limits: () => <FormSkeleton />,
  pickem: () => <DashboardSkeleton label="Loading Pick'em" />,
  pools: () => <DashboardSkeleton label="Loading pools" />,
  competitions: () => <DashboardSkeleton label="Loading competitions" />,
  challenges: () => <DashboardSkeleton label="Loading challenges" />,
  gamification: () => <DashboardSkeleton label="Loading quests" />,
  referrals: () => <DashboardSkeleton label="Loading referrals" />,
  boosts: () => <DashboardSkeleton label="Loading boosts" />,
  splits: () => <DashboardSkeleton label="Loading splits" />,
}

/**
 * The loading placeholder for a section — the shell's <Suspense fallback>. Returns the
 * section-shaped skeleton, or GenericSectionSkeleton for an unmapped key (never blank).
 */
export function sectionSkeleton(key: string): ReactNode {
  return (SECTION_SKELETON[key] ?? (() => <GenericSectionSkeleton />))()
}

/** Section keys that have a bespoke (non-generic) skeleton. The coverage test asserts
 *  every real section key is present here, so a new section can't ship without one. */
export const MAPPED_SECTION_KEYS: readonly string[] = Object.keys(SECTION_SKELETON)
