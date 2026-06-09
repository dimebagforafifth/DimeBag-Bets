/**
 * The manager-console feature contract (console/registry/types).
 *
 * This is the seam every feature plugs into. A feature ships a FeatureManifest;
 * the shell renders its tile and, when clicked, mounts its Panel inside the
 * workspace. A Panel renders ONLY the feature body — never its own top bar,
 * figures strip, or page chrome — and receives `onBack`.
 *
 * The reference spec types `icon` as lucide-react's `LucideIcon`. That package
 * isn't in this codebase, so `ConsoleIcon` is a structural, Lucide-COMPATIBLE
 * type: any lucide-react icon satisfies it, and so does any plain SVG component.
 * To use the literal `LucideIcon`, `npm i lucide-react` and alias it here — the
 * one line that changes; nothing downstream does.
 */

import type { ComponentType, SVGProps } from 'react'

/** The four console sections, in their display order. */
export type ConsoleSection = 'operations' | 'players' | 'catalog' | 'control'

/** A Lucide-compatible icon component (lucide icons + any SVG component fit). */
export type ConsoleIcon = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string
    strokeWidth?: number
    absoluteStrokeWidth?: boolean
  }
>

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
