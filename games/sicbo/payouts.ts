/**
 * Sic Bo bet types, standard payouts, and house edges (CLAUDE.md §4, §7).
 *
 * Sic Bo odds are INDUSTRY-STANDARD, so we use the canonical paytable rather than
 * computing multipliers to a target edge (like Keno/Wheel do). Each bet carries
 * its own inherent edge, stated per type below and back-checked against the exact
 * 6³ = 216 equally-likely roll outcomes in the tests (realizedEdge / realizedRtp).
 *
 * In this codebase a "1 to 1" win means a RETURN multiplier of 2 (your stake comes
 * back plus an equal win), so every "X to 1" payout below is expressed as the
 * RETURN multiplier (X + 1) the core settles at; a losing bet settles at 0×.
 *
 *   bet               odds (to 1)   return     house edge
 *   ----------------  -----------   -------     ----------
 *   Small / Big          1            2×        2.78%  (loses on any triple)
 *   Odd / Even           1            2×        2.78%  (loses on any triple)
 *   Single (×1)          1            2×       ┐
 *   Single (×2)          2            3×       ┤ combined ~7.87% over the bet
 *   Single (×3)          3            4×       ┘
 *   Two-dice Combo        5            6×        16.67% (both chosen faces appear)
 *   Specific Double     10           11×        18.52%
 *   Any Triple          30           31×        13.89%
 *   Specific Triple    180          181×        16.20%
 *   Total 4 / 17        60           61×        15.28%
 *   Total 5 / 16        30           31×        13.89%
 *   Total 6 / 15        17           18×        16.67%
 *   Total 7 / 14        12           13×        9.72%
 *   Total 8 / 13         8            9×        12.50%
 *   Total 9 / 12         6            7×        18.98%
 *   Total 10 / 11        6            7×        12.50%
 *
 * This is the full Stake / Macau-standard Sic Bo board: the four even-money bets
 * (Small, Big, Odd, Even), Singles, the fifteen two-dice Combinations, Doubles,
 * triples, and every exact Total. Every edge is back-checked over all 216 rolls in
 * engine.test.ts.
 */

/** The kinds of bet a player can stake on a single roll. */
export type BetType =
  | 'small' // total 4..10, loses on any triple
  | 'big' // total 11..17, loses on any triple
  | 'odd' // odd total, loses on any triple
  | 'even' // even total, loses on any triple
  | 'single' // a face 1..6: pays by how many dice show it
  | 'combo' // two DISTINCT faces both appear among the dice (a two-dice combination)
  | 'double' // a specific face appears at least twice
  | 'anyTriple' // all three dice equal (any face)
  | 'triple' // a specific face appears three times
  | 'total' // the exact sum of the three dice (4..17)

/** RETURN multiplier for a winning two-dice Combination (5 to 1). */
export const COMBO_RETURN = 6

/** The fifteen distinct two-dice combinations {a,b} with a < b (1..6). */
export function comboList(): [number, number][] {
  const out: [number, number][] = []
  for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) out.push([a, b])
  return out
}

/** Standard "to 1" odds for an exact total (4..17). totalOdds(t) + 1 = return. */
export function totalOdds(total: number): number {
  switch (total) {
    case 4:
    case 17:
      return 60
    case 5:
    case 16:
      return 30
    case 6:
    case 15:
      return 17
    case 7:
    case 14:
      return 12
    case 8:
    case 13:
      return 8
    case 9:
    case 12:
      return 6
    case 10:
    case 11:
      return 6
    default:
      throw new Error(`total must be 4..17, got ${total}`)
  }
}

/** RETURN multiplier for a winning Single by how many dice show the face (1..3). */
export function singleReturn(count: number): number {
  if (count < 1 || count > 3) throw new Error(`single count must be 1..3, got ${count}`)
  return count + 1 // 1 die → 2×, 2 dice → 3×, 3 dice → 4×
}

/** A bet description: a type plus, where relevant, the face (1..6) or total (4..17). */
export interface BetSpec {
  type: BetType
  /** Face 1..6 for single/double/triple/combo; total 4..17 for total; unused otherwise. */
  param?: number
  /** The SECOND face 1..6 of a two-dice combination (combo only); param < param2. */
  param2?: number
}

/** The dice total. */
export function sumDice(dice: readonly number[]): number {
  return dice[0] + dice[1] + dice[2]
}

/** Whether the roll is a triple (all three dice equal). */
export function isTriple(dice: readonly number[]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2]
}

/** How many of the three dice show `face`. */
export function countFace(dice: readonly number[], face: number): number {
  return dice.reduce((n, d) => n + (d === face ? 1 : 0), 0)
}

/**
 * Settle a single bet against a roll: the RETURN multiplier the core resolves at.
 * 0 = a loss; > 1 = a win (the standard odds above + 1).
 */
export function betReturn(spec: BetSpec, dice: readonly number[]): number {
  const total = sumDice(dice)
  const triple = isTriple(dice)
  switch (spec.type) {
    case 'small':
      // 4..10, but ANY triple loses (even a small one) — the house edge.
      return !triple && total >= 4 && total <= 10 ? 2 : 0
    case 'big':
      return !triple && total >= 11 && total <= 17 ? 2 : 0
    case 'odd':
      // any odd total, but ANY triple loses (mirrors Small/Big) — the house edge.
      return !triple && total % 2 === 1 ? 2 : 0
    case 'even':
      return !triple && total % 2 === 0 ? 2 : 0
    case 'single': {
      const c = countFace(dice, requireFace(spec.param))
      return c > 0 ? singleReturn(c) : 0
    }
    case 'combo': {
      // both chosen (distinct) faces must appear among the three dice.
      const [f1, f2] = requireCombo(spec.param, spec.param2)
      return countFace(dice, f1) > 0 && countFace(dice, f2) > 0 ? COMBO_RETURN : 0
    }
    case 'double':
      return countFace(dice, requireFace(spec.param)) >= 2 ? 11 : 0
    case 'anyTriple':
      return triple ? 31 : 0
    case 'triple': {
      // validate the face independent of the roll, so a bad param fails fast on
      // EVERY roll (not only on the 6 triples) — same as the other param'd types.
      const f = requireFace(spec.param)
      return triple && dice[0] === f ? 181 : 0
    }
    case 'total':
      return total === requireTotal(spec.param) ? totalOdds(total) + 1 : 0
    default: {
      const never: never = spec.type
      throw new Error(`unknown bet type ${never}`)
    }
  }
}

/**
 * Throw if a bet spec is malformed (bad/missing face, total, or combo faces).
 * The engine calls this for EVERY bet before placing any wager, so a single bad
 * spec rejects the whole round up front instead of leaving it half-settled with
 * stake leaked in `pending` (settlement is all-or-nothing).
 */
export function validateBetSpec(spec: BetSpec): void {
  switch (spec.type) {
    case 'single':
    case 'double':
    case 'triple':
      requireFace(spec.param)
      return
    case 'combo':
      requireCombo(spec.param, spec.param2)
      return
    case 'total':
      requireTotal(spec.param)
      return
    case 'small':
    case 'big':
    case 'odd':
    case 'even':
    case 'anyTriple':
      return // no params to validate
    default: {
      const never: never = spec.type
      throw new Error(`unknown bet type ${never}`)
    }
  }
}

function requireFace(param: number | undefined): number {
  if (param == null || param < 1 || param > 6 || !Number.isInteger(param)) {
    throw new Error(`bet requires a face 1..6, got ${param}`)
  }
  return param
}

/** Validate a two-dice combination's faces and return them sorted (low, high). */
function requireCombo(a: number | undefined, b: number | undefined): [number, number] {
  const f1 = requireFace(a)
  const f2 = requireFace(b)
  if (f1 === f2) throw new Error(`combo needs two DISTINCT faces, got ${f1} and ${f2}`)
  return f1 < f2 ? [f1, f2] : [f2, f1]
}

function requireTotal(param: number | undefined): number {
  if (param == null || param < 4 || param > 17 || !Number.isInteger(param)) {
    throw new Error(`total bet requires a total 4..17, got ${param}`)
  }
  return param
}

/**
 * The realized RTP of a bet over all 216 equally-likely rolls (= mean return).
 * Used to back-check the standard payouts in tests; (1 − rtp) is the house edge.
 */
export function rtpOf(spec: BetSpec): number {
  let total = 0
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      for (let c = 1; c <= 6; c++) {
        total += betReturn(spec, [a, b, c])
      }
    }
  }
  return total / 216
}

/** The inherent house edge of a bet (1 − rtp). */
export function edgeOf(spec: BetSpec): number {
  return 1 - rtpOf(spec)
}

/** Human label for a bet (UI + history). */
export function betLabel(spec: BetSpec): string {
  switch (spec.type) {
    case 'small':
      return 'Small'
    case 'big':
      return 'Big'
    case 'odd':
      return 'Odd'
    case 'even':
      return 'Even'
    case 'single':
      return `Single ${spec.param}`
    case 'combo':
      return `Combo ${spec.param}·${spec.param2}`
    case 'double':
      return `Double ${spec.param}s`
    case 'anyTriple':
      return 'Any Triple'
    case 'triple':
      return `Triple ${spec.param}s`
    case 'total':
      return `Total ${spec.param}`
  }
}
