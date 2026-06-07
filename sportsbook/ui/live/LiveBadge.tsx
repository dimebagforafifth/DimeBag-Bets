/**
 * Live / pre-match status badges (CLAUDE.md §2, §4). Presentational only — give
 * them a `GameEvent` and they render the right state: a pulsing LIVE chip with
 * the game clock, a FINAL chip, or the kickoff time for an upcoming game. Pure
 * props in, no data fetching, so they drop into any sportsbook view.
 */

import type { GameEvent } from '../../index.js'
import './live.css'

export function LiveBadge({ event }: { event: GameEvent }) {
  if (event.status === 'live') {
    return (
      <span className="live-badge is-live" role="status">
        <span className="live-dot" aria-hidden="true" />
        LIVE{event.clock ? ` · ${event.clock}` : ''}
      </span>
    )
  }
  if (event.status === 'final') {
    return <span className="live-badge is-final">FINAL</span>
  }
  return <span className="live-badge is-upcoming">{event.startsAt}</span>
}

/** The running or final score, when present. Shown away–home to match the
 *  board's "Away @ Home" header, so the numbers line up with the teams above. */
export function LiveScore({ event }: { event: GameEvent }) {
  if (!event.score) return null
  return (
    <span className="live-score" aria-label={`${event.away} ${event.score.away}, ${event.home} ${event.score.home}`}>
      <span className="live-score-num">{event.score.away}</span>
      <span className="live-score-sep">–</span>
      <span className="live-score-num">{event.score.home}</span>
    </span>
  )
}
