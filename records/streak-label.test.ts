import { describe, expect, it } from 'vitest'
import { streakLabel } from './streak-label.js'

describe('streakLabel', () => {
  it('pluralizes wins cleanly', () => {
    expect(streakLabel(1, 'win')).toBe('1 win')
    expect(streakLabel(3, 'win')).toBe('3 wins')
  })

  it('pluralizes losses without the "losss" defect', () => {
    expect(streakLabel(1, 'loss')).toBe('1 loss')
    expect(streakLabel(2, 'loss')).toBe('2 losses')
    expect(streakLabel(3, 'loss')).toBe('3 losses')
    // the bug being fixed: never triple-s
    expect(streakLabel(2, 'loss')).not.toContain('losss')
  })

  it('renders a dash for no streak', () => {
    expect(streakLabel(0, 'none')).toBe('—')
    expect(streakLabel(5, 'none')).toBe('—')
    expect(streakLabel(0, 'win')).toBe('—')
  })
})
