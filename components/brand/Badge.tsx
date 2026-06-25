import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export type BrandBadgeVariant = 'gold' | 'solid' | 'live' | 'neutral'

export interface BrandBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BrandBadgeVariant
}

/** A small status pill — Featured, Live, Provably fair, etc. */
export function BrandBadge({ children, variant = 'gold', className, ...rest }: BrandBadgeProps) {
  return (
    <span className={cn('sds-badge', `sds-badge--${variant}`, className)} {...rest}>
      {children}
    </span>
  )
}
