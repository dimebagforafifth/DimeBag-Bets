/**
 * A live-feed status chip (CLAUDE.md §2, §4) — shows whether the odds feed is
 * connected, when it last updated, and (for a metered API) how much quota is
 * left. Honest by default (§4). Presentational; the parent passes feed state.
 *
 * This is the single source of truth for the feed indicator. Drive it with the
 * app's rich `health` (the feed's `status` + `lastUpdated`, the live path the
 * sportsbook store provides), or, for a feed with no health channel, a simple
 * `connected` boolean. A real odds API drives the same `health` shape — nothing
 * here changes when it lands.
 */

import { useEffect, useState } from 'react'
import type { FeedHealth, FeedStatus as FeedConnStatus } from '../../index.js'
import './live.css'

const STATUS_LABEL: Record<FeedConnStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  error: 'Offline',
}

interface FeedStatusProps {
  /** The feed's rich health (status + last-updated). When present it drives the
   *  label, dot color and the "· Ns ago" freshness — the app's live indicator. */
  health?: FeedHealth
  /** A simple connected flag, for a feed with no health channel. */
  connected?: boolean
  /** ms timestamp of the last successful update (used when `health` is absent). */
  lastUpdated?: number | null
  /** Remaining API requests from the vendor quota header, if known. */
  quotaRemaining?: number | null
}

export function FeedStatus({ health, connected, lastUpdated, quotaRemaining }: FeedStatusProps) {
  // The health channel wins; otherwise map the boolean to a coarse status.
  const status: FeedConnStatus = health ? health.status : connected ? 'live' : 'error'
  const updated = health ? health.lastUpdated : lastUpdated ?? null

  // While live, re-render every second so "Ns ago" stays current.
  const [, tick] = useState(0)
  useEffect(() => {
    if (status !== 'live' || updated == null) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [status, updated])

  return (
    <span className={`feed-status is-${status}`} role="status" aria-live="polite">
      <span className="feed-dot" aria-hidden="true" />
      <span className="feed-label">{STATUS_LABEL[status]}</span>
      {status === 'live' && updated != null && (
        // aria-hidden: the per-second freshness must not re-announce each tick;
        // only the status label is spoken (and only when it changes).
        <span className="feed-meta feed-ago" aria-hidden="true">· {agoLabel(updated)}</span>
      )}
      {quotaRemaining != null && (
        <span className="feed-meta feed-quota">· {quotaRemaining.toLocaleString('en-US')} reqs left</span>
      )}
    </span>
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
