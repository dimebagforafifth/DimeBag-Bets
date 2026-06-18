/**
 * Leaderboard — a pure read-only projection that ranks a competition's entrants by its
 * metric and assigns each a rank + the prize their rank wins from the pool. No money moves
 * here; `store.ts` consumes `payoutsFor` at close to actually grant prizes through `core`.
 */

import { metricValue } from './metrics.js'
import type { Competition, Entry, Payout, Standing } from './types.js'

/** The prize pool in cents: the operator guarantee + collected entry fees (fee × entrants). */
export function prizePool(comp: Competition, entrantCount: number): number {
  return comp.guaranteedCents + comp.entryFeeCents * entrantCount
}

/** The prize a given rank NOMINALLY wins (independent rounding) — a display helper. The
 *  actual distribution uses `allocatePrizes` so the total can never exceed the pool. */
export function prizeForRank(rank: number, poolCents: number, split: number[]): number {
  const frac = split[rank - 1] ?? 0
  return Math.round(poolCents * Math.max(0, frac))
}

/**
 * Distribute the pool across ranks under a split, in whole cents, such that the total paid
 * NEVER exceeds the pool (conservation). Floors each rank's share, then hands the rounding
 * remainder out one cent at a time by largest fractional part (largest-remainder method). A
 * split that sums to < 1 leaves the rake undistributed; the result index = rank − 1.
 */
export function allocatePrizes(poolCents: number, split: number[]): number[] {
  const ideals = split.map((f) => poolCents * Math.max(0, f))
  const floors = ideals.map((x) => Math.floor(x))
  const target = Math.min(poolCents, Math.round(ideals.reduce((a, b) => a + b, 0)))
  let remainder = target - floors.reduce((a, b) => a + b, 0)
  const out = [...floors]
  const byFrac = ideals
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0 && k < byFrac.length; k++, remainder--) out[byFrac[k].i] += 1
  return out
}

/**
 * Rank a competition's entrants by its metric (desc, name as a stable tiebreak) and stamp
 * each with a rank + prize. A DEMO event ranks its seeded snapshot so the board renders
 * populated; a real event derives every value live from settled activity in the window
 * (capped at `now` while the event is still live). Pure.
 */
export function standingsFor(comp: Competition, entries: Entry[], now: number): Standing[] {
  const entrants = entries.filter((e) => e.competitionId === comp.id)
  const windowEnd = Math.min(now, comp.endsAt)
  // The seeded board is for DISPLAY ONLY and only when nobody has really entered — a real
  // entrant always ranks live (demo events are non-joinable, so this is also defence in depth).
  const useSeed = comp.demo && comp.seededStandings?.length && entrants.length === 0
  const rows = useSeed
    ? comp.seededStandings!.map((s) => ({ accountId: s.accountId, name: s.name, value: s.value }))
    : entrants.map((e) => ({
        accountId: e.accountId,
        name: e.playerName,
        value: metricValue(comp.metric, e.accountId, comp.startsAt, windowEnd),
      }))
  const pool = comp.prizePoolCents ?? prizePool(comp, entrants.length)
  // Stable, locale-independent tiebreak: value desc, then name, then the immutable id.
  const ranked = rows
    .slice()
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.name.localeCompare(b.name) ||
        (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0),
    )
  const prizes = allocatePrizes(pool, comp.payoutSplit)
  return ranked.map((r, i) => ({
    accountId: r.accountId,
    name: r.name,
    value: r.value,
    rank: i + 1,
    prizeCents: prizes[i] ?? 0,
  }))
}

/** The in-the-money rows of a standings table, as the audited payout list close/pay use. */
export function payoutsFor(standings: Standing[]): Payout[] {
  return standings
    .filter((s) => s.prizeCents > 0)
    .map((s) => ({ accountId: s.accountId, name: s.name, rank: s.rank, prizeCents: s.prizeCents }))
}
