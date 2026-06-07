/**
 * The shared win popup (CLAUDE.md §2) — every game shows the same celebratory
 * card centered over its stage on a win: the multiplier + how much you won.
 * Styles live in app/theme.css (.win-overlay / .win-popup). The parent stage
 * element must be `position: relative`.
 *
 * It waits a short beat after the win lands before appearing, so the win itself
 * (the winning tiles, the landed multiplier) reads on the stage first and the
 * card doesn't stomp on it. Parents render it as `{won && <WinPopup …/>}`, so it
 * remounts each round and the delay re-arms naturally.
 */

import { useEffect, useState } from 'react'
import { formatMoney } from './money.js'

interface WinPopupProps {
  multiplier: number
  /** The wager's stake. The card shows the TOTAL returned (stake × multiplier) —
   *  Stake's convention, i.e. your winnings plus the original bet, not net profit
   *  (a $10 bet at 2× shows +$20). Computed here so the rule lives in one place. */
  stake: number
  /** Beat to wait after the win lands before the card appears, in ms. */
  delayMs?: number
  /** Pop-in animation length, in ms. Lets a fast game (e.g. Crash at 2×/3×)
   *  speed the card's entrance to match its pace. Defaults to the CSS 0.4s. */
  popMs?: number
}

export function WinPopup({ multiplier, stake, delayMs = 500, popMs }: WinPopupProps) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])

  if (!show) return null

  const total = Math.round(stake * multiplier) // cents
  return (
    <div
      className="win-overlay"
      role="status"
      aria-live="polite"
      style={popMs != null ? { animationDuration: `${popMs}ms` } : undefined}
    >
      <div className="win-popup">
        <div className="win-popup-mult">{multiplier.toFixed(2)}×</div>
        <div className="win-popup-divider" />
        <div className="win-popup-amount">+{formatMoney(total)}</div>
      </div>
    </div>
  )
}
