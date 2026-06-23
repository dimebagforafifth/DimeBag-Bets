import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * CI GUARD — every top-level source directory must be listed in tsconfig's `include`.
 *
 * `tsc` only treats files reachable from `include` as roots, so a brand-new top-level module
 * that nothing in an included dir imports yet is NEVER type-checked — its errors hide until
 * something imports it. That is exactly the gap that let two latent type errors slip through in
 * round 3 (the `crm/` + `analytics/` dirs weren't in `include`). This test fails the build the
 * moment a source dir is missing, so the fix (add it to `include`) is forced at authoring time.
 *
 * Pure filesystem + JSON; no app code. Skips only deps/build/VCS dirs — any other root dir that
 * contains a non-declaration `.ts`/`.tsx` is "source" and must be covered.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Hard-skip: dependencies, build output, coverage, VCS. Everything else is judged by content. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git'])

/** Does `dir` (recursively) contain a real `.ts`/`.tsx` source file (not a `.d.ts`)? */
function hasTsSource(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    if (entry.isDirectory()) {
      if (hasTsSource(join(dir, entry.name))) return true
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      return true
    }
  }
  return false
}

/** Top-level dirs that contain TS source (the set that MUST be covered by include). */
function rootSourceDirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .filter((name) => hasTsSource(join(root, name)))
    .sort()
}

function tsconfigInclude(root: string): string[] {
  const parsed = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')) as {
    include?: string[]
  }
  return parsed.include ?? []
}

/**
 * Pure detector (unit-tested below): the source dirs NOT covered by `include`. An include entry
 * may be a bare dir (`"core"`) or a glob (`"core/**"`); either way its FIRST path segment is the
 * dir it covers.
 */
function uncoveredDirs(sourceDirs: string[], include: string[]): string[] {
  const covered = new Set(include.map((p) => p.replace(/^\.\//, '').split('/')[0]))
  return sourceDirs.filter((d) => !covered.has(d))
}

describe('tsconfig coverage guard', () => {
  it('every top-level source dir is listed in tsconfig include', () => {
    const sourceDirs = rootSourceDirs(ROOT)
    const include = tsconfigInclude(ROOT)
    const missing = uncoveredDirs(sourceDirs, include)
    expect(
      missing,
      `Top-level source dirs missing from tsconfig.json "include" (tsc won't check them): ` +
        `${missing.join(', ')}`,
    ).toEqual([])
  })

  it('feature modules consolidated under features/ are covered by the features include', () => {
    // The reorg moved the former top-level feature dirs (e.g. gamification, rewards) under
    // features/, so they are no longer roots — and `features` in include covers them all.
    const sourceDirs = rootSourceDirs(ROOT)
    const include = tsconfigInclude(ROOT)
    expect(sourceDirs).not.toContain('gamification')
    expect(sourceDirs).not.toContain('rewards')
    expect(hasTsSource(join(ROOT, 'features', 'gamification'))).toBe(true)
    expect(hasTsSource(join(ROOT, 'features', 'rewards'))).toBe(true)
    expect(include).toContain('features')
  })

  it('the detector flags a source dir that is absent from include (proves the guard bites)', () => {
    // A newly-added module not yet in include is reported…
    expect(uncoveredDirs(['core', 'games', 'newmod'], ['core', 'games'])).toEqual(['newmod'])
    // …an include with extra (non-existent) entries is harmless…
    expect(uncoveredDirs(['core', 'games'], ['core', 'games', 'legacy'])).toEqual([])
    // …and a glob include still covers its dir by first segment.
    expect(uncoveredDirs(['core'], ['./core/**'])).toEqual([])
  })
})
