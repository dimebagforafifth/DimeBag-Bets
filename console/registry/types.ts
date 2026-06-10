/**
 * The manager-console feature contract (console/registry/types).
 *
 * This is the seam every feature plugs into. A feature ships a FeatureManifest;
 * the shell renders its tile and, when clicked, mounts its Panel inside the
 * workspace. A Panel renders ONLY the feature body — never its own top bar,
 * figures strip, or page chrome — and receives `onBack`.
 *
 * `icon` is lucide-react's `LucideIcon` (the dep is installed at integration). Every
 * manifest passes a real lucide icon; `ConsoleIcon` aliases the literal type so the
 * rest of the contract is unchanged.
 */

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** The four console sections, in their display order. */
export type ConsoleSection = 'operations' | 'players' | 'catalog' | 'control'

/** The tile icon type — lucide-react's icon component. */
export type ConsoleIcon = LucideIcon

/** What a feature gives the shell to render its tile and mount its panel. */
export interface FeatureManifest {
  /** Stable kebab-case route id, e.g. "weekly-figures". */
  key: string
  /** Tile label. */
  name: string
  /** One-line tile subtitle. */
  hint: string
  /** Which section the tile lives under. */
  section: ConsoleSection
  /** Tile icon (Lucide-compatible). */
  icon: ConsoleIcon
  /** The feature body, mounted in the workspace. Renders only itself; gets onBack. */
  Panel: ComponentType<{ onBack: () => void }>
}
