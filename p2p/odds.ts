/**
 * The no-vig odds math for a peer-to-peer challenge — pure functions, no money, no state.
 *
 * The whole mechanic is two opposing stakes and one pot. The proposer agrees decimal odds `d`
 * (d > 1; 2.0 = even money) and stakes `S`. The accepter must cover the proposer's potential
 * PROFIT, so the accepter stakes `S × (d − 1)`. The pot is the sum of both stakes and the
 * winner takes ALL of it — there is no house margin anywhere.
 *
 * Why this is exactly zero-sum (zero house leakage), for ANY stake ratio:
 *   pot = winnerStake + loserStake
 *   the winner is settled at core multiplier  m = pot / winnerStake
 *   winner profit = winnerStake × (m − 1) = pot − winnerStake = loserStake
 *   the loser loses exactly loserStake
 *   ⇒ winner gain (+loserStake) + loser loss (−loserStake) = 0.
 * The two integer stakes are the source of truth; `decimalOdds` is display only, so integer
 * rounding of the derived accepter stake can never move credits — settlement reads the stakes.
 */

import type { Challenge } from './types.js'

/** Decimal odds for an even-money (1:1) challenge — equal stakes, winner doubles up. */
export const EVEN_ODDS = 2

/** Smallest stake either side may put up: 1 credit-cent (core rejects non-positive stakes). */
export const MIN_STAKE_CENTS = 1

/**
 * The accepter's required stake to cover the proposer's potential profit at the agreed odds:
 * `accepterStake = round(proposerStake × (decimalOdds − 1))`. Even money (2.0) ⇒ equal stakes.
 * Rounds to whole cents; the result is clamped to ≥ 1 so a tiny edge still has a real pot.
 */
export function accepterStakeFor(proposerStakeCents: number, decimalOdds: number): number {
  if (!Number.isInteger(proposerStakeCents) || proposerStakeCents <= 0) {
    throw new Error(
      `proposer stake must be a positive whole number of credits, got ${proposerStakeCents}`,
    )
  }
  if (!(decimalOdds > 1) || !Number.isFinite(decimalOdds)) {
    throw new Error(`decimal odds must be > 1, got ${decimalOdds}`)
  }
  return Math.max(MIN_STAKE_CENTS, Math.round(proposerStakeCents * (decimalOdds - 1)))
}

/** The total pot = both stakes. The winner takes all of it; the house takes nothing. */
export function potCents(c: Pick<Challenge, 'proposerStakeCents' | 'accepterStakeCents'>): number {
  return c.proposerStakeCents + c.accepterStakeCents
}

/**
 * The core win-multiplier for the winning side: `pot / winnerStake`. Always > 1 (the loser's
 * stake is positive), so it satisfies core's "a win needs a multiplier > 1" rule. Settling the
 * winner at this multiple makes their profit exactly the loser's stake — the zero-sum identity.
 */
export function winnerMultiplier(winnerStakeCents: number, pot: number): number {
  if (winnerStakeCents <= 0) throw new Error('winner stake must be positive')
  return pot / winnerStakeCents
}

/** The accepter's implied decimal odds (the mirror of the proposer's): `pot / accepterStake`. */
export function accepterDecimalOdds(
  c: Pick<Challenge, 'proposerStakeCents' | 'accepterStakeCents'>,
): number {
  return potCents(c) / c.accepterStakeCents
}

/** The stake the WINNING side risked — used to settle them at `pot / winnerStake`. */
export function winnerStakeCents(c: Challenge, winner: 'proposer' | 'accepter'): number {
  return winner === 'proposer' ? c.proposerStakeCents : c.accepterStakeCents
}
