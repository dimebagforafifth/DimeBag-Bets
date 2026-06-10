/**
 * Pending — the open-bet MANAGER. It closes the Ticketwriter "grade-later" loop:
 * the read-only exposure summary (coins at risk, by game + by player) stays on top,
 * and below it sits the live list of operator-written OPEN tickets (from
 * features/operations/open-tickets-store) that an operator can GRADE on the spot —
 * Win / Loss / Push / Void — each settling through core inside `mutateBook`.
 *
 * Money still moves ONLY through core (CLAUDE.md §3): grading calls
 * `resolveWager(member.account, ticket.wager, outcome, ticket.multiplier)` inside
 * `mutateBook`, which releases the hold and adjusts the figure. The durable audit
 * 'resolve' entry is recorded AUTOMATICALLY: app/book-ledger subscribes to core's
 * `onWagerResolved` (wired as a side-effect in App.tsx), so every grade lands in the
 * book ledger exactly once with the live before/after figure and the game tag — we do
 * NOT also call recordBookEntry here, which would double-record the same movement.
 *
 * The header carries a book-wide "Freeze all betting" toggle: setBookBettingLocked on
 * the manager (the book root) locks/unlocks new action on every player at once; open
 * tickets still settle. The live count of locked players is shown alongside.
 *
 * Coins-only for the new content (a local `coins()` formatter, never a "$"): this is a
 * points/coins book (CLAUDE.md §1). The pre-existing exposure KPIs/summary keep the
 * formatMoney() they already used — that's untouched existing behavior.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney, CENTS } from '../../games/shared/money.js'
import { membersByRole, getMember, setBookBettingLocked } from '../../org/index.js'
import { resolveWager, type Outcome } from '../../core/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import {
  getExposureByGame,
  getExposureVersion,
  subscribeExposure,
  totalOpenExposure,
} from '../../app/exposure.js'
import {
  list as listOpenTickets,
  remove as removeOpenTicket,
  subscribe as subscribeOpenTickets,
  getVersion as getOpenTicketsVersion,
  type OpenTicket,
} from './open-tickets-store.js'
import { PanelShell } from './shared.js'
import './pending.css'

/** Format integer cents as a plain coin amount — "1,234.56 coins", optionally signed.
 *  Coins-only, never a "$" (CLAUDE.md §1); NOT formatMoney(), whose operator display
 *  defaults to a currency mark. */
function coins(cents: number, signed = false): string {
  const neg = cents < 0
  const sign = neg ? '−' : signed ? '+' : ''
  const num = (Math.abs(cents) / CENTS).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${num} coins`
}

/** "just now" / "3m ago" / "2h ago" — a light relative clock for the placed time. */
function placedAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** A graded outcome's user-facing verb + whether it moved the figure up/down/flat. */
const GRADES: { outcome: Outcome; label: string; cls: string }[] = [
  { outcome: 'win', label: 'Win', cls: 'is-win' },
  { outcome: 'loss', label: 'Loss', cls: 'is-loss' },
  { outcome: 'push', label: 'Push', cls: '' },
  { outcome: 'void', label: 'Void', cls: '' },
]

/** What the last grade produced — shown as a standalone banner (the graded ticket's row
 *  is removed on success, so the result can't live on the row). */
interface GradeResult {
  id: string
  player: string
  outcome: Outcome
  delta: number
  error?: string
}

export function PendingPanel({ onBack }: { onBack: () => void }) {
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const tv = useSyncExternalStore(subscribeOpenTickets, getOpenTicketsVersion)
  const [result, setResult] = useState<GradeResult | null>(null)

  const view = useMemo(() => {
    const org = getBook()
    const manager = membersByRole(org, 'manager')[0] ?? null
    const players = membersByRole(org, 'player')
    const lockedCount = players.filter((p) => p.account.bettingLocked).length
    const summaryPlayers = players
      .map((p) => ({ id: p.id, name: p.name, pending: p.account.pending }))
      .filter((p) => p.pending > 0)
      .sort((a, b) => b.pending - a.pending)
    return {
      byGame: getExposureByGame(),
      total: totalOpenExposure(),
      players: summaryPlayers,
      tickets: listOpenTickets(),
      managerId: manager?.id ?? null,
      playerCount: players.length,
      lockedCount,
    }
    // tv keeps the ticket list fresh; ev/bv keep exposure + locks/figures fresh.
  }, [ev, bv, tv])

  const allLocked = view.playerCount > 0 && view.lockedCount === view.playerCount
  const now = Date.now()

  /** Grade an open ticket through core (the figure moves ONLY here), then drop it from
   *  the open-ticket store. The durable audit entry is recorded automatically by
   *  app/book-ledger's onWagerResolved subscriber — we don't double-record it. */
  function grade(ticket: OpenTicket, outcome: Outcome) {
    try {
      const org = getBook()
      const member = getMember(org, ticket.playerId)
      const before = member.account.balance
      mutateBook(() => {
        // win carries the priced multiplier; loss/push/void ignore it (core's contract).
        resolveWager(member.account, ticket.wager, outcome, ticket.multiplier)
      })
      const delta = member.account.balance - before
      removeOpenTicket(ticket.id)
      setResult({ id: ticket.id, player: member.name, outcome, delta })
    } catch (e) {
      setResult({
        id: ticket.id,
        player: getMember(getBook(), ticket.playerId).name,
        outcome,
        delta: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  /** Freeze / unfreeze the whole book: lock or unlock new action on every player
   *  beneath the manager (the book root). Open tickets still settle. */
  function toggleFreeze() {
    if (!view.managerId) return
    const id = view.managerId
    mutateBook((org) => {
      setBookBettingLocked(org, id, !allLocked)
    })
  }

  const summaryEmpty = view.byGame.length === 0 && view.players.length === 0

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Open tickets awaiting grade — coins at risk across the book, plus operator-written
          tickets you can grade on the spot.
        </p>
        <div className="pend-freeze">
          <span className={`pend-freeze-state ${allLocked ? 'is-locked' : ''}`}>
            {view.lockedCount > 0
              ? `${view.lockedCount} of ${view.playerCount} players locked`
              : 'All players live'}
          </span>
          <button
            type="button"
            className={`pend-freeze-btn ${allLocked ? 'is-on' : ''}`}
            onClick={toggleFreeze}
            disabled={!view.managerId || view.playerCount === 0}
            aria-pressed={allLocked}
          >
            {allLocked ? 'Unfreeze all betting' : 'Freeze all betting'}
          </button>
        </div>
      </header>

      <section className="feat-kpis" aria-label="Pending summary">
        <div className="feat-kpi">
          <span className="feat-label">Total at risk</span>
          <strong>{formatMoney(view.total)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Games with action</span>
          <strong>{view.byGame.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Open tickets</span>
          <strong>{view.tickets.length}</strong>
        </div>
      </section>

      {result && (
        <p
          role="status"
          className={`pend-banner ${
            result.error ? 'is-down' : result.delta > 0 ? 'is-up' : result.delta < 0 ? 'is-down' : ''
          }`}
        >
          {result.error
            ? `Couldn't grade ${result.player}'s ticket: ${result.error}`
            : `Graded ${result.player}'s ticket ${result.outcome.toUpperCase()} — figure ${
                result.delta === 0 ? 'unchanged' : coins(result.delta, true)
              }.`}
        </p>
      )}

      <section className="feat-card" aria-label="Open tickets">
        <h2 className="feat-h2">Open tickets · grade-later</h2>
        {view.tickets.length === 0 ? (
          <p className="feat-empty">
            No open tickets. Write one in Ticketwriter and "Leave open" to grade it here.
          </p>
        ) : (
          <div className="pend-tickets">
            {view.tickets.map((t) => {
              return (
                <div key={t.id} className="pend-ticket">
                  <div className="pend-ticket-main">
                    <span className="pend-ticket-who">{t.playerName}</span>
                    <span className="pend-ticket-desc">{t.description}</span>
                    <span className="pend-ticket-meta">
                      {t.multiplier.toFixed(2)}× · placed {placedAgo(t.placedAt, now)}
                    </span>
                  </div>
                  <div className="pend-ticket-stake">
                    <strong>{coins(t.stake)}</strong>
                    <small>at risk</small>
                  </div>
                  <div className="pend-grade" role="group" aria-label={`Grade ${t.playerName}'s ticket`}>
                    {GRADES.map((g) => (
                      <button
                        key={g.outcome}
                        type="button"
                        className={`pend-grade-btn ${g.cls}`}
                        onClick={() => grade(t, g.outcome)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {summaryEmpty ? (
        <p className="feat-empty">No open exposure — nothing is awaiting grade right now.</p>
      ) : (
        <div className="feat-grid">
          <section className="feat-card" aria-label="Open by game">
            <h2 className="feat-h2">Open by game</h2>
            <ul className="feat-list">
              {view.byGame.map((g) => (
                <li key={g.key}>
                  <span>{g.name}</span>
                  <span className="feat-num">{formatMoney(g.open)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="feat-card" aria-label="At risk by player">
            <h2 className="feat-h2">At risk by player</h2>
            <ul className="feat-list">
              {view.players.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className="feat-num">{formatMoney(p.pending)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </PanelShell>
  )
}
