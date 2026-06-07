import { describe, it, expect, afterEach } from 'vitest'
import { formatMoney } from './money.js'
import { normalizeMoneyDisplay, resetMoneyDisplay, setMoneyDisplay } from './presentation.js'

// Always restore defaults so the global display singleton never leaks to other tests.
afterEach(() => resetMoneyDisplay())

describe('formatMoney × money display', () => {
  it('defaults to the historical $1,234.56 / −$9.23', () => {
    expect(formatMoney(123456)).toBe('$1,234.56')
    expect(formatMoney(-923)).toBe('−$9.23')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('reflects a configured symbol, position, and decimals', () => {
    setMoneyDisplay({ symbol: '₵', symbolPosition: 'after', decimals: 0 })
    expect(formatMoney(123456)).toBe('1,235 ₵') // 1234.56 → 0 dp → rounds
    resetMoneyDisplay()
    expect(formatMoney(123456)).toBe('$1,234.56') // reset restores the default
  })

  it('normalizes/clamps incoming display config', () => {
    expect(normalizeMoneyDisplay({ decimals: 9 }).decimals).toBe(2)
    expect(normalizeMoneyDisplay({ decimals: -3 }).decimals).toBe(0)
    expect(normalizeMoneyDisplay({ symbol: '' }).symbol).toBe('$')
    expect(normalizeMoneyDisplay({ symbolPosition: 'sideways' as never }).symbolPosition).toBe('before')
  })
})
