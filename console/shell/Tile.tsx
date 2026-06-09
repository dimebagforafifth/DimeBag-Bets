/**
 * A clickable app tile: icon · name · hint, with a gold left-accent and a small
 * lift on hover. It's a real <button>, so it's keyboard-operable with a visible
 * focus ring (theme.css) out of the box.
 */

import type { ConsoleIcon } from '../registry/types.js'

export interface TileProps {
  name: string
  hint: string
  icon: ConsoleIcon
  onClick: () => void
}

export function Tile({ name, hint, icon: Icon, onClick }: TileProps) {
  return (
    <button type="button" className="c-tile" onClick={onClick}>
      <span className="c-tile-accent" aria-hidden="true" />
      <span className="c-tile-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="c-tile-body">
        <span className="c-tile-name">{name}</span>
        <span className="c-tile-hint">{hint}</span>
      </span>
    </button>
  )
}
