import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Account } from '../../core/index.js'
import { formatMoney } from '../../games/shared/money.js'
import { levelForXp } from '../xp.js'
import { probabilities } from '../wheel.js'
import {
  canSpin,
  claimRewards,
  getConfig,
  getGamificationVersion,
  getPlayerState,
  nextSpinAt,
  playerMissions,
  spinWheel,
  subscribeGamification,
  tournamentStandings,
  type WheelResult,
} from '../store.js'
import './gamification.css'

/**
 * The player's gamification hub (CLAUDE.md §2) — level/XP, missions, achievements, the
 * daily reward wheel, and live tournaments. Bets are tracked in real time by the engine
 * (off core's events); this view auto-claims any earned mission/achievement free-play on
 * the settling render, so rewards land in-session. All payouts go through core.grant.
 *
 * Takes the player's `account` (like a game) so rewards credit the right figure, and an
 * optional id→name list so tournament rows read as names. The app shell mounts it.
 */
export function GamificationPanel({
  account,
  players = [],
  onBalanceChange,
}: {
  account: Account
  players?: { id: string; name: string }[]
  onBalanceChange?: () => void
}) {
  const version = useSyncExternalStore(subscribeGamification, getGamificationVersion)
  const [spinResult, setSpinResult] = useState<WheelResult | null>(null)
  const now = Date.now()

  // Auto-claim earned missions/achievements as they complete (real-time, in-session).
  // A second claim with nothing pending is a no-op, so this settles immediately.
  useEffect(() => {
    const r = claimRewards(account)
    if (r.cents > 0) onBalanceChange?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, account.id])

  // Recompute each render; the store's version-driven re-render keeps these fresh.
  const config = getConfig()
  const state = getPlayerState(account.id)
  const missions = playerMissions(account.id, now)
  const level = levelForXp(state.xp)
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const wheelProbs = Object.fromEntries(probabilities(config.wheel.segments).map((x) => [x.id, x.p]))

  function doSpin() {
    const r = spinWheel(account)
    if (r) {
      setSpinResult(r)
      onBalanceChange?.()
    }
  }

  const spinReady = canSpin(account.id, now)
  const readyAt = nextSpinAt(account.id, now)

  return (
    <section className="gam">
      <header className="gam-head">
        <div>
          <h2 className="gam-title">Rewards</h2>
          <p className="gam-sub">Missions, badges, the daily wheel, and tournaments — all paid as free play.</p>
        </div>
        <div className="gam-level">
          <span className="gam-level-num">Lv {level.level}</span>
          <div className="gam-xpbar" aria-label={`XP ${level.xpIntoLevel}/${level.xpForLevel}`}>
            <span className="gam-xpfill" style={{ width: `${Math.round(level.pct * 100)}%` }} />
          </div>
          <span className="gam-xp">
            {level.xpIntoLevel}/{level.xpForLevel} XP
          </span>
        </div>
      </header>

      {/* Missions */}
      <h3 className="gam-section">Missions</h3>
      <div className="gam-missions">
        {missions.map(({ def, progress }) => {
          const pct = Math.min(1, def.target > 0 ? progress.progress / def.target : 0)
          const done = progress.completedAt !== null
          return (
            <div key={def.id} className={`gam-mission ${done ? 'is-done' : ''}`}>
              <div className="gam-mission-top">
                <span className="gam-mission-title">{def.title}</span>
                <span className="gam-mission-reward">{done ? '✓ paid' : `+${formatMoney(def.rewardCents)}`}</span>
              </div>
              <p className="gam-mission-desc">{def.description}</p>
              <div className="gam-bar">
                <span className="gam-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
              </div>
              <span className="gam-mission-prog">
                {def.metric === 'wagered' ? formatMoney(Math.min(progress.progress, def.target)) : Math.min(progress.progress, def.target)}
                {' / '}
                {def.metric === 'wagered' ? formatMoney(def.target) : def.target}
                <span className="gam-cadence"> · {def.cadence}</span>
              </span>
            </div>
          )
        })}
      </div>

      {/* Achievements */}
      <h3 className="gam-section">Achievements</h3>
      <div className="gam-badges">
        {config.achievements
          .filter((a) => a.enabled)
          .map((a) => {
            const earned = !!state.achievements[a.id]
            return (
              <div key={a.id} className={`gam-badge ${earned ? 'is-earned' : ''}`} title={a.description}>
                <span className="gam-badge-glyph">{earned ? a.badge : '🔒'}</span>
                <span className="gam-badge-name">{a.title}</span>
                <span className="gam-badge-reward">{formatMoney(a.rewardCents)}</span>
              </div>
            )
          })}
      </div>

      {/* Daily wheel */}
      {config.wheel.enabled && (
        <>
          <h3 className="gam-section">Daily spin</h3>
          <div className="gam-wheel">
            <ul className="gam-wheel-prizes">
              {config.wheel.segments.map((s) => (
                <li key={s.id} className="gam-wheel-prize">
                  <span>{s.label}</span>
                  <span className="gam-wheel-odds">{Math.round((wheelProbs[s.id] ?? 0) * 100)}%</span>
                </li>
              ))}
            </ul>
            <div className="gam-wheel-action">
              <button className="gam-spin" onClick={doSpin} disabled={!spinReady}>
                {spinReady ? 'Spin' : 'Spun — come back later'}
              </button>
              {spinResult && (
                <p className="gam-spin-result">
                  Landed on <strong>{spinResult.segment.label}</strong>
                  {spinResult.cents > 0 ? ` — +${formatMoney(spinResult.cents)} free play!` : ' — no win, try tomorrow.'}
                </p>
              )}
              {!spinReady && readyAt > 0 && <p className="gam-spin-cd">Next spin in {hoursUntil(readyAt, now)}.</p>}
            </div>
          </div>
        </>
      )}

      {/* Tournaments */}
      {config.tournaments
        .filter((t) => t.enabled)
        .map((t) => {
          const rows = tournamentStandings(t.id, names)
          return (
            <div key={t.id} className="gam-tourney">
              <h3 className="gam-section">
                {t.name} <span className="gam-pool">pool {formatMoney(t.prizePoolCents)}</span>
              </h3>
              {rows.length === 0 ? (
                <p className="gam-empty">No entries yet — place a bet to join.</p>
              ) : (
                <div className="gam-board">
                  {rows.slice(0, 10).map((r) => (
                    <div key={r.id} className={`gam-brow ${r.id === account.id ? 'is-me' : ''}`}>
                      <span className="gam-pos">{r.position}</span>
                      <span className="gam-bname">{r.name}</span>
                      <span className="gam-score">{t.metric === 'wagered' ? formatMoney(r.score) : r.score}</span>
                      <span className="gam-prize">{r.prizeCents > 0 ? formatMoney(r.prizeCents) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </section>
  )
}

function hoursUntil(at: number, now: number): string {
  const mins = Math.max(0, Math.ceil((at - now) / 60_000))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
