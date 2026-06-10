import { useState, useSyncExternalStore } from 'react'
import { membersByRole, setMaxWager, setMinWager } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  SPORTS,
  getBookDefault,
  setBookDefault,
  getPlayerCap,
  setPlayerCap,
  effectiveCap,
  subscribeLimits,
  getLimitsVersion,
} from './limits-store.js'
import './players.css'

/**
 * Limits — wager caps by player, and by sport/market. The GLOBAL per-head max/min bet is
 * core-enforced (org.setMaxWager/setMinWager → core rejects an over-cap stake). Per-sport
 * caps (book defaults + per-player overrides) are operator config layered on top, plus a
 * one-click "circle" to tighten a sharp player. Coins/points language only.
 *
 * // SEAM / TODO(api): per-sport caps are advisory until the bet-placement path consults
 * // effectiveCap(playerId, sport). The global core cap is the enforced ceiling today.
 */
export function LimitsPanel({ onBack: _onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeLimits, getLimitsVersion)
  const org = getBook()
  const players = membersByRole(org, 'player')
  const [id, setId] = useState<string>(players[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const member = id ? org.members[id] : null

  const guard = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="feat">
      <label className="feat-field" style={{ maxWidth: 280 }}>
        <span>Player</span>
        <select className="feat-select" value={id} onChange={(e) => setId(e.target.value)}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {member && member.role === 'player' ? (
        <>
          <div className="feat-card">
            <h3 className="feat-h">{member.name} · global caps (enforced)</h3>
            <CapField
              label="Max bet"
              value={member.account.maxWager ?? null}
              onSet={(c) => guard(() => mutateBook(() => setMaxWager(org, member.id, c)))}
            />
            <CapField
              label="Min bet"
              value={member.account.minWager ?? null}
              onSet={(c) => guard(() => mutateBook(() => setMinWager(org, member.id, c)))}
            />
            <Circle
              current={member.account.maxWager ?? null}
              onCircle={(c) => guard(() => mutateBook(() => setMaxWager(org, member.id, c)))}
            />
            {error && <p className="feat-err">{error}</p>}
          </div>

          <div className="feat-card">
            <div className="feat-inline" style={{ justifyContent: 'space-between' }}>
              <h3 className="feat-h" style={{ margin: 0 }}>
                Caps by sport
              </h3>
              <span className="feat-flag">Advisory</span>
            </div>
            <p className="feat-sub" style={{ margin: '4px 0 10px' }}>
              Book default per sport, with a per-player override. The player&apos;s effective cap
              is their override, else the book default.
            </p>
            <div className="feat-tablewrap">
              <table className="feat-table">
                <thead>
                  <tr>
                    <th>Sport</th>
                    <th>Book default</th>
                    <th>{member.name} override</th>
                    <th className="feat-num">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {SPORTS.map((s) => (
                    <tr key={s}>
                      <td>{s}</td>
                      <td>
                        <CapInline
                          value={getBookDefault(s)}
                          onSet={(c) => setBookDefault(s, c)}
                        />
                      </td>
                      <td>
                        <CapInline
                          value={getPlayerCap(member.id, s)}
                          onSet={(c) => setPlayerCap(member.id, s, c)}
                        />
                      </td>
                      <td className="feat-num">
                        {effectiveCap(member.id, s) != null
                          ? formatMoney(effectiveCap(member.id, s) as number)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <p className="feat-empty">Pick a player to set wager caps.</p>
      )}
    </div>
  )
}

function CapField({
  label,
  value,
  onSet,
}: {
  label: string
  value: number | null
  onSet: (cents: number | null) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value / 100) : '')
  return (
    <div className="feat-cap">
      <label className="feat-field">
        <span>{label} (coins)</span>
        <input
          className="feat-input"
          inputMode="decimal"
          placeholder="none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">{value != null ? `now ${formatMoney(value)}` : 'no cap'}</span>
      <button
        className="feat-btn is-primary is-sm"
        type="button"
        onClick={() => onSet(draft.trim() === '' ? null : toCents(Number(draft) || 0))}
      >
        Set
      </button>
      <button
        className="feat-btn is-sm"
        type="button"
        onClick={() => {
          setDraft('')
          onSet(null)
        }}
      >
        Clear
      </button>
    </div>
  )
}

/** Compact cap editor for a table cell (advisory per-sport caps). */
function CapInline({ value, onSet }: { value: number | null; onSet: (cents: number | null) => void }) {
  const [draft, setDraft] = useState(value != null ? String(value / 100) : '')
  return (
    <span className="feat-inline">
      <input
        className="feat-input"
        style={{ width: 90, padding: '6px 8px' }}
        inputMode="decimal"
        placeholder="none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSet(draft.trim() === '' ? null : toCents(Number(draft) || 0))}
      />
    </span>
  )
}

/** Circle a player: clamp their enforced max bet to a tight watch limit. */
function Circle({ current, onCircle }: { current: number | null; onCircle: (cents: number) => void }) {
  const [cap, setCap] = useState('25')
  return (
    <div className="feat-cap" style={{ marginTop: 4 }}>
      <label className="feat-field">
        <span>Circle — tighten max bet to (coins)</span>
        <input
          className="feat-input"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">
        {current != null ? `capped at ${formatMoney(current)}` : 'uncapped'}
      </span>
      <button className="feat-btn is-sm" type="button" onClick={() => onCircle(toCents(Number(cap) || 0))}>
        Circle player
      </button>
    </div>
  )
}
