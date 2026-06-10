import { useMemo, useState, useSyncExternalStore } from 'react'
import { availableToWager, placeWager, resolveWager } from '../../core/index.js'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { record as recordOpenTicket } from '../operations/open-tickets-store.js'
import { toCents, CENTS } from '../../games/shared/money.js'
import { EVENTS, SPORTS, type GameEvent, type Selection } from '../../sportsbook/markets.js'
import { decimalFromAmerican, formatAmerican } from '../../sportsbook/odds.js'
import './catalog.css'
import './ticketwriter.css'

/**
 * Manual Ticket — write a bet by hand (CLAUDE.md §3, §4). Search a player, optionally
 * BUILD a sportsbook selection (sport → event → market/side from the slate), set a
 * coin stake + multiplier, and either leave the ticket open or grade it on the spot.
 * Everything moves the player's figure ONLY through core (placeWager/resolveWager),
 * so the same limits, locks, and ledger/grant events apply as any other bet.
 *
 * Deepened (per brief):
 *  - Build-a-selection: attach a real slate selection; its label rides the ticket and
 *    its American odds PREFILL the multiplier via decimalFromAmerican (CLAUDE.md §4).
 *  - Odds helper: type American odds (e.g. −110 / +150); we convert to a decimal and
 *    write the multiplier state. The multiplier field stays the single source of truth
 *    that placeWager/resolveWager settle on (a decimal multiplier == core's payout, §3).
 *  - Open ("grade-later") tickets: leave the hold pending in core until graded; a SEAM
 *    note marks where they should later register in the Pending lane.
 *
 * Coins/points language only — no "$" (closed-loop points, CLAUDE.md §1). We format
 * coin amounts locally rather than via formatMoney(), whose operator display config
 * defaults to a "$" mark.
 */
type Settle = 'open' | 'win' | 'loss' | 'push'

/** Format integer cents as a plain coin amount — "1,234.56 coins". Intentionally NOT
 *  formatMoney(): that renders the operator's display symbol (a "$" by default), and a
 *  points-only book must never show a currency mark here (CLAUDE.md §1). */
function coins(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  const num = (Math.abs(cents) / CENTS).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${num} coins`
}

/** Round a raw decimal multiplier to a tidy 2-dp string for the multiplier field. */
function tidyMult(decimal: number): string {
  return (Math.round(decimal * 100) / 100).toFixed(2)
}

export function TicketWriterPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [id, setId] = useState<string | null>(null)
  const [stake, setStake] = useState('10')
  const [mult, setMult] = useState('2.0')
  const [settle, setSettle] = useState<Settle>('win')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [leftOpen, setLeftOpen] = useState(false)

  // Build-a-selection state (all optional — a manual ticket needs none of it).
  const [buildOpen, setBuildOpen] = useState(false)
  const [sport, setSport] = useState<string>(SPORTS[0] ?? '')
  const [eventId, setEventId] = useState<string>('')
  const [sel, setSel] = useState<Selection | null>(null)
  // The American-odds helper input — its own field (class "tw-input"), NOT a
  // .feat-input, so the test's first two .feat-input stay stake + multiplier.
  const [american, setAmerican] = useState('')

  const member = id ? org.members[id] : null

  // Events for the chosen sport — only `upcoming` fixtures are bettable (CLAUDE.md §4).
  const sportEvents = useMemo<GameEvent[]>(
    () => EVENTS.filter((e) => e.sport === sport && e.status === 'upcoming'),
    [sport],
  )
  const chosenEvent = useMemo<GameEvent | null>(
    () => sportEvents.find((e) => e.id === eventId) ?? null,
    [sportEvents, eventId],
  )

  /** Attach a selection: remember it for the ticket + prefill the multiplier from its
   *  American odds (the price the bet locks at, CLAUDE.md §4). */
  function pickSelection(s: Selection) {
    setSel(s)
    setMult(tidyMult(decimalFromAmerican(s.odds)))
    setAmerican('') // the chip is now the source of the price
    setError(null)
  }

  function clearSelection() {
    setSel(null)
  }

  /** Odds helper: American → decimal → multiplier field (the source of truth). Accepts the
   *  Unicode minus (−) the chips + placeholder render, not just an ASCII hyphen. */
  function applyAmerican(raw: string) {
    setAmerican(raw)
    const n = Number(raw.replace(/[−–—]/g, '-'))
    if (raw.trim() !== '' && Number.isFinite(n) && n !== 0) {
      setMult(tidyMult(decimalFromAmerican(n)))
    }
  }

  // Live implied multiplier preview for whatever American odds are typed.
  const impliedMult = useMemo(() => {
    const n = Number(american.replace(/[−–—]/g, '-'))
    if (american.trim() === '' || !Number.isFinite(n) || n === 0) return null
    return tidyMult(decimalFromAmerican(n))
  }, [american])

  function write() {
    setError(null)
    setDone(null)
    setLeftOpen(false)
    if (!member) return
    const acct = member.account
    const stakeCents = toCents(Number(stake) || 0)
    const m = Number(mult)
    if (stakeCents <= 0) return setError('Enter a stake.')
    if ((settle === 'win' || settle === 'open') && !(m > 1))
      return setError('Multiplier must be greater than 1.')
    const tag = sel ? ` on ${sel.label}` : ''
    try {
      const before = acct.balance
      mutateBook(() => {
        const w = placeWager(acct, stakeCents)
        if (settle === 'win') resolveWager(acct, w, 'win', m)
        else if (settle === 'loss') resolveWager(acct, w, 'loss')
        else if (settle === 'push') resolveWager(acct, w, 'push')
        else {
          // 'open' → leave the hold pending until graded later, and register the live
          // gradeable Wager (by reference) + display meta in the shared open-tickets
          // store so it shows up in Operations ▸ Pending with Win/Loss/Push/Void buttons
          // that settle it through core. The hold itself already sits in core.pending.
          recordOpenTicket({
            id: w.id,
            playerId: member.id,
            playerName: member.name,
            wager: w,
            stake: stakeCents,
            multiplier: m,
            description: sel ? sel.label : 'Manual ticket',
            placedAt: Date.now(),
          })
        }
      })
      const delta = acct.balance - before
      if (settle === 'open') {
        setLeftOpen(true)
        setDone(`Open ticket written${tag} — ${coins(stakeCents)} at risk, now in Pending.`)
      } else {
        setDone(
          `Ticket graded ${settle.toUpperCase()}${tag} — figure ${delta >= 0 ? '+' : ''}${coins(delta)}.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="feat">
      <PlayerSearch org={org} onSelect={setId} />
      {member && member.role === 'player' ? (
        <div className="feat-form">
          <h3 className="feat-h">
            Ticket for {member.name}
            <span className="feat-note"> · {coins(availableToWager(member.account))} to wager</span>
          </h3>

          {/* Build-a-selection — optional. Uses .tw-input / chips, never a .feat-input,
              so the stake + multiplier stay the first two .feat-input elements. */}
          <div className="tw-build">
            <div className="tw-build-head">
              <span>Build a selection · optional</span>
              <button
                type="button"
                className="tw-toggle"
                aria-expanded={buildOpen}
                onClick={() => setBuildOpen((o) => !o)}
              >
                {buildOpen ? 'Hide' : 'Attach a game'}
              </button>
            </div>

            {sel && (
              <div className="tw-picked">
                <span className="tw-picked-label">{sel.label}</span>
                <span className="tw-picked-odds">
                  {formatAmerican(sel.odds)} · {tidyMult(decimalFromAmerican(sel.odds))}×
                  <button type="button" className="tw-clear" onClick={clearSelection} title="Detach">
                    ✕
                  </button>
                </span>
              </div>
            )}

            {buildOpen && (
              <>
                <div className="tw-pickers">
                  <label className="tw-field">
                    <span>Sport</span>
                    <select
                      className="tw-input"
                      value={sport}
                      onChange={(e) => {
                        setSport(e.target.value)
                        setEventId('')
                      }}
                    >
                      {SPORTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="tw-field">
                    <span>Event</span>
                    <select
                      className="tw-input"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">Pick a game…</option>
                      {sportEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.away} @ {e.home} · {e.league}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {chosenEvent && (
                  <div className="tw-chips">
                    {chosenEvent.selections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`tw-chip ${sel?.id === s.id ? 'is-on' : ''}`}
                        onClick={() => pickSelection(s)}
                      >
                        <span>{s.label}</span>
                        <span className="tw-chip-odds">{formatAmerican(s.odds)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stake + multiplier MUST be the first two .feat-input (test invariant),
              then the grade <select>. The American-odds helper sits between them but
              uses .tw-input, so it never shifts the .feat-input order. */}
          <div className="cat-ticket-grid">
            <label className="feat-field">
              <span>Stake (coins)</span>
              <input
                className="feat-input"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </label>
            <label className="feat-field">
              <span>Multiplier</span>
              <input
                className="feat-input"
                inputMode="decimal"
                value={mult}
                onChange={(e) => {
                  setMult(e.target.value)
                  setAmerican('') // hand-edits override the odds helper
                }}
              />
            </label>
            <label className="feat-field">
              <span>Grade</span>
              <select
                className="feat-input"
                value={settle}
                onChange={(e) => setSettle(e.target.value as Settle)}
              >
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="push">Push</option>
                <option value="open">Leave open</option>
              </select>
            </label>
          </div>

          {/* Odds helper — type American odds, we write the multiplier (the source of
              truth core settles on). Class is "tw-input", NOT .feat-input. */}
          <div className="tw-odds-helper">
            <label className="tw-field">
              <span>Or enter American odds</span>
              <input
                className="tw-input"
                inputMode="numeric"
                placeholder="e.g. −110 / +150"
                value={american}
                onChange={(e) => applyAmerican(e.target.value)}
              />
            </label>
            <span className="tw-implied">
              {impliedMult ? (
                <>
                  → <b>{impliedMult}×</b> multiplier
                </>
              ) : (
                <>decimal multiplier</>
              )}
            </span>
          </div>

          {done && <p className="feat-ok">{done}</p>}
          {leftOpen && (
            <p className="tw-open-note">
              Left open — now listed in Operations ▸ Pending, ready to grade.
            </p>
          )}
          {error && <p className="feat-err">{error}</p>}
          <div className="feat-actions">
            <button className="feat-btn is-primary" type="button" onClick={write}>
              Write ticket
            </button>
          </div>
        </div>
      ) : (
        <p className="feat-empty">Search a player to write a ticket.</p>
      )}
    </div>
  )
}
