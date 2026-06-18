/**
 * Risk-alert TRANSPORT (off-by-default) — wires the risk engine's `onAlert` hook (app/risk-
 * controls.ts) to an SMS / email transport so a breach can page an operator, not just show
 * in-app. This is the seam `onAlert` was built for ("// SEAM: wire an SMS / email transport here").
 *
 * INERT WITHOUT KEYS — the byte-for-byte invariant. With no transport endpoints configured,
 * `installAlertTransport` registers NO hook and returns a no-op disposer: `onAlert` fires into
 * nothing, exactly as before. Only once an endpoint env var is present does it subscribe and
 * dispatch. So the default build (and every test that doesn't opt in) behaves identically.
 *
 * NO PROVIDER SECRETS HERE — a channel is a relay ENDPOINT (an internal URL provisioning points
 * at Twilio / SendGrid, holding the real credentials server-side); the alert is POSTed there as
 * JSON. This keeps account tokens out of the browser bundle. It also moves no money and reads no
 * balance — it only forwards an already-raised `Alert`.
 */

import type { FetchLike } from '../persistence/index.js'
import { onAlert, type Alert } from './risk-controls.js'

/** One notification channel: where to POST, and (optionally) the destination it relays to. */
export interface AlertChannelConfig {
  /** Relay endpoint URL (provisioning wires it to the provider). */
  endpoint: string
  /** Destination handle (phone / address) passed through to the relay. */
  to?: string
}

export interface AlertTransportConfig {
  sms?: AlertChannelConfig
  email?: AlertChannelConfig
  /** Don't dispatch below this severity. Default 'warn' (dispatch everything raised). */
  minSeverity?: Alert['severity']
}

const trimmed = (v: string | undefined): string | undefined => {
  const t = v?.trim()
  return t ? t : undefined
}

/**
 * Resolve the transport config from an env bag, or NULL when nothing is configured (the inert,
 * off-by-default case). A channel exists only if its endpoint env var is set.
 */
export function resolveAlertTransportConfig(
  env: Record<string, string | undefined>,
): AlertTransportConfig | null {
  const smsEndpoint = trimmed(env.ALERT_SMS_ENDPOINT)
  const emailEndpoint = trimmed(env.ALERT_EMAIL_ENDPOINT)
  const sms = smsEndpoint ? { endpoint: smsEndpoint, to: trimmed(env.ALERT_SMS_TO) } : undefined
  const email = emailEndpoint
    ? { endpoint: emailEndpoint, to: trimmed(env.ALERT_EMAIL_TO) }
    : undefined
  if (!sms && !email) return null
  const minSeverity: Alert['severity'] =
    trimmed(env.ALERT_MIN_SEVERITY) === 'critical' ? 'critical' : 'warn'
  return { sms, email, minSeverity }
}

/** The JSON forwarded to a relay — the alert essentials, no internal store shape. */
function payloadFor(channel: 'sms' | 'email', cfg: AlertChannelConfig, a: Alert) {
  return {
    channel,
    to: cfg.to,
    severity: a.severity,
    scope: a.scope,
    scopeKey: a.scopeKey,
    metric: a.metric,
    message: a.message,
    valueCents: a.valueCents,
    limitCents: a.limitCents,
    at: a.at,
  }
}

/**
 * Build the dispatcher for a config — `(alert) => Promise<void>` that POSTs the alert to each
 * configured channel. A transport failure is swallowed (best-effort: a down relay must never
 * break the in-app alert path that already ran). Severity below `minSeverity` is skipped.
 */
export function createAlertDispatcher(
  config: AlertTransportConfig,
  deps: { fetch?: FetchLike } = {},
): (a: Alert) => Promise<void> {
  const doFetch = deps.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const min = config.minSeverity ?? 'warn'
  return async (a) => {
    if (min === 'critical' && a.severity !== 'critical') return
    const channels: Array<['sms' | 'email', AlertChannelConfig | undefined]> = [
      ['sms', config.sms],
      ['email', config.email],
    ]
    await Promise.all(
      channels.map(async ([kind, cfg]) => {
        if (!cfg) return
        try {
          await doFetch(cfg.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadFor(kind, cfg, a)),
          })
        } catch {
          /* best-effort: a transport failure never breaks the in-app alert */
        }
      }),
    )
  }
}

/** Read the ambient env. In the browser only VITE_-prefixed vars exist on import.meta.env and
 *  these alert endpoints aren't VITE_-prefixed, so the browser read is empty → inert; a server
 *  caller (where the relay endpoints live) gets process.env. */
function ambientEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  try {
    const me = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    if (me) Object.assign(out, me)
  } catch {
    /* import.meta.env unavailable in this runtime */
  }
  if (typeof process !== 'undefined' && process.env) Object.assign(out, process.env)
  return out
}

export interface InstallAlertTransportOpts {
  /** Env source (defaults to the ambient env). */
  env?: Record<string, string | undefined>
  /** Injected fetch (tests / a server runtime). */
  fetch?: FetchLike
  /** Hook registrar (defaults to risk-controls `onAlert`); injectable for tests. */
  register?: (hook: (a: Alert) => void) => () => void
}

/**
 * Wire the transport to `onAlert`. Returns a disposer. OFF BY DEFAULT: with no endpoints in the
 * env it registers NOTHING and returns a no-op disposer — byte-for-byte the no-transport
 * behaviour. With at least one endpoint it subscribes and dispatches every raised alert.
 */
export function installAlertTransport(opts: InstallAlertTransportOpts = {}): () => void {
  const config = resolveAlertTransportConfig(opts.env ?? ambientEnv())
  if (!config) return () => {} // inert: no hook registered, nothing changes
  const dispatch = createAlertDispatcher(config, { fetch: opts.fetch })
  const register = opts.register ?? onAlert
  return register((a) => {
    void dispatch(a)
  })
}
