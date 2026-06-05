/**
 * The shared win popup (CLAUDE.md §2) — every game shows the same celebratory
 * card centered over its stage on a win: the multiplier + how much you won.
 * Styles live in app/theme.css (.win-overlay / .win-popup). The parent stage
 * element must be `position: relative`.
 */

interface WinPopupProps {
  multiplier: number
  /** Net points won (profit). */
  amount: number
}

export function WinPopup({ multiplier, amount }: WinPopupProps) {
  return (
    <div className="win-overlay" role="status" aria-live="polite">
      <div className="win-popup">
        <div className="win-popup-mult">{multiplier.toFixed(2)}×</div>
        <div className="win-popup-divider" />
        <div className="win-popup-amount">+${Math.abs(Math.round(amount)).toLocaleString('en-US')}</div>
      </div>
    </div>
  )
}
