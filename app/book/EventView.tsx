/**
 * The full event view — every market for one game, grouped the way a major book
 * lays them out: Game Lines (moneyline / spread / total), Alternate Lines (the alt
 * spread/total ladders), and Player Props (one block per player+stat). All chips
 * show `priceDisplay` and add to the same slip.
 */

import type { NormalizedEvent, NormalizedMarket } from '../../lib/odds/contract.js'
import { PriceChip, type ToggleLeg } from './MarketChips.js'
import { MarketSplitBar } from '../../features/splits/index.js'

const STAT_LABEL: Record<string, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  passing_yards: 'Passing Yards',
  rushing_yards: 'Rushing Yards',
  goals: 'Goals',
}

function MarketBlock({
  title,
  isProp,
  event,
  market,
  slipKeys,
  onToggle,
  viewerId,
}: {
  title: string
  isProp?: boolean
  event: NormalizedEvent
  market: NormalizedMarket
  slipKeys: Set<string>
  onToggle: ToggleLeg
  viewerId: string
}) {
  // chips in pairs (home/away, over/under) so a market reads as rows of two
  const rows: NormalizedMarket['selections'][] = []
  for (let i = 0; i < market.selections.length; i += 2) rows.push(market.selections.slice(i, i + 2))
  return (
    <div className="bk-mblock">
      <h4 className="bk-mblock-title">{title}</h4>
      {rows.map((pair, i) => (
        <div key={i} className={`bk-mrow ${isProp ? 'is-prop' : ''}`}>
          {pair.map((s) => (
            <PriceChip
              key={s.selectionId}
              event={event}
              market={market}
              sel={s}
              on={slipKeys.has(s.selectionId)}
              onToggle={onToggle}
            />
          ))}
        </div>
      ))}
      {/* Round-4 C: public betting split for this market (read-only; "No action yet" when empty). */}
      <MarketSplitBar marketId={market.marketId} viewerId={viewerId} />
    </div>
  )
}

export function EventView({
  event,
  slipKeys,
  onToggle,
  onBack,
  viewerId,
}: {
  event: NormalizedEvent
  slipKeys: Set<string>
  onToggle: ToggleLeg
  onBack: () => void
  viewerId: string
}) {
  const byType = (t: NormalizedMarket['type']) => event.markets.filter((m) => m.type === t)
  const [ml] = byType('moneyline')
  const spreads = byType('spread')
  const totals = byType('total')
  const props = byType('prop')

  return (
    <div className="bk-main">
      <button type="button" className="bk-back" onClick={onBack}>
        ← All games
      </button>
      <div className="bk-event-top">
        <div className="bk-teams">
          {event.away}
          <span className="bk-at">@</span>
          {event.home}
        </div>
        <div className="bk-event-meta">
          <span className="bk-league-tag">{event.leagueId}</span>
          {event.status === 'live' && <span className="bk-livebadge">● LIVE</span>}
        </div>
      </div>

      {ml && (
        <MarketBlock
          title="Moneyline"
          event={event}
          market={ml}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      )}
      {spreads[0] && (
        <MarketBlock
          title="Spread"
          event={event}
          market={spreads[0]}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      )}
      {totals[0] && (
        <MarketBlock
          title="Total"
          event={event}
          market={totals[0]}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      )}

      {spreads[1] && (
        <MarketBlock
          title="Alternate Spreads"
          event={event}
          market={spreads[1]}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      )}
      {totals[1] && (
        <MarketBlock
          title="Alternate Totals"
          event={event}
          market={totals[1]}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      )}

      {props.map((m) => (
        <MarketBlock
          key={m.marketId}
          title={`${m.playerId ?? 'Player'} — ${m.statId ? (STAT_LABEL[m.statId] ?? m.statId) : 'Prop'}`}
          isProp
          event={event}
          market={m}
          slipKeys={slipKeys}
          onToggle={onToggle}
          viewerId={viewerId}
        />
      ))}
    </div>
  )
}
