/**
 * CLV-beat — the store-backed read side for a profile.
 *
 * It reads the verified record's closing-line summary (records/, already honestly gated) and
 * the account's recorded priced legs (app/book/bets-store), and composes the CLV-beat view.
 * Read-only: it reads projections and recorded bets, and writes nothing.
 */

import { getRecord } from '../records/index.js'
import { getBets } from '../app/book/bets-store.js'
import { clvBeat, type ClvBeatView, type ValueLeg } from './clv.js'

/** The account's priced legs — every recorded (non-void) leg carrying a locked true prob.
 *  Value is price-based and outcome-independent, so open + settled both count; voids don't. */
function valueLegsFor(accountId: string): ValueLeg[] {
  const legs: ValueLeg[] = []
  for (const b of getBets()) {
    if (b.accountId !== accountId || b.status === 'void') continue
    for (const leg of b.legs) {
      legs.push({
        decimal: leg.price.decimal,
        ...(leg.trueProb === undefined ? {} : { trueProb: leg.trueProb }),
      })
    }
  }
  return legs
}

/** The CLV-beat credibility view for a profile, honestly gated. The closing-line beat comes
 *  from the verified record (gated to n/a in production); the value-vs-taken from priced legs. */
export function clvBeatFor(accountId: string, now: number): ClvBeatView {
  return clvBeat({ closing: getRecord(accountId, now).clv, legs: valueLegsFor(accountId) })
}
