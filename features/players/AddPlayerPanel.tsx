import { useState, type FormEvent } from 'react'
import { addPlayer } from '../../org/index.js'
import { mutateBook } from '../../app/book-store.js'
import { toCents } from '../../games/shared/money.js'
import './players.css'

/**
 * Add Player — onboard a new account. Built on the existing `org.addPlayer` (the same
 * model the book uses); the account sits directly under the book root (no agent tier).
 * Coin/points language only. Uses `onBack` to return after a successful onboard.
 */
export function AddPlayerPanel({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [credit, setCredit] = useState('200')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nm = name.trim()
    if (!nm) {
      setError('Enter a player name.')
      return
    }
    try {
      let createdName = nm
      mutateBook((org) => {
        createdName = addPlayer(org, org.managerId, {
          name: nm,
          creditLimit: toCents(Number(credit) || 0),
        }).name
      })
      setAdded(createdName)
      setName('')
      setCredit('200')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="feat">
      <form className="feat-form" onSubmit={submit}>
        <h3 className="feat-h">Onboard a new account</h3>
        <label className="feat-field">
          <span>Player name</span>
          <input
            className="feat-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="feat-field">
          <span>Credit line (coins)</span>
          <input
            className="feat-input"
            inputMode="decimal"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
          />
        </label>
        {added && <p className="feat-ok">Added “{added}”. Add another, or go back.</p>}
        {error && <p className="feat-err">{error}</p>}
        <div className="feat-actions">
          <button className="feat-btn is-primary" type="submit">
            Add player
          </button>
          <button className="feat-btn" type="button" onClick={onBack}>
            Done
          </button>
        </div>
      </form>
    </div>
  )
}
