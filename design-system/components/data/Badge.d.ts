import * as React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `gold` outline, `solid` filled gold, `live` green dot, `neutral` grey. */
  variant?: 'gold' | 'solid' | 'live' | 'neutral'
  children?: React.ReactNode
}

/** A small status pill — Featured / Live / Provably fair. */
export function Badge(props: BadgeProps): React.JSX.Element
