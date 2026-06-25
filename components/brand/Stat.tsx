import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  value: ReactNode
  /** Paint the value gold (a live multiplier / treasure). */
  hot?: boolean
}

/** A compact readout box — a labelled figure set in the mono numeral face. */
export function Stat({ label, value, hot = false, className, ...rest }: StatProps) {
  return (
    <div className={cn('sds-stat', className)} {...rest}>
      <span className="sds-stat__label">{label}</span>
      <span className={cn('sds-stat__value', hot && 'is-hot')}>{value}</span>
    </div>
  )
}
