import { useSyncExternalStore } from 'react'
import { formatMoney } from '../games/shared/money.js'
import {
  getSettlementHistory,
  markCollected,
  settlementToCsv,
  subscribeSettlements,
  type SettlementRecord,
} from './settlement-store.js'
import './settlement-history.css'

/**
 * Settlement history (CLAUDE.md §4) — the persisted record of past squared-up periods
 * with mark-paid tracking and CSV / PDF export. An app-level panel in the manager
 * console, alongside the audit + house-edge panels; it reads the persisted settlement
 * store and moves no money.
 */
export function SettlementHistory() {
  const records = useSyncExternalStore(subscribeSettlements, getSettlementHistory, getSettlementHistory)
  return (
    <section className="sh">
      <div className="sh-head">
        <h2 className="sh-title">Settlement history</h2>
        <p className="sh-sub">Past periods — net, members, collection status, and export.</p>
      </div>
      {records.length === 0 ? (
        <p className="sh-empty">
          No settlements yet — settle a week in the book above and it’ll be recorded here.
        </p>
      ) : (
        <div className="sh-list">
          {records.map((r) => (
            <SettlementRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </section>
  )
}

function SettlementRow({ r }: { r: SettlementRecord }) {
  return (
    <div className="sh-row">
      <span className="sh-when">{formatWhen(r.generatedAt)}</span>
      <span className={`sh-net ${r.net > 0 ? 'is-up' : r.net < 0 ? 'is-down' : ''}`}>
        {formatMoney(r.net)}
      </span>
      <span className="sh-meta">
        {r.lines.length} members{r.carriedOver ? ' · carried forward' : ''}
      </span>
      <span className={`sh-status ${r.collected ? 'is-collected' : ''}`}>
        {r.collected ? 'Collected' : 'Outstanding'}
      </span>
      <span className="sh-actions">
        <button className="sh-btn" onClick={() => markCollected(r.id, !r.collected)}>
          {r.collected ? 'Mark outstanding' : 'Mark collected'}
        </button>
        <button className="sh-btn" onClick={() => downloadCsv(r)}>
          CSV
        </button>
        <button className="sh-btn" onClick={() => printRecord(r)}>
          PDF
        </button>
      </span>
    </div>
  )
}

function downloadCsv(r: SettlementRecord): void {
  const blob = new Blob([settlementToCsv(r)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${r.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Open a clean, printable view of one settlement so the operator can "Save as PDF"
 *  from the browser's print dialog — a PDF export with no extra dependency. */
function printRecord(r: SettlementRecord): void {
  const w = window.open('', '_blank')
  if (!w) {
    alert('Allow pop-ups to export the settlement as a PDF.')
    return
  }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  const rows = r.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}</td><td>${l.role}</td><td class="n">${esc(formatMoney(l.amount))}</td></tr>`,
    )
    .join('')
  w.document.write(
    `<!doctype html><html><head><title>Settlement ${esc(r.id)}</title><style>` +
      `body{font-family:system-ui,sans-serif;padding:28px;color:#111}` +
      `h2{margin:0 0 4px}p{color:#555;margin:0 0 16px}` +
      `table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 10px;font-size:13px}` +
      `th{text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}` +
      `</style></head><body>` +
      `<h2>Settlement</h2><p>${new Date(r.generatedAt).toLocaleString()} · Net ${esc(formatMoney(r.net))} · ` +
      `${r.collected ? 'Collected' : 'Outstanding'}${r.carriedOver ? ' · carried forward' : ''}</p>` +
      `<table><thead><tr><th>Member</th><th>Role</th><th class="n">Settles up</th></tr></thead><tbody>${rows}</tbody></table>` +
      `</body></html>`,
  )
  w.document.close()
  w.focus()
  w.print()
}

function formatWhen(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
