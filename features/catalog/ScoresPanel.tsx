import { EVENTS } from '../../sportsbook/markets.js'
import './catalog.css'

/**
 * Scores — results & auto-grading (NEW panel; no existing component). A read-only board
 * over the sportsbook slate: each fixture with its score + lifecycle status. Grading is
 * automatic — bets settle off the live feed through the shared core as games finish, so
 * this is the operator's at-a-glance results view, not a manual grader.
 *
 * SEAM: shows the current slate; live scores stream once a feed/store is wired in (the
 * existing sportsbook store progresses scores). // TODO(api): subscribe to the live feed.
 */
export function ScoresPanel() {
  return (
    <div className="feat">
      <div className="feat-card">
        <h3 className="feat-h">Results &amp; auto-grading</h3>
        <p className="feat-note">
          Bets settle automatically off the live feed as games finish — graders run on the shared
          core. Scores stream in once games start.
        </p>
        <div className="cat-scores">
          <div className="cat-score-row is-head">
            <span>League</span>
            <span>Match</span>
            <span className="cat-num">Score</span>
            <span className="cat-stat">Status</span>
          </div>
          {EVENTS.map((e) => (
            <div key={e.id} className="cat-score-row">
              <span className="cat-league">{e.league}</span>
              <span className="cat-match">
                {e.away} <span className="cat-at">@</span> {e.home}
              </span>
              <span className="cat-num">{e.score ? `${e.score.away}–${e.score.home}` : '—'}</span>
              <span className={`cat-stat is-${e.status}`}>{e.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
