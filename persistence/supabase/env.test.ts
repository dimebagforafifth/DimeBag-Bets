import { describe, it, expect } from 'vitest'
import { getSupabaseEnv, isSupabaseConfigured } from './env.js'

describe('supabase env', () => {
  it('is null (→ localStorage) when neither key is set', () => {
    expect(getSupabaseEnv({})).toBeNull()
    expect(isSupabaseConfigured({})).toBe(false)
  })

  it('resolves the unprefixed names and trims a trailing slash on the url', () => {
    const env = getSupabaseEnv({
      SUPABASE_URL: 'https://abc.supabase.co/',
      SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(env).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon-key' })
    expect(isSupabaseConfigured({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'k' })).toBe(true)
  })

  it('also accepts the Vite-prefixed names (browser build)', () => {
    const env = getSupabaseEnv({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'pub',
    })
    expect(env).toEqual({ url: 'https://x.supabase.co', anonKey: 'pub' })
  })

  it('is null when only one of the two keys is present', () => {
    expect(getSupabaseEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
    expect(getSupabaseEnv({ SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })

  it('treats an empty-string value as absent', () => {
    expect(getSupabaseEnv({ SUPABASE_URL: '', SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })
})
