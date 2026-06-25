import * as React from 'react'

export interface OddsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Small market label above the price (e.g. team, "Over 2.5"). */
  label?: string
  /** The price/odds, pre-formatted (e.g. "+150", "2.40"). */
  price: React.ReactNode
  /** Selected state — renders the gold hit and feeds the bet slip. */
  selected?: boolean
  /** Tiny price-movement indicator. */
  move?: 'up' | 'down'
  disabled?: boolean
}

/**
 * A tappable sportsbook odds cell.
 *
 * @startingPoint section="Sportsbook" subtitle="Tappable odds cells + event row" viewport="700x300"
 */
export function OddsButton(props: OddsButtonProps): React.JSX.Element
