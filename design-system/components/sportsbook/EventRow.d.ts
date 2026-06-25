import * as React from 'react'

export interface OddsOption {
  id: string
  label?: string
  price: React.ReactNode
  move?: 'up' | 'down'
}
export interface Market {
  heading?: string
  options: OddsOption[]
}
export interface Competitor {
  name: string
  sport?: string
}
export interface EventRowProps extends React.HTMLAttributes<HTMLDivElement> {
  league?: string
  time?: string
  live?: boolean
  home: Competitor | string
  away: Competitor | string
  score?: { home: React.ReactNode; away: React.ReactNode }
  markets?: Market[]
  selectedId?: string
  onPick?: (option: OddsOption, market: Market) => void
}

/** A sportsbook event row with competitors and tappable market columns. */
export function EventRow(props: EventRowProps): React.JSX.Element
