import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../persistence/index.js'
import type { Alert } from './risk-controls.js'
import {
  createAlertDispatcher,
  installAlertTransport,
  resolveAlertTransportConfig,
} from './alert-transport.js'

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'al-1',
  thresholdId: 'book-liability',
  at: 1_000,
  severity: 'critical',
  scope: 'book',
  scopeKey: 'book',
  metric: 'liability',
  message: 'Book open liability over the limit',
  valueCents: 200_000,
  limitCents: 150_000,
  action: 'alert',
  acted: false,
  acknowledged: false,
  ...over,
})

/** A fetch spy that records every POST. */
function fetchSpy() {
  const calls: { url: string; body: unknown }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse((init?.body as string) ?? 'null') })
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
  }
  return { fetchImpl, calls }
}

describe('alert transport config — off by default', () => {
  it('no endpoints → null config (the inert case)', () => {
    expect(resolveAlertTransportConfig({})).toBeNull()
    expect(resolveAlertTransportConfig({ ALERT_SMS_TO: '+155501', NOISE: 'x' })).toBeNull()
    expect(resolveAlertTransportConfig({ ALERT_SMS_ENDPOINT: '   ' })).toBeNull() // blank ignored
  })

  it('an endpoint → a config for that channel', () => {
    const c = resolveAlertTransportConfig({
      ALERT_SMS_ENDPOINT: 'https://relay/sms',
      ALERT_SMS_TO: '+15550100',
    })
    expect(c).toEqual({
      sms: { endpoint: 'https://relay/sms', to: '+15550100' },
      minSeverity: 'warn',
    })
  })

  it('minSeverity is read from env (default warn)', () => {
    expect(
      resolveAlertTransportConfig({ ALERT_EMAIL_ENDPOINT: 'https://relay/mail' })?.minSeverity,
    ).toBe('warn')
    expect(
      resolveAlertTransportConfig({
        ALERT_EMAIL_ENDPOINT: 'https://relay/mail',
        ALERT_MIN_SEVERITY: 'critical',
      })?.minSeverity,
    ).toBe('critical')
    // An unrecognised value coerces to the safe default (notify on everything), never undefined.
    expect(
      resolveAlertTransportConfig({
        ALERT_EMAIL_ENDPOINT: 'https://relay/mail',
        ALERT_MIN_SEVERITY: 'bogus',
      })?.minSeverity,
    ).toBe('warn')
  })
})

describe('alert dispatcher', () => {
  it('POSTs the alert to each configured channel', async () => {
    const { fetchImpl, calls } = fetchSpy()
    const dispatch = createAlertDispatcher(
      {
        sms: { endpoint: 'https://relay/sms', to: '+1' },
        email: { endpoint: 'https://relay/mail' },
      },
      { fetch: fetchImpl },
    )
    await dispatch(alert({ message: 'breach!' }))
    expect(calls.map((c) => c.url).sort()).toEqual(['https://relay/mail', 'https://relay/sms'])
    const sms = calls.find((c) => c.url.endsWith('/sms'))!.body as Record<string, unknown>
    expect(sms).toMatchObject({
      channel: 'sms',
      to: '+1',
      severity: 'critical',
      message: 'breach!',
    })
  })

  it('skips alerts below minSeverity', async () => {
    const { fetchImpl, calls } = fetchSpy()
    const dispatch = createAlertDispatcher(
      { sms: { endpoint: 'https://relay/sms' }, minSeverity: 'critical' },
      { fetch: fetchImpl },
    )
    await dispatch(alert({ severity: 'warn' })) // below threshold → not sent
    expect(calls).toHaveLength(0)
    await dispatch(alert({ severity: 'critical' }))
    expect(calls).toHaveLength(1)
  })

  it('a transport failure never throws (best-effort)', async () => {
    const failing: FetchLike = async () => {
      throw new Error('relay down')
    }
    const dispatch = createAlertDispatcher(
      { sms: { endpoint: 'https://relay/sms' } },
      { fetch: failing },
    )
    await expect(dispatch(alert())).resolves.toBeUndefined()
  })
})

describe('installAlertTransport — wiring onAlert (inert without keys)', () => {
  it('registers NOTHING without endpoints (byte-for-byte: no hook added)', () => {
    const register = vi.fn(() => () => {})
    const dispose = installAlertTransport({ env: {}, register })
    expect(register).not.toHaveBeenCalled() // inert: never subscribes
    expect(dispose).toBeTypeOf('function')
    expect(() => dispose()).not.toThrow() // no-op disposer
  })

  it('subscribes and dispatches once an endpoint is configured', async () => {
    const { fetchImpl, calls } = fetchSpy()
    let captured: ((a: Alert) => void) | null = null
    const register = vi.fn((hook: (a: Alert) => void) => {
      captured = hook
      return () => {
        captured = null
      }
    })
    const dispose = installAlertTransport({
      env: { ALERT_SMS_ENDPOINT: 'https://relay/sms' },
      fetch: fetchImpl,
      register,
    })
    expect(register).toHaveBeenCalledOnce()
    expect(captured).toBeTypeOf('function')
    captured!(alert({ message: 'paged' })) // simulate a raised alert
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect((calls[0].body as Record<string, unknown>).message).toBe('paged')
    dispose()
    expect(captured).toBeNull() // disposer ran the unsubscribe
  })

  it('the installed transport honours minSeverity from env (gating through the real install path)', async () => {
    const { fetchImpl, calls } = fetchSpy()
    let captured: ((a: Alert) => void) | null = null
    const register = vi.fn((hook: (a: Alert) => void) => {
      captured = hook
      return () => {}
    })
    // Gate to 'critical' via env → the dispatcher built inside installAlertTransport must skip warns.
    installAlertTransport({
      env: { ALERT_SMS_ENDPOINT: 'https://relay/sms', ALERT_MIN_SEVERITY: 'critical' },
      fetch: fetchImpl,
      register,
    })
    captured!(alert({ severity: 'warn' })) // below the gate → not dispatched
    await Promise.resolve()
    expect(calls).toHaveLength(0)
    captured!(alert({ severity: 'critical' })) // at the gate → dispatched
    await vi.waitFor(() => expect(calls).toHaveLength(1))
  })
})
