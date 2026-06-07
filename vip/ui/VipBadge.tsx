import { useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { rankProgress } from '../index.js'
import {
  getPlayerVip,
  getVipConfig,
  getVipVersion,
  subscribeVip,
  takeFreePlay,
} from '../../app/vip-store.js'
import { RankBadge } from './Leaderboard.js'
import './vip.css'

/**
 * A compact VIP card meant to sit NEAR the player's balance: their current rank,
 * a slim progress bar toward the next rung (with the remaining wagered), and the
 * free-play balance with a "Redeem to balance" button.
 *
 * Redeeming hands the cents OUT to the parent (`onRedeem`) — this card only takes
 * the free play from the store; the app integration credits the core balance with
 * it. Money never moves inside this feature (CLAUDE.md §3).
 */
export function VipBadge({
  playerId,
  playerName,
  onRedeem,
}: {
  playerId: string
  playerName?: string
  onRedeem: (cents: number) => void
}) {
  // re-render on any store change (wager accrual, a granted reward, a redeem)
  useSyncExternalStore(subscribeVip, getVipVersion)
  const config = getVipConfig()
  const pv = getPlayerVip(playerId)
  const prog = rankProgress(pv.wagered, config)
  const canRedeem = pv.freePlay > 0

  return (
    <div className="vip-mini" style={{ '--rank': prog.current.color } as React.CSSProperties}>
      <div className="vip-mini-top">
        <span className="vip-mini-label">{playerName ? `${playerName} · VIP` : 'VIP'}</span>
        <RankBadge rank={prog.current} />
      </div>

      <div className="vip-prog">
        <div className="vip-prog-track">
          <div className="vip-prog-fill" style={{ width: `${Math.round(prog.pct * 100)}%` }} />
        </div>
        <div className="vip-prog-meta">
          {prog.next ? (
            <>
              <span>
                <strong>{formatMoney(prog.remaining)}</strong> to {prog.next.name}
              </span>
              <span>{Math.round(prog.pct * 100)}%</span>
            </>
          ) : (
            <span>Top rank reached — {prog.current.name}</span>
          )}
        </div>
      </div>

      <div className="vip-fp">
        <div className="vip-fp-text">
          <span className="vip-fp-label">Free play</span>
          <span className={`vip-fp-value ${canRedeem ? '' : 'is-zero'}`}>
            {formatMoney(pv.freePlay)}
          </span>
        </div>
        <button
          className="action action-bet vip-redeem"
          disabled={!canRedeem}
          onClick={() => onRedeem(takeFreePlay(playerId))}
        >
          Redeem to balance
        </button>
      </div>
    </div>
  )
}
