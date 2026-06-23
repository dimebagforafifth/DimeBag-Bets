/**
 * Realistic demo data so the Challenges surface renders fully populated in every lifecycle
 * state. The settled / in-flight / voided history is built among the SEED players by running it
 * through the REAL store → core, so the figures actually moved (an honest demo, not a mockup) —
 * and it never touches the live viewer's account. The viewer additionally gets open community
 * offers to accept and one directed offer to accept/decline, so they can move real credits live.
 *
 * Player ids mirror social/ (p-marco, p-lena, …) so a challenge naturally lines up with someone
 * you follow — the "challenge a friend" tie-in. Credits/balance only.
 */

import type { Account } from '../../core/index.js'
import { challenges, registerAccount } from './store.js'
import type { Challenger } from './types.js'

const MIN = 60_000
const HOUR = 60 * MIN

/** The seeded roster (ids match social/seed.ts SEED_PLAYERS). */
export const SEED_PLAYERS: readonly Challenger[] = [
  { playerId: 'p-marco', playerName: 'Marco' },
  { playerId: 'p-lena', playerName: 'Lena' },
  { playerId: 'p-priya', playerName: 'Priya' },
  { playerId: 'p-dana', playerName: 'Dana' },
  { playerId: 'p-tariq', playerName: 'Tariq' },
]

const by = (id: string): Challenger => SEED_PLAYERS.find((p) => p.playerId === id)!

/** A fresh demo account for a seed player — generous credit so the demo never hits a limit. */
function seedAccount(id: string): Account {
  return { id, creditLimit: 100_000, balance: 0, pending: 0 }
}

let seeded = false

/** (Re)seed the singleton store + book deterministically from `now`. Idempotent via ensureSeeded. */
export function seedChallenges(now: number): void {
  challenges.reset()
  for (const p of SEED_PLAYERS) registerAccount(p.playerId, seedAccount(p.playerId))

  // ── Open community offers anyone can accept (no money held yet) ───────────────
  challenges.propose({
    proposer: by('p-dana'),
    title: 'Celtics vs Heat tonight',
    proposerPick: 'Celtics ML',
    accepterPick: 'Heat ML',
    proposerStakeCents: 2_000,
    decimalOdds: 2, // even money — equal $20 stakes
    audience: 'open',
    expiresInMs: 6 * HOUR,
    now,
  })
  challenges.propose({
    proposer: by('p-marco'),
    title: 'Jokic over 27.5 pts',
    proposerPick: 'Over 27.5',
    accepterPick: 'Under 27.5',
    proposerStakeCents: 5_000,
    decimalOdds: 1.8, // custom odds — accepter stakes round(5000×0.8)=$40
    audience: 'open',
    expiresInMs: 4 * HOUR,
    now,
  })

  // ── An in-flight match: both stakes escrowed via core, awaiting the result ─────
  const inflight = challenges.propose({
    proposer: by('p-lena'),
    title: 'Rangers vs Devils — puck line',
    proposerPick: 'Rangers -1.5',
    accepterPick: 'Devils +1.5',
    proposerStakeCents: 2_500,
    decimalOdds: 2,
    audience: 'open',
    now,
  })
  challenges.accept(inflight.id, by('p-priya'), now)

  // ── A settled win for the proposer (even money) ───────────────────────────────
  const win = challenges.propose({
    proposer: by('p-marco'),
    title: 'Eagles cover -3.5',
    proposerPick: 'Eagles -3.5',
    accepterPick: 'Cowboys +3.5',
    proposerStakeCents: 5_000,
    decimalOdds: 2,
    audience: 'open',
    now: now - 3 * HOUR,
  })
  challenges.accept(win.id, by('p-lena'), now - 3 * HOUR)
  challenges.settle(win.id, 'proposer')

  // ── A settled win for the ACCEPTER at custom odds (shows the no-vig stake ratio) ─
  const upset = challenges.propose({
    proposer: by('p-priya'),
    title: 'Arsenal to win',
    proposerPick: 'Arsenal',
    accepterPick: 'Draw or City',
    proposerStakeCents: 4_000,
    decimalOdds: 1.5, // accepter stakes round(4000×0.5)=$20; pot $60
    audience: 'open',
    now: now - 2 * HOUR,
  })
  challenges.accept(upset.id, by('p-dana'), now - 2 * HOUR)
  challenges.settle(upset.id, 'accepter')

  // ── A voided match: both stakes refunded via core (event abandoned) ───────────
  const voided = challenges.propose({
    proposer: by('p-tariq'),
    title: 'Match postponed — Lakers vs Suns',
    proposerPick: 'Lakers ML',
    accepterPick: 'Suns ML',
    proposerStakeCents: 3_000,
    decimalOdds: 2,
    audience: 'open',
    now: now - 90 * MIN,
  })
  challenges.accept(voided.id, by('p-marco'), now - 90 * MIN)
  challenges.voidChallenge(voided.id)

  seeded = true
}

/** Seed once (the section calls this on mount). */
export function ensureSeeded(now: number): void {
  if (!seeded) seedChallenges(now)
}

/**
 * Make sure the viewer has something to do: register their real account and, if they have no
 * directed offer yet, drop one in from a seed player so the "To you" tab is populated. The
 * viewer's account is NOT charged here — proposing holds nothing; accepting (their choice) does.
 */
export function ensureViewerOffers(
  viewerId: string,
  viewerName: string,
  account: Account,
  now: number,
): void {
  ensureSeeded(now)
  registerAccount(viewerId, account)
  const hasDirected = challenges
    .openFor(viewerId)
    .some((c) => c.audience === 'friend' && c.targetPlayerId === viewerId)
  if (!hasDirected && viewerId !== 'p-tariq') {
    challenges.propose({
      proposer: by('p-tariq'),
      title: 'Heads-up: NBA props parlay',
      proposerPick: 'Tariq: Over',
      accepterPick: `${viewerName}: Under`,
      proposerStakeCents: 2_500,
      decimalOdds: 2,
      audience: 'friend',
      targetPlayerId: viewerId,
      targetPlayerName: viewerName,
      expiresInMs: 12 * HOUR,
      now,
    })
  }
}

/** Test reset. */
export function __resetChallenges(): void {
  seeded = false
  challenges.reset()
}
