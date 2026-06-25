import * as React from 'react'

export interface WalletPillProps {
  /** Pre-formatted headline balance string (e.g. "$8,420"). */
  balance: string
  /** Label over the headline balance. */
  label?: string
  /** Label over the week standing. */
  weekLabel?: string
  /** Week win/loss in cents — sign drives the arrow + colour. */
  weekCents: number
}

/** The header wallet unit: headline balance + week up/down standing. */
export function WalletPill(props: WalletPillProps): React.JSX.Element
