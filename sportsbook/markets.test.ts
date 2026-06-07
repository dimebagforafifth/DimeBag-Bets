import { describe, it, expect } from 'vitest'
import { EVENTS, LEAGUES, SPORTS, leaguesInSport, gradeSelection, type Selection } from './markets.js'

const sel = (over: Partial<Selection>): Selection => ({
  id: 's',
  eventId: 'e',
  market: 'moneyline',
  pick: 'home',
  label: 'x',
  odds: -110,
  ...over,
})

describe('fixtures', () => {
  it('gives every event the six standard selections', () => {
    expect(EVENTS.length).toBeGreaterThan(0)
    for (const e of EVENTS) {
      expect(e.selections).toHaveLength(6)
      const kinds = e.selections.map((s) => `${s.market}-${s.pick}`)
      expect(new Set(kinds).size).toBe(6)
    }
  })
})

describe('sport tier', () => {
  it('gives every event a sport and groups its leagues underneath', () => {
    for (const e of EVENTS) expect(e.sport).toBeTruthy()
    // the slate spans several sports, and at least two sports carry >1 league
    expect(SPORTS).toEqual(expect.arrayContaining(['Basketball', 'Football', 'Soccer', 'Hockey']))
    expect(new Set(SPORTS).size).toBe(SPORTS.length) // no dupes
    expect(leaguesInSport('Basketball')).toEqual(expect.arrayContaining(['NBA', 'EuroLeague']))
    expect(leaguesInSport('Soccer').length).toBeGreaterThanOrEqual(2)
  })

  it('scopes leagues to their sport — every league rolls up to exactly one sport', () => {
    for (const s of SPORTS) {
      for (const l of leaguesInSport(s)) {
        expect(LEAGUES).toContain(l)
        // a league appears under only the one sport
        const sportsWithLeague = SPORTS.filter((x) => leaguesInSport(x).includes(l))
        expect(sportsWithLeague).toEqual([s])
      }
    }
  })
})

describe('moneyline grading', () => {
  it('pays the side that won, pushes a tie', () => {
    expect(gradeSelection(sel({ pick: 'home' }), { home: 3, away: 1 })).toBe('win')
    expect(gradeSelection(sel({ pick: 'away' }), { home: 3, away: 1 })).toBe('loss')
    expect(gradeSelection(sel({ pick: 'home' }), { home: 2, away: 2 })).toBe('push')
  })
})

describe('spread grading', () => {
  it('covers, pushes on the number, loses otherwise', () => {
    const homeFav = sel({ market: 'spread', pick: 'home', line: -3 })
    expect(gradeSelection(homeFav, { home: 10, away: 6 })).toBe('win') // wins by 4 > 3
    expect(gradeSelection(homeFav, { home: 10, away: 7 })).toBe('push') // wins by exactly 3
    expect(gradeSelection(homeFav, { home: 10, away: 8 })).toBe('loss') // wins by 2 < 3
    const awayDog = sel({ market: 'spread', pick: 'away', line: +3 })
    expect(gradeSelection(awayDog, { home: 10, away: 8 })).toBe('win') // +3 covers a 2-pt loss
  })

  it('half-point spreads never push', () => {
    const s = sel({ market: 'spread', pick: 'home', line: -3.5 })
    expect(gradeSelection(s, { home: 10, away: 7 })).toBe('loss')
    expect(gradeSelection(s, { home: 11, away: 7 })).toBe('win')
  })
})

describe('total grading', () => {
  it('compares the combined score to the line', () => {
    const over = sel({ market: 'total', pick: 'over', line: 220.5 })
    const under = sel({ market: 'total', pick: 'under', line: 220.5 })
    expect(gradeSelection(over, { home: 120, away: 110 })).toBe('win') // 230 > 220.5
    expect(gradeSelection(under, { home: 120, away: 110 })).toBe('loss')
    expect(gradeSelection(sel({ market: 'total', pick: 'over', line: 200 }), { home: 100, away: 100 })).toBe(
      'push',
    )
  })
})

describe('void', () => {
  it('voids when there is no result or it is not official', () => {
    expect(gradeSelection(sel({}), null)).toBe('void')
    expect(gradeSelection(sel({}), { home: 3, away: 1, official: false })).toBe('void')
  })
})
