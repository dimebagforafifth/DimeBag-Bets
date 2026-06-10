/**
 * Player Analysis — closing-line value (CLV), the flagship players-lane analytic.
 *
 * CLV measures how sharp a player is: did they consistently get a BETTER price than the
 * market's closing line? A player who beats the close over a large sample is +EV against
 * the book and should be limited; one who's reliably below the close is a profit center.
 *
 * This file has two parts, cleanly separated:
 *   1. A PURE engine (computePlayerClv / rankByClv / sharpness / suggestedMaxWager) that
 *      turns a list of priced, settled bets into per-player CLV metrics. Fully unit-tested.
 *   2. A DETERMINISTIC seed (seedClvBets) standing in for real bet history until the feed
 *      records closing prices.
 *
 * // SEAM / TODO(api): the engine is real; only its INPUT is seeded. When the odds feed +
 * // durable ledger record (priceTaken, priceClose) per graded sportsbook bet, replace
 * // seedClvBets with that history — computePlayerClv et al. stay unchanged.
 */

import type { Org } from '../../org/index.js'
import { membersByRole } from '../../org/index.js'
import { rngFor, pick } from './rng.js'

/** One priced, settled sportsbook bet — the engine's input row. */
export interface ClvBet {
  playerId: string
  sport: string
  market: string
  /** Stake in cents. */
  stake: number
  /** Decimal odds the player took. */
  priceTaken: number
  /** Decimal odds at close (market consensus by kickoff). */
  priceClose: number
  /** Settled P&L in cents (player perspective; negative = lost). */
  profit: number
  /** Epoch ms placed. */
  at: number
}

/** Per-player CLV summary the panel renders + sorts. */
export interface PlayerClv {
  playerId: string
  playerName: string
  totalBets: number
  /** Bets where priceTaken > priceClose (got a better number than the close). */
  beatLine: number
  /** beatLine / totalBets, 0..1. */
  beatRate: number
  /** Mean CLV % across all bets ((taken/close − 1) × 100). The headline edge number. */
  avgClvPct: number
  /** Net settled P&L in cents over the window. */
  points: number
  /** Total staked in cents (handle). */
  handle: number
  /** 0..100 sharpness score (shrinks toward 50 on small samples). */
  sharpness: number
  /** Suggested tightened max bet in cents (null = no change recommended). */
  suggestedMaxWager: number | null
  /** The player's current per-head max bet (cents) or null if uncapped. */
  currentMaxWager: number | null
}

/** CLV of a single bet, in percent: how much better the taken price was vs the close. */
export function clvPct(b: ClvBet): number {
  if (b.priceClose <= 0) return 0
  return (b.priceTaken / b.priceClose - 1) * 100
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Sharpness 0..100 from average CLV % and beat-rate, shrunk toward 50 when the sample is
 * thin (you can't trust a 3-bet read). A pro who averages ~+2.5% CLV and beats the close
 * ~60% of the time scores high; someone reliably under the close scores low.
 */
export function sharpness(avgClvPct: number, beatRate: number, n: number): number {
  const edge = clamp(avgClvPct, -3, 3) // ±3% brackets the realistic range
  const edgeScore = ((edge + 3) / 6) * 100 // 0..100
  const rateScore = beatRate * 100
  const raw = 0.7 * edgeScore + 0.3 * rateScore
  const confidence = Math.min(1, n / 20) // ~20 bets for full confidence
  return Math.round(50 + (raw - 50) * confidence)
}

/**
 * Recommend tightening a sharp player's ceiling. Only fires at sharpness ≥ 70 with a
 * positive edge; the cut deepens with sharpness. Returns null when no change is warranted
 * or the suggestion wouldn't actually tighten the current cap. Rounds to whole coins.
 */
export function suggestedMaxWager(
  sharp: number,
  avgClvPct: number,
  avgStake: number,
  currentMaxWager: number | null,
): number | null {
  if (sharp < 70 || avgClvPct <= 0) return null
  const factor = sharp >= 85 ? 0.5 : sharp >= 78 ? 0.65 : 0.8
  const base = currentMaxWager ?? Math.max(avgStake * 5, 100_00)
  const target = Math.max(100, Math.round((base * factor) / 100) * 100) // ≥ 1 coin, whole coins
  if (currentMaxWager != null && target >= currentMaxWager) return null
  return target
}

/** Roll one player's bets into a CLV summary. */
export function computePlayerClv(
  playerId: string,
  playerName: string,
  bets: ClvBet[],
  currentMaxWager: number | null,
): PlayerClv {
  const totalBets = bets.length
  let beatLine = 0
  let clvSum = 0
  let points = 0
  let handle = 0
  for (const b of bets) {
    const c = clvPct(b)
    clvSum += c
    if (b.priceTaken > b.priceClose) beatLine += 1
    points += b.profit
    handle += b.stake
  }
  const avgClvPct = totalBets ? clvSum / totalBets : 0
  const beatRate = totalBets ? beatLine / totalBets : 0
  const avgStake = totalBets ? handle / totalBets : 0
  const sharp = totalBets ? sharpness(avgClvPct, beatRate, totalBets) : 50
  return {
    playerId,
    playerName,
    totalBets,
    beatLine,
    beatRate,
    avgClvPct,
    points,
    handle,
    sharpness: sharp,
    suggestedMaxWager: suggestedMaxWager(sharp, avgClvPct, avgStake, currentMaxWager),
    currentMaxWager,
  }
}

export type ClvSortKey = 'sharpness' | 'avgClvPct' | 'beatLine' | 'points' | 'totalBets' | 'handle'

/** Summaries for every player with at least one bet in the set, sorted. */
export function rankByClv(
  org: Org,
  bets: ClvBet[],
  sortKey: ClvSortKey = 'sharpness',
  desc = true,
): PlayerClv[] {
  const byPlayer = new Map<string, ClvBet[]>()
  for (const b of bets) {
    const list = byPlayer.get(b.playerId) ?? []
    list.push(b)
    byPlayer.set(b.playerId, list)
  }
  const rows: PlayerClv[] = []
  for (const p of membersByRole(org, 'player')) {
    const list = byPlayer.get(p.id)
    if (!list || list.length === 0) continue
    rows.push(computePlayerClv(p.id, p.name, list, p.account.maxWager ?? null))
  }
  rows.sort((a, b) => (desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]))
  return rows
}

/* --------------------------- the seed (SEAM) ---------------------------- */

const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer'] as const
const MARKETS = ['Spread', 'Moneyline', 'Total', 'Player Prop'] as const

/**
 * Deterministic stand-in bet history. Each player gets a fixed "skill" in [-1, 1] from
 * their id; sharper players are biased to take a price ABOVE the eventual close (positive
 * CLV) and to win slightly more. Spread across the last ~90 days so the window selector
 * has something to filter. // SEAM: swap for the real durable ledger + odds feed.
 */
export function seedClvBets(org: Org): ClvBet[] {
  const now = Date.now()
  const DAY = 86_400_000
  const out: ClvBet[] = []
  for (const p of membersByRole(org, 'player')) {
    const rnd = rngFor(`clv:${p.id}`)
    const skill = rnd() * 2 - 1 // -1..1
    const n = 10 + Math.floor(rnd() * 18) // 10..27 bets
    for (let i = 0; i < n; i++) {
      const priceTaken = 1.5 + rnd() * 1.4 // 1.50..2.90
      // Sharper players' taken price sits above the close; weak players below.
      const drift = (skill * 0.06 + (rnd() - 0.5) * 0.05) * priceTaken
      const priceClose = Math.max(1.05, priceTaken - drift)
      const stake = (5 + Math.floor(rnd() * 40)) * 100 // 5..44 coins, in cents
      // Win probability tracks the closing implied prob plus the player's skill edge.
      const won = rnd() < 1 / priceClose + skill * 0.04
      const profit = won ? Math.round(stake * (priceTaken - 1)) : -stake
      out.push({
        playerId: p.id,
        sport: pick(SPORTS, rnd()),
        market: pick(MARKETS, rnd()),
        stake,
        priceTaken: Math.round(priceTaken * 100) / 100,
        priceClose: Math.round(priceClose * 100) / 100,
        profit,
        at: now - Math.floor(rnd() * 90) * DAY,
      })
    }
  }
  return out
}

/** Filter a bet set to the last `days` (or all when null). */
export function withinWindow(bets: ClvBet[], days: number | null, now: number): ClvBet[] {
  if (days == null) return bets
  const cutoff = now - days * 86_400_000
  return bets.filter((b) => b.at >= cutoff)
}
