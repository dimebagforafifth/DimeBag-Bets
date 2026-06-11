import { useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { rankProgress } from '../index.js'
import { getPlayerVip, getVipConfig, getVipVersion, subscribeVip } from '../../app/vip-store.js'
import { RankBadge } from './Leaderboard.js'
import './vip.css'

/**
 * A small VIP rank chip for the header: just the player's current loyalty tier, with
 * progress to the next rung shown on hover. No free-play balance or redeem here —
 * rewards are configured and granted from the manager's VIP tools; this is a clean,
 * compact status indicator only.
 */
export function VipBadge({ playerId }: { playerId: string }) {
  useSyncExternalStore(subscribeVip, getVipVersion)
  const prog = rankProgress(getPlayerVip(playerId).wagered, getVipConfig())
  const tip = prog.next
    ? `${formatMoney(prog.remaining)} more wagered to reach ${prog.next.name}`
    : `Top rank reached — ${prog.current.name}`
  return (
    <div className="vip-chip" title={tip}>
      <span className="vip-chip-label">VIP</span>
      <RankBadge rank={prog.current} />
    </div>
  )
}
