/**
 * Realistic demo data for the social core, so the Community surface renders fully
 * populated. Builds a small follow graph among the seeded book players and a lively feed
 * of shared slips — singles + a same-game parlay, a mix of open/won/lost — using REAL
 * events/markets from the book's mock slate (so every card shows real picks + prices, and
 * single-leg cards can actually be faded). No money moves: these are feed SNAPSHOTS.
 */

import { mockSlate } from '../app/book/mockBook.js'
import { combinedDecimal, legFromSelection, type SlipLeg } from '../app/book/slip.js'
import type { NormalizedEvent } from '../lib/odds/contract.js'
import { demoSeedsEnabled } from '../app/demo-seeds.js'
import { seedFollows, __resetFollows } from './follows-store.js'
import { shareSlip, allSlips, __resetFeed } from './feed-store.js'

const MIN = 60_000
const HOUR = 60 * MIN

/** Find a main-market selection on the slate and build a locked leg from it. */
function findLeg(
  slate: NormalizedEvent[],
  eventId: string,
  spec: { type: SlipLeg['marketType']; side: string; line?: number; playerId?: string },
): SlipLeg {
  const event = slate.find((e) => e.eventId === eventId)
  if (!event) throw new Error(`seed: unknown event ${eventId}`)
  const market = event.markets.find(
    (m) =>
      m.type === spec.type &&
      !m.marketId.includes('-alt') &&
      (spec.playerId ? m.playerId === spec.playerId : !m.playerId),
  )
  if (!market) throw new Error(`seed: no ${spec.type} market on ${eventId}`)
  const selection = market.selections.find(
    (s) => s.side === spec.side && (spec.line === undefined || s.line === spec.line),
  )
  if (!selection) throw new Error(`seed: no ${spec.side} selection on ${eventId} ${spec.type}`)
  return legFromSelection(event, market, selection)
}

/** The seeded book players (ids match app/book-store's demo org). */
export const SEED_PLAYERS = [
  { id: 'p-marco', name: 'Marco' },
  { id: 'p-lena', name: 'Lena' },
  { id: 'p-priya', name: 'Priya' },
  { id: 'p-dana', name: 'Dana' },
  { id: 'p-tariq', name: 'Tariq' },
] as const

/** A connected-enough graph that any seeded player's feed is populated. */
const FOLLOW_EDGES: ReadonlyArray<readonly [string, string]> = [
  ['p-marco', 'p-lena'],
  ['p-marco', 'p-priya'],
  ['p-marco', 'p-dana'],
  ['p-lena', 'p-marco'],
  ['p-lena', 'p-dana'],
  ['p-lena', 'p-tariq'],
  ['p-priya', 'p-marco'],
  ['p-priya', 'p-dana'],
  ['p-dana', 'p-marco'],
  ['p-dana', 'p-lena'],
  ['p-tariq', 'p-dana'],
  ['p-tariq', 'p-marco'],
]

/**
 * (Re)seed the social graph + feed deterministically from `now`.
 *
 * Demo seeding is gated by `demoSeedsEnabled()` (ON in dev, OFF in production, override via
 * VITE_DEMO_SEEDS) so real users never see fabricated slips. Pass `force` to seed regardless of
 * the env default (tests / an explicit "load the demo" control).
 */
export function seedSocial(now: number, force = false): void {
  if (!force && !demoSeedsEnabled()) return
  __resetFollows()
  __resetFeed()
  seedFollows(FOLLOW_EDGES)

  const slate = mockSlate()
  const single = (eventId: string, spec: Parameters<typeof findLeg>[2]) => {
    const leg = findLeg(slate, eventId, spec)
    return { leg, decimal: leg.price.decimal }
  }

  // Lena — a winning same-game parlay (Chiefs ML + Mahomes over passing yards).
  const lenaLegs = [
    findLeg(slate, 'nfl-kc-buf', { type: 'moneyline', side: 'home' }),
    findLeg(slate, 'nfl-kc-buf', { type: 'prop', side: 'over', playerId: 'P. Mahomes' }),
  ]
  shareSlip({
    playerId: 'p-lena',
    playerName: 'Lena',
    legs: lenaLegs,
    mode: 'parlay',
    stakeCents: 5_000,
    decimal: combinedDecimal(lenaLegs).decimal,
    status: 'won',
    sharedAt: now - 5 * HOUR,
    reactions: [
      { playerId: 'p-marco', emoji: '🔥' },
      { playerId: 'p-dana', emoji: '🔥' },
      { playerId: 'p-tariq', emoji: '💰' },
    ],
    comments: [
      { id: 'seed-c1', playerId: 'p-marco', playerName: 'Marco', text: 'cooking 🔥', at: now - 4 * HOUR },
    ],
  })

  // Dana — a moneyline single on the UCL game, still open.
  {
    const { leg, decimal } = single('ucl-rma-bay', { type: 'moneyline', side: 'home' })
    shareSlip({
      playerId: 'p-dana',
      playerName: 'Dana',
      legs: [leg],
      mode: 'single',
      stakeCents: 25_000,
      decimal,
      status: 'open',
      sharedAt: now - 3 * HOUR,
      reactions: [{ playerId: 'p-lena', emoji: '👀' }],
    })
  }

  // Priya — a Chiefs spread single, open (fadeable: away +1.5 is on the board).
  {
    const { leg, decimal } = single('nfl-kc-buf', { type: 'spread', side: 'home', line: -1.5 })
    shareSlip({
      playerId: 'p-priya',
      playerName: 'Priya',
      legs: [leg],
      mode: 'single',
      stakeCents: 4_000,
      decimal,
      status: 'open',
      sharedAt: now - 2 * HOUR,
      comments: [
        { id: 'seed-c2', playerId: 'p-dana', playerName: 'Dana', text: 'fading this one', at: now - 110 * MIN },
      ],
    })
  }

  // Tariq — a hockey moneyline single that lost.
  {
    const { leg, decimal } = single('nhl-col-veg', { type: 'moneyline', side: 'home' })
    shareSlip({
      playerId: 'p-tariq',
      playerName: 'Tariq',
      legs: [leg],
      mode: 'single',
      stakeCents: 10_000,
      decimal,
      status: 'lost',
      sharedAt: now - 90 * MIN,
      reactions: [{ playerId: 'p-marco', emoji: '😂' }],
    })
  }

  // Marco — an over total single (the viewer's own card, so self-feed is populated too).
  {
    const { leg, decimal } = single('nba-lal-bos', { type: 'total', side: 'over', line: 224.5 })
    shareSlip({
      playerId: 'p-marco',
      playerName: 'Marco',
      legs: [leg],
      mode: 'single',
      stakeCents: 7_500,
      decimal,
      status: 'open',
      sharedAt: now - 20 * MIN,
    })
  }
}

let seeded = false

/** Seed once (idempotent) — the section calls this on mount so the demo is populated. No-op when
 *  demo seeding is disabled (production), so real users start with an empty community. */
export function ensureSeeded(now: number): void {
  if (seeded) return
  seeded = true
  if (!demoSeedsEnabled()) return
  // The feed + follows now persist (KVStore seam), so on a reload they're already populated
  // (the demo seed and/or the player's own shares/follows). Only seed a genuinely empty feed,
  // so a refresh never clobbers persisted state.
  if (allSlips().length > 0) return
  seedSocial(now)
}

/** Reset everything social (tests). */
export function __resetSocial(): void {
  __resetFollows()
  __resetFeed()
  seeded = false
}
