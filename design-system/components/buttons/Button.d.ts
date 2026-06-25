import * as React from 'react'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Visual style. `primary` is the one gold CTA; `ghost` is the quiet secondary. */
  variant?: 'primary' | 'ghost' | 'text' | 'danger'
  /** Control height / padding. */
  size?: 'sm' | 'md' | 'lg'
  /** Stretch to fill the container width. */
  block?: boolean
  /** Render as an anchor instead of a button. */
  href?: string
  children?: React.ReactNode
}

/**
 * Stadium's primary action control.
 *
 * @startingPoint section="Components" subtitle="Primary, ghost, text & danger buttons" viewport="700x140"
 */
export function Button(props: ButtonProps): React.JSX.Element
