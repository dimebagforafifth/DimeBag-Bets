/**
 * Demo seed — realistic competitions so every surface renders fully populated:
 *   • three DISPLAY-ONLY samples (`demo: true`): a live weekly race + a live seasonal
 *     tournament with seeded leaderboards, and a finished + paid monthly tournament. These
 *     carry a seeded board so they render without ledger history; they are NOT joinable and
 *     CANNOT be settled (the store guards `comp.demo`) — they move no money, ever.
 *   • one REAL upcoming free-roll (via `createCompetition`): joinable, with the live money
 *     path (entry holds + close/pay through `core`) so the demo exercises the real flow.
 *
 * The seed itself moves NO money on load (idempotent): it registers display records and one
 * empty real event. Real credits move only when a player taps Join or an operator closes/pays.
 */

import { membersByRole } from '../org/index.js'
import { getBook } from '../../app/book-store.js'
import { allocatePrizes } from './leaderboard.js'
import { addCompetition, createCompetition, hasSeeded, markSeeded } from './store.js'
import type { Competition, MetricType, Payout, SeededStanding } from './types.js'

const DAY = 86_400_000

/** Up to 5 demo players to populate the boards (real member ids so rows link correctly). */
function demoPlayers(): { id: string; name: string }[] {
  return membersByRole(getBook(), 'player')
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.name }))
}

function seededStandings(
  players: { id: string; name: string }[],
  values: number[],
): SeededStanding[] {
  return players.map((p, i) => ({ accountId: p.id, name: p.name, value: values[i] ?? 0 }))
}

/** Seed the demo competitions (idempotent). Returns how many were added (0 if already). */
export function seedDemoCompetitions(now: number): number {
  if (hasSeeded()) return 0
  const players = demoPlayers()
  if (players.length === 0) {
    markSeeded()
    return 0
  }

  // 1) LIVE weekly race — most credits wagered (display sample).
  addCompetition(
    demoComp({
      id: 'demo-weekly-race',
      name: 'Weekly Action Race',
      theme: 'weekly_race',
      metric: 'wagered',
      startsAt: now - 3 * DAY,
      endsAt: now + 4 * DAY,
      entryFeeCents: 0,
      payoutSplit: [0.5, 0.3, 0.2],
      prizePoolCents: 50_000,
      standings: seededStandings(players, [1_250_000, 940_000, 610_000, 320_000, 150_000]),
      blurb: 'Most credits in play this week takes the top of the board.',
    }),
  )

  // 2) LIVE seasonal tournament — biggest multiplier (display sample).
  addCompetition(
    demoComp({
      id: 'demo-seasonal',
      name: 'Season Highlight Chase',
      theme: 'seasonal',
      metric: 'biggest_multiplier',
      startsAt: now - 20 * DAY,
      endsAt: now + 40 * DAY,
      entryFeeCents: 2_500,
      payoutSplit: [0.6, 0.25, 0.15],
      prizePoolCents: 250_000,
      standings: seededStandings(players, [48.5, 22.0, 15.25, 9.8, 4.2]),
      blurb: 'One huge hit can win it — biggest multiplier of the season.',
    }),
  )

  // 3) FINISHED + PAID monthly tournament — net profit (a settled historical record).
  {
    const standings = seededStandings(players, [820_000, 510_000, 240_000, -60_000, -180_000])
    const pool = 250_000
    const split = [0.5, 0.25, 0.15, 0.1]
    const prizes = allocatePrizes(pool, split)
    const ranked = [...standings].sort(
      (a, b) =>
        b.value - a.value ||
        a.name.localeCompare(b.name) ||
        (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0),
    )
    const payouts: Payout[] = ranked
      .map((s, i) => ({
        accountId: s.accountId,
        name: s.name,
        rank: i + 1,
        prizeCents: prizes[i] ?? 0,
      }))
      .filter((p) => p.prizeCents > 0)
    addCompetition({
      ...demoComp({
        id: 'demo-finished-monthly',
        name: 'Monthly Profit Tournament',
        theme: 'monthly_tournament',
        metric: 'net_profit',
        startsAt: now - 37 * DAY,
        endsAt: now - 7 * DAY,
        entryFeeCents: 2_500,
        payoutSplit: split,
        prizePoolCents: pool,
        standings,
        blurb: 'Last month’s ladder — settled and paid.',
      }),
      settlement: 'paid',
      payouts,
      paidAt: now - 7 * DAY,
    })
  }

  // 4) REAL upcoming free-roll — joinable, runs the live money path (no seeded board).
  createCompetition({
    name: 'Friday Free-Roll',
    theme: 'weekly_race',
    metric: 'wagered',
    startsAt: now + DAY,
    endsAt: now + 8 * DAY,
    entryFeeCents: 0,
    guaranteedCents: 30_000,
    payoutSplit: [0.6, 0.4],
    eligibility: { kind: 'all' },
    createdBy: 'operator',
    blurb: 'Free to enter — most action over the weekend takes the pot.',
  })

  markSeeded()
  return 4
}

/* -------------------------------- helpers ------------------------------- */

function demoComp(args: {
  id: string
  name: string
  theme: Competition['theme']
  metric: MetricType
  startsAt: number
  endsAt: number
  entryFeeCents: number
  payoutSplit: number[]
  prizePoolCents: number
  standings: SeededStanding[]
  blurb: string
}): Competition {
  return {
    id: args.id,
    name: args.name,
    theme: args.theme,
    metric: args.metric,
    startsAt: args.startsAt,
    endsAt: args.endsAt,
    entryFeeCents: args.entryFeeCents,
    guaranteedCents: args.prizePoolCents,
    payoutSplit: args.payoutSplit,
    eligibility: { kind: 'all' },
    settlement: 'open',
    createdBy: 'operator',
    blurb: args.blurb,
    demo: true,
    seededStandings: args.standings,
    prizePoolCents: args.prizePoolCents,
  }
}
