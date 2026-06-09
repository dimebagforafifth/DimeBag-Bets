/**
 * The app grid: each non-empty section as an eyebrow heading over a responsive
 * grid of tiles, in the order the orchestrator hands them. When nothing is
 * registered it shows a calm empty state instead of bare headings — so the grid
 * renders cleanly against an empty registry.
 */

import type { FeatureManifest } from '../registry/types.js'
import { Tile } from './Tile.js'

export interface SectionGroup {
  key: string
  label: string
  items: FeatureManifest[]
}

export function SectionGrid({
  groups,
  onOpen,
}: {
  groups: SectionGroup[]
  onOpen: (key: string) => void
}) {
  const filled = groups.filter((g) => g.items.length > 0)

  if (filled.length === 0) {
    return (
      <div className="c-grid-empty" role="status">
        <span className="c-eyebrow">No apps yet</span>
        <p className="c-grid-empty-msg">Console features appear here as they’re registered.</p>
      </div>
    )
  }

  return (
    <div className="c-grid">
      {filled.map((g) => (
        <section className="c-section" key={g.key} aria-label={g.label}>
          <h2 className="c-eyebrow c-section-head">{g.label}</h2>
          <div className="c-tiles">
            {g.items.map((m) => (
              <Tile key={m.key} name={m.name} hint={m.hint} icon={m.icon} onClick={() => onOpen(m.key)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
