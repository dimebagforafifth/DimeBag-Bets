/**
 * ProfileStatsCard — a finished, read-only reference surface for the projection. Renders a
 * player's verified stats for a chosen window (net, ROI, units, W–L, streak, by-sport), straight
 * from the materialized projection. It RESPECTS privacy (canView) and moves no money — purely a
 * view over `player_profile_stats_mv`. Lane B composes the richer discovery/H2H UI on the same
 * read API; this is the building block + a working end-to-end demonstration.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../games/shared/money.js'
import { getProfileStats, subscribeProjection, getProjectionVersion } from './projection-store.js'
import { canView } from './privacy.js'
import { STAT_WINDOWS, type StatWindow } from './projection.js'
import './profile.css'

const WINDOW_LABEL: Record<StatWindow, string> = { '7d': '7 days', '30d': '30 days', season: 'Season', all: 'All-time' }

export function ProfileStatsCard({
  playerId,
  name,
  viewerId,
}: {
  playerId: string
  name?: string
  viewerId?: string | null
}) {
  useSyncExternalStore(subscribeProjection, getProjectionVersion, getProjectionVersion)
  const [window, setWindow] = useState<StatWindow>('all')
  const visible = canView(viewerId, playerId, 'stats')
  const stats = visible ? getProfileStats(playerId, window) : null

  const topSports = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.bySport)
      .sort((a, b) => b[1].wagers - a[1].wagers)
      .slice(0, 4)
  }, [stats])

  if (!visible) {
    return (
      <section className="pf-card">
        <header className="pf-head">
          <h3 className="pf-name">{name ?? playerId}</h3>
        </header>
        <p className="pf-private">This player keeps their stats for followers only.</p>
      </section>
    )
  }

  const roiPct = stats ? (stats.roiBps / 100).toFixed(1) : '0.0'
  const netTone = (stats?.netCents ?? 0) > 0 ? 'is-up' : (stats?.netCents ?? 0) < 0 ? 'is-down' : ''
  const streak = stats?.currentStreak ?? 0

  return (
    <section className="pf-card">
      <header className="pf-head">
        <h3 className="pf-name">{name ?? playerId}</h3>
        <div className="pf-windows" role="group" aria-label="Stat window">
          {STAT_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`pf-win ${w === window ? 'is-on' : ''}`}
              aria-pressed={w === window}
              onClick={() => setWindow(w)}
            >
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </header>

      {!stats || stats.wagers === 0 ? (
        <p className="pf-empty">No settled bets in this window yet.</p>
      ) : (
        <>
          <div className="pf-stats">
            <Stat label="Net" value={formatMoney(stats.netCents)} tone={netTone} />
            <Stat label="ROI" value={`${roiPct}%`} tone={stats.roiBps > 0 ? 'is-up' : stats.roiBps < 0 ? 'is-down' : ''} />
            <Stat label="Units" value={`${stats.units > 0 ? '+' : ''}${stats.units}`} tone={netTone} />
            <Stat label="Record" value={`${stats.wins}–${stats.losses}`} />
            <Stat label="Wagers" value={String(stats.wagers)} />
            <Stat
              label="Streak"
              value={streak === 0 ? '—' : `${Math.abs(streak)}${streak > 0 ? 'W' : 'L'}`}
              tone={streak > 0 ? 'is-up' : streak < 0 ? 'is-down' : ''}
            />
          </div>

          {topSports.length > 0 && (
            <div className="pf-sports">
              <span className="pf-sub">By sport</span>
              {topSports.map(([k, s]) => (
                <div key={k} className="pf-srow">
                  <span className="pf-sname">{k}</span>
                  <span className="pf-scount">{s.wagers}</span>
                  <span className={`pf-snet ${s.netCents > 0 ? 'is-up' : s.netCents < 0 ? 'is-down' : ''}`}>
                    {s.netCents > 0 ? '+' : ''}
                    {formatMoney(s.netCents)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {stats.clvBeatBps != null && (
            <p className="pf-clv">CLV {(stats.clvBeatBps / 100).toFixed(2)}% vs close</p>
          )}
        </>
      )}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="pf-stat">
      <span className="pf-stat-label">{label}</span>
      <span className={`pf-stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}
