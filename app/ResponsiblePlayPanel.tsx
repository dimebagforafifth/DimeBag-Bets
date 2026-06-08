/**
 * Responsible-play settings (CLAUDE.md §2, §4) — the player sets their own limits
 * and sees this session at a glance. Clean and plain: per-bet cap, session loss
 * cap, session time cap, and a "take a break" cooldown. Honest by default — the
 * limits are the player's, shown openly, and the gate enforces them for real.
 */

import { useReducer, useEffect } from 'react'
import { NumberInput } from '../games/shared/NumberInput.js'
import { formatMoney, toCents } from '../games/shared/money.js'
import { useResponsiblePlay } from './ResponsiblePlayGate.js'
import { setLimits, startCooldown, sessionMinutesElapsed, netLossCents } from './responsible-play.js'
import './responsible-play.css'

const BREAKS = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '24 hours', ms: 24 * 60 * 60_000 },
]
const REMINDER_MINUTES = 30

export function ResponsiblePlayPanel({ playerId }: { playerId: string }) {
  const { limits, session, now } = useResponsiblePlay(playerId)
  // a one-per-second tick so the live session clock stays current while open
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const minutes = Math.floor(sessionMinutesElapsed(session, now))
  const net = session.netCents
  const cooling = limits.cooldownUntil != null && now < limits.cooldownUntil
  const remind = minutes >= REMINDER_MINUTES

  /** Commit a dollars value to a cents limit, or clear it when emptied. */
  const onLimit = (key: 'perBetMax' | 'sessionLossLimit') => (d: number | null) =>
    setLimits(playerId, { [key]: d == null || d <= 0 ? undefined : toCents(d) })

  return (
    <section className="rp-panel" aria-label="Responsible play">
      <div className="rp-panel-head">
        <h3 className="rp-panel-title">Responsible play</h3>
        <span className="rp-panel-sub">Your limits, your call — enforced for real.</span>
      </div>

      <div className="rp-grid">
        <label className="field">
          <span className="field-label">Max per bet</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={limits.perBetMax != null ? limits.perBetMax / 100 : null}
              min={0}
              allowEmpty
              placeholder="No limit"
              onCommit={onLimit('perBetMax')}
            />
          </div>
        </label>

        <label className="field">
          <span className="field-label">Session loss limit</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={limits.sessionLossLimit != null ? limits.sessionLossLimit / 100 : null}
              min={0}
              allowEmpty
              placeholder="No limit"
              onCommit={onLimit('sessionLossLimit')}
            />
          </div>
        </label>

        <label className="field">
          <span className="field-label">Session time limit (min)</span>
          <NumberInput
            className="field-input"
            value={limits.sessionMinutes ?? null}
            min={0}
            decimals={0}
            allowEmpty
            placeholder="No limit"
            onCommit={(d) => setLimits(playerId, { sessionMinutes: d == null || d <= 0 ? undefined : Math.round(d) })}
          />
        </label>
      </div>

      <div className="rp-break-row">
        <span className="field-label">Take a break</span>
        <div className="rp-break-chips">
          {BREAKS.map((b) => (
            <button
              key={b.ms}
              className="chip"
              disabled={cooling}
              onClick={() => startCooldown(playerId, b.ms, Date.now())}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="rp-session">
        <div>
          <dt>This session</dt>
          <dd>{minutes} min · {session.bets} bets</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={net < 0 ? 'is-down' : net > 0 ? 'is-up' : ''}>
            {net >= 0 ? '+' : ''}
            {formatMoney(net)}
          </dd>
        </div>
        {limits.sessionLossLimit != null && (
          <div>
            <dt>Loss used</dt>
            <dd>
              {formatMoney(netLossCents(session))} / {formatMoney(limits.sessionLossLimit)}
            </dd>
          </div>
        )}
      </dl>

      {cooling ? (
        <p className="rp-note is-cooling">You’re on a break — play is paused.</p>
      ) : remind ? (
        <p className="rp-note">You’ve been playing for {minutes} minutes — a good moment for a break.</p>
      ) : null}
    </section>
  )
}
