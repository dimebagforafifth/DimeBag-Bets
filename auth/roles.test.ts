import { describe, it, expect } from 'vitest'
import { allowedSections, canManage, canReach, defaultSection } from './roles.js'

describe('role → route access', () => {
  it('a player can play but cannot reach management', () => {
    expect(allowedSections('player')).toEqual([
      'casino',
      'sportsbook',
      'rewards',
      'mybets',
      'leaderboard',
      'community',
      'profile',
      'pickem',
      'challenges',
      'competitions',
      'gamification',
    ])
    expect(canReach('player', 'management')).toBe(false)
    expect(canManage('player')).toBe(false)
    expect(defaultSection('player')).toBe('casino')
  })

  it('agents and sub-agents reach the console, not the tables', () => {
    for (const role of ['agent', 'subagent'] as const) {
      expect(canManage(role)).toBe(true)
      expect(canReach(role, 'management')).toBe(true)
      expect(canReach(role, 'casino')).toBe(false)
      expect(defaultSection(role)).toBe('management')
    }
  })

  it('a manager (operator) reaches everything', () => {
    expect(canManage('manager')).toBe(true)
    for (const s of ['casino', 'sportsbook', 'mybets', 'leaderboard', 'management'] as const) {
      expect(canReach('manager', s)).toBe(true)
    }
  })
})
