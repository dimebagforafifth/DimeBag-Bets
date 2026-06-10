import { useState, useSyncExternalStore } from 'react'
import { availableToWager, placeWager, resolveWager } from '../../core/index.js'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import './catalog.css'

/**
 * Manual Ticket — write a bet by hand (NEW panel; no existing component). Search a
 * player, set a stake + multiplier, and either leave the ticket open or grade it on the
 * spot. Everything moves the player's figure ONLY through core (placeWager/resolveWager),
 * so the same limits, locks, and ledger/grant events apply as any other bet. Coin/points
 * language only.
 */
type Settle = 'open' | 'win' | 'loss' | 'push'

export function TicketWriterPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [id, setId] = useState<string | null>(null)
  const [stake, setStake] = useState('10')
  const [mult, setMult] = useState('2.0')
  const [settle, setSettle] = useState<Settle>('win')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const member = id ? org.members[id] : null

  function write() {
    setError(null)
    setDone(null)
    if (!member) return
    const acct = member.account
    const stakeCents = toCents(Number(stake) || 0)
    const m = Number(mult)
    if (stakeCents <= 0) return setError('Enter a stake.')
    if ((settle === 'win' || settle === 'open') && !(m > 1)) return setError('Multiplier must be greater than 1.')
    try {
      const before = acct.balance
      mutateBook(() => {
        const w = placeWager(acct, stakeCents)
        if (settle === 'win') resolveWager(acct, w, 'win', m)
        else if (settle === 'loss') resolveWager(acct, w, 'loss')
        else if (settle === 'push') resolveWager(acct, w, 'push')
        // 'open' → leave the hold pending until graded later
      })
      const delta = acct.balance - before
      setDone(
        settle === 'open'
          ? `Open ticket written — ${formatMoney(stakeCents)} at risk.`
          : `Ticket graded ${settle.toUpperCase()} — figure ${delta >= 0 ? '+' : ''}${formatMoney(delta)}.`,
      )
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
            <span className="feat-note"> · {formatMoney(availableToWager(member.account))} to wager</span>
          </h3>
          <div className="cat-ticket-grid">
            <label className="feat-field">
              <span>Stake (coins)</span>
              <input className="feat-input" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
            <label className="feat-field">
              <span>Multiplier</span>
              <input className="feat-input" inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} />
            </label>
            <label className="feat-field">
              <span>Grade</span>
              <select className="feat-input" value={settle} onChange={(e) => setSettle(e.target.value as Settle)}>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="push">Push</option>
                <option value="open">Leave open</option>
              </select>
            </label>
          </div>
          {done && <p className="feat-ok">{done}</p>}
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
