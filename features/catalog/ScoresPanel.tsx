import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  applyResults,
  clearResult,
  createMockFeed,
  getResult,
  getResultsVersion,
  setResult,
  subscribeResults,
  voidEvent,
  type GameEvent,
  type ResultOverride,
} from '../../sportsbook/index.js'
import { EVENTS } from '../../sportsbook/markets.js'
import './catalog.css'

/**
 * Scores — results & grading (CLAUDE.md §4). A live board over the sportsbook slate
 * that is ALSO a real operator desk: most games settle automatically off the feed as
 * they finish, but the operator can step in to
 *  - enter or correct a final result by hand (a palpable-error re-settle), or
 *  - void a postponed / abandoned fixture (stake returned to every bet).
 *
 * Both move every player's book: they write the shared results overlay
 * (sportsbook/book/results), which each player's store re-grades through core — the
 * same path the feed uses when a game finals. Coin/points language only.
 */

const describeOverride = (o: ResultOverride): string =>
  o.kind === 'void'
    ? 'Voided by hand — every stake returned'
    : `Graded by hand — final ${o.home}–${o.away} (official)`

export function ScoresPanel() {
  // The live slate from a display feed (each fixture progresses upcoming → live →
  // final on the demo timer). Seeded from the initial slate so the board paints
  // immediately, then the feed takes over.
  const [raw, setRaw] = useState<GameEvent[]>(EVENTS)
  useEffect(() => {
    const feed = createMockFeed()
    setRaw(feed.snapshot())
    const unsub = feed.subscribe(setRaw)
    feed.start()
    return () => {
      unsub()
      feed.stop()
    }
  }, [])
  // Re-render the instant the operator grades/voids/clears (results are global).
  useSyncExternalStore(subscribeResults, getResultsVersion)

  const slate = applyResults(raw)
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="feat">
      <div className="feat-card">
        <h3 className="feat-h">Results &amp; grading</h3>
        <p className="feat-note">
          Bets settle automatically off the live feed as games finish. Step in to enter or correct a
          final result, or void a postponed / abandoned fixture — every open bet on it settles
          through the shared core, stakes returned on a void.
        </p>
        <div className="cat-scores">
          <div className="cat-score-row is-head">
            <span>League</span>
            <span>Match</span>
            <span className="cat-num">Score</span>
            <span className="cat-stat">Status</span>
            <span />
          </div>
          {slate.map((e) => {
            const override = getResult(e.id)
            const open = openId === e.id
            const statusLabel = override?.kind === 'void' ? 'void' : e.status
            return (
              <div key={e.id} className={`cat-score-block ${override ? 'is-managed' : ''}`}>
                <div className="cat-score-row">
                  <span className="cat-league">{e.league}</span>
                  <span className="cat-match">
                    {e.away} <span className="cat-at">@</span> {e.home}
                  </span>
                  <span className="cat-num">
                    {override?.kind === 'void'
                      ? '—'
                      : e.score
                        ? `${e.score.away}–${e.score.home}`
                        : '—'}
                  </span>
                  <span className={`cat-stat is-${statusLabel}`}>
                    {statusLabel}
                    {override && <span className="cat-managed-dot" title="Graded by the operator" />}
                  </span>
                  <button
                    type="button"
                    className={`cat-grade-toggle ${open ? 'is-on' : ''}`}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    Grade
                  </button>
                </div>
                {open && (
                  <FixtureGrader event={e} override={override} onClose={() => setOpenId(null)} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The per-fixture grading control. Every book-moving action takes a second confirm. */
function FixtureGrader({
  event,
  override,
  onClose,
}: {
  event: GameEvent
  override: ResultOverride | undefined
  onClose: () => void
}) {
  const [home, setHome] = useState(String(event.score?.home ?? ''))
  const [away, setAway] = useState(String(event.score?.away ?? ''))
  const [armed, setArmed] = useState<'final' | 'void' | 'clear' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Until the operator types, keep the inputs tracking the live feed score, so when a
  // game finals they're pre-filled with the REAL final — never a stale in-play score.
  const touched = useRef(false)
  const feedHome = event.score?.home
  const feedAway = event.score?.away
  useEffect(() => {
    if (!touched.current && feedHome != null && feedAway != null) {
      setHome(String(feedHome))
      setAway(String(feedAway))
    }
  }, [feedHome, feedAway])
  const edit = (set: (v: string) => void) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    touched.current = true
    set(ev.target.value)
  }

  const markFinal = () => {
    // Blank fields coerce to 0 — don't let an empty form silently grade the book 0–0.
    if (home.trim() === '' || away.trim() === '') {
      setArmed(null)
      setError('Enter a score for both sides before marking final.')
      return
    }
    setError(null)
    try {
      setResult(event.id, Number(home), Number(away)) // validates + settles every book
      onClose()
    } catch (e) {
      setArmed(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="cat-grade">
      {override && (
        <div className="cat-grade-current">
          <span className="cat-grade-current-text">{describeOverride(override)}</span>
          {armed === 'clear' ? (
            <span className="cat-grade-confirm">
              <button
                type="button"
                className="cat-grade-btn is-primary"
                onClick={() => {
                  clearResult(event.id)
                  onClose()
                }}
              >
                Confirm — re-grades off the feed
              </button>
              <button type="button" className="cat-grade-btn" onClick={() => setArmed(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="cat-grade-btn"
              onClick={() => {
                setError(null)
                setArmed('clear')
              }}
            >
              Return to feed
            </button>
          )}
        </div>
      )}

      <div className="cat-grade-form">
        <label className="cat-grade-field">
          <span>Home ({event.home})</span>
          <input
            className="cat-grade-input"
            inputMode="numeric"
            value={home}
            onChange={edit(setHome)}
          />
        </label>
        <label className="cat-grade-field">
          <span>Away ({event.away})</span>
          <input
            className="cat-grade-input"
            inputMode="numeric"
            value={away}
            onChange={edit(setAway)}
          />
        </label>
      </div>

      {error && <p className="feat-err">{error}</p>}

      <div className="cat-grade-actions">
        {armed === 'final' ? (
          <>
            <button type="button" className="cat-grade-btn is-primary" onClick={markFinal}>
              Confirm — settles open bets
            </button>
            <button type="button" className="cat-grade-btn" onClick={() => setArmed(null)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cat-grade-btn is-primary"
            onClick={() => {
              setError(null)
              setArmed('final')
            }}
          >
            {override?.kind === 'final' ? 'Correct result' : 'Mark final'}
          </button>
        )}

        {armed === 'void' ? (
          <>
            <button
              type="button"
              className="cat-grade-btn is-danger"
              onClick={() => {
                setError(null)
                voidEvent(event.id)
                onClose()
              }}
            >
              Confirm void — returns stakes
            </button>
            <button type="button" className="cat-grade-btn" onClick={() => setArmed(null)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cat-grade-btn is-ghost"
            onClick={() => {
              setError(null)
              setArmed('void')
            }}
          >
            Void fixture
          </button>
        )}
      </div>
    </div>
  )
}
