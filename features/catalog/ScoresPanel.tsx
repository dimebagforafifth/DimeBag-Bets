import { useState } from 'react'
import { EVENTS, findEvent, gradeSelection } from '../../sportsbook/markets.js'
import type { GameEvent, MarketKind, Selection } from '../../sportsbook/markets.js'
import type { Outcome } from '../../core/index.js'
import './catalog.css'
import './scores.css'

/**
 * Scores — results board + auto-grading, with manual result entry as the fallback
 * (CLAUDE.md §4 settlement / official-games rules). The read-only board sits over the
 * sportsbook slate (one .cat-score-row per fixture); the live feed grades bets as games
 * finish. Until that feed is wired, the operator can hand-enter a final score and preview
 * the would-be grade for each market.
 *
 * Grading is generic per §3: gradeSelection() turns a final score into a core Outcome
 * (win/loss/push/void); core.resolveWager moves the figure. This panel PREVIEWS those
 * outcomes — it never touches a balance (see the SEAM below).
 */

/** A final score being entered by hand, per market preview. */
interface DraftResult {
  home: string
  away: string
  official: boolean
}

/** One market's would-be outcome under the entered score (both sides graded). */
interface MarketGrade {
  market: MarketKind
  label: string
  outcome: Outcome
}

const EMPTY_DRAFT: DraftResult = { home: '', away: '', official: true }

/** Display copy for a graded outcome. */
const OUTCOME_LABEL: Record<Outcome, string> = {
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  void: 'Void',
}

/**
 * Grade each market on the event under a hand-entered score. We grade the event's two
 * sides per market but report the side the operator would settle from the player's view:
 * we surface every selection so the operator sees the full picture (home/away, over/under).
 */
function previewGrades(event: GameEvent, draft: DraftResult): MarketGrade[] {
  const h = draft.home.trim()
  const a = draft.away.trim()
  const homeNum = Number(h)
  const awayNum = Number(a)
  // Trim first: Number(' ') is 0, not NaN, so a whitespace-only field must be rejected
  // here rather than graded as a real 0.
  const valid = h !== '' && a !== '' && !Number.isNaN(homeNum) && !Number.isNaN(awayNum)
  if (!valid) return []
  const result = { home: homeNum, away: awayNum, official: draft.official }
  return event.selections.map((sel: Selection) => ({
    market: sel.market,
    label: sel.label,
    outcome: gradeSelection(sel, result),
  }))
}

export function ScoresPanel() {
  // Which fixture's manual-entry row is open, and the score being drafted for it.
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftResult>(EMPTY_DRAFT)

  const openEvent = openId ? findEvent(openId) : undefined
  const grades = openEvent ? previewGrades(openEvent, draft) : []

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null)
    } else {
      const ev = findEvent(id)
      // Seed the draft from any score the feed already reported, else blank.
      setDraft(
        ev?.score
          ? { home: String(ev.score.home), away: String(ev.score.away), official: ev.score.official !== false }
          : EMPTY_DRAFT,
      )
      setOpenId(id)
    }
  }

  return (
    <div className="feat">
      <div className="feat-card">
        <h3 className="feat-h">Results &amp; auto-grading</h3>
        <p className="feat-note">
          Bets settle automatically off the live feed as games finish — graders run on the shared
          core (CLAUDE.md §4). Tap a fixture to hand-enter a final score and preview the grade for
          each market when the feed is unavailable.
        </p>
        {/* TODO(api): subscribe to the live scores feed; auto-grade fires as games finish (the
            sportsbook store progresses scores). Until then, manual entry below is the fallback. */}
        <div className="cat-scores">
          <div className="cat-score-row is-head">
            <span>League</span>
            <span>Match</span>
            <span className="cat-num">Score</span>
            <span className="cat-stat">Status</span>
          </div>
          {EVENTS.map((e) => {
            const isOpen = openId === e.id
            return (
              <div key={e.id}>
                <div
                  className={`cat-score-row is-pick${isOpen ? ' is-open' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      toggle(e.id)
                    }
                  }}
                >
                  <span className="cat-league">{e.league}</span>
                  <span className="cat-match">
                    {e.away} <span className="cat-at">@</span> {e.home}
                  </span>
                  <span className="cat-num">
                    {e.score ? `${e.score.away}–${e.score.home}` : '—'}
                  </span>
                  <span className={`cat-stat is-${e.status}`}>{e.status}</span>
                </div>
                {isOpen && (
                  <ResultEntry
                    event={e}
                    draft={draft}
                    grades={grades}
                    onChange={setDraft}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Manual result entry for one fixture: home/away final + an "official" toggle (an
 * unofficial game voids every bet, §4). Submitting previews — does not settle — the grade
 * for each market.
 *
 * SEAM: applying a manual result to settle open tickets routes through core.resolveWager
 * once the Pending/open-ticket store lands (see Ticketwriter SEAM). This panel currently
 * previews grades; it does not yet move figures.
 */
function ResultEntry({
  event,
  draft,
  grades,
  onChange,
}: {
  event: GameEvent
  draft: DraftResult
  grades: MarketGrade[]
  onChange: (d: DraftResult) => void
}) {
  return (
    <div className="cat-result">
      <div className="cat-result-head">
        <span className="cat-result-title">
          {event.away} @ {event.home}
        </span>
        <label className="cat-official">
          <input
            type="checkbox"
            checked={draft.official}
            onChange={(e) => onChange({ ...draft, official: e.target.checked })}
          />
          Official
        </label>
      </div>
      <div className="cat-result-grid">
        <label className="feat-field">
          <span>{event.away} (away)</span>
          <input
            className="feat-input"
            inputMode="numeric"
            value={draft.away}
            onChange={(e) => onChange({ ...draft, away: e.target.value })}
          />
        </label>
        <label className="feat-field">
          <span>{event.home} (home)</span>
          <input
            className="feat-input"
            inputMode="numeric"
            value={draft.home}
            onChange={(e) => onChange({ ...draft, home: e.target.value })}
          />
        </label>
      </div>

      {grades.length > 0 ? (
        <div className="cat-grades">
          {grades.map((g, i) => (
            <div className="cat-grade-row" key={`${g.market}-${i}`}>
              <span className="cat-grade-label">
                <span className="cat-mkt">{g.market}</span>
                {g.label}
              </span>
              <span className={`cat-grade-out is-${g.outcome}`}>{OUTCOME_LABEL[g.outcome]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="feat-empty">Enter both scores to preview each market&rsquo;s grade.</p>
      )}

      <p className="cat-seam">
        Preview only — settling open tickets through core lands with the Pending store.
      </p>
    </div>
  )
}
