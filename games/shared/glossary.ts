/**
 * The single source of truth for player-facing betting/casino terms (CLAUDE.md
 * §4 "honest by default"). One flat map of term → plain-language explanation,
 * consumed by the shared <Term> info-icon (games/shared/GlossaryTerm) across the
 * casino and the sportsbook. Add a term here once; every surface can reference it.
 *
 * Keep explanations short, plain, and honest — they show in a small tooltip.
 */

export interface GlossaryEntry {
  /** The display name of the term. */
  term: string
  /** A one- or two-sentence plain-language explanation. */
  short: string
}

export const GLOSSARY = {
  multiplier: {
    term: 'Multiplier',
    short: 'What your bet is multiplied by if you win. Payout = bet × multiplier.',
  },
  payout: {
    term: 'Payout',
    short: 'The total points returned on a win — your stake times the multiplier (or odds).',
  },
  cashout: {
    term: 'Cash Out',
    short: 'Take the win early at the current value instead of letting the round run to the end.',
  },
  'provably-fair': {
    term: 'Provably fair',
    short:
      'The result is fixed by a cryptographic seed committed before you bet, so you can verify afterwards it was not changed.',
  },
  stake: {
    term: 'Stake',
    short: 'The amount of points you put at risk on a bet.',
  },
  'house-edge': {
    term: 'House edge',
    short:
      "The book's long-run margin, e.g. a 1% edge means 99% RTP. It is stated openly per game, not hidden.",
  },
  rtp: {
    term: 'RTP',
    short: 'Return to player — the long-run share of stakes paid back. 99% RTP = a 1% house edge.',
  },
  vig: {
    term: 'Vig',
    short: "The book's cut baked into the odds (also called juice or margin) — how the house makes money.",
  },
  moneyline: {
    term: 'Moneyline',
    short: 'A straight bet on which side wins the game outright, no points spread.',
  },
  spread: {
    term: 'Spread',
    short: 'A handicap on the margin: the favourite must win by more than the line, the underdog can lose by less.',
  },
  total: {
    term: 'Total',
    short: 'A bet on the combined score of both sides being Over or Under a posted number.',
  },
  parlay: {
    term: 'Parlay',
    short: 'One bet combining several legs — every leg must win, and the odds multiply for a bigger payout.',
  },
  'same-game-parlay': {
    term: 'Same Game Parlay',
    short: 'A parlay whose legs are all on the one game — combine several of its markets into a single bet.',
  },
  'round-robin': {
    term: 'Round robin',
    short: 'Auto-builds every smaller parlay combination from your picks, so one losing leg need not sink them all.',
  },
  leg: {
    term: 'Leg',
    short: 'One selection inside a parlay. Every leg must win for the parlay to pay.',
  },
  push: {
    term: 'Push',
    short: 'A tie against the line — your stake is returned, no win or loss. In a parlay the leg drops out.',
  },
  void: {
    term: 'Void',
    short: 'A bet cancelled (e.g. a postponed game) — your stake is returned. In a parlay the leg drops out.',
  },
  odds: {
    term: 'Odds',
    short: 'The price of a bet. They convert to a multiplier and lock in the moment you place.',
  },
  'cashout-margin': {
    term: 'Cash-out margin',
    short: 'A small fee (here 5%) the book takes when you cash out an open bet early — shown up front.',
  },
} as const satisfies Record<string, GlossaryEntry>

/** Every valid glossary key — use it to type-check `<Term id=… />` call sites. */
export type GlossaryId = keyof typeof GLOSSARY

/** Lookup that never throws; returns undefined for an unknown id. */
export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return (GLOSSARY as Record<string, GlossaryEntry>)[id]
}
