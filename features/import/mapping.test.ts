import { describe, expect, it } from 'vitest'
import { applyMapping, autoDetectMapping, parseAmountCents, splitAgentPath } from './mapping.js'
import { DEFAULT_MAPPING_OPTIONS } from './types.js'

describe('autoDetectMapping', () => {
  it('guesses the common columns from typical headers', () => {
    const map = autoDetectMapping([
      'Player Name',
      'Agent',
      'Credit Limit',
      'Balance',
      'Email',
      'Phone',
    ])
    expect(map).toMatchObject({
      name: 'Player Name',
      agent: 'Agent',
      creditLimit: 'Credit Limit',
      startingBalance: 'Balance',
      email: 'Email',
      phone: 'Phone',
    })
  })

  it('prefers an exact header match and never reuses a column', () => {
    const map = autoDetectMapping(['name', 'nickname'])
    expect(map.name).toBe('name')
    expect(map.nickname).toBe('nickname') // 'nickname' didn't get stolen by the name field
  })

  it('maps figure-like headers to startingBalance', () => {
    expect(autoDetectMapping(['player', 'figure']).startingBalance).toBe('figure')
    expect(autoDetectMapping(['player', 'net']).startingBalance).toBe('net')
  })

  it('leaves unknown headers unmapped', () => {
    const map = autoDetectMapping(['xyz', 'qqq'])
    expect(map.name).toBeUndefined()
  })
})

describe('parseAmountCents', () => {
  const dollars = { signed: false, dollars: true }
  const signedDollars = { signed: true, dollars: true }

  it('parses dollars with symbols and separators to cents', () => {
    expect(parseAmountCents('$2,000', dollars)).toBe(200000)
    expect(parseAmountCents('1500.50', dollars)).toBe(150050)
  })

  it('reads accounting parentheses and leading minus as negative (signed only)', () => {
    expect(parseAmountCents('(75)', signedDollars)).toBe(-7500)
    expect(parseAmountCents('-200', signedDollars)).toBe(-20000)
  })

  it('clamps to >= 0 when unsigned (a credit line is never negative)', () => {
    expect(parseAmountCents('(75)', dollars)).toBe(7500)
    expect(parseAmountCents('-200', dollars)).toBe(20000)
  })

  it('treats blanks/garbage as 0', () => {
    expect(parseAmountCents('', signedDollars)).toBe(0)
    expect(parseAmountCents('  ', signedDollars)).toBe(0)
    expect(parseAmountCents('n/a', signedDollars)).toBe(0)
  })

  it('passes integer cents through when amounts are already cents', () => {
    expect(parseAmountCents('200000', { signed: false, dollars: false })).toBe(200000)
    expect(parseAmountCents('-4500', { signed: true, dollars: false })).toBe(-4500)
  })

  it('rejects malformed money as 0 rather than silently corrupting it', () => {
    expect(parseAmountCents('1.2.3', signedDollars)).toBe(0) // multiple decimals
    expect(parseAmountCents('1e3', signedDollars)).toBe(0) // NOT 1300 — scientific notation rejected
    expect(parseAmountCents('USD 50', signedDollars)).toBe(0) // currency code / letters → 0
    expect(parseAmountCents('abc', signedDollars)).toBe(0)
  })
})

describe('splitAgentPath', () => {
  it('splits on the delimiter and drops empties', () => {
    expect(splitAgentPath('North / East Desk', '/')).toEqual(['North', 'East Desk'])
    expect(splitAgentPath('North /', '/')).toEqual(['North'])
    expect(splitAgentPath('', '/')).toEqual([])
  })
})

describe('applyMapping', () => {
  const map = {
    name: 'Player',
    agent: 'Agent',
    creditLimit: 'Credit',
    startingBalance: 'Bal',
    email: 'Email',
    nickname: 'Nick',
  }
  it('produces the canonical player shape with money in cents and a built profile', () => {
    const row = {
      Player: 'Marco',
      Agent: 'North / East',
      Credit: '$2,000',
      Bal: '(450)',
      Email: 'm@x.com',
      Nick: 'marco',
    }
    const mapped = applyMapping(row, map, DEFAULT_MAPPING_OPTIONS)
    expect(mapped.name).toBe('Marco')
    expect(mapped.agentPath).toEqual(['North', 'East'])
    expect(mapped.creditLimitCents).toBe(200000)
    expect(mapped.startingBalanceCents).toBe(-45000)
    expect(mapped.profile).toEqual({ email: 'm@x.com', nickname: 'marco' })
  })

  it('omits absent fields and leaves an empty profile when none map', () => {
    const mapped = applyMapping({ Player: 'Solo' }, { name: 'Player' }, DEFAULT_MAPPING_OPTIONS)
    expect(mapped.agentPath).toEqual([])
    expect(mapped.creditLimitCents).toBe(0)
    expect(mapped.startingBalanceCents).toBe(0)
    expect(mapped.profile).toEqual({})
    expect(mapped.externalId).toBeUndefined()
  })
})
