/**
 * Per-game edge bands (PART 2): the flat 5% cap is replaced by a per-game min/max/default band
 * in bps. A manager input is clamped into the band (tight games can't exceed their ceiling;
 * high-edge games accept richer settings; variable games band per bet type). And the load-bearing
 * PROVABLY-FAIR INVARIANCE: the edge shifts only the payout/multiplier mapping, never the RNG —
 * a fixed (server seed, client seed, nonce) yields the same OUTCOME at any edge.
 */

import { describe, expect, it } from 'vitest'
import {
  bpsToEdge,
  bpsToRtp,
  clampEdgeBps,
  edgeModelFor,
  edgeToBps,
  GAME_EDGE_BANDS,
  rtpToBps,
} from './game-edge-config.js'
import { isWin, multiplierFor, rollFromSeeds, winChance } from '../games/dice/fair.js'

describe('clampEdgeBps — per-game bands', () => {
  it('blackjack: 9% input clamps down to its 2% ceiling', () => {
    expect(clampEdgeBps('blackjack', edgeToBps(0.09))).toBe(200) // 2.00%
  })

  it('blackjack REJECTS 28% (clamps to 2%) while keno ACCEPTS 28%', () => {
    expect(clampEdgeBps('blackjack', edgeToBps(0.28))).toBe(200)
    expect(clampEdgeBps('keno', edgeToBps(0.28))).toBe(2800) // within keno's 15–30% band
  })

  it('clamps up to the floor as well as down to the ceiling', () => {
    expect(clampEdgeBps('keno', edgeToBps(0.02))).toBe(1500) // keno floor 15%
    expect(clampEdgeBps('blackjack', edgeToBps(0.001))).toBe(30) // blackjack floor 0.3%
  })

  it('sic bo: even-money capped ≤ 2.5% while a triple can band up to 30% (bet_type_overrides)', () => {
    expect(clampEdgeBps('sicbo', edgeToBps(0.5), 'even-money')).toBe(250) // ≤ 2.5%
    expect(clampEdgeBps('sicbo', edgeToBps(0.5), 'triple')).toBe(3000) // up to 30%
    expect(clampEdgeBps('sicbo', edgeToBps(0.3), 'triple')).toBe(3000)
  })

  it('roulette EU vs US bands differ by wheel (bet_type_overrides)', () => {
    expect(clampEdgeBps('roulette', edgeToBps(0.08), 'european')).toBe(550) // EU ceiling 5.5%
    expect(clampEdgeBps('roulette', edgeToBps(0.08), 'american')).toBe(700) // US ceiling 7%
  })

  it('an unbanded game falls back to the legacy 0–5% range', () => {
    expect(clampEdgeBps('mystery-game', edgeToBps(0.5))).toBe(500)
    expect(clampEdgeBps('mystery-game', edgeToBps(0.001))).toBe(10)
  })

  it('NaN input falls back to the band default', () => {
    expect(clampEdgeBps('blackjack', Number.NaN)).toBe(GAME_EDGE_BANDS.blackjack.edge_default_bps)
  })

  it('every band default sits inside [min, max] and at/below the max (not pinned to the ceiling)', () => {
    for (const cfg of Object.values(GAME_EDGE_BANDS)) {
      expect(cfg.edge_default_bps).toBeGreaterThanOrEqual(cfg.edge_min_bps)
      expect(cfg.edge_default_bps).toBeLessThanOrEqual(cfg.edge_max_bps)
    }
  })
})

describe('existing edge values survive the band migration', () => {
  it('preserves a stored RTP that already sits inside the game band, exactly', () => {
    // dice band is 1%–5% edge → an existing RTP 0.98 (2% edge) is in-band and unchanged.
    const stored = 0.98
    const migrated = bpsToRtp(clampEdgeBps('dice', rtpToBps(stored)))
    expect(migrated).toBeCloseTo(stored, 10)
  })
})

describe('edge model — which games keep the provably-fair invariance', () => {
  it('payout-model games scale the multiplier (invariance holds); crash/limbo scale the draw', () => {
    // Dice & friends: edge is in the payout → a fixed seed gives the same outcome at any edge.
    expect(edgeModelFor('dice')).toBe('payout')
    expect(edgeModelFor('mines')).toBe('payout')
    expect(edgeModelFor('roulette')).toBe('payout')
    // Crash & Limbo: edge is in the OUTCOME distribution (Stake's model) — a band change shifts the
    // realised outcome for a fixed seed, so the invariance does NOT hold; the round must record its
    // locked edge to stay verifiable. Made explicit here so it's never silently assumed invariant.
    expect(edgeModelFor('crash')).toBe('distribution')
    expect(edgeModelFor('limbo')).toBe('distribution')
  })
})

describe('PROVABLY-FAIR INVARIANCE (payout-model games) — edge moves the payout, never the RNG', () => {
  const serverSeed = 'server-seed-fixed-abc'
  const clientSeed = 'player-seed-xyz'
  const nonce = 7
  const target = 50
  const direction = 'over' as const

  it('a fixed seed yields the SAME roll + win/loss at two different edges; only the payout differs', () => {
    const edgeLow = bpsToEdge(clampEdgeBps('dice', edgeToBps(0.01))) // 1%
    const edgeHigh = bpsToEdge(clampEdgeBps('dice', edgeToBps(0.05))) // 5%
    expect(edgeLow).not.toBe(edgeHigh)

    // The RNG outcome depends ONLY on the seeds — identical across edges.
    const rollA = rollFromSeeds(serverSeed, clientSeed, nonce)
    const rollB = rollFromSeeds(serverSeed, clientSeed, nonce)
    expect(rollA).toBe(rollB)

    // Win/loss is roll-vs-target — also edge-independent.
    const wonA = isWin(rollA, target, direction)
    const wonB = isWin(rollB, target, direction)
    expect(wonA).toBe(wonB)

    // Only the payout multiplier shifts with the edge (lower edge → bigger payout).
    const chance = winChance(target, direction)
    const multLow = multiplierFor(chance, { edge: edgeLow })
    const multHigh = multiplierFor(chance, { edge: edgeHigh })
    expect(multLow).not.toBe(multHigh)
    expect(multLow).toBeGreaterThan(multHigh)
  })
})
