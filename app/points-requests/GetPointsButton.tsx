/**
 * "Get points" — the player side of the closed-loop top-up. Points can't be bought
 * (no real-money buy-in, per the product model); instead a player REQUESTS more and
 * their agent/operator approves it (which credits the figure through core). This button
 * sits in the header wallet and opens a small request modal; it shows a badge with the
 * player's pending-request count.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Plus, X } from 'lucide-react'
import { toCents, formatMoney } from '../../games/shared/money.js'
import { pointsRequestsStore, type PointsRequestStatus } from './store.js'
import './points-requests.css'

const STATUS_LABEL: Record<PointsRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
}

export function GetPointsButton({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [open, setOpen] = useState(false)
  useSyncExternalStore(
    pointsRequestsStore.subscribe,
    pointsRequestsStore.version,
    pointsRequestsStore.version,
  )
  const pendingCount = pointsRequestsStore.forPlayer(playerId).filter((r) => r.status === 'pending').length

  return (
    <>
      <button
        type="button"
        className="pr-get-btn"
        onClick={() => setOpen(true)}
        aria-label="Get points"
      >
        <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
        <span className="pr-get-label">Get points</span>
        {pendingCount > 0 && (
          <span className="pr-get-badge" aria-label={`${pendingCount} pending`}>{pendingCount}</span>
        )}
      </button>
      {open && (
        <GetPointsModal playerId={playerId} playerName={playerName} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function GetPointsModal({
  playerId,
  playerName,
  onClose,
}: {
  playerId: string
  playerName: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  useSyncExternalStore(
    pointsRequestsStore.subscribe,
    pointsRequestsStore.version,
    pointsRequestsStore.version,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const cents = toCents(Number(amount) || 0)
  const canSubmit = cents > 0

  function submit() {
    setError(null)
    try {
      pointsRequestsStore.create(playerId, playerName, cents, note)
      setSent(true)
      setAmount('')
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const mine = pointsRequestsStore.forPlayer(playerId).slice(0, 5)

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div
        className="pr-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Request points"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pr-modal-head">
          <h2 className="pr-modal-title">Get points</h2>
          <button type="button" className="pr-modal-x" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <p className="pr-modal-sub">
          Points are awarded by your agent — there's no buy-in. Request an amount and they'll
          approve it.
        </p>

        <label className="pr-field">
          <span className="pr-field-label">Amount</span>
          <input
            className="pr-input"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setSent(false)
            }}
          />
        </label>
        <label className="pr-field">
          <span className="pr-field-label">Note (optional)</span>
          <input
            className="pr-input"
            type="text"
            placeholder="Anything your agent should know?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p className="pr-flag" role="alert">
            {error}
          </p>
        )}
        {sent && (
          <p className="pr-sent" role="status">
            Request sent — your agent will review it.
          </p>
        )}

        <button type="button" className="pr-submit" disabled={!canSubmit} onClick={submit}>
          Request {cents > 0 ? formatMoney(cents) : 'points'}
        </button>

        {mine.length > 0 && (
          <div className="pr-history">
            <span className="pr-history-label">Your recent requests</span>
            <ul className="pr-history-list">
              {mine.map((r) => (
                <li key={r.id} className="pr-history-row">
                  <span className="pr-history-amt">{formatMoney(r.amount)}</span>
                  <span className={`pr-history-status is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
