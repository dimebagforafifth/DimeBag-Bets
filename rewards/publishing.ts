/**
 * Reward announcements — when the manager publishes a feature or runs a promo, relay it to
 * the operator's Discord / Telegram (reusing the shared webhook layer in manager/communication
 * — no duplicate transport) and log it. Best-effort: a dead webhook never blocks publishing.
 *
 * Time is passed in (`now`) for testability; the sender (`fetch`) is injectable.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import {
  dispatch,
  configuredChannels,
  announcementText,
  commsStore,
  type DispatchResult,
} from '../manager/communication/index.js'

/* ------------------------------- publish log ------------------------------- */

export type PublishStatus = 'sent' | 'partial' | 'failed' | 'skipped'
export interface PublishEntry {
  id: number
  at: number
  kind: 'feature' | 'promo' | 'test'
  name: string
  status: PublishStatus
  channels: string[]
  detail: string
}
interface PublishLog {
  seq: number
  entries: PublishEntry[]
}

const MAX_LOG = 50
const store = createStore({ namespace: 'dimebag' })
const LOG: Doc<PublishLog> = persistedDoc<PublishLog>(store, 'rewards.publishLog', {
  version: 1,
  initial: { seq: 0, entries: [] },
})

let log: PublishLog = LOG.load() ?? { seq: 0, entries: [] }
let logVersion = 0
const listeners = new Set<() => void>()
function bump(): void {
  LOG.save(log)
  logVersion += 1
  listeners.forEach((l) => l())
}

export function subscribePublishLog(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getPublishLogVersion(): number {
  return logVersion
}
export function getPublishLog(): PublishEntry[] {
  return log.entries
}
export function __resetPublishLog(): void {
  log = { seq: 0, entries: [] }
  bump()
}

function append(e: Omit<PublishEntry, 'id'>): void {
  const entry: PublishEntry = { ...e, id: (log.seq += 1) }
  log = { seq: log.seq, entries: [entry, ...log.entries].slice(0, MAX_LOG) }
  bump()
}

/* --------------------------------- relay ----------------------------------- */

export interface RelayOutcome {
  channels: string[]
  results: DispatchResult[]
  status: PublishStatus
}

async function relay(
  kind: PublishEntry['kind'],
  name: string,
  title: string,
  body: string,
  now: number,
  sender: typeof fetch,
): Promise<RelayOutcome> {
  const cfg = commsStore.webhooks()
  const channels = configuredChannels(cfg)
  if (channels.length === 0) {
    append({ at: now, kind, name, status: 'skipped', channels: [], detail: 'No Discord/Telegram webhook configured.' })
    return { channels: [], results: [], status: 'skipped' }
  }
  const results = await dispatch(cfg, announcementText(title, body), sender)
  const okN = results.filter((r) => r.ok).length
  const status: PublishStatus = okN === results.length ? 'sent' : okN > 0 ? 'partial' : 'failed'
  const detail =
    status === 'sent'
      ? `Relayed to ${channels.join(' + ')}.`
      : results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error ?? 'failed'}`).join('; ')
  append({ at: now, kind, name, status, channels, detail })
  return { channels, results, status }
}

/** Announce a feature going live (Rakeback / Daily / Free Spins). */
export function announceFeature(label: string, now: number, sender: typeof fetch = fetch): Promise<RelayOutcome> {
  return relay('feature', label, `🎁 ${label} is live`, `${label} is now available in Rewards.`, now, sender)
}

/** Announce a promo (e.g. a profit boost). */
export function announcePromo(name: string, detail: string, now: number, sender: typeof fetch = fetch): Promise<RelayOutcome> {
  return relay('promo', name, `🔥 ${name}`, detail, now, sender)
}

/** Send a one-off test alert to verify the wiring. */
export function relayTest(now: number, sender: typeof fetch = fetch): Promise<RelayOutcome> {
  return relay(
    'test',
    'Webhook test',
    'Webhook test',
    'DimeBag-Bets rewards alerts are wired up. You’ll get a ping here when you publish a feature or run a promo.',
    now,
    sender,
  )
}
