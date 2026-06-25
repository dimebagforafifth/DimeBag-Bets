import * as React from 'react'

export interface BetSelection {
  id: string
  /** The chosen pick, e.g. "Lakers -3.5". */
  pick: React.ReactNode
  /** The event context, e.g. "Lakers @ Celtics · NBA". */
  event?: React.ReactNode
  /** Decimal odds for this selection. */
  price: number
}
export interface BetSlipProps extends React.HTMLAttributes<HTMLElement> {
  selections?: BetSelection[]
  /** Stake in points. */
  stake?: number
  mode?: 'single' | 'parlay'
  onStakeChange?: (stake: number) => void
  onRemove?: (selection: BetSelection) => void
  onModeChange?: (mode: 'single' | 'parlay') => void
  onPlace?: () => void
}

/**
 * The points bet slip — selections, stake, live combined odds + potential return.
 *
 * @startingPoint section="Sportsbook" subtitle="Bet slip with stake + parlay math" viewport="360x520"
 */
export function BetSlip(props: BetSlipProps): React.JSX.Element
