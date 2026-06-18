/**
 * The demo seed populates four competitions — a live race, a live seasonal, an upcoming
 * event, and a finished+paid one — so every surface renders fully. Idempotent; display-only
 * (it moves no money).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  seedDemoCompetitions,
  getCompetitions,
  getCompetition,
  statusOf,
  leaderboard,
  __resetCompetitions,
} from './index.js'

const NOW = 1_750_000_000_000

beforeEach(() => __resetCompetitions())

describe('seedDemoCompetitions', () => {
  it('seeds four populated competitions, idempotently', () => {
    expect(seedDemoCompetitions(NOW)).toBe(4)
    expect(seedDemoCompetitions(NOW)).toBe(0) // already seeded — no duplicates
    expect(getCompetitions()).toHaveLength(4)
  })

  it('covers the full lifecycle spread with populated boards', () => {
    seedDemoCompetitions(NOW)
    const statuses = getCompetitions().map((c) => statusOf(c, NOW))
    expect(statuses).toContain('live')
    expect(statuses).toContain('upcoming')
    expect(statuses).toContain('paid')

    // the live race board ranks its seeded entrants with a prize on top
    const race = getCompetition('demo-weekly-race')!
    const board = leaderboard(race, NOW)
    expect(board.length).toBeGreaterThan(1)
    expect(board[0].value).toBeGreaterThanOrEqual(board[1].value) // ranked desc
    expect(board[0].prizeCents).toBeGreaterThan(0)

    // the finished event carries its paid payouts
    const finished = getCompetition('demo-finished-monthly')!
    expect(finished.settlement).toBe('paid')
    expect((finished.payouts ?? []).length).toBeGreaterThan(0)
  })
})
