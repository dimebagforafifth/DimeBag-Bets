/**
 * The responsible-play gate (CLAUDE.md §2). Wrap a play surface (a casino game,
 * the sportsbook) with it: while the player is inside a self-set limit or a
 * "take a break" cooldown it shows the children, and the moment they're over a
 * limit it replaces them with a break screen — so the block is real, not advisory.
 * Reads the responsible-play store (read-only); never touches money.
 */

import { useEffect, useReducer, useSyncExternalStore, type ReactNode } from 'react'
import {
  checkPlay,
  getLimits,
  getSession,
  getResponsiblePlayVersion,
  resetSession,
  startCooldown,
  subscribeResponsiblePlay,
  type PlayCheck,
} from './responsible-play.js'
import './responsible-play.css'

/** Subscribe to the store AND tick on an interval, so time-based blocks (session
 *  time, cooldown expiry) re-evaluate even with no store change. */
export function useResponsiblePlay(playerId: string, tickMs = 20_000) {
  useSyncExternalStore(subscribeResponsiblePlay, getResponsiblePlayVersion, getResponsiblePlayVersion)
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, tickMs)
    return () => clearInterval(id)
  }, [tickMs])
  const now = Date.now()
  return { now, limits: getLimits(playerId), session: getSession(playerId), check: checkPlay(playerId, now) }
}

export function ResponsiblePlayGate({ playerId, children }: { playerId: string; children: ReactNode }) {
  const { check, now } = useResponsiblePlay(playerId)
  if (check.allowed) return <>{children}</>
  return <BreakScreen playerId={playerId} check={check} now={now} />
}

const BREAKS = [
  { label: '15 minutes', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '24 hours', ms: 24 * 60 * 60_000 },
]

function BreakScreen({ playerId, check, now }: { playerId: string; check: PlayCheck; now: number }) {
  const cooling = check.kind === 'cooldown'
  return (
    <div className="rp-break" role="status">
      <div className="rp-break-icon" aria-hidden="true">
        ⏸
      </div>
      <h2 className="rp-break-title">{cooling ? 'You’re taking a break' : 'Time to step away'}</h2>
      <p className="rp-break-msg">{check.reason}</p>
      {cooling && check.until != null ? (
        <p className="rp-break-until">Play reopens in {remaining(check.until - now)}.</p>
      ) : (
        <>
          <p className="rp-break-sub">Take a proper break — your session resets when it’s over.</p>
          <div className="rp-break-actions">
            {BREAKS.map((b) => (
              <button
                key={b.ms}
                className="action"
                onClick={() => {
                  startCooldown(playerId, b.ms, Date.now())
                  resetSession(playerId)
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** "5m" / "1h 5m" / "23h" from a millisecond remaining. */
function remaining(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
