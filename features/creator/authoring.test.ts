/**
 * Creator authoring: every theme template produces a valid, ready-to-create draft, and the
 * eligibility preview resolves the real field (all players / an agent's downline) read-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { TEMPLATES, TEMPLATE_ORDER, draftFromTemplate } from './authoring.js'
import { createCompetition, __resetCompetitions, eligiblePlayers } from '../events/index.js'
import { membersByRole, rosterOf } from '../org/index.js'
import { getBook } from '../../app/book-store.js'

const NOW = 1_750_000_000_000

beforeEach(() => __resetCompetitions())

describe('templates', () => {
  it('every theme is present and ordered', () => {
    expect(TEMPLATE_ORDER).toEqual([
      'weekly_race',
      'monthly_tournament',
      'seasonal',
      'holiday',
      'custom',
    ])
    for (const th of TEMPLATE_ORDER) expect(TEMPLATES[th].theme).toBe(th)
  })

  it('draftFromTemplate builds a draft the engine accepts', () => {
    for (const th of TEMPLATE_ORDER) {
      const draft = draftFromTemplate(th, 'operator', NOW)
      expect(draft.endsAt).toBeGreaterThan(draft.startsAt)
      const sum = draft.payoutSplit.reduce((a, b) => a + b, 0)
      expect(sum).toBeLessThanOrEqual(1 + 1e-9)
      const comp = createCompetition(draft) // round-trips through validation without throwing
      expect(comp.metric).toBe(TEMPLATES[th].metric)
      expect(comp.settlement).toBe('open')
    }
  })
})

describe('eligiblePlayers preview', () => {
  it('all → every player; downline → only that agent’s roster', () => {
    const all = eligiblePlayers({ kind: 'all' })
    expect(all.length).toBe(membersByRole(getBook(), 'player').length)

    const roster = rosterOf(getBook(), 'a-e')
      .map((p) => p.id)
      .sort()
    const downline = eligiblePlayers({ kind: 'downline', agentId: 'a-e' })
      .map((p) => p.id)
      .sort()
    expect(downline).toEqual(roster)
    expect(downline).toContain('p-marco') // Marco sits under East Desk
    expect(downline).not.toContain('p-dana') // Dana sits under the manager
  })
})
