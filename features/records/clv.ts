/**
 * Closing-line value (CLV) for the verified record — honestly GATED.
 *
 * CLV-beat needs the price a bet was struck at AND a de-vigged closing price. The book has the
 * math (`closingLineValue` in sportsbook/trading) but the production ledger does NOT capture a
 * closing price per settled ticket — so for real ledger data CLV is reported as UNAVAILABLE
 * with a note, never faked. Seeded demo bets carry closing lines so the surface renders
 * populated. Production lights this up by snapshotting the de-vigged closing line into the
 * ledger at settlement (server-side) — see the records README / SEAM notes.
 */

import { closingLineValue } from '../../sportsbook/trading/index.js'
import type { ClvDatum, ClvSummary } from './types.js'

const NO_DATA_NOTE =
  'No closing-line data captured yet — needs a server-side closing-line snapshot at settlement.'

/**
 * Summarise CLV over priced bets. Empty input → available:false (honest gate). Otherwise
 * beatRate = % of bets that beat the close (clv > 0); avgClvPct = mean CLV as a percent.
 */
export function clvSummary(data: ClvDatum[]): ClvSummary {
  if (data.length === 0) {
    return { available: false, sampleSize: 0, beatRate: 0, avgClvPct: 0, note: NO_DATA_NOTE }
  }
  let beat = 0
  let total = 0
  for (const d of data) {
    const clv = closingLineValue(d.betDecimal, d.closeFairProb)
    if (clv > 0) beat++
    total += clv
  }
  return {
    available: true,
    sampleSize: data.length,
    beatRate: (beat / data.length) * 100,
    avgClvPct: (total / data.length) * 100,
  }
}
