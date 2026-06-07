import { useSyncExternalStore } from 'react'
import { getAuditLog, subscribeAudit } from './audit-store.js'
import './audit.css'

/**
 * The audit log panel (CLAUDE.md §4) — every MANUAL change to the book (credit edits,
 * locks, suspends, max-bet changes, moves, removals, figure adjustments, settlements)
 * with who/what/when/old→new. An app-level panel mounted in the manager console
 * alongside the house-edge and VIP panels; it reads the persisted audit store.
 */
export function AuditPanel() {
  const log = useSyncExternalStore(subscribeAudit, getAuditLog, getAuditLog)
  return (
    <section className="audit">
      <div className="audit-head">
        <h2 className="audit-title">Audit log</h2>
        <p className="audit-sub">Every manual change to the book — who, what, and when.</p>
      </div>
      {log.length === 0 ? (
        <p className="audit-empty">
          No manual changes yet — credit edits, locks, suspends, moves, adjustments and
          settlements will appear here.
        </p>
      ) : (
        <div className="audit-list">
          {log.slice(0, 60).map((e) => (
            <div key={e.id} className="audit-row">
              <span className="audit-when">{formatWhen(e.at)}</span>
              <span className="audit-member">{e.memberName}</span>
              <span className="audit-detail">{e.detail}</span>
              <span className="audit-actor">{e.actor}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function formatWhen(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
