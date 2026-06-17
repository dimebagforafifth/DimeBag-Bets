// @vitest-environment node
/**
 * Design-system guard (UI visual-finish lane). The whole app is on ONE
 * graphite-and-gold token system (app/theme.css): wins read as GOLD treasure,
 * and no surface or feature carries its own palette. This test pins the
 * load-bearing invariants from the consistency pass so a future edit can't
 * silently reintroduce a per-feature palette or a green win-state.
 *
 * It reads CSS as text (not a visual regression) — cheap, deterministic, and it
 * fails loudly the moment a stray literal creeps back in.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function gameCssFiles(): string[] {
  const gamesDir = join(ROOT, 'games')
  const out: string[] = []
  for (const g of readdirSync(gamesDir)) {
    const uiDir = join(gamesDir, g, 'ui')
    if (!existsSync(uiDir)) continue
    for (const f of readdirSync(uiDir)) if (f.endsWith('.css')) out.push(join(uiDir, f))
  }
  return out
}

describe('graphite-and-gold visual consistency', () => {
  it('the sportsbook book consumes the global tokens, not its own palette', () => {
    const css = readFileSync(join(ROOT, 'app/book/book.css'), 'utf8')
    // every --bk-* colour alias repoints to a global token (single source of truth)
    expect(css).toMatch(/--bk-gold:\s*var\(--gold\)/)
    expect(css).toMatch(/--bk-win:\s*var\(--green\)/)
    expect(css).toMatch(/--bk-loss:\s*var\(--red\)/)
    // the old per-feature book literals (gold / win / loss) are gone
    for (const stray of ['#f6c350', '#3ddc97', '#ff6b6b']) {
      expect(css, `book.css must not hardcode ${stray} — use the global token`).not.toContain(stray)
    }
  })

  it('no casino game keeps a stray bright-green win-state literal (wins are gold)', () => {
    const offenders: string[] = []
    for (const file of gameCssFiles()) {
      const css = readFileSync(file, 'utf8')
      // #6dffa6 was the blackjack win green; #00e701 the old neon "win" accent.
      // Both were recolored to --gem; neither is legitimate game art.
      for (const green of ['#6dffa6', '#00e701']) {
        if (css.includes(green)) offenders.push(`${file.replace(ROOT + '/', '')} → ${green}`)
      }
    }
    expect(offenders, `stray win-greens found:\n${offenders.join('\n')}`).toEqual([])
  })

  it('covers every registered game directory', () => {
    // sanity: the glob actually found the games (so the guard isn't vacuously passing)
    expect(gameCssFiles().length).toBeGreaterThanOrEqual(20)
  })
})
