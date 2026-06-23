import { describe, it, expect } from 'vitest'
import { levelForXp, levelFromXp, XP_PER_LEVEL } from './xp.js'

describe('xp / levels', () => {
  it('starts at level 1 and advances every XP_PER_LEVEL', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1)
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2)
    expect(levelFromXp(XP_PER_LEVEL * 9)).toBe(10)
  })

  it('reports progress through the current level', () => {
    const info = levelForXp(XP_PER_LEVEL + 25)
    expect(info.level).toBe(2)
    expect(info.xpIntoLevel).toBe(25)
    expect(info.pct).toBeCloseTo(0.25)
  })
})
