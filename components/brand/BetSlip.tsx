import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import './brand.css'

export interface BetSelection {
  id: string
  /** The chosen pick, e.g. "Lakers -3.5". */
  pick: ReactNode
  /** The event context, e.g. "Lakers @ Celtics · NBA". */
  event?: ReactNode
  /** Decimal odds for this selection. */
  price: number
}
export interface BetSlipProps extends HTMLAttributes<HTMLElement> {
  selections?: BetSelection[]
  /** Stake in points. */
  stake?: number
  mode?: 'single' | 'parlay'
  onStakeChange?: (stake: number) => void
  onRemove?: (selection: BetSelection) => void
  onModeChange?: (mode: 'single' | 'parlay') => void
  onPlace?: () => void
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/**
 * The points bet slip — selections, stake, live combined odds + potential return.
 * Toggle Single / Parlay. Composes the real components/ui Button for the CTA.
 */
export function BetSlip({
  selections = [],
  stake = 100,
  mode = 'parlay',
  onStakeChange,
  onRemove,
  onModeChange,
  onPlace,
  className,
  ...rest
}: BetSlipProps) {
  const combined = selections.reduce((acc, s) => acc * (Number(s.price) || 1), 1)
  const ret =
    mode === 'parlay'
      ? stake * combined
      : selections.reduce((acc, s) => acc + stake * (Number(s.price) || 1), 0)

  return (
    <aside className={cn('sds-slip', className)} {...rest}>
      <div className="sds-slip__head">
        <span className="sds-slip__title">Bet slip</span>
        {selections.length > 0 ? <span className="sds-slip__count">{selections.length}</span> : null}
        {selections.length > 1 ? (
          <div className="sds-slip__mode">
            <button
              type="button"
              className={mode === 'single' ? 'on' : ''}
              onClick={() => onModeChange?.('single')}
            >
              Singles
            </button>
            <button
              type="button"
              className={mode === 'parlay' ? 'on' : ''}
              onClick={() => onModeChange?.('parlay')}
            >
              Parlay
            </button>
          </div>
        ) : null}
      </div>

      {selections.length === 0 ? (
        <div className="sds-slip__empty">
          Tap any odds to add a pick.
          <br />
          Casino &amp; sportsbook share one balance.
        </div>
      ) : (
        <>
          <div className="sds-slip__list">
            {selections.map((s) => (
              <div className="sds-pick" key={s.id}>
                <button
                  type="button"
                  className="sds-pick__x"
                  onClick={() => onRemove?.(s)}
                  aria-label="Remove"
                >
                  ✕
                </button>
                <div className="sds-pick__pick">{s.pick}</div>
                {s.event ? <div className="sds-pick__event">{s.event}</div> : null}
                <div className="sds-pick__price">{Number(s.price).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="sds-slip__foot">
            <div className="sds-slip__stake">
              <label htmlFor="sds-stake">Stake</label>
              <input
                id="sds-stake"
                type="number"
                value={stake}
                onChange={(e) => onStakeChange?.(Number(e.target.value))}
              />
              <span className="unit">pts</span>
            </div>
            <div className="sds-slip__rows">
              <div className="sds-slip__row">
                <span className="k">{mode === 'parlay' ? 'Combined odds' : 'Selections'}</span>
                <span className="v">{mode === 'parlay' ? combined.toFixed(2) : selections.length}</span>
              </div>
              <div className="sds-slip__row sds-slip__row--return">
                <span className="k">Potential return</span>
                <span className="v">{fmt(ret)} pts</span>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={() => onPlace?.()}>
              Place bet · {fmt(stake)} pts
            </Button>
          </div>
        </>
      )}
    </aside>
  )
}
