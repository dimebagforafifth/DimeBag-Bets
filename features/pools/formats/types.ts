/**
 * The pool FORMAT-PLUGIN contract + each format's config / picks / results shapes.
 *
 * A format plugin is PURE (like pickem's gradeEntry / events' standingsFor): it turns
 * picks + posted results into ranked standings and prize-weight winners. It moves NO money —
 * the escrow applies the weights to the pool through core. Configs/picks/results are
 * discriminated unions keyed by `kind`, so each plugin narrows type-safely (no `any`).
 */

/* ----------------------------- pick'em ----------------------------- */
/** A binary matchup the entrant picks a side of. */
export interface PickemGame {
  id: string
  label: string
  options: [string, string]
}
export interface PickemConfig {
  kind: 'pickem'
  games: PickemGame[]
}
export interface PickemPicks {
  kind: 'pickem'
  /** gameId → chosen option. */
  selections: Record<string, string>
}
export interface PickemResults {
  kind: 'pickem'
  /** gameId → winning option (or 'void' to drop the game from scoring). */
  winners: Record<string, string>
}

/* --------------------------- confidence --------------------------- */
export interface ConfidenceConfig {
  kind: 'confidence'
  games: PickemGame[]
}
export interface ConfidencePicks {
  kind: 'confidence'
  selections: Record<string, string>
  /** gameId → confidence weight; must be a permutation of 1..N (each used once). */
  confidence: Record<string, number>
}
export interface ConfidenceResults {
  kind: 'confidence'
  winners: Record<string, string>
}

/* ---------------------------- survivor ---------------------------- */
export interface SurvivorConfig {
  kind: 'survivor'
  teams: string[]
  rounds: number
}
export interface SurvivorPicks {
  kind: 'survivor'
  /** round index → team picked to win that round (no team reused across rounds). */
  selections: Record<number, string>
}
export interface SurvivorResults {
  kind: 'survivor'
  /** round index → teams that WON (advanced) that round. A pick survives if its team is listed. */
  roundWinners: Record<number, string[]>
}

/* ----------------------------- bracket ---------------------------- */
export interface BracketMatchup {
  id: string
  round: number
  teamA: string
  seedA: number
  teamB: string
  seedB: number
}
export interface BracketConfig {
  kind: 'bracket'
  matchups: BracketMatchup[]
  /** Points for a correct pick by round index (defaults to 1 each). */
  pointsPerRound: number[]
  /** Extra points when the correctly-picked winner was the underdog (higher seed number). */
  upsetBonus: number
}
export interface BracketPicks {
  kind: 'bracket'
  /** matchupId → team picked to win. */
  winners: Record<string, string>
}
export interface BracketResults {
  kind: 'bracket'
  /** matchupId → team that actually won. */
  winners: Record<string, string>
}

/* ----------------------------- squares ---------------------------- */
export interface SquaresConfig {
  kind: 'squares'
  /** Scoring periods, e.g. ['Q1','Q2','Q3','Final']. */
  periods: string[]
  /** Fraction of the prize pool paid for each period (index-aligned to periods; Σ ≤ 1). */
  periodWeights: number[]
}
export interface SquaresPicks {
  kind: 'squares'
  /** The squares this entry holds: row = home last digit (0–9), col = away last digit (0–9). */
  squares: { row: number; col: number }[]
}
export interface SquaresResults {
  kind: 'squares'
  /** Score per period: home/away totals; the winning square is (home%10, away%10). */
  periodScores: { period: number; home: number; away: number }[]
}

/* ------------------------------ unions ----------------------------- */
export type PoolConfig =
  | PickemConfig
  | ConfidenceConfig
  | SurvivorConfig
  | BracketConfig
  | SquaresConfig
export type PoolPicks = PickemPicks | ConfidencePicks | SurvivorPicks | BracketPicks | SquaresPicks
export type PoolResults =
  | PickemResults
  | ConfidenceResults
  | SurvivorResults
  | BracketResults
  | SquaresResults

/* --------------------------- plugin contract ----------------------- */
export interface ScoredEntry {
  accountId: string
  name: string
  picks: PoolPicks
}
export interface FormatStanding {
  accountId: string
  name: string
  /** Format-native score (correct count / confidence points / survival round / bracket points). */
  points: number
  rank: number
  /** Short human note (e.g. 'eliminated R3', '2 squares'). */
  note?: string
}
/** A prize-eligible winner and their fraction of the prize pool (Σ over winners ≤ 1; any
 *  shortfall is the rake). */
export interface FormatWinner {
  accountId: string
  weight: number
}
export interface FormatScoreInput {
  config: PoolConfig
  results: PoolResults
  /** The pool's prizeStructure (rank weights); squares uses its own periodWeights instead. */
  prizeSplit: number[]
  entries: ScoredEntry[]
}

/** A pure scoring plugin for one pool format. Moves no money. */
export interface PoolFormat {
  kind: PoolConfig['kind']
  label: string
  defaultConfig(): PoolConfig
  /** Throws if the format config is malformed. */
  validateConfig(config: PoolConfig): void
  /** Throws if an entrant's picks are illegal for this config (e.g. survivor team reuse). */
  validatePicks(picks: PoolPicks, config: PoolConfig): void
  /** Ranked standings for display (pure; tolerates partial/empty results). */
  standings(input: FormatScoreInput): FormatStanding[]
  /** Prize-weight winners from the posted results (pure). */
  winners(input: FormatScoreInput): FormatWinner[]
}
