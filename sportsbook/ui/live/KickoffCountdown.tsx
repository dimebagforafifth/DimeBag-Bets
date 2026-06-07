/**
 * A kickoff countdown (CLAUDE.md §2) for upcoming games. Takes the raw ISO
 * commence time and ticks down ("Starts in 12m"). Renders nothing for an
 * unparseable time. Self-contained; the parent supplies the ISO string the
 * feed/API already carries.
 */

import { useEffect, useState } from 'react'
import './live.css'

export function KickoffCountdown({ kickoff }: { kickoff: string }) {
  const target = new Date(kickoff).getTime()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  if (Number.isNaN(target)) return null
  const ms = target - now
  if (ms <= 0) return <span className="kickoff-countdown is-soon">Starting…</span>
  return <span className="kickoff-countdown">Starts in {formatDuration(ms)}</span>
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}
