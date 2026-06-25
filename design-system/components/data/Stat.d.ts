import * as React from 'react'

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase label. */
  label: string
  /** The figure (string or number). */
  value: React.ReactNode
  /** Paint the value gold — for a live multiplier / treasure. */
  hot?: boolean
}

/** A compact labelled readout box. */
export function Stat(props: StatProps): React.JSX.Element
