import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export interface BrandChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Gold-gem highlight when selected. */
  active?: boolean
}

/**
 * A small selectable token — bet presets (½, 2×, Max), quick filters. Gold-gem
 * highlight when `active`.
 */
export function BrandChip({ children, active = false, className, type = 'button', ...rest }: BrandChipProps) {
  return (
    <button type={type} className={cn('sds-chip', className)} aria-pressed={active} {...rest}>
      {children}
    </button>
  )
}
