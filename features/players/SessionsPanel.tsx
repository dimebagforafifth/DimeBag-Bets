import { useMemo, useState } from 'react'
import { membersByRole } from '../../org/index.js'
import { getBook } from '../../app/book-store.js'
import { allSessions, sharedIps, suspiciousPlayerIds } from './sessions.js'
import { dateLabel } from './format.js'
import './players.css'

const WINDOWS: { label: string; ms: number | null }[] = [
  { label: '24h', ms: 86_400_000 },
  { label: '7d', ms: 7 * 86_400_000 },
  { label: '30d', ms: 30 * 86_400_000 },
  { label: 'All', ms: null },
]

/**
 * Sessions / IP — the player web-access log: sign-ins by device and IP, filterable by
 * player and date range, with SHARED-IP (one IP across 2+ players) and suspicious sign-ins
 * flagged for multi-accounting review. (The current operator session lives in Control.)
 *
 * // TODO(api): synthesized from a deterministic seed today — swap for the real auth/session
 * // feed (Supabase Auth: device, ip, user-agent, last_seen) when it lands; shape is stable.
 */
export function SessionsPanel({ onBack: _onBack }: { onBack: () => void }) {
  const [player, setPlayer] = useState('all')
  const [windowMs, setWindowMs] = useState<number | null>(7 * 86_400_000)
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const shared = useMemo(() => sharedIps(), [])
  const suspicious = useMemo(() => suspiciousPlayerIds(), [])
  const players = membersByRole(getBook(), 'player')

  const rows = useMemo(() => {
    const now = Date.now()
    return allSessions().filter(
      (e) =>
        (player === 'all' || e.playerId === player) &&
        (windowMs == null || e.at >= now - windowMs) &&
        (!flaggedOnly || shared.has(e.ip) || e.status === 'failed'),
    )
  }, [player, windowMs, flaggedOnly, shared])

  const distinctIps = new Set(rows.map((e) => e.ip)).size
  const flaggedPlayers = new Set(rows.map((e) => e.playerId).filter((id) => suspicious.has(id))).size

  return (
    <div className="feat">
      <div className="feat-kpis">
        <div className="feat-kpi">
          <span className="feat-label">Sign-ins</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Distinct IPs</span>
          <strong>{distinctIps}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Shared IPs</span>
          <strong>{shared.size}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Flagged players</span>
          <strong>{flaggedPlayers}</strong>
        </div>
      </div>

      <div className="feat-toolbar">
        <label className="feat-field">
          <span>Player</span>
          <select className="feat-select" value={player} onChange={(e) => setPlayer(e.target.value)}>
            <option value="all">All players</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="feat-chips" aria-label="Date range">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              className={`feat-chip ${windowMs === w.ms ? 'is-on' : ''}`}
              onClick={() => setWindowMs(w.ms)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`feat-chip ${flaggedOnly ? 'is-on' : ''}`}
          onClick={() => setFlaggedOnly((f) => !f)}
        >
          Flagged only
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="feat-empty">No sign-ins in this range.</p>
      ) : (
        <div className="feat-tablewrap">
          <table className="feat-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Player</th>
                <th>Device</th>
                <th>IP</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{dateLabel(e.at)}</td>
                  <td>
                    {e.playerName}
                    {suspicious.has(e.playerId) && <span className="feat-pill is-suspended"> Flag</span>}
                  </td>
                  <td>{e.device}</td>
                  <td>
                    {e.ip}
                    {shared.has(e.ip) && <span className="feat-pill is-locked"> Shared</span>}
                  </td>
                  <td>{e.location}</td>
                  <td className={e.status === 'failed' ? 'feat-down' : 'feat-up'}>
                    {e.status === 'failed' ? 'Failed' : 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
