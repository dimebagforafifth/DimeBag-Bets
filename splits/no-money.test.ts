/**
 * The cardinal-rule guard: this module is a READ-ONLY projection. No file under splits/ may
 * import the shared `core` money model or name any of its mutators — so the projection can
 * never mint or move a credit. A static scan of the module's own source asserts it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = dirname(fileURLToPath(import.meta.url))

/** Every money mutator in core's surface (and the org/book figure paths). */
const FORBIDDEN_TOKENS = [
  'placeWager',
  'resolveWager',
  'resolveAtMultiplier',
  'settleWeek',
  'settleOrgWeek',
  'adjustBalance',
  'adjustFigure',
  'mutateBook',
  'grant',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

describe('splits is a read-only projection — no money path', () => {
  const files = sourceFiles(DIR)

  it('scans the whole module (sanity: found the source files)', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it('no splits/ file imports the shared core money model (at any depth)', () => {
    // Match `../core`, `../../core`, … so a ui/ file's deeper relative path can't slip a core
    // import past the guard (the belt to the mutator-token suspenders below).
    const coreImport = /from ['"](?:\.\.\/)+core(?:\/|['"])/
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} must not import core`).not.toMatch(coreImport)
    }
  })

  it('no splits/ file names a core money mutator', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const tok of FORBIDDEN_TOKENS) {
        expect(src, `${f} must not name ${tok}`).not.toMatch(new RegExp(`\\b${tok}\\b`))
      }
    }
  })
})
