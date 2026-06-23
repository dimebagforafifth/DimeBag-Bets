import { useSyncExternalStore } from 'react'
import { formatMoney } from '../../../games/shared/money.js'
import type { RankDef } from '../index.js'
import { getVipConfig, getVipVersion, leaderboard, subscribeVip } from '../../../app/vip-store.js'
import './vip.css'

/**
 * The VIP leaderboard — players ranked by lifetime wagered (CLAUDE.md §2: one
 * clean table, no clutter). Purely presentational: it pulls live rows from the
 * VIP store (which accrues every settled wager) and reflects the release state.
 * It never moves money.
 */
export function Leaderboard({
  players,
  currentPlayerId,
}: {
  players: { id: string; name: string }[]
  currentPlayerId?: string | null
}) {
  // re-render whenever the store changes (a new wager, a re-price, a release)
  useSyncExternalStore(subscribeVip, getVipVersion)
  const released = getVipConfig().released
  const rows = leaderboard(players)

  return (
    <section className="vip-lb">
      <div className="vip-lb-head">
        <div>
          <h1 className="vip-lb-title">Leaderboard</h1>
          <p className="vip-lb-sub">Ranked by lifetime wagered across every game and the book.</p>
        </div>
        {!released && <span className="vip-lb-note">Not released yet</span>}
      </div>

      {rows.length === 0 ? (
        <p className="vip-lb-empty">No players yet — wagers show up here as soon as they settle.</p>
      ) : (
        <table className="vip-lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rank</th>
              <th className="vip-num">Wagered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const you = currentPlayerId != null && r.id === currentPlayerId
              return (
                <tr key={r.id} className={you ? 'is-current' : ''}>
                  <td className="vip-lb-pos">{r.position}</td>
                  <td className="vip-lb-name">
                    {r.name}
                    {you && <span className="vip-lb-you">You</span>}
                  </td>
                  <td>
                    <RankBadge rank={r.rank} />
                  </td>
                  <td className="vip-num">{formatMoney(r.wagered)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** A rank's colored badge — used across the leaderboard and the VIP card. */
export function RankBadge({ rank }: { rank: RankDef }) {
  return (
    <span className="vip-badge-pill" style={{ '--rank': rank.color } as React.CSSProperties}>
      {rank.name}
    </span>
  )
}
