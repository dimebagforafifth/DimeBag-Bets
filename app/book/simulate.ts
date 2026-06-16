/**
 * Demo/dev control to simulate BETTING activity end-to-end: place sample bets
 * across several players, then advance them through to settlement — so the full
 * bet → live activity → player figure → weekly settlement flow runs without waiting
 * on a real game. (The FEED lane fakes the odds; this fakes the betting.)
 *
 * Everything routes through the real placement path (`placeBookBet`/`settleBookBet`)
 * and the real `core` figures — nothing here is cosmetic. Credit/balance only.
 */

import type { Outcome } from '../../core/index.js'
import { getBookOddsSnapshot } from './odds-source.js'
import { legFromSelection, type SlipLeg } from './slip.js'
import { accountFor, placeBookBet, settleBookBet } from './placement.js'
import { getBets, openBets, type BookBet } from './bets-store.js'
import { getBook } from '../book-store.js'

/** The seed players we spread demo action across (skipped if absent/insufficient). */
const SAMPLE_PLAYERS = ['p-marco', 'p-lena', 'p-tariq', 'p-priya']

/** First available selection of a given market type from the slate, as a slip leg. */
function legAt(eventIndex: number, type: SlipLeg['marketType'], side: string): SlipLeg | null {
  const { events } = getBookOddsSnapshot()
  const ev = events[eventIndex]
  if (!ev) return null
  const market = ev.markets.find((m) => m.type === type)
  const sel = market?.selections.find((s) => s.side === side && s.available)
  return market && sel ? legFromSelection(ev, market, sel) : null
}

/**
 * Place a spread of demo bets: a moneyline single for most sample players, plus one
 * 2-leg parlay — each on a different player's real figure. Stakes are modest so they
 * fit the seeded credit. Returns the bets that actually placed.
 */
export function placeSampleBets(now: number, stakeCents = 5_000): BookBet[] {
  const placed: BookBet[] = []
  const moneyline = legAt(0, 'moneyline', 'home')
  const totalOver = legAt(1, 'total', 'over')
  const spreadHome = legAt(2, 'spread', 'home')

  const book = getBook()
  SAMPLE_PLAYERS.forEach((pid, i) => {
    const account = accountFor(pid)
    const member = book.members[pid]
    if (!account || !member) return
    const playerName = member.name
    try {
      if (i === 0 && moneyline && totalOver) {
        // one player gets a 2-leg parlay (cross-game, so it's a true parlay)
        placed.push(
          ...placeBookBet({
            account,
            playerName,
            placedBy: playerName,
            legs: [moneyline, totalOver],
            mode: 'parlay',
            stakeCents,
            now,
          }),
        )
      } else {
        const leg = i % 2 === 0 ? spreadHome : moneyline
        if (!leg) return
        placed.push(
          ...placeBookBet({
            account,
            playerName,
            placedBy: playerName,
            legs: [leg],
            mode: 'single',
            stakeCents,
            now,
          }),
        )
      }
    } catch {
      // insufficient available / locked — skip this player in the demo
    }
  })
  return placed
}

export type SimulateResult = 'win' | 'loss' | 'mixed'

/**
 * Settle every open demo bet, forcing outcomes. 'win' wins them all, 'loss' loses
 * them all, 'mixed' alternates — each settling the player's real figure through
 * `core`. Returns how many were settled.
 */
export function settleOpenBets(now: number, result: SimulateResult = 'mixed'): number {
  const open = openBets(getBets())
  let settled = 0
  open.forEach((bet, i) => {
    const outcome: Outcome =
      result === 'win' ? 'win' : result === 'loss' ? 'loss' : i % 2 === 0 ? 'win' : 'loss'
    const legOutcomes: Record<string, Outcome> = {}
    // For a parlay, forcing the FIRST leg carries the bet (loss loses it; win wins all).
    bet.legs.forEach((l, idx) => {
      legOutcomes[l.key] = idx === 0 ? outcome : 'win'
    })
    if (settleBookBet(bet.id, legOutcomes, now) != null) settled += 1
  })
  return settled
}
