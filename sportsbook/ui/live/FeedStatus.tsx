/**
 * A live-feed status chip (CLAUDE.md §2, §4) — shows whether the odds feed is
 * connected, when it last updated, and how much API quota is left (honest by
 * default, §4). Presentational; the parent passes the state from the feed/store.
 */

import { useEffect, useState } from 'react'
import './live.css'

interface FeedStatusProps {
  connected: boolean
  /** ms timestamp of the last successful update. */
  lastUpdated?: number | null
  /** Remaining API requests from the vendor quota header, if known. */
  quotaRemaining?: number | null
}

export function FeedStatus({ connected, lastUpdated, quotaRemaining }: FeedStatusProps) {
  // re-render every few seconds so "updated Ns ago" stays current
  const [, tick] = useState(0)
  useEffect(() => {
    if (lastUpdated == null) return
    const t = setInterval(() => tick((n) => n + 1), 5_000)
    return () => clearInterval(t)
  }, [lastUpdated])

  return (
    <div className={`feed-status ${connected ? 'is-on' : 'is-off'}`} role="status">
      <span className="feed-dot" aria-hidden="true" />
      <span className="feed-label">{connected ? 'Live feed' : 'Feed offline'}</span>
      {lastUpdated != null && <span className="feed-meta">· updated {agoLabel(lastUpdated)}</span>}
      {quotaRemaining != null && (
        <span className="feed-meta feed-quota">· {quotaRemaining.toLocaleString('en-US')} reqs left</span>
      )}
    </div>
  )
}

function agoLabel(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
