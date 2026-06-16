/**
 * The price chip — the one bettable control. It ALWAYS shows `priceDisplay` (never
 * the raw feed price), is disabled when the selection is off the board, and lights
 * gold when it's on the slip. Shared by the lobby cards and the full event view.
 */

import type { NormalizedEvent, NormalizedMarket, Selection } from '../../lib/odds/contract.js'
import { formatAmerican } from './odds-format.js'

export type ToggleLeg = (event: NormalizedEvent, market: NormalizedMarket, sel: Selection) => void

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** A compact chip label — the market type is implied by the column/row it sits in. */
export function chipLabel(event: NormalizedEvent, market: NormalizedMarket, s: Selection): string {
  switch (market.type) {
    case 'moneyline':
      return s.side === 'home' ? event.home : event.away
    case 'spread':
      return signed(s.line ?? 0)
    case 'total':
    case 'prop':
      return `${s.side === 'over' ? 'O' : 'U'} ${s.line}`
  }
}

export function PriceChip({
  event,
  market,
  sel,
  on,
  onToggle,
}: {
  event: NormalizedEvent
  market: NormalizedMarket
  sel: Selection
  on: boolean
  onToggle: ToggleLeg
}) {
  return (
    <button
      type="button"
      className={`bk-chip ${on ? 'is-on' : ''}`}
      disabled={!sel.available}
      aria-pressed={on}
      onClick={() => onToggle(event, market, sel)}
    >
      <span className="bk-chip-pick">{chipLabel(event, market, sel)}</span>
      <span className="bk-chip-price">{formatAmerican(sel.priceDisplay.american)}</span>
    </button>
  )
}
