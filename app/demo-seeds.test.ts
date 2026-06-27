/**
 * The single demo-seeding gate. Asserts the override precedence (on/off wins) and the dev/prod
 * default, plus robustness when `import.meta.env` has no DEV flag.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoSeedsEnabled } from './demo-seeds.js'

// `import.meta.env` is the only input. Override it per-case with vi.stubEnv, which patches
// import.meta.env under Vitest. unstubAllEnvs restores the real bag afterwards.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('demoSeedsEnabled — the demo-seeding gate', () => {
  it('VITE_DEMO_SEEDS=on forces ON even in a production build', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', 'on')
    vi.stubEnv('DEV', false)
    expect(demoSeedsEnabled()).toBe(true)
  })

  it('VITE_DEMO_SEEDS=off forces OFF even in dev', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', 'off')
    vi.stubEnv('DEV', true)
    expect(demoSeedsEnabled()).toBe(false)
  })

  it('is case/whitespace tolerant on the override', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', '  OFF  ')
    vi.stubEnv('DEV', true)
    expect(demoSeedsEnabled()).toBe(false)
  })

  it('with no override, defaults to import.meta.env.DEV (ON in dev)', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', '')
    vi.stubEnv('DEV', true)
    expect(demoSeedsEnabled()).toBe(true)
  })

  it('with no override, defaults OFF in a production build', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', '')
    vi.stubEnv('DEV', false)
    expect(demoSeedsEnabled()).toBe(false)
  })

  it('an unrecognised override value falls back to the dev/prod default', () => {
    vi.stubEnv('VITE_DEMO_SEEDS', 'yes')
    vi.stubEnv('DEV', false)
    expect(demoSeedsEnabled()).toBe(false)
  })
})
