/**
 * The format-plugin registry. A pool dispatches scoring/validation to its kind's plugin.
 * Five formats are built in order: pick'em → confidence → survivor → bracket → squares.
 * ('prop' is reserved in the schema but has no plugin yet — creating one is refused.)
 */

import type { PoolKind } from '../types.js'
import type { PoolFormat } from './types.js'
import { pickemFormat } from './pickem.js'
import { confidenceFormat } from './confidence.js'
import { survivorFormat } from './survivor.js'
import { bracketFormat } from './bracket.js'
import { squaresFormat } from './squares.js'

const FORMATS: Record<string, PoolFormat> = {
  pickem: pickemFormat,
  confidence: confidenceFormat,
  survivor: survivorFormat,
  bracket: bracketFormat,
  squares: squaresFormat,
}

/** The built format kinds, in build order. */
export const FORMAT_KINDS = ['pickem', 'confidence', 'survivor', 'bracket', 'squares'] as const

/** The plugin for a kind, or undefined if not yet built (e.g. 'prop'). */
export function formatForOrNull(kind: PoolKind): PoolFormat | undefined {
  return FORMATS[kind]
}

/** The plugin for a kind, throwing if it isn't available. */
export function formatFor(kind: PoolKind): PoolFormat {
  const f = FORMATS[kind]
  if (!f) throw new Error(`pool format "${kind}" is not available`)
  return f
}

export * from './types.js'
