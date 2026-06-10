import { useState, type FormEvent } from 'react'
import { addPlayer } from '../../org/index.js'
import { mutateBook } from '../../app/book-store.js'
import { toCents } from '../../games/shared/money.js'
import './players.css'

/**
 * Add Player — onboard one account or a batch. New accounts sit directly under the book
 * (the manager root): no agent tier is created or shown. Bulk takes one player per line,
 * optionally `Name, creditLine`. Coins/points language only; `onBack` returns when done.
 *
 * // SEAM: "assign to a private-league commissioner" isn't modelled in the org yet (roles
 * // are manager + player only here); new players go to the book root until that lands.
 */
export function AddPlayerPanel({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  return (
    <div className="feat">
      <div className="feat-chips">
        <button
          type="button"
          className={`feat-chip ${mode === 'single' ? 'is-on' : ''}`}
          onClick={() => setMode('single')}
        >
          Single
        </button>
        <button
          type="button"
          className={`feat-chip ${mode === 'bulk' ? 'is-on' : ''}`}
          onClick={() => setMode('bulk')}
        >
          Bulk
        </button>
      </div>
      {mode === 'single' ? <SingleForm onBack={onBack} /> : <BulkForm onBack={onBack} />}
    </div>
  )
}

function SingleForm({ onBack }: { onBack: () => void }) {
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
    <form className="feat-form" onSubmit={submit}>
      <h3 className="feat-h">Onboard a new account</h3>
      <label className="feat-field">
        <span>Player name</span>
        <input className="feat-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
  )
}

/** Parse one bulk line: "Name" or "Name, 500" (credit line in coins). */
function parseLine(line: string): { name: string; credit: number } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const [namePart, creditPart] = trimmed.split(',')
  const name = namePart.trim()
  if (!name) return null
  const credit = creditPart != null && creditPart.trim() !== '' ? Number(creditPart) : 200
  return { name, credit: Number.isFinite(credit) ? credit : 200 }
}

function BulkForm({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const parsed = text.split('\n').map(parseLine).filter((x): x is { name: string; credit: number } => !!x)
    if (parsed.length === 0) {
      setError('Add at least one player — one per line.')
      return
    }
    let added = 0
    let skipped = 0
    mutateBook((org) => {
      for (const row of parsed) {
        try {
          addPlayer(org, org.managerId, { name: row.name, creditLimit: toCents(row.credit) })
          added += 1
        } catch {
          skipped += 1
        }
      }
    })
    setResult({ added, skipped })
    if (added > 0) setText('')
  }

  return (
    <form className="feat-form" onSubmit={submit} style={{ maxWidth: 520 }}>
      <h3 className="feat-h">Bulk onboard</h3>
      <label className="feat-field">
        <span>One player per line — “Name” or “Name, creditLine”</span>
        <textarea
          className="feat-textarea"
          rows={6}
          placeholder={'Jordan Vega\nSam Okafor, 500\nRiley Chen, 1000'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {result && (
        <p className="feat-ok">
          Added {result.added} player{result.added === 1 ? '' : 's'}
          {result.skipped > 0 ? ` · skipped ${result.skipped}` : ''}.
        </p>
      )}
      {error && <p className="feat-err">{error}</p>}
      <div className="feat-actions">
        <button className="feat-btn is-primary" type="submit">
          Add all
        </button>
        <button className="feat-btn" type="button" onClick={onBack}>
          Done
        </button>
      </div>
    </form>
  )
}
