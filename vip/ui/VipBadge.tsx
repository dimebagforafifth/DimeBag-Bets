import { useSyncExternalStore } from 'react'
import { Circle, Shield, Medal, Trophy, Crown, Gem, type LucideIcon } from 'lucide-react'
import { formatMoney } from '../../games/shared/money.js'
import { rankProgress } from '../index.js'
import type { RankDef, RankId } from '../index.js'
import { getPlayerVip, getVipConfig, getVipVersion, subscribeVip } from '../../app/vip-store.js'
import './vip.css'

/** A distinct icon per tier, escalating in prestige (and, via CSS, glow) the higher
 *  you climb: shield → medal → trophy → crown → gem. */
const RANK_ICON: Record<RankId, LucideIcon> = {
  none: Circle,
  bronze: Shield,
  silver: Medal,
  gold: Trophy,
  platinum: Crown,
  diamond: Gem,
}

function TierIcon({ rank, size }: { rank: RankDef; size: number }) {
  const Icon = RANK_ICON[rank.id]
  return (
    <Icon
      size={size}
      strokeWidth={2.2}
      style={{ color: rank.color }}
      className={`vip-ico vip-ico-${rank.id}`}
      aria-hidden="true"
    />
  )
}

/**
 * A compact loyalty-tier chip for the header: the player's current tier (with its
 * icon) + a slim progress bar toward the next rung. Hovering reveals the tier ladder
 * — the rungs they can still walk towards, each icon glowing a little brighter the
 * higher it sits. Display only; rewards are granted from the manager's VIP tools.
 */
export function VipBadge({ playerId }: { playerId: string }) {
  useSyncExternalStore(subscribeVip, getVipVersion)
  const config = getVipConfig()
  const wagered = getPlayerVip(playerId).wagered
  const prog = rankProgress(wagered, config)
  const tiers = config.ranks.filter((r) => r.id !== 'none') // the real rungs
  const pct = Math.round(prog.pct * 100)

  return (
    <div className="vip-chip" style={{ '--rank': prog.current.color } as React.CSSProperties}>
      <span className="vip-chip-tier">
        <TierIcon rank={prog.current} size={15} />
        {prog.current.name}
      </span>
      <span className="vip-chip-bar" aria-hidden="true">
        <span className="vip-chip-fill" style={{ width: `${pct}%` }} />
      </span>

      <div className="vip-pop" role="tooltip">
        <span className="vip-pop-title">Loyalty tiers</span>
        {prog.next ? (
          <div className="vip-pop-prog">
            <div className="vip-pop-prog-labels">
              <span className="vip-pop-wagered">{formatMoney(wagered)} wagered</span>
              <span className="vip-pop-remaining">
                {formatMoney(prog.remaining)} to {prog.next.name}
              </span>
            </div>
            <span className="vip-pop-track">
              <span className="vip-pop-fill" style={{ width: `${pct}%` }} />
            </span>
          </div>
        ) : (
          <div className="vip-pop-top">Top tier reached · {formatMoney(wagered)} wagered</div>
        )}
        <ul className="vip-pop-list">
          {tiers.map((t) => {
            const reached = wagered >= t.minWagered
            const isCurrent = t.id === prog.current.id
            return (
              <li
                key={t.id}
                className={`vip-pop-row${isCurrent ? ' is-current' : ''}${reached ? ' is-reached' : ''}`}
              >
                <TierIcon rank={t} size={17} />
                <span className="vip-pop-name">{t.name}</span>
                {!isCurrent && (
                  <span className="vip-pop-thresh">
                    {reached ? 'Reached' : formatMoney(t.minWagered)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
