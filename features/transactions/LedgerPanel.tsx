/**
 * Ledger — the FULL durable coin ledger for the whole book, read-only. Reads the
 * persisted book ledger (app/book-ledger) — every place/resolve/settle/adjust
 * movement that survives reloads — and lets the operator filter it (by player, by
 * kind, by date range), trace each row to its origin, and export the filtered slice
 * as CSV/JSON. This panel NEVER mutates money: it only reads + serialises history.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { getBookLedger, subscribeBookLedger } from '../../app/book-ledger.js'
import type { LedgerEntry } from '../../ledger/index.js'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  PanelShell,
  useBook,
  Figure,
  ChipBar,
  Toolbar,
  downloadFile,
} from '../_desk/shared.js'
import { filterLedger, dayStart, dayEnd, rowsToCsv } from '../_desk/data.js'

const KIND_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'resolve', label: 'resolve' },
  { value: 'adjust', label: 'adjust' },
  { value: 'settle', label: 'settle' },
] as const

/** A human "When" stamp from the entry's epoch-ms timestamp. */
function whenLabel(at: number): string {
  return new Date(at).toLocaleString()
}

/** The detail string for one row: a resolve traces to its game + outcome + the
 *  originating core wager id; an adjust/settle traces to who did it + why. */
function detailText(e: LedgerEntry): string {
  if (e.kind === 'resolve') {
    const meta = e.meta ?? {}
    const game =
      (typeof meta.gameName === 'string' && meta.gameName) ||
      (typeof meta.game === 'string' && meta.game) ||
      'Bet'
    const parts = [game]
    if (e.outcome) parts.push(e.outcome)
    if (e.wagerId) parts.push(e.wagerId)
    return parts.join(' · ')
  }
  // adjust / settle: the audit trail — actor performed it, reason carries the
  // settlement id / cashier note.
  const parts: string[] = []
  if (e.actor) parts.push(e.actor)
  if (e.reason) parts.push(e.reason)
  return parts.join(' · ')
}

export function LedgerPanel({ onBack }: { onBack: () => void }) {
  const entries = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const book = useBook()

  const [accountId, setAccountId] = useState('')
  const [kind, setKind] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const nameOf = (id: string) => book.members[id]?.name ?? id

  const filtered = useMemo(
    () =>
      filterLedger(entries, {
        accountId: accountId || null,
        kind: kind || null,
        from: from ? dayStart(from) : null,
        to: to ? dayEnd(to) : null,
      }),
    [entries, accountId, kind, from, to],
  )

  function exportCsv() {
    const cols = ['when', 'type', 'player', 'delta', 'balanceAfter', 'detail']
    const rows = filtered.map((e) => ({
      when: whenLabel(e.at),
      type: e.kind,
      player: nameOf(e.accountId),
      delta: e.balanceDelta,
      balanceAfter: e.balanceAfter,
      detail: detailText(e),
    }))
    downloadFile('ledger.csv', rowsToCsv(rows, cols))
  }

  function exportJson() {
    downloadFile('ledger.json', JSON.stringify(filtered, null, 2), 'application/json')
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          The full durable coin ledger — every movement across the whole book. Read-only;
          filter, trace, and export.
        </p>
      </header>

      <Toolbar>
        {accountId ? (
          <span className="led-pfilter">
            <span className="led-pfilter-name">{nameOf(accountId)}</span>
            <button
              type="button"
              className="led-pfilter-clear"
              aria-label="Clear player filter"
              onClick={() => setAccountId('')}
            >
              ×
            </button>
          </span>
        ) : (
          <div className="led-pfilter-search">
            <PlayerSearch org={book} onSelect={setAccountId} />
          </div>
        )}

        <ChipBar value={kind} options={KIND_OPTIONS} onChange={setKind} label="Kind" />

        <label className="feat-field">
          <span className="feat-label">From</span>
          <input
            type="date"
            className="feat-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">To</span>
          <input
            type="date"
            className="feat-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>

        <div className="feat-actions">
          <button type="button" className="feat-btn" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </button>
          <button type="button" className="feat-btn" onClick={exportJson} disabled={filtered.length === 0}>
            Export JSON
          </button>
        </div>
      </Toolbar>

      {/* SEAM: wagerId→ticketId bridge not wired — a resolve row knows its core wagerId (w_N) but the sportsbook ticket id (t_N) is not in meta (ticket.wager.id is the bridge but placeTicket never threads ticketId into core meta). Show wagerId for now; the sportsbook lane should emit { ticketId } into meta. */}
      {/* SEAM: bonus grants (core.onGrant) are not recorded in the durable book ledger today, so a truly full ledger omits grants until the promo/core lane wires onGrant → recordBookEntry (and adds a grant kind). */}

      {filtered.length === 0 ? (
        <p className="feat-empty">No ledger entries match these filters.</p>
      ) : (
        <table className="feat-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Player</th>
              <th className="num">Δ</th>
              <th className="num">Balance after</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.seq}>
                <td>{whenLabel(e.at)}</td>
                <td>
                  <span className={'mdsk-pill is-' + e.kind}>{e.kind}</span>
                </td>
                <td>{nameOf(e.accountId)}</td>
                <td className="num">
                  <Figure cents={e.balanceDelta} />
                </td>
                <td className="num">{formatMoney(e.balanceAfter)}</td>
                <td>{detailText(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PanelShell>
  )
}
