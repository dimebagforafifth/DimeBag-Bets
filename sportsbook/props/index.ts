/**
 * Derived line markets — public surface (CLAUDE.md §4).
 *
 * Player props and alternate lines, all priced and graded off one normal model
 * (`distribution` → `lines`) and the trading desk's two-way pricer. Self-contained
 * — settles through `core` like the rest of the book.
 *
 *   import { pricePlayerProp, altLineLadder, gradeOverUnder } from 'sportsbook/props'
 */

export { normalCdf, normalSf } from './distribution.js'

export {
  overProbability,
  priceLine,
  altLineLadder,
  gradeOverUnder,
} from './lines.js'
export type { OverUnder, PricedLine } from './lines.js'

export {
  DEFAULT_STAT_SD,
  propOverProbability,
  pricePlayerProp,
  gradePlayerProp,
  SAMPLE_PROPS,
} from './props.js'
export type { StatKey, PlayerProp } from './props.js'
