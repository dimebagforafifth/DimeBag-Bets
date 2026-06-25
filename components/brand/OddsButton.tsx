import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export interface OddsButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  label?: ReactNode
  price: ReactNode
  /** The one gold hit when this price is on the slip. */
  selected?: boolean
  /** Tiny ▲/▼ when a price drifts. */
  move?: 'up' | 'down'
}

/**
 * A single tappable odds cell for the sportsbook: a market label over a price.
 * Selected = the one gold hit. `move` shows a tiny ▲/▼ when a price drifts.
 */
export function OddsButton({
  label,
  price,
  selected = false,
  move,
  disabled = false,
  className,
  type = 'button',
  ...rest
}: OddsButtonProps) {
  return (
    <button
      type={type}
      className={cn('sds-odds', className)}
      aria-pressed={selected}
      disabled={disabled}
      {...rest}
    >
      {label ? <span className="sds-odds__label">{label}</span> : null}
      <span className="sds-odds__price">{price}</span>
      <span className={cn('sds-odds__move', move)}>
        {move === 'up' ? '▲' : move === 'down' ? '▼' : ''}
      </span>
    </button>
  )
}
