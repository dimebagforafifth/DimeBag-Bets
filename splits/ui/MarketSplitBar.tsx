/**
 * MarketSplitBar — a thin, embeddable "public is on X" bar for ONE market. Drop it next to a
 * market's sides on the book's event/market view to show, at a glance, the bets%-vs-handle%
 * lean. Read-only: it subscribes to the recorded bets and renders the live split, nothing more.
 *
 * // SEAM (book view): the event/market view (app/book/EventView, BookLobby) renders this beside
 * each market by passing the market id + the operating viewer id. It is intentionally
 * self-contained (own store subscription) so the book view can mount it without threading state.
 */

import { useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import type { DiscoveryScope } from '../../profile/community-settings.js'
import {
  defaultSplitScope,
  splitForMarketScoped,
  splitsVersion,
  subscribeSplits,
} from '../source.js'
import { roundShares } from '../splits.js'
import type { SideSplit } from '../types.js'
import './splits.css'

export function MarketSplitBar({
  marketId,
  viewerId,
  scope,
  /** Show the handle bar in addition to the tickets % (defaults to true). */
  showHandle = true,
}: {
  marketId: string
  viewerId: string
  scope?: DiscoveryScope
  showHandle?: boolean
}) {
  useSyncExternalStore(subscribeSplits, splitsVersion)
  const split = splitForMarketScoped(viewerId, scope ?? defaultSplitScope(), marketId)
  if (!split || split.totalTickets === 0) {
    return <p className="sp-bar-empty">No action yet</p>
  }
  // Round the displayed integers so the labels sum to exactly 100 (bars keep the raw fraction).
  const ticketPcts = roundShares(split.sides.map((s) => s.ticketPct))
  const handlePcts = roundShares(split.sides.map((s) => s.handlePct))
  return (
    <div className="sp-bar" aria-label="Public betting split">
      <div className="sp-bar-track" role="img" aria-label="Handle share by side">
        {split.sides.map((s, i) => (
          <span
            key={s.side}
            className="sp-bar-seg"
            style={{ width: `${s.handlePct}%` }}
            title={`${s.pick}: ${handlePcts[i]}% of handle`}
          />
        ))}
      </div>
      <ul className="sp-bar-legend">
        {split.sides.map((s, i) => (
          <SideRow
            key={s.side}
            side={s}
            ticketPct={ticketPcts[i]}
            handlePct={handlePcts[i]}
            showHandle={showHandle}
          />
        ))}
      </ul>
    </div>
  )
}

function SideRow({
  side,
  ticketPct,
  handlePct,
  showHandle,
}: {
  side: SideSplit
  ticketPct: number
  handlePct: number
  showHandle: boolean
}) {
  return (
    <li className="sp-bar-row">
      <span className="sp-bar-pick">{side.pick}</span>
      <span className="sp-bar-nums">
        <span className="sp-bar-tickets">{ticketPct}% bets</span>
        {showHandle && (
          <span className="sp-bar-handle" title={formatMoney(side.handleCents)}>
            {handlePct}% handle
          </span>
        )}
      </span>
    </li>
  )
}
