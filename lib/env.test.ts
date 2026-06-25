import { describe, it, expect, vi } from 'vitest'
import {
  readEnv,
  parseServerEnv,
  getServerEnv,
  collectEnvIssues,
  validateServerEnv,
  isProductionEnv,
  EnvValidationError,
} from './env.js'

describe('readEnv', () => {
  it('reads from an explicit source when given', () => {
    expect(readEnv('FOO', { FOO: 'bar' })).toBe('bar')
    expect(readEnv('MISSING', { FOO: 'bar' })).toBeUndefined()
  })

  it('returns an explicitly-empty value as-is (callers decide emptiness)', () => {
    expect(readEnv('FOO', { FOO: '' })).toBe('')
  })
})

describe('parseServerEnv — typed coercion (lenient, never throws)', () => {
  it('coerces numeric knobs, ports, and flags to their real types', () => {
    const env = parseServerEnv({
      PORT: '3000',
      LIVE_POLL_MS: '5000',
      RUN_ODDS_POLLER: '0',
      RUN_CRASH_CLOCK: 'false',
      CRON_SECRET: 'shh',
    })
    expect(env.PORT).toBe(3000)
    expect(env.LIVE_POLL_MS).toBe(5000)
    expect(env.RUN_ODDS_POLLER).toBe(false)
    expect(env.RUN_CRASH_CLOCK).toBe(false)
    expect(env.CRON_SECRET).toBe('shh')
  })

  it('defaults flags ON when unset and only OFF for 0 / false', () => {
    expect(parseServerEnv({}).RUN_ODDS_POLLER).toBe(true)
    expect(parseServerEnv({}).RUN_CRASH_CLOCK).toBe(true)
    expect(parseServerEnv({ RUN_ODDS_POLLER: '1' }).RUN_ODDS_POLLER).toBe(true)
    expect(parseServerEnv({ RUN_ODDS_POLLER: 'anything' }).RUN_ODDS_POLLER).toBe(true)
  })

  it('treats empty / malformed numeric knobs as unset (degrades, never throws)', () => {
    const env = parseServerEnv({ PORT: '', LIVE_POLL_MS: 'abc', PREMATCH_POLL_MS: '-5' })
    expect(env.PORT).toBeUndefined()
    expect(env.LIVE_POLL_MS).toBeUndefined()
    expect(env.PREMATCH_POLL_MS).toBeUndefined()
  })

  it('strips unknown keys (only documented config survives)', () => {
    const env = parseServerEnv({ PATH: '/usr/bin', FAIRNESS_SECRET: 's' }) as Record<string, unknown>
    expect(env.PATH).toBeUndefined()
    expect(env.FAIRNESS_SECRET).toBe('s')
  })
})

describe('getServerEnv', () => {
  it('parses an explicit source without touching the process cache', () => {
    expect(getServerEnv({ PORT: '9090' }).PORT).toBe(9090)
  })
})

describe('collectEnvIssues', () => {
  it('finds no issues for a clean dev env', () => {
    expect(collectEnvIssues({}, false)).toEqual([])
  })

  it('flags malformed positive-int knobs and out-of-range ports', () => {
    const issues = collectEnvIssues({ LIVE_POLL_MS: 'abc', PORT: '70000' }, false)
    expect(issues.some((i) => i.includes('LIVE_POLL_MS'))).toBe(true)
    expect(issues.some((i) => i.includes('PORT'))).toBe(true)
  })

  it('requires FAIRNESS_SECRET only in production', () => {
    expect(collectEnvIssues({}, false).some((i) => i.includes('FAIRNESS_SECRET'))).toBe(false)
    expect(collectEnvIssues({}, true).some((i) => i.includes('FAIRNESS_SECRET'))).toBe(true)
    expect(
      collectEnvIssues({ FAIRNESS_SECRET: 's' }, true).some((i) => i.includes('FAIRNESS_SECRET')),
    ).toBe(false)
  })

  it('requires the Supabase URL and anon key to be set together', () => {
    expect(
      collectEnvIssues({ SUPABASE_URL: 'https://x.supabase.co' }, false).some((i) =>
        i.includes('SUPABASE'),
      ),
    ).toBe(true)
    expect(collectEnvIssues({ SUPABASE_ANON_KEY: 'k' }, false).some((i) => i.includes('SUPABASE'))).toBe(
      true,
    )
    expect(
      collectEnvIssues({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }, false),
    ).toEqual([])
    // the Vite-exposed pair satisfies the rule too
    expect(
      collectEnvIssues(
        { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' },
        false,
      ),
    ).toEqual([])
  })
})

describe('validateServerEnv — the startup gate', () => {
  it('passes for a valid production env and returns the typed env', () => {
    const env = validateServerEnv({
      source: { FAIRNESS_SECRET: 'strong', PORT: '8080' },
      production: true,
    })
    expect(env.PORT).toBe(8080)
  })

  it('HARD-FAILS in production when FAIRNESS_SECRET is missing', () => {
    expect(() => validateServerEnv({ source: {}, production: true })).toThrow(EnvValidationError)
    expect(() => validateServerEnv({ source: {}, production: true })).toThrow(/FAIRNESS_SECRET/)
  })

  it('HARD-FAILS in production on a malformed knob', () => {
    expect(() =>
      validateServerEnv({ source: { FAIRNESS_SECRET: 's', LIVE_POLL_MS: 'abc' }, production: true }),
    ).toThrow(/LIVE_POLL_MS/)
  })

  it('WARNS (does not throw) outside production and still returns safe fallbacks', () => {
    const warn = vi.fn()
    const env = validateServerEnv({ source: { LIVE_POLL_MS: 'abc' }, production: false, warn })
    expect(env.LIVE_POLL_MS).toBeUndefined() // degraded to the default, not thrown
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.some(([m]) => String(m).includes('LIVE_POLL_MS'))).toBe(true)
  })

  it('aggregates every issue in the thrown error', () => {
    let caught: unknown
    try {
      validateServerEnv({
        source: { PORT: '0', SUPABASE_URL: 'https://x.supabase.co' },
        production: true,
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(EnvValidationError)
    const issues = (caught as EnvValidationError).issues
    expect(issues.some((i) => i.includes('FAIRNESS_SECRET'))).toBe(true) // missing
    expect(issues.some((i) => i.includes('PORT'))).toBe(true) // malformed
    expect(issues.some((i) => i.includes('SUPABASE'))).toBe(true) // unpaired
  })
})

describe('isProductionEnv', () => {
  it('detects NODE_ENV / VERCEL_ENV production', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true)
    expect(isProductionEnv({ VERCEL_ENV: 'production' })).toBe(true)
    expect(isProductionEnv({ NODE_ENV: 'development' })).toBe(false)
    expect(isProductionEnv({})).toBe(false)
  })
})
