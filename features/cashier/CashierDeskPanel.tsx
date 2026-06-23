/**
 * Cashier Desk — the operator's dollar window. Pull up a player, pick an action
 * (Grant / Deduct / Set), see the figure it would land on BEFORE committing, then
 * stage moves in a batch and confirm them together. Every figure is shown read-only
 * via the shared Figure (dollars, never real money); the one write path is
 * `adjustFigure`, which moves money through core AND records the audit + reason.
 *
 * Why a batch: a window operator often touches several players in one sitting. The
 * queue lets them line the moves up, eyeball the net to the book, then commit — each
 * row recomputed against the LIVE balance at confirm time so a stale preview can't
 * over/under-shoot a Set.
 */
import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch } from '../org/ui/PlayerLookup.js'
import { getBookLedger, subscribeBookLedger } from '../../app/book-ledger.js'
import { adjustFigure } from '../../app/manager-actions.js'
import { toCents, formatMoney } from '../../games/shared/money.js'
import { PanelShell, useBook, Figure, Tabs } from '../_desk/shared.js'
import { toDelta, previewBalance, type CashAction } from '../_desk/data.js'
import { ScopeBar, inScope, ALL_SCOPE } from '../_desk/scope.js'
import { InfoDot } from '../_desk/Tooltip.js'

const ACTIONS: ReadonlyArray<{ value: CashAction; label: string }> = [
  { value: 'grant', label: 'Grant' },
  { value: 'deduct', label: 'Deduct' },
  { value: 'set', label: 'Set' },
]

const VERB: Record<CashAction, string> = { grant: 'Grant', deduct: 'Deduct', set: 'Set to' }

interface QueueRow {
  memberId: string
  name: string
  action: CashAction
  cents: number
  reason: string
}

interface Saved {
  applied: number
  net: number
}

export function CashierDeskPanel({ onBack }: { onBack: () => void }) {
  const book = useBook()
  // Re-render the recent-movements list as the durable ledger grows.
  const ledger = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)

  const [scope, setScope] = useState(ALL_SCOPE)
  const [id, setId] = useState<string | null>(null)
  const [action, setAction] = useState<CashAction>('grant')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [saved, setSaved] = useState<Saved | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committed, setCommitted] = useState<string[]>([]) // names already applied when a batch failed

  const member = id ? book.members[id] : null
  const isPlayer = member?.role === 'player'

  const cents = toCents(Number(amount) || 0)
  const balance = isPlayer ? member!.account.balance : 0
  const stagedDelta = isPlayer ? toDelta(action, cents, balance) : 0
  const canAdd = isPlayer && cents > 0 && reason.trim() !== '' && stagedDelta !== 0

  // Net the whole queue would move the book by (each row priced off the LIVE balance,
  // applied cumulatively so two Sets / a Grant+Set on the same player net correctly).
  const projected = new Map<string, number>()
  const rowDeltas = queue.map((r) => {
    const live = book.members[r.memberId]?.account.balance ?? 0
    const base = projected.get(r.memberId) ?? live
    const d = toDelta(r.action, r.cents, base)
    projected.set(r.memberId, base + d)
    return d
  })
  const queueDeltaSum = rowDeltas.reduce((s, d) => s + d, 0)
  // "Net to the book": a player gaining dollars is the book paying out, so the book's net
  // is the negative of the players' delta sum.
  const netToBook = -queueDeltaSum

  function addToBatch() {
    if (!canAdd || !member) return
    setQueue((q) => [
      ...q,
      { memberId: member.id, name: member.name, action, cents, reason: reason.trim() },
    ])
    setAmount('')
    setReason('')
    setSaved(null)
    setError(null)
    setCommitted([])
  }

  function removeRow(idx: number) {
    setQueue((q) => q.filter((_, i) => i !== idx))
    setSaved(null)
  }

  function confirmBatch() {
    setError(null)
    setSaved(null)
    const done: string[] = []
    let net = 0
    for (const row of queue) {
      // Recompute against the LIVE balance — earlier rows in this loop have already
      // mutated the book, so this stays correct for repeat touches of one player.
      const live = book.members[row.memberId]?.account.balance ?? 0
      const delta = toDelta(row.action, row.cents, live)
      if (delta === 0) continue // a Set that's already on target — nothing to move
      try {
        // SEAM: actor is hardcoded cashier until real auth lands — pass the signed-in manager id when auth/roles is wired.
        adjustFigure(row.memberId, delta, row.reason, 'cashier')
        net += delta
        done.push(row.name)
      } catch (e) {
        // SEAM: core has no atomic multi-action primitive — rows apply sequentially, so a mid-batch failure leaves earlier rows committed. A true all-or-nothing batch needs a new core primitive (adjustBalances with rollback) + an app wrapper.
        setCommitted(done)
        setError(e instanceof Error ? e.message : String(e))
        return // stop at the first failure; earlier rows stay durably committed
      }
    }
    setQueue([])
    setSaved({ applied: done.length, net })
  }

  // The player's own recent cashier moves (read-only), newest first (the ledger
  // snapshot is already reversed).
  const recent = id
    ? ledger.filter((e) => e.kind === 'adjust' && e.accountId === id).slice(0, 6)
    : []

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">Cashier Desk — grant, deduct, or set a player's figure, then batch-confirm.</p>
      </header>

      <ScopeBar org={book} value={scope} onChange={setScope} />
      <PlayerSearch
        org={book}
        restrictTo={inScope(book, scope)}
        onSelect={(pid) => {
          setId(pid)
          setSaved(null)
          setError(null)
        }}
      />

      {!isPlayer ? (
        <p className="feat-empty">Search a player to grant, deduct, or set their dollar figure.</p>
      ) : (
        <div className="feat-card">
          <h3 className="feat-head">{member!.name}</h3>

          <div className="feat-actions">
            <Tabs value={action} options={ACTIONS} onChange={setAction} label="Cashier action" />
            <InfoDot id="set" label="Grant, Deduct and Set" />
          </div>

          <div className="feat-field">
            <label className="feat-label" htmlFor="cashier-amount">
              {action === 'set' ? 'Target figure (dollars)' : 'Amount (dollars)'}
            </label>
            <input
              id="cashier-amount"
              className="feat-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="feat-field">
            <label className="feat-label" htmlFor="cashier-reason">
              Reason (logged)
            </label>
            <input
              id="cashier-reason"
              className="feat-input"
              type="text"
              placeholder="Why this move? (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="feat-card" aria-label="Live preview">
            <span className="feat-label">Lands on</span>
            <div className="feat-actions">
              <Figure cents={balance} plus={false} />
              <span aria-hidden="true">→</span>
              <Figure cents={previewBalance(action, cents, balance)} plus={false} />
            </div>
          </div>

          <div className="feat-actions">
            <button type="button" className="feat-btn" disabled={!canAdd} onClick={addToBatch}>
              Add to batch
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="feat-card">
          <div className="feat-actions">
            <h3 className="feat-head">Batch ({queue.length})</h3>
            <span className="feat-label">
              Net to the book <InfoDot id="net-to-book" /> <Figure cents={netToBook} />
            </span>
          </div>
          <div className="mdsk-queue">
            {queue.map((row, i) => (
              <div className="mdsk-queue-row" key={`${row.memberId}-${i}`}>
                <span>
                  {row.name}
                  <span className="mdsk-queue-reason"> · {row.reason}</span>
                </span>
                <span className="mdsk-meta">
                  {VERB[row.action]} {formatMoney(row.cents)}
                </span>
                <Figure cents={rowDeltas[i]} />
                <button
                  type="button"
                  className="mdsk-x"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => removeRow(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="feat-actions">
            <button type="button" className="feat-btn-primary" onClick={confirmBatch}>
              Confirm batch
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="feat-flag" role="alert">
          {error}
          {committed.length > 0
            ? ` — already committed: ${committed.join(', ')}.`
            : ' — nothing was committed.'}
        </p>
      )}

      {saved && (
        <p className="feat-saved" role="status">
          Applied {saved.applied} {saved.applied === 1 ? 'move' : 'moves'} · net to players{' '}
          {saved.net >= 0 ? '+' : ''}
          {formatMoney(saved.net)}.
        </p>
      )}

      {isPlayer && recent.length > 0 && (
        <div className="feat-card">
          <h3 className="feat-head">Recent cashier moves</h3>
          <table className="feat-table">
            <thead>
              <tr>
                <th>When</th>
                <th className="num">Delta</th>
                <th className="num">Balance after</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.seq}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td className="num">
                    <Figure cents={e.balanceDelta} />
                  </td>
                  <td className="num">{formatMoney(e.balanceAfter)}</td>
                  <td className="mdsk-meta">{e.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
