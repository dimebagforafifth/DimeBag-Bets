/**
 * Live win probability (CLAUDE.md §4) — DimeBag's distinctive, transparent
 * in-play model. It powers the win-probability bar on live games and the
 * Cash Out price, and it's deliberately simple enough to explain to a player:
 *
 *   "Your bet started at the opening price. As the game plays out, the live
 *    score takes over — the further along it is, the more the scoreboard (not
 *    the price) decides your chances."
 *
 * Concretely we blend the opening implied probability with a score-driven model
 * by how far the game has progressed:  p = (1 − r)·pre + r·pModel, where r is
 * the fraction of the game elapsed. At kickoff (r=0) it's the price; at the
 * final whistle (r=1) it's the scoreboard. Pure & framework-free — the same math
 * runs on whatever a real scores feed reports.
 */

import { americanFromDecimal, impliedProbability } from './odds.js'
import { gradeSelection, type GameEvent, type Selection } from './markets.js'

const logistic = (x: number) => 1 / (1 + Math.exp(-x))
const clampProb = (p: number) => Math.min(0.99, Math.max(0.01, p))

/** Margin baked into in-play prices — live markets carry a touch more juice than
 *  pre-game, the price of betting a game already in motion. */
export const LIVE_MARGIN = 0.06

/** Typical spread of final margins / totals — the model's uncertainty scale. */
const MARGIN_SD = 11
const TOTAL_SD = 13

/**
 * The probability `selection` is currently winning given the event's live state.
 *  - upcoming → the opening implied probability
 *  - final    → 0.99 / 0.50 / 0.01 for a win / push / loss
 *  - live     → blend opening price with a score-driven model by game progress
 */
export function liveWinProb(sel: Selection, event: GameEvent): number {
  const pre = impliedProbability(sel.odds)
  if (event.status === 'final' && event.score) {
    const outcome = gradeSelection(sel, event.score)
    return outcome === 'win' ? 0.99 : outcome === 'loss' ? 0.01 : 0.5
  }
  if (event.status !== 'live' || !event.score) return clampProb(pre)

  const r = Math.min(1, Math.max(0, event.progress ?? 0.5))
  const { home, away } = event.score

  let pModel: number
  if (sel.market === 'total') {
    const projected = (home + away) / Math.max(r, 0.15) // pace-projected final total
    const edge = (sel.pick === 'over' ? 1 : -1) * (projected - (sel.line ?? 0))
    pModel = logistic(edge / (TOTAL_SD * Math.sqrt(Math.max(1 - r, 0.02))))
  } else {
    const line = sel.line ?? 0 // moneyline → 0
    const lead = sel.pick === 'home' ? home + line - away : away + line - home
    pModel = logistic(lead / (MARGIN_SD * Math.sqrt(Math.max(1 - r, 0.02))))
  }

  return clampProb((1 - r) * pre + r * pModel)
}

/** Decimal odds for a live selection from its current win probability, with the
 *  live margin shortening the price. Clamped so the decimal stays > 1. */
export function liveDecimal(sel: Selection, event: GameEvent, margin = LIVE_MARGIN): number {
  const vigged = Math.min(0.98, liveWinProb(sel, event) * (1 + margin))
  return Math.max(1.01, 1 / vigged)
}

/** The rounded American price a live selection is offered at right now. */
export function liveAmerican(sel: Selection, event: GameEvent, margin = LIVE_MARGIN): number {
  return americanFromDecimal(liveDecimal(sel, event, margin))
}

/**
 * The in-play markets offered while a game is live — the same moneyline, spread
 * and total as pre-game, but each re-priced off the live win probability so the
 * lines move with the score. Empty unless the event is live. Lines are held at
 * their opening numbers; only the prices move. Each selection grades exactly like
 * its pre-game twin at the final whistle; its `odds` are the live price, locked
 * onto the bet when placed (id suffixed `-live` so it's distinct on the slip).
 */
export function liveSelections(event: GameEvent): Selection[] {
  if (event.status !== 'live') return []
  return event.selections.map((base) => {
    // Seed from the opening price so liveWinProb has an anchor, then quote live.
    const seed: Selection = { ...base, id: `${base.id}-live`, live: true }
    return { ...seed, odds: liveAmerican(seed, event) }
  })
}
