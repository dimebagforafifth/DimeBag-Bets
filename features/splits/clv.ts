/**
 * CLV-beat — a skill/credibility signal for a profile, PURE and honestly GATED.
 *
 * Two honest, clearly-separated signals (neither ever faked):
 *
 *  1. `closing` — true Closing-Line Value beat: did the bettor get a better number than the
 *     de-vigged CLOSING price? This needs a closing price per settled ticket, which the
 *     production ledger does not capture, so it is reported UNAVAILABLE (with a note) until
 *     closing-line snapshots exist — exactly the existing records `clvSummary` gate, reused
 *     verbatim (so this surface lights up on seeded demo data and gates to n/a in production).
 *
 *  2. `valueVsTaken` — value against the price TAKEN: each leg locks the book's own de-vigged
 *     true probability at add time, so `decimal · trueProb − 1` is the edge the bettor got over
 *     the no-vig line they bet into. This IS captured today, so it's a real number — but it is
 *     value-at-open, NOT closing-line value, and is labelled as such. Gated on priced legs.
 *
 * Read-only over recorded data; no money path, mints nothing.
 */

import { clvSummary } from '../records/index.js'
import type { ClvDatum, ClvSummary } from '../records/index.js'
import { expectedValue } from '../../sportsbook/trading/index.js'

/** A leg's taken price + its locked de-vigged true probability (the value-vs-taken input). */
export interface ValueLeg {
  /** Decimal price the leg was struck at (> 1). */
  decimal: number
  /** The book's de-vigged true win probability locked at add time (0..1), if known. */
  trueProb?: number
}

/**
 * Value against the price taken — the edge over the book's own de-vigged line at bet time.
 * Honestly distinct from closing-line value; gated on having priced legs. NOT called CLV.
 */
export interface ValueSummary {
  available: boolean
  /** Legs that carried a usable locked true probability (the sample). */
  sampleSize: number
  /** Percent of priced legs at a +value price (edge > 0). */
  beatRate: number
  /** Mean value edge across priced legs, as a percent. */
  avgEdgePct: number
  note?: string
}

const NO_VALUE_NOTE = 'No priced legs yet — needs bets carrying a locked de-vigged line.'

/** Summarise value-vs-taken over a leg set. A leg only counts when it carries a usable true
 *  probability in (0,1) at a price > 1 (so the EV is well-defined). Empty → available:false. */
export function valueVsTaken(legs: ValueLeg[]): ValueSummary {
  const priced = legs.filter(
    (l) =>
      typeof l.trueProb === 'number' &&
      (l.trueProb as number) > 0 &&
      (l.trueProb as number) < 1 &&
      Number.isFinite(l.decimal) &&
      l.decimal > 1,
  )
  if (priced.length === 0) {
    return { available: false, sampleSize: 0, beatRate: 0, avgEdgePct: 0, note: NO_VALUE_NOTE }
  }
  let beat = 0
  let total = 0
  for (const l of priced) {
    const e = expectedValue(l.trueProb as number, l.decimal) // decimal · trueProb − 1
    if (e > 0) beat++
    total += e
  }
  return {
    available: true,
    sampleSize: priced.length,
    beatRate: (beat / priced.length) * 100,
    avgEdgePct: (total / priced.length) * 100,
  }
}

/** The credibility CLV-beat view for a profile — both halves honestly gated. */
export interface ClvBeatView {
  /** True closing-line-value beat. Available only where closing-line data exists (n/a otherwise). */
  closing: ClvSummary
  /** Value over the de-vigged price taken. Available where priced legs exist. */
  valueVsTaken: ValueSummary
}

/**
 * Compose the CLV-beat view. `closing` may be supplied pre-summarised (the records projection
 * already gates it) or derived from raw closing-line data; both routes keep the honest gate.
 */
export function clvBeat(input: {
  closing: ClvSummary | ClvDatum[]
  legs: ValueLeg[]
}): ClvBeatView {
  const closing = Array.isArray(input.closing) ? clvSummary(input.closing) : input.closing
  return { closing, valueVsTaken: valueVsTaken(input.legs) }
}
