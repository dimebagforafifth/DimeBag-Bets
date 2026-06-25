import { describe, expect, it } from 'vitest'
import {
  GAME_RESOLVERS,
  isGameId,
  resolveGameOutcome,
  type GameId,
  type ResolveParams,
} from './resolvers.js'
import { verifyRoll } from '../dice/fair.js'
import { verifyMines } from '../mines/fair.js'
import { verifyDraw } from '../keno/fair.js'
import { verifyCrashPoint, DEFAULT_CRASH_CONFIG } from '../crash/fair.js'
import { verifyLimbo } from '../limbo/fair.js'
import { verifyDrop } from '../plinko/fair.js'
import { verifySpin as verifyWheelSpin } from '../wheel/fair.js'

const S = 'resolver-server-seed'
const C = 'resolver-client-seed'
const N = 7

/** Valid round inputs for every game — exercises each resolver's param path. */
const VALID_PARAMS: Record<GameId, ResolveParams> = {
  baccarat: {},
  blackjack: {},
  cases: { risk: 'medium' },
  chickenroad: { survival: 0.8, lanes: 10 },
  coinflip: { count: 5 },
  crash: {},
  diamonds: {},
  dice: {},
  'dragon-tower': { difficulty: 'easy' },
  hilo: { count: 4 },
  keno: {},
  limbo: {},
  mines: { mineCount: 5 },
  plinko: { rows: 16 },
  pump: { difficulty: 'easy' },
  roulette: {},
  sicbo: {},
  slots: {},
  threecardpoker: {},
  videopoker: {},
  wheel: { segments: 10 },
}

describe('resolveGameOutcome — every game resolves deterministically', () => {
  for (const game of Object.keys(GAME_RESOLVERS) as GameId[]) {
    it(`${game}: same seeds → same outcome, and it is defined`, () => {
      const a = resolveGameOutcome(game, S, C, N, VALID_PARAMS[game])
      const b = resolveGameOutcome(game, S, C, N, VALID_PARAMS[game])
      expect(a).toBeDefined()
      expect(a).toEqual(b) // deterministic in (seed, clientSeed, nonce, params)
    })
  }

  it('covers exactly the 21 games', () => {
    expect(Object.keys(GAME_RESOLVERS)).toHaveLength(21)
  })
})

describe('server-derived outcomes re-verify with each game published helper', () => {
  it('dice roll', () => {
    const roll = resolveGameOutcome('dice', S, C, N) as number
    expect(verifyRoll(S, C, N, roll)).toBe(true)
  })
  it('mines layout', () => {
    const mines = resolveGameOutcome('mines', S, C, N, { mineCount: 5 }) as number[]
    expect(verifyMines(S, C, N, 5, mines)).toBe(true)
  })
  it('keno draw', () => {
    const draw = resolveGameOutcome('keno', S, C, N) as number[]
    expect(verifyDraw(S, C, N, draw)).toBe(true)
  })
  it('crash point', () => {
    const cp = resolveGameOutcome('crash', S, C, N) as number
    expect(verifyCrashPoint(S, C, N, cp, DEFAULT_CRASH_CONFIG)).toBe(true)
  })
  it('limbo result', () => {
    const r = resolveGameOutcome('limbo', S, C, N) as number
    expect(verifyLimbo(S, C, N, r)).toBe(true)
  })
  it('plinko drop', () => {
    const drop = resolveGameOutcome('plinko', S, C, N, { rows: 16 }) as {
      path: number[]
      slot: number
    }
    expect(verifyDrop(S, C, N, 16, drop.slot)).toBe(true)
  })
  it('wheel segment', () => {
    const seg = resolveGameOutcome('wheel', S, C, N, { segments: 10 }) as number
    expect(verifyWheelSpin(S, C, N, 10, seg)).toBe(true)
  })
})

describe('param validation + game guard', () => {
  it('throws a clear error when a required numeric param is missing', () => {
    expect(() => resolveGameOutcome('mines', S, C, N, {})).toThrow(/mineCount/)
    expect(() => resolveGameOutcome('plinko', S, C, N, {})).toThrow(/rows/)
    expect(() => resolveGameOutcome('wheel', S, C, N, {})).toThrow(/segments/)
  })
  it('throws when a required string param is missing', () => {
    expect(() => resolveGameOutcome('dragon-tower', S, C, N, {})).toThrow(/difficulty/)
    expect(() => resolveGameOutcome('cases', S, C, N, {})).toThrow(/risk/)
  })
  it('isGameId recognizes registered games and rejects others', () => {
    expect(isGameId('mines')).toBe(true)
    expect(isGameId('crash')).toBe(true)
    expect(isGameId('poker')).toBe(false)
    expect(isGameId(42)).toBe(false)
    expect(isGameId(undefined)).toBe(false)
  })
})
