import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers?: Array<{
    source: string
    headers: VercelHeader[]
  }>
}

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig

function rootHeaders(): Map<string, string> {
  const entry = config.headers?.find((h) => h.source === '/(.*)')
  return new Map(entry?.headers.map((h) => [h.key, h.value]) ?? [])
}

describe('vercel security headers', () => {
  it('ships the G2 defense-in-depth headers for every route', () => {
    const headers = rootHeaders()

    expect(headers.get('Content-Security-Policy-Report-Only')).toBeTruthy()
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=63072000')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
  })

  it('keeps the starter CSP compatible with the current app surface', () => {
    const csp = rootHeaders().get('Content-Security-Policy-Report-Only')

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('wss://*.supabase.co')
    expect(csp).toContain('https://api.the-odds-api.com')
    expect(csp).toContain('https://api.sportsgameodds.com')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })
})
