/**
 * The player-facing announcements banner — the binding the manager Communication console
 * was missing (manager/README "Shell bindings to wire"). It renders the operator's ACTIVE
 * book-wide announcements at the top of the player app, so a posted notice actually reaches
 * players. Read-only, dismissible per-announcement (dismissal is session-local).
 */
import { useState, useSyncExternalStore } from 'react'
import { Info, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { commsStore, activeAnnouncements, type Severity } from '../../manager/communication/index.js'
import './notifications.css'

const ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
} as const

export function AnnouncementsBanner({ now = Date.now() }: { now?: number }) {
  useSyncExternalStore(commsStore.subscribe, commsStore.version, commsStore.version)
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set())

  const live = activeAnnouncements(commsStore.announcements(), now).filter((a) => !dismissed.has(a.id))
  if (live.length === 0) return null

  return (
    <div className="pa-banners">
      {live.slice(0, 3).map((a) => {
        const Icon = ICON[a.severity as Severity] ?? Info
        return (
          <div key={a.id} className={`pa-banner pa-banner--${a.severity}`} role="status">
            <Icon size={16} className="pa-banner-icon" aria-hidden="true" />
            <div className="pa-banner-body">
              {a.title ? <strong className="pa-banner-title">{a.title}</strong> : null}
              <span className="pa-banner-text">{a.body}</span>
            </div>
            <button
              type="button"
              className="pa-banner-x"
              aria-label="Dismiss announcement"
              onClick={() => setDismissed((prev) => new Set(prev).add(a.id))}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
