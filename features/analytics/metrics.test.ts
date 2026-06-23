import { describe, expect, it } from 'vitest'
import {
  holdBySport,
  parlayMix,
  figureTrend,
  cohortRetention,
  perActiveMember,
  netMarginPct,
  type AnBet,
  type AnRecord,
  type SignupRef,
} from './metrics.js'

const DAY = 86_400_000

/* ---------- small hand-crafted builders (no demo seed, no app stores) ------- */

const bet = (over: Partial<AnBet> = {}): AnBet => ({
  accountId: 'p1',
  mode: 'single',
  sgp: false,
  legs: 1,
  sports: ['BASKETBALL'],
  leagues: ['NBA'],
  stakeCents: 1000,
  status: 'lost',
  ...over,
})

const rec = (over: Partial<AnRecord> = {}): AnRecord => ({
  time: 0,
  accountId: 'p1',
  gameKey: 'mines',
  game: 'Mines',
  kind: 'wager',
  stake: 1000,
  profit: 0,
  multiplier: 1,
  outcome: 'loss',
  ...over,
})

/* ================================ holdBySport ============================== */

describe('holdBySport', () => {
  it('computes houseGGR = stake − returnCents on settled bets, holdPct = ggr/turnover', () => {
    const bets: AnBet[] = [
      // BASKETBALL: a 1000-stake loss (returns 0 ⇒ ggr 1000)
      bet({ sports: ['BASKETBALL'], stakeCents: 1000, status: 'lost' }),
      // BASKETBALL: a 2000-stake win returning 3000 ⇒ ggr = 2000 − 3000 = −1000
      bet({ sports: ['BASKETBALL'], stakeCents: 2000, status: 'won', returnCents: 3000 }),
      // BASEBALL: a 500-stake push returning 500 ⇒ ggr = 500 − 500 = 0
      bet({
        sports: ['BASEBALL'],
        leagues: ['MLB'],
        stakeCents: 500,
        status: 'push',
        returnCents: 500,
      }),
    ]
    const rows = holdBySport(bets)

    // turnover desc ⇒ BASKETBALL (3000) before BASEBALL (500)
    expect(rows.map((r) => r.sport)).toEqual(['BASKETBALL', 'BASEBALL'])

    const nba = rows[0]
    expect(nba.bets).toBe(2)
    expect(nba.turnover).toBe(3000) // 1000 + 2000
    expect(nba.houseGGR).toBe(0) // 1000 + (−1000)
    expect(nba.holdPct).toBe(0) // 0 / 3000

    const mlb = rows[1]
    expect(mlb.bets).toBe(1)
    expect(mlb.turnover).toBe(500)
    expect(mlb.houseGGR).toBe(0) // 500 − 500
    expect(mlb.holdPct).toBe(0)
  })

  it('uses cashedOutCents for cashed bets (falls back to returnCents)', () => {
    const bets: AnBet[] = [
      // cashed with explicit cashedOutCents: ggr = 1000 − 700 = 300
      bet({ stakeCents: 1000, status: 'cashed', cashedOutCents: 700, returnCents: 999 }),
      // cashed with only returnCents present: ggr = 2000 − 1500 = 500
      bet({ stakeCents: 2000, status: 'cashed', returnCents: 1500 }),
    ]
    const rows = holdBySport(bets)
    expect(rows).toHaveLength(1)
    expect(rows[0].sport).toBe('BASKETBALL')
    expect(rows[0].turnover).toBe(3000)
    expect(rows[0].houseGGR).toBe(800) // 300 + 500
    // holdPct = 800 / 3000
    expect(rows[0].holdPct).toBeCloseTo(800 / 3000, 12)
  })

  it('excludes open bets entirely', () => {
    const bets: AnBet[] = [
      bet({ sports: ['HOCKEY'], stakeCents: 9999, status: 'open' }),
      bet({ sports: ['HOCKEY'], stakeCents: 1000, status: 'lost' }),
    ]
    const rows = holdBySport(bets)
    expect(rows).toHaveLength(1)
    expect(rows[0].sport).toBe('HOCKEY')
    expect(rows[0].bets).toBe(1) // open one not counted
    expect(rows[0].turnover).toBe(1000) // open stake excluded
    expect(rows[0].houseGGR).toBe(1000)
    expect(rows[0].holdPct).toBe(1) // 1000 / 1000
  })

  it("buckets a cross-sport parlay as 'multi-sport' and a single sport by name", () => {
    const bets: AnBet[] = [
      bet({
        mode: 'parlay',
        legs: 2,
        sports: ['BASKETBALL', 'BASEBALL'],
        leagues: ['NBA', 'MLB'],
        stakeCents: 1000,
        status: 'lost',
      }),
      bet({ sports: ['SOCCER'], leagues: ['EPL'], stakeCents: 400, status: 'lost' }),
    ]
    const rows = holdBySport(bets)
    const sports = rows.map((r) => r.sport).sort()
    expect(sports).toEqual(['SOCCER', 'multi-sport'])
    const multi = rows.find((r) => r.sport === 'multi-sport')!
    expect(multi.bets).toBe(1)
    expect(multi.turnover).toBe(1000)
    expect(multi.houseGGR).toBe(1000) // lost, returns 0
  })

  it("buckets a bet with no sports as 'unknown'", () => {
    const rows = holdBySport([bet({ sports: [], stakeCents: 250, status: 'lost' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].sport).toBe('unknown')
    expect(rows[0].houseGGR).toBe(250)
  })

  it('returns an empty array when there are no settled bets', () => {
    expect(holdBySport([])).toEqual([])
    expect(holdBySport([bet({ status: 'open' })])).toEqual([])
  })
})

/* ================================ parlayMix =============================== */

describe('parlayMix', () => {
  it('computes penetration ratios across ALL bets (open included)', () => {
    const bets: AnBet[] = [
      bet({ mode: 'single', stakeCents: 1000, status: 'lost' }),
      bet({ mode: 'single', stakeCents: 1000, status: 'open' }),
      bet({ mode: 'parlay', legs: 3, sgp: false, stakeCents: 2000, status: 'lost' }),
      bet({
        mode: 'parlay',
        legs: 5,
        sgp: true,
        stakeCents: 2000,
        status: 'won',
        returnCents: 9000,
      }),
    ]
    const m = parlayMix(bets)

    expect(m.totalBets).toBe(4)
    expect(m.singles).toBe(2)
    expect(m.parlays).toBe(2)
    expect(m.sgp).toBe(1)

    // parlayPct = 2/4 = 0.5
    expect(m.parlayPct).toBe(0.5)
    // sgpPct = 1/4 = 0.25
    expect(m.sgpPct).toBe(0.25)
    // total turnover = 1000+1000+2000+2000 = 6000; parlay turnover = 4000
    expect(m.parlayTurnoverPct).toBeCloseTo(4000 / 6000, 12)
    // avgParlayLegs = (3 + 5) / 2 = 4
    expect(m.avgParlayLegs).toBe(4)
  })

  it('is all-zero (no NaN) on an empty book', () => {
    const m = parlayMix([])
    expect(m).toEqual({
      totalBets: 0,
      singles: 0,
      parlays: 0,
      sgp: 0,
      parlayPct: 0,
      sgpPct: 0,
      parlayTurnoverPct: 0,
      avgParlayLegs: 0,
    })
  })

  it('reports avgParlayLegs 0 when there are only singles', () => {
    const m = parlayMix([bet({ mode: 'single' }), bet({ mode: 'single' })])
    expect(m.parlays).toBe(0)
    expect(m.avgParlayLegs).toBe(0)
    expect(m.parlayPct).toBe(0)
    expect(m.parlayTurnoverPct).toBe(0)
  })
})

/* =============================== figureTrend ============================== */

describe('figureTrend', () => {
  it('buckets daily oldest→newest, gap-fills, and runs cumulativeNet', () => {
    // now sits on a clean day boundary so floor math is easy.
    const days = 3
    const now = 100 * DAY // day index 100
    // startDay = floor((now − (days−1)*DAY)/DAY) = 100 − 2 = 98
    // buckets: day 98 (i=0), day 99 (i=1), day 100 (i=2)

    const records: AnRecord[] = [
      // day 98: a wager the player LOST 1000 (profit −1000) ⇒ houseGGR = +1000
      rec({ time: 98 * DAY + 10, kind: 'wager', profit: -1000 }),
      // day 99: GAP — no records ⇒ houseGGR 0 (still plotted)
      // day 100: a wager the player WON 500 (profit +500) ⇒ houseGGR = −500
      rec({ time: 100 * DAY + 5, kind: 'wager', profit: 500 }),
      // day 100: a bonus grant of 200 (profit 200) ⇒ bonusCost = 200
      rec({ time: 100 * DAY + 6, kind: 'bonus', profit: 200, gameKey: 'bonus', game: 'Bonus' }),
      // out of window (day 97) ⇒ ignored
      rec({ time: 97 * DAY, kind: 'wager', profit: -9999 }),
    ]

    const trend = figureTrend(records, now, days)
    expect(trend).toHaveLength(3)

    // day starts
    expect(trend[0].dayStart).toBe(98 * DAY)
    expect(trend[1].dayStart).toBe(99 * DAY)
    expect(trend[2].dayStart).toBe(100 * DAY)

    // houseGGR
    expect(trend[0].houseGGR).toBe(1000)
    expect(trend[0].bonusCost).toBe(0)
    expect(trend[1].houseGGR).toBe(0) // gap-filled flat day
    expect(trend[1].bonusCost).toBe(0)
    expect(trend[2].houseGGR).toBe(-500)
    expect(trend[2].bonusCost).toBe(200)

    // cumulativeNet = running sum of (ggr − bonus)
    // i0: 1000 − 0 = 1000
    // i1: 1000 + (0 − 0) = 1000
    // i2: 1000 + (−500 − 200) = 300
    expect(trend[0].cumulativeNet).toBe(1000)
    expect(trend[1].cumulativeNet).toBe(1000)
    expect(trend[2].cumulativeNet).toBe(300)
  })

  it('produces a length-`days` all-zero series when there are no records', () => {
    const trend = figureTrend([], 100 * DAY, 5)
    expect(trend).toHaveLength(5)
    for (const p of trend) {
      expect(p.houseGGR).toBe(0)
      expect(p.bonusCost).toBe(0)
      expect(p.cumulativeNet).toBe(0)
    }
    // oldest→newest, contiguous day starts
    expect(trend[0].dayStart).toBe(96 * DAY) // 100 − (5−1)
    expect(trend[4].dayStart).toBe(100 * DAY)
  })
})

/* ============================= cohortRetention =========================== */

describe('cohortRetention', () => {
  it('retention[0] = 1 when every member is active in week 0, only reports elapsed periods', () => {
    const period = 7 * DAY
    // Cohort week aligned to multiples of `period` from epoch.
    // Put signups inside week index 10 ⇒ cohortStart = 10*period.
    const cohortStart = 10 * period
    const signups: SignupRef[] = [
      { id: 'a', signupAt: cohortStart + DAY },
      { id: 'b', signupAt: cohortStart + 2 * DAY },
    ]
    // now is 9 days after cohortStart ⇒ floor(9d/7d)+1 = 1+1 = 2 elapsed periods
    const now = cohortStart + 9 * DAY

    const records: AnRecord[] = [
      // week 0 [cohortStart, +7d): both active
      rec({ accountId: 'a', kind: 'wager', time: cohortStart + DAY }),
      rec({ accountId: 'b', kind: 'wager', time: cohortStart + 3 * DAY }),
      // week 1 [+7d, +14d): only 'a' active
      rec({ accountId: 'a', kind: 'wager', time: cohortStart + 8 * DAY }),
      // a bonus record must NOT count toward activity
      rec({ accountId: 'b', kind: 'bonus', time: cohortStart + 8 * DAY, profit: 100 }),
    ]

    const rows = cohortRetention(signups, records, now)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.cohortStart).toBe(cohortStart)
    expect(row.size).toBe(2)
    // only 2 periods elapsed
    expect(row.retention).toHaveLength(2)
    // week 0: both active ⇒ 2/2 = 1
    expect(row.retention[0]).toBe(1)
    // week 1: only 'a' active (b's bonus ignored) ⇒ 1/2 = 0.5
    expect(row.retention[1]).toBe(0.5)
  })

  it('splits signups into separate weekly cohorts, sorted oldest→newest', () => {
    const period = 7 * DAY
    const c1 = 5 * period
    const c2 = 7 * period
    const signups: SignupRef[] = [
      { id: 'x', signupAt: c2 + DAY }, // later cohort first in input
      { id: 'y', signupAt: c1 + DAY },
    ]
    // far enough out that both have >= 1 elapsed period; cap at maxPeriods
    const now = c2 + 3 * DAY
    const records: AnRecord[] = [rec({ accountId: 'y', kind: 'wager', time: c1 + 2 * DAY })]

    const rows = cohortRetention(signups, records, now)
    expect(rows).toHaveLength(2)
    // sorted ascending by cohortStart
    expect(rows[0].cohortStart).toBe(c1)
    expect(rows[1].cohortStart).toBe(c2)
    // y active in its week 0 ⇒ 1/1
    expect(rows[0].retention[0]).toBe(1)
    // x never wagered ⇒ 0/1
    expect(rows[1].retention[0]).toBe(0)
  })

  it('honors a custom periodDays/periods and reports 0 retention for an inactive cohort', () => {
    const period = 30 * DAY
    const cohortStart = 2 * period
    const signups: SignupRef[] = [{ id: 'z', signupAt: cohortStart + 5 * DAY }]
    // now = cohortStart + 65 days ⇒ floor(65/30)+1 = 2+1 = 3, capped to periods:2
    const now = cohortStart + 65 * DAY
    const rows = cohortRetention(signups, [], now, { periodDays: 30, periods: 2 })
    expect(rows).toHaveLength(1)
    expect(rows[0].retention).toEqual([0, 0]) // capped at 2 periods, never active
  })
})

/* ============================ perActiveMember ============================ */

describe('perActiveMember', () => {
  it('sums turnover over distinct active players in the window', () => {
    const now = 100 * DAY
    const windowDays = 7
    const from = now - windowDays * DAY // 93*DAY
    const records: AnRecord[] = [
      // p1: two wagers in window (stakes 1000 + 500)
      rec({ accountId: 'p1', kind: 'wager', stake: 1000, time: from + DAY }),
      rec({ accountId: 'p1', kind: 'wager', stake: 500, time: now - 1 }),
      // p2: one wager in window (stake 2500)
      rec({ accountId: 'p2', kind: 'wager', stake: 2500, time: now - 2 * DAY }),
      // bonus record ignored
      rec({ accountId: 'p2', kind: 'bonus', stake: 999, time: now - DAY, profit: 50 }),
      // before window ⇒ ignored
      rec({ accountId: 'p3', kind: 'wager', stake: 9999, time: from - 1 }),
      // after now ⇒ ignored
      rec({ accountId: 'p4', kind: 'wager', stake: 8888, time: now + 1 }),
    ]
    const r = perActiveMember(records, now, windowDays)
    expect(r.activeMembers).toBe(2) // p1, p2
    expect(r.turnover).toBe(4000) // 1000 + 500 + 2500
    // perMemberCents = round(4000 / 2) = 2000
    expect(r.perMemberCents).toBe(2000)
    // betsPerMember = 3 bets / 2 members = 1.5
    expect(r.betsPerMember).toBe(1.5)
  })

  it('rounds perMemberCents to the nearest cent', () => {
    const now = 50 * DAY
    const records: AnRecord[] = [
      rec({ accountId: 'a', kind: 'wager', stake: 1000, time: now - DAY }),
      rec({ accountId: 'b', kind: 'wager', stake: 1000, time: now - DAY }),
      rec({ accountId: 'c', kind: 'wager', stake: 1001, time: now - DAY }),
    ]
    const r = perActiveMember(records, now, 7)
    expect(r.activeMembers).toBe(3)
    expect(r.turnover).toBe(3001)
    // round(3001 / 3) = round(1000.333…) = 1000
    expect(r.perMemberCents).toBe(1000)
    expect(r.betsPerMember).toBe(1)
  })

  it('is zero (no division-by-zero) when no players are active', () => {
    const r = perActiveMember([], 10 * DAY, 7)
    expect(r.activeMembers).toBe(0)
    expect(r.turnover).toBe(0)
    expect(r.perMemberCents).toBe(0)
    expect(r.betsPerMember).toBe(0)
  })
})

/* ============================== netMarginPct ============================= */

describe('netMarginPct', () => {
  it('computes (−playerNet − bonus) / turnover', () => {
    const records: AnRecord[] = [
      // wager: stake 1000, player lost (profit −1000)
      rec({ kind: 'wager', stake: 1000, profit: -1000 }),
      // wager: stake 1000, player won 300 (profit +300)
      rec({ kind: 'wager', stake: 1000, profit: 300 }),
      // bonus: cost 200 (profit 200)
      rec({ kind: 'bonus', stake: 0, profit: 200, gameKey: 'bonus', game: 'Bonus' }),
    ]
    // turnover = 2000; playerNet = −1000 + 300 = −700; bonus = 200
    // margin = (−(−700) − 200) / 2000 = (700 − 200)/2000 = 500/2000 = 0.25
    expect(netMarginPct(records)).toBeCloseTo(0.25, 12)
  })

  it('returns 0 when turnover is 0 (only bonuses)', () => {
    expect(netMarginPct([rec({ kind: 'bonus', stake: 0, profit: 500 })])).toBe(0)
    expect(netMarginPct([])).toBe(0)
  })

  it('can go negative when players beat the book net of bonuses', () => {
    const records: AnRecord[] = [
      rec({ kind: 'wager', stake: 1000, profit: 600 }), // player up 600
      rec({ kind: 'bonus', stake: 0, profit: 100 }),
    ]
    // (−600 − 100)/1000 = −0.7
    expect(netMarginPct(records)).toBeCloseTo(-0.7, 12)
  })
})
