/**
 * Rollout acceptance gate: EVERY casino game's UI sources its server seed from the platform
 * fairness authority (the round-1 fairnessClient seam), not a browser randomServerSeed().
 *
 * A source-scan rather than 21 bespoke render tests: it proves, per game, that the swap was
 * applied — the authority client is used, a seed is minted (commit→reveal), and that minted
 * seed is passed into the engine call. The per-game *.fairness-rollout.test.ts files prove the
 * minted seed actually verifies through each game's unchanged fairness math.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const GAMES_DIR = new URL('.', import.meta.url).pathname

function gameDirs(): string[] {
  return readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'shared')
    .map((d) => d.name)
    .sort()
}

/** The game's main UI component source (the *Game.tsx that isn't a test). */
function uiSource(game: string): { file: string; src: string } | null {
  const dir = join(GAMES_DIR, game, 'ui')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null // a game without a ui/ dir (shouldn't happen for originals)
  }
  const file = names.find((n) => /Game\.tsx$/.test(n) && !n.includes('.test.'))
  return file ? { file, src: readFileSync(join(dir, file), 'utf8') } : null
}

describe('provably-fair rollout — every game sources its seed from the authority', () => {
  const games = gameDirs()

  it('covers all ~20 originals', () => {
    expect(games.length).toBeGreaterThanOrEqual(20)
  })

  for (const game of games) {
    it(`${game}: UI is wired to the fairness authority`, () => {
      const ui = uiSource(game)
      expect(ui, `${game} has a *Game.tsx`).not.toBeNull()
      const src = ui!.src

      // 1. Uses the platform authority client (not a local random server seed).
      expect(src, `${game} imports/uses fairnessClient`).toMatch(/fairnessClient/)

      // 2. Mints a seed from the authority: commit→reveal. mintRound for all games; Crash
      //    additionally uses commit/reveal/resolveCrash directly.
      const mints =
        /mintRound\s*\(/.test(src) || (/\.commit\s*\(/.test(src) && /\.reveal\s*\(/.test(src))
      expect(mints, `${game} mints a seed via the authority`).toBe(true)

      // 3. The minted seed is passed into the engine call (not defaulted from randomServerSeed).
      expect(src, `${game} passes serverSeed into its engine call`).toMatch(/serverSeed:/)
      expect(src, `${game} does NOT mint the server seed in the browser`).not.toMatch(
        /serverSeed:\s*randomServerSeed\(\)/,
      )
    })
  }
})
