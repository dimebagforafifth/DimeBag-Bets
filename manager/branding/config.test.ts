import { describe, it, expect } from 'vitest'
import { DEFAULT_BOOK_CONFIG, formatInZone, isValidTimezone, normalizeBookConfig } from './config.js'

describe('normalizeBookConfig', () => {
  it('fills defaults from an empty partial', () => {
    expect(normalizeBookConfig({})).toEqual(DEFAULT_BOOK_CONFIG)
  })
  it('accepts a valid hex accent, drops an invalid one', () => {
    expect(normalizeBookConfig({ accent: '#4f9bff' }).accent).toBe('#4f9bff')
    expect(normalizeBookConfig({ accent: '#fff' }).accent).toBe('#fff')
    expect(normalizeBookConfig({ accent: 'red' }).accent).toBe('') // invalid → fall back to theme
    expect(normalizeBookConfig({ accent: '#12' }).accent).toBe('')
  })
  it('keeps a non-empty name, falls back when blank', () => {
    expect(normalizeBookConfig({ name: 'Acme Book' }).name).toBe('Acme Book')
    expect(normalizeBookConfig({ name: '' }).name).toBe(DEFAULT_BOOK_CONFIG.name)
  })
  it('clamps the money display', () => {
    const c = normalizeBookConfig({ money: { symbol: '€', symbolPosition: 'after', decimals: 9, locale: 'de-DE' } })
    expect(c.money).toEqual({ symbol: '€', symbolPosition: 'after', decimals: 2, locale: 'de-DE' })
  })
})

describe('timezone helpers', () => {
  it('validates IANA zones (empty = local)', () => {
    expect(isValidTimezone('')).toBe(true)
    expect(isValidTimezone('America/New_York')).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
  })
  it('formats an epoch in a zone', () => {
    expect(formatInZone(0, 'UTC')).toMatch(/1970/)
  })
})
