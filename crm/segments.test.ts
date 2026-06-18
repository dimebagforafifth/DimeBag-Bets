import { describe, it, expect } from 'vitest'
import type { BehaviorFeatures } from './types.js'
import {
  segmentOf,
  lifecycleOf,
  classifySegment,
  tagsOf,
  SEGMENT_LABEL,
  LIFECYCLE_LABEL,
  NEW_DAYS,
  DORMANT_DAYS,
  AT_RISK_CHURN,
} from './segments.js'

/**
 * A hand-crafted, fully-active, "ordinary casual" BehaviorFeatures.
 * Chosen so that with no overrides it falls through every precedence branch in
 * segmentOf() to 'casual' and through lifecycleOf() to 'habit'. Each test then
 * mutates only the fields relevant to the archetype under test.
 *
 * Deliberately NOT 'new'/'dormant':
 *   - bets > 0
 *   - daysSinceSignup (60) > NEW_DAYS (7)
 *   - recencyDays (3) <= DORMANT_DAYS (21)
 * Not a whale: stakeTier 'mid'. Not parlay-lotto: shares low. Not a grinder:
 * betsPerActiveDay 2. productLean 'mixed' ⇒ falls to 'casual'. churnRisk 0.1 ⇒ 'habit'.
 */
function features(overrides: Partial<BehaviorFeatures> = {}): BehaviorFeatures {
  return {
    playerId: 'p_1',
    name: 'Player One',
    bets: 40,
    turnoverCents: 200000,
    netCents: -5000,
    avgStakeCents: 5000,
    medianStakeCents: 5000,
    stakeTier: 'mid',
    topGameKey: 'mines',
    topGameName: 'Mines',
    topGameShare: 0.3,
    casinoShare: 0.5,
    sportsbookShare: 0.5,
    productLean: 'mixed',
    parlayShare: 0.1,
    sgpShare: 0.05,
    signupAt: 0,
    daysSinceSignup: 60,
    firstActive: 0,
    lastActive: 0,
    recencyDays: 3,
    activeDays: 20,
    betsPerActiveDay: 2,
    topUps: 0,
    sessions: 10,
    avgSessionMin: 20,
    winRate: 0.45,
    churnRisk: 0.1,
    ...overrides,
  }
}

describe('exported constants are the documented thresholds', () => {
  it('matches the brief', () => {
    expect(NEW_DAYS).toBe(7)
    expect(DORMANT_DAYS).toBe(21)
    expect(AT_RISK_CHURN).toBe(0.55)
  })
})

describe('the baseline fixture is a plain casual/habit player', () => {
  it('resolves to casual + habit so every other test isolates one branch', () => {
    const b = features()
    expect(segmentOf(b)).toBe('casual')
    expect(lifecycleOf(b, false)).toBe('habit')
  })
})

describe('segmentOf — each archetype resolves, in precedence order', () => {
  it('new: bets === 0 (even when otherwise long-tenured & active)', () => {
    const b = features({ bets: 0 })
    expect(segmentOf(b)).toBe('new')
  })

  it('new: daysSinceSignup <= NEW_DAYS', () => {
    // boundary: exactly 7 is still new (<=)
    expect(segmentOf(features({ daysSinceSignup: NEW_DAYS }))).toBe('new')
    expect(segmentOf(features({ daysSinceSignup: 0 }))).toBe('new')
    // 8 is no longer new on the days axis
    expect(segmentOf(features({ daysSinceSignup: NEW_DAYS + 1 }))).toBe('casual')
  })

  it('new wins over dormant (brand-new but lapsed still reads new)', () => {
    const b = features({ daysSinceSignup: 3, recencyDays: 40 })
    expect(segmentOf(b)).toBe('new')
  })

  it('dormant: recencyDays > DORMANT_DAYS', () => {
    // boundary: exactly 21 is NOT dormant (strict >)
    expect(segmentOf(features({ recencyDays: DORMANT_DAYS }))).toBe('casual')
    expect(segmentOf(features({ recencyDays: DORMANT_DAYS + 1 }))).toBe('dormant')
    expect(segmentOf(features({ recencyDays: 90 }))).toBe('dormant')
  })

  it('dormant wins over whale (a lapsed whale reads dormant)', () => {
    const b = features({ recencyDays: 30, stakeTier: 'whale' })
    expect(segmentOf(b)).toBe('dormant')
  })

  it('whale: stakeTier whale or high', () => {
    expect(segmentOf(features({ stakeTier: 'whale' }))).toBe('whale')
    expect(segmentOf(features({ stakeTier: 'high' }))).toBe('whale')
  })

  it('whale wins over parlay-lotto (a high-stake parlay chaser reads whale)', () => {
    const b = features({ stakeTier: 'high', sportsbookShare: 0.9, parlayShare: 0.8 })
    expect(segmentOf(b)).toBe('whale')
  })

  it('parlay-lotto: sportsbookShare >= 0.4 AND parlayShare >= 0.5', () => {
    // mid stakes so it doesn't get caught as whale
    const b = features({ stakeTier: 'mid', sportsbookShare: 0.4, parlayShare: 0.5 })
    expect(segmentOf(b)).toBe('parlay-lotto')
    expect(segmentOf(features({ stakeTier: 'low', sportsbookShare: 0.7, parlayShare: 0.6 }))).toBe(
      'parlay-lotto',
    )
  })

  it('parlay-lotto needs BOTH shares — either one short falls through', () => {
    // sportsbook share too low ⇒ not parlay-lotto; productLean mixed ⇒ casual
    expect(segmentOf(features({ sportsbookShare: 0.39, parlayShare: 0.9 }))).toBe('casual')
    // parlay share too low ⇒ not parlay-lotto
    expect(segmentOf(features({ sportsbookShare: 0.9, parlayShare: 0.49 }))).toBe('casual')
  })

  it('grinder: betsPerActiveDay >= 6 AND activeDays >= 4 AND micro/low stakes', () => {
    const micro = features({
      stakeTier: 'micro',
      betsPerActiveDay: 6,
      activeDays: 4,
      // keep parlay pattern off so it doesn't pre-empt
      sportsbookShare: 0.2,
      parlayShare: 0.1,
    })
    expect(segmentOf(micro)).toBe('grinder')

    const low = features({
      stakeTier: 'low',
      betsPerActiveDay: 10,
      activeDays: 12,
      sportsbookShare: 0.2,
      parlayShare: 0.1,
    })
    expect(segmentOf(low)).toBe('grinder')
  })

  it('grinder requires all three — a high-frequency MID-stake player is not a grinder', () => {
    // mid stake fails the (micro||low) clause; productLean mixed ⇒ casual
    const b = features({
      stakeTier: 'mid',
      betsPerActiveDay: 12,
      activeDays: 10,
      sportsbookShare: 0.2,
      parlayShare: 0.1,
    })
    expect(segmentOf(b)).toBe('casual')
    // too few active days
    expect(segmentOf(features({ stakeTier: 'low', betsPerActiveDay: 9, activeDays: 3 }))).toBe(
      'casual',
    )
    // not frequent enough
    expect(segmentOf(features({ stakeTier: 'low', betsPerActiveDay: 5, activeDays: 9 }))).toBe(
      'casual',
    )
  })

  it('sports-regular: sportsbook lean, no stronger pattern', () => {
    const b = features({
      productLean: 'sportsbook',
      // ensure not caught by parlay-lotto / whale / grinder
      stakeTier: 'mid',
      sportsbookShare: 0.6,
      parlayShare: 0.1,
      betsPerActiveDay: 2,
    })
    expect(segmentOf(b)).toBe('sports-regular')
  })

  it('casino-regular: casino lean, no stronger pattern', () => {
    const b = features({
      productLean: 'casino',
      stakeTier: 'mid',
      sportsbookShare: 0.1,
      parlayShare: 0.0,
      betsPerActiveDay: 2,
    })
    expect(segmentOf(b)).toBe('casino-regular')
  })

  it('casual: the fall-through when nothing else fires', () => {
    expect(segmentOf(features({ productLean: 'mixed' }))).toBe('casual')
  })
})

describe('lifecycleOf — each stage resolves, in precedence order', () => {
  it('dormant wins over everything, even VIP', () => {
    const b = features({ recencyDays: DORMANT_DAYS + 1 })
    expect(lifecycleOf(b, true)).toBe('dormant')
    expect(lifecycleOf(b, false)).toBe('dormant')
  })

  it('vip: an active VIP beats onboarding/at-risk/habit', () => {
    // active (recencyDays <= 21), brand new AND high churn — isVip still wins
    const b = features({ daysSinceSignup: 2, churnRisk: 0.99, recencyDays: 1 })
    expect(lifecycleOf(b, true)).toBe('vip')
  })

  it('onboarding: brand-new non-VIP active player', () => {
    const b = features({ daysSinceSignup: NEW_DAYS, recencyDays: 1 })
    expect(lifecycleOf(b, false)).toBe('onboarding')
  })

  it('reactivated: long-tenured, thin history, back within the last week', () => {
    const b = features({ daysSinceSignup: 30, activeDays: 4, recencyDays: 7 })
    expect(lifecycleOf(b, false)).toBe('reactivated')
  })

  it('reactivated needs all three — too many active days ⇒ at-risk/habit, not reactivated', () => {
    // activeDays 5 fails the (<=4) clause; with low churn it falls to habit
    const b = features({ daysSinceSignup: 30, activeDays: 5, recencyDays: 7, churnRisk: 0.1 })
    expect(lifecycleOf(b, false)).toBe('habit')
  })

  it('at-risk: still active but churnRisk >= AT_RISK_CHURN', () => {
    // boundary: exactly 0.55 trips at-risk; not new, not reactivated-shaped
    const b = features({
      daysSinceSignup: 60,
      recencyDays: 5,
      activeDays: 20,
      churnRisk: AT_RISK_CHURN,
    })
    expect(lifecycleOf(b, false)).toBe('at-risk')
    expect(lifecycleOf(features({ churnRisk: 0.8 }), false)).toBe('at-risk')
  })

  it('at-risk boundary: churnRisk just under threshold is habit', () => {
    const b = features({ churnRisk: AT_RISK_CHURN - 0.01 })
    expect(lifecycleOf(b, false)).toBe('habit')
  })

  it('habit: the settled, low-churn, active, non-VIP fall-through', () => {
    expect(lifecycleOf(features(), false)).toBe('habit')
  })
})

describe('a segment UPDATES as behaviour changes (same object, mutated field)', () => {
  it('recency drift flips an active casual player into dormant and back', () => {
    const active = features({ recencyDays: 2 })
    expect(segmentOf(active)).toBe('casual')

    // the player goes quiet — only recencyDays moves
    const lapsed = features({ recencyDays: 30 })
    expect(segmentOf(lapsed)).toBe('dormant')

    // ...and the very same change drives lifecycle the same way
    expect(lifecycleOf(active, false)).toBe('habit')
    expect(lifecycleOf(lapsed, false)).toBe('dormant')
  })

  it('rising stake tier promotes a casual player to whale', () => {
    const before = features({ stakeTier: 'mid' })
    expect(segmentOf(before)).toBe('casual')
    const after = features({ stakeTier: 'high' })
    expect(segmentOf(after)).toBe('whale')
  })

  it('cranking up cadence + low stakes turns a casual player into a grinder', () => {
    const before = features({
      stakeTier: 'low',
      betsPerActiveDay: 2,
      activeDays: 20,
      sportsbookShare: 0.2,
      parlayShare: 0.1,
    })
    expect(segmentOf(before)).toBe('casual')
    // same player, now grinding many bets per day
    const after = features({
      stakeTier: 'low',
      betsPerActiveDay: 8,
      activeDays: 20,
      sportsbookShare: 0.2,
      parlayShare: 0.1,
    })
    expect(segmentOf(after)).toBe('grinder')
  })

  it('churnRisk climbing past the threshold moves an active player from habit to at-risk', () => {
    const calm = features({ churnRisk: 0.2 })
    expect(lifecycleOf(calm, false)).toBe('habit')
    const cooling = features({ churnRisk: 0.7 })
    expect(lifecycleOf(cooling, false)).toBe('at-risk')
  })
})

describe('tagsOf — computed dimension tags', () => {
  it('emits stake tier, product lean and per-bet median for an active sportsbook player', () => {
    // medianStakeCents 5000 ⇒ $50/bet (Math.round(5000/100))
    const b = features({
      stakeTier: 'high',
      productLean: 'sportsbook',
      topGameShare: 0.2,
      sgpShare: 0.1,
      parlayShare: 0.1,
      betsPerActiveDay: 2,
      topUps: 0,
      avgSessionMin: 20,
      churnRisk: 0.1,
      medianStakeCents: 5000,
      bets: 40,
    })
    const tags = tagsOf(b)
    expect(tags).toContain('high stakes')
    expect(tags).toContain('sportsbook')
    expect(tags).toContain('~$50/bet')
    // none of the conditional tags should appear given the inputs above
    expect(tags).not.toContain('SGP-heavy')
    expect(tags).not.toContain('parlay-heavy')
    expect(tags).not.toContain('high-frequency')
    expect(tags).not.toContain('frequent top-ups')
    expect(tags).not.toContain('cooling off')
    expect(tags).not.toContain('long sessions')
  })

  it('mixed product reads "mixed product"; top game fan needs share >= 0.4', () => {
    const mixed = features({ productLean: 'mixed', topGameName: 'Mines', topGameShare: 0.4 })
    const tags = tagsOf(mixed)
    expect(tags).toContain('mixed product')
    expect(tags).not.toContain('sportsbook')
    expect(tags).not.toContain('casino')
    expect(tags).toContain('Mines fan')
  })

  it('SGP-heavy pre-empts parlay-heavy (else-if), and frequency/top-up/session tags fire', () => {
    // sgpShare 0.3 ⇒ SGP-heavy; parlayShare 0.6 would be parlay-heavy but it's an else-if
    const b = features({
      sgpShare: 0.3,
      parlayShare: 0.6,
      betsPerActiveDay: 8,
      topUps: 3,
      avgSessionMin: 45,
    })
    const tags = tagsOf(b)
    expect(tags).toContain('SGP-heavy')
    expect(tags).not.toContain('parlay-heavy')
    expect(tags).toContain('high-frequency')
    expect(tags).toContain('frequent top-ups')
    expect(tags).toContain('long sessions')
  })

  it('parlay-heavy fires when SGP is low but parlay share is high', () => {
    const b = features({ sgpShare: 0.1, parlayShare: 0.5 })
    const tags = tagsOf(b)
    expect(tags).toContain('parlay-heavy')
    expect(tags).not.toContain('SGP-heavy')
  })

  it('cooling off: high churn while still inside the dormant window', () => {
    const b = features({ churnRisk: AT_RISK_CHURN, recencyDays: DORMANT_DAYS })
    expect(tagsOf(b)).toContain('cooling off')
    // once past the dormant window, the "cooling off" tag drops
    const lapsed = features({ churnRisk: AT_RISK_CHURN, recencyDays: DORMANT_DAYS + 1 })
    expect(tagsOf(lapsed)).not.toContain('cooling off')
  })

  it('zero-bet players get no per-bet median tag', () => {
    const tags = tagsOf(features({ bets: 0 }))
    expect(tags.some((t) => t.includes('/bet'))).toBe(false)
  })
})

describe('classifySegment — the joined read', () => {
  it('combines segment, lifecycle, tags and carries the playerId through', () => {
    const b = features({
      playerId: 'p_42',
      stakeTier: 'whale',
      productLean: 'sportsbook',
      recencyDays: 3,
      daysSinceSignup: 60,
      medianStakeCents: 5000,
    })
    const result = classifySegment(b, false)
    expect(result.playerId).toBe('p_42')
    expect(result.segment).toBe(segmentOf(b))
    expect(result.segment).toBe('whale')
    expect(result.lifecycle).toBe(lifecycleOf(b, false))
    expect(result.lifecycle).toBe('habit')
    expect(result.tags).toEqual(tagsOf(b))
    expect(result.tags).toContain('whale stakes')
    expect(result.tags).toContain('~$50/bet')
  })

  it('passes isVip through to lifecycle', () => {
    const b = features({ recencyDays: 3, daysSinceSignup: 60 })
    expect(classifySegment(b, true).lifecycle).toBe('vip')
    expect(classifySegment(b, false).lifecycle).toBe('habit')
  })
})

describe('label maps cover every union member', () => {
  it('every segment archetype produced by segmentOf has a label', () => {
    const segments = [
      segmentOf(features({ bets: 0 })),
      segmentOf(features({ recencyDays: 30 })),
      segmentOf(features({ stakeTier: 'whale' })),
      segmentOf(features({ stakeTier: 'mid', sportsbookShare: 0.5, parlayShare: 0.5 })),
      segmentOf(
        features({
          stakeTier: 'low',
          betsPerActiveDay: 8,
          activeDays: 6,
          sportsbookShare: 0.2,
          parlayShare: 0.1,
        }),
      ),
      segmentOf(features({ productLean: 'sportsbook' })),
      segmentOf(features({ productLean: 'casino' })),
      segmentOf(features({ productLean: 'mixed' })),
    ]
    for (const s of segments) {
      expect(typeof SEGMENT_LABEL[s]).toBe('string')
      expect(SEGMENT_LABEL[s].length).toBeGreaterThan(0)
    }
    // spot-check a couple of label texts
    expect(SEGMENT_LABEL.whale).toBe('Whale')
    expect(SEGMENT_LABEL['parlay-lotto']).toBe('Parlay lotto')
  })

  it('every lifecycle stage produced by lifecycleOf has a label', () => {
    const stages = [
      lifecycleOf(features({ recencyDays: 30 }), false),
      lifecycleOf(features(), true),
      lifecycleOf(features({ daysSinceSignup: 3, recencyDays: 1 }), false),
      lifecycleOf(features({ daysSinceSignup: 30, activeDays: 4, recencyDays: 7 }), false),
      lifecycleOf(features({ churnRisk: 0.9 }), false),
      lifecycleOf(features(), false),
    ]
    for (const s of stages) {
      expect(typeof LIFECYCLE_LABEL[s]).toBe('string')
      expect(LIFECYCLE_LABEL[s].length).toBeGreaterThan(0)
    }
    expect(LIFECYCLE_LABEL['at-risk']).toBe('At-risk')
    expect(LIFECYCLE_LABEL.reactivated).toBe('Reactivated')
  })
})
