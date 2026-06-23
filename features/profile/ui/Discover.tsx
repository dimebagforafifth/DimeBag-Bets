/**
 * Discover — "players to follow", the scoped discovery leaderboard, and follow-by-sport. Every
 * list is a read-only ranking over the projection + follow graph; the only writes are follows
 * (not money). Scope (global vs downline) follows Community Settings.
 */

import { useState, type ReactNode } from 'react'
import {
  availableSports,
  defaultScopeFor,
  leaderboardFor,
  LEADER_METRICS,
  sportLeaderboardFor,
  suggestionsFor,
  type LeaderMetric,
} from '../discovery.js'
import { communitySettings, type DiscoveryScope } from '../community-settings.js'
import { follow, isFollowing, unfollow } from '../follow-graph.js'
import { STATS_WINDOWS, type StatsWindow } from '../projection.js'
import { moneyTone, pct, signedMoney } from './bits.js'

function metricText(metric: LeaderMetric, value: number): { text: string; tone: string } {
  switch (metric) {
    case 'net':
      return { text: signedMoney(value), tone: moneyTone(value) }
    case 'roi':
      return { text: pct(value), tone: moneyTone(value) }
    case 'winRate':
      return { text: `${value.toFixed(0)}%`, tone: '' }
  }
}

export function Discover({
  viewerId,
  now,
  onOpenProfile,
}: {
  viewerId: string
  now: number
  onOpenProfile: (id: string) => void
}): ReactNode {
  const settings = communitySettings()
  const [scope, setScope] = useState<DiscoveryScope>(defaultScopeFor())
  const [metric, setMetric] = useState<LeaderMetric>('roi')
  const [window, setWindow] = useState<StatsWindow>('week')
  const sports = availableSports(viewerId, now)
  const [sportKey, setSportKey] = useState<string>(sports[0]?.key ?? '')

  const suggestions = suggestionsFor(viewerId, now, 6)
  const board = leaderboardFor(viewerId, now, { metric, window, scope, limit: 10 })
  const sportBoard = sportKey
    ? sportLeaderboardFor(viewerId, now, sportKey, { scope, limit: 10 })
    : []

  return (
    <section className="prof-discover">
      {/* Players to follow */}
      <div className="prof-section">
        <h2 className="prof-h2">Players to follow</h2>
        {suggestions.length ? (
          <div className="prof-suggest">
            {suggestions.map((s) => (
              <div className="prof-suggest-card" key={s.id}>
                <button className="prof-suggest-name" onClick={() => onOpenProfile(s.id)}>
                  {s.name}
                </button>
                <span className={`prof-pill ${s.reason === 'friends-of-friends' ? 'is-gold' : ''}`}>
                  {s.reason === 'friends-of-friends' ? s.detail : s.detail}
                </span>
                <FollowBtn viewerId={viewerId} ownerId={s.id} />
              </div>
            ))}
          </div>
        ) : (
          <p className="prof-empty">No suggestions yet — follow a few players to get going.</p>
        )}
      </div>

      {/* Discovery leaderboard */}
      <div className="prof-section">
        <div className="prof-board-head">
          <h2 className="prof-h2">Leaderboard</h2>
          {settings.allowScopeToggle && (
            <div className="prof-scope">
              <button
                className={`chip ${scope === 'global' ? 'is-on' : ''}`}
                onClick={() => setScope('global')}
              >
                Everyone
              </button>
              <button
                className={`chip ${scope === 'downline' ? 'is-on' : ''}`}
                onClick={() => setScope('downline')}
              >
                My downline
              </button>
            </div>
          )}
        </div>
        <div className="prof-board-controls">
          <div className="prof-metric">
            {LEADER_METRICS.map((m) => (
              <button
                key={m.key}
                className={`chip ${metric === m.key ? 'is-on' : ''}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="prof-windows">
            {STATS_WINDOWS.map((w) => (
              <button
                key={w.key}
                className={`chip ${window === w.key ? 'is-on' : ''}`}
                onClick={() => setWindow(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        {board.length ? (
          <div className="prof-board">
            {board.map((r) => {
              const m = metricText(r.metric, r.value)
              return (
                <div className="prof-board-row" key={r.id}>
                  <span className="prof-board-rank">{r.rank}</span>
                  <button className="prof-board-name" onClick={() => onOpenProfile(r.id)}>
                    {r.name}
                  </button>
                  <span className={`prof-board-val ${m.tone}`}>{m.text}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="prof-empty">No ranked players in this scope yet.</p>
        )}
      </div>

      {/* Follow by sport */}
      {sports.length > 0 && (
        <div className="prof-section">
          <div className="prof-board-head">
            <h2 className="prof-h2">By sport</h2>
            <select
              className="prof-switch"
              value={sportKey}
              onChange={(e) => setSportKey(e.target.value)}
              aria-label="Pick a sport"
            >
              {sports.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {sportBoard.length ? (
            <div className="prof-board">
              {sportBoard.map((r) => (
                <div className="prof-board-row" key={r.id}>
                  <span className="prof-board-rank">{r.rank}</span>
                  <button className="prof-board-name" onClick={() => onOpenProfile(r.id)}>
                    {r.name}
                  </button>
                  <span className="prof-board-sub">
                    {r.split.bets} bets · {r.split.winRate}%
                  </span>
                  <span className={`prof-board-val ${moneyTone(r.split.net)}`}>
                    {signedMoney(r.split.net)}
                  </span>
                  <FollowBtn viewerId={viewerId} ownerId={r.id} />
                </div>
              ))}
            </div>
          ) : (
            <p className="prof-empty">No action in this sport yet.</p>
          )}
        </div>
      )}
    </section>
  )
}

function FollowBtn({ viewerId, ownerId }: { viewerId: string; ownerId: string }): ReactNode {
  if (!viewerId || viewerId === ownerId) return null
  const following = isFollowing(viewerId, ownerId)
  return (
    <button
      className={`prof-follow-mini ${following ? 'is-following' : ''}`}
      onClick={() => (following ? unfollow(viewerId, ownerId) : follow(viewerId, ownerId))}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
