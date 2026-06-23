import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.js'

describe('parseCsv', () => {
  it('parses a simple sheet into header-keyed rows', () => {
    const { headers, rows } = parseCsv('name,credit\nMarco,2000\nLena,1500')
    expect(headers).toEqual(['name', 'credit'])
    expect(rows).toEqual([
      { name: 'Marco', credit: '2000' },
      { name: 'Lena', credit: '1500' },
    ])
  })

  it('honours quoted fields with embedded commas and escaped quotes', () => {
    const { rows } = parseCsv('name,note\n"Reyes, Marco","said ""hi"""')
    expect(rows[0]).toEqual({ name: 'Reyes, Marco', note: 'said "hi"' })
  })

  it('handles a newline inside a quoted field', () => {
    const { rows } = parseCsv('name,note\nMarco,"line1\nline2"')
    expect(rows).toHaveLength(1)
    expect(rows[0].note).toBe('line1\nline2')
  })

  it('tolerates CRLF endings, a BOM, and a trailing newline', () => {
    const { headers, rows } = parseCsv('﻿name,credit\r\nMarco,2000\r\n')
    expect(headers).toEqual(['name', 'credit'])
    expect(rows).toEqual([{ name: 'Marco', credit: '2000' }])
  })

  it('skips blank lines and trims cells', () => {
    const { rows } = parseCsv('name,credit\n  Marco , 2000 \n\nLena,1500\n')
    expect(rows).toEqual([
      { name: 'Marco', credit: '2000' },
      { name: 'Lena', credit: '1500' },
    ])
  })

  it('pads short rows and keeps extras under synthesised headers', () => {
    const { rows } = parseCsv('a,b\nonly\nx,y,z')
    expect(rows[0]).toEqual({ a: 'only', b: '' })
    expect(rows[1]).toEqual({ a: 'x', b: 'y', col3: 'z' })
  })

  it('returns empty for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})
