import * as React from 'react'

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — renders the gold-gem highlight. */
  active?: boolean
  children?: React.ReactNode
}

/** A small selectable token for bet presets and quick filters. */
export function Chip(props: ChipProps): React.JSX.Element
