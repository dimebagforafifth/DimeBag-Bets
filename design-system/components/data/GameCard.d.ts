import * as React from 'react'

export interface GameCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Game name (Saira Condensed headline). */
  name: string
  /** One-line Stake-style description. */
  tag?: string
  /** Source for the 3D game icon PNG. */
  icon?: string
  iconAlt?: string
}

/**
 * A casino-lobby game tile.
 *
 * @startingPoint section="Components" subtitle="Lobby game tile with 3D icon" viewport="700x320"
 */
export function GameCard(props: GameCardProps): React.JSX.Element
