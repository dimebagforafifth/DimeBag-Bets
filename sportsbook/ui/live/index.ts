/**
 * Live / pre-match UI primitives — public surface (CLAUDE.md §2).
 *
 * Drop-in presentational components for a live board: a LIVE/FINAL/kickoff badge,
 * the running score, a price that flashes when it moves, a kickoff countdown, and
 * a feed-status chip. All pure props in — wire them into the sportsbook view as
 * the live feed lands (see sportsdata/vendors for the data side).
 */

export { LiveBadge, LiveScore } from './LiveBadge.js'
export { OddsTick } from './OddsTick.js'
export { KickoffCountdown } from './KickoffCountdown.js'
export { FeedStatus } from './FeedStatus.js'
