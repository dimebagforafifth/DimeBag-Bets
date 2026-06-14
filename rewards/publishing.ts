/**
 * Reward feature PUBLISHING — the operator decides which reward features are live, schedules
 * when they go live, and publishes them. Publishing a feature flips it on for players AND
 * relays an alert to the operator's Discord / Telegram (reusing the shared webhook layer in
 * manager/communication — no duplicate transport). Every relay is logged so the operator can
 * see what went out and whether it landed.
 *
 * Time is passed in (`now`) so the logic is deterministic + testable; the panel passes
 * Date.now(). The webhook sender (`fetch`) is injectable for tests.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import {
  getRewardsConfig,
  setProgramEnabled,
  setProgramSchedule,
  PROGRAM_KEYS,
  type ProgramKey,
} from './economy.js'
import {
  dispatch,
  configuredChannels,
  announcementText,
  commsStore,
  type DispatchResult,
} from '../manager/communication/index.js'

/* ----------------------------- feature metadata ---------------------------- */

export interface ProgramMeta {
  name: string
  /** A one-line, player-facing blurb used in the published alert. */
  blurb: string
}
export const PROGRAM_META: Record<ProgramKey, ProgramMeta> = {
  tiers: { name: 'Tiers & Ranks', blurb: 'climb the VIP ladder for perks and status.' },
  cashback: { name: 'Cashback', blurb: 'earn a slice of every wager back as balance.' },
  daily: { name: 'Daily & Streak', blurb: 'daily login bonuses that grow with your streak.' },
  missions: { name: 'Missions', blurb: 'complete challenges to bank balance.' },
  promos: { name: 'Promotions', blurb: 'limited-time offers and bonuses.' },
  contests: { name: 'Contests', blurb: 'compete over a window for a balance prize pool.' },
  leaderboards: { name: 'Leaderboards', blurb: 'climb the boards for status and prizes.' },
}

export type ProgramState = 'live' | 'scheduled' | 'off'

/** A program is LIVE once enabled; SCHEDULED while it has a future go-live and isn't live yet;
 *  otherwise OFF. (A schedule whose time has passed is published by `runDueSchedules`.) */
export function programState(key: ProgramKey): ProgramState {
  const cfg = getRewardsConfig()
  if (cfg.enabled[key]) return 'live'
  if (cfg.schedule[key] != null) return 'scheduled'
  return 'off'
}

/* ------------------------------- publish log ------------------------------- */

export type PublishStatus = 'sent' | 'partial' | 'failed' | 'skipped'
export interface PublishEntry {
  id: number
  at: number
  kind: 'program' | 'test'
  key: string
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
  kind: 'program' | 'test',
  key: string,
  name: string,
  body: string,
  now: number,
  sender: typeof fetch,
): Promise<RelayOutcome> {
  const cfg = commsStore.webhooks()
  const channels = configuredChannels(cfg)
  if (channels.length === 0) {
    append({ at: now, kind, key, name, status: 'skipped', channels: [], detail: 'No Discord/Telegram webhook configured.' })
    return { channels: [], results: [], status: 'skipped' }
  }
  const results = await dispatch(cfg, announcementText(`🎁 ${name}`, body), sender)
  const okN = results.filter((r) => r.ok).length
  const status: PublishStatus = okN === results.length ? 'sent' : okN > 0 ? 'partial' : 'failed'
  const detail =
    status === 'sent'
      ? `Relayed to ${channels.join(' + ')}.`
      : results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error ?? 'failed'}`).join('; ')
  append({ at: now, kind, key, name, status, channels, detail })
  return { channels, results, status }
}

/* ------------------------------- operations -------------------------------- */

/** Publish a program NOW: flip it live, clear any schedule, and relay the alert. */
export async function publishProgram(
  key: ProgramKey,
  now: number,
  sender: typeof fetch = fetch,
): Promise<RelayOutcome> {
  setProgramEnabled(key, true)
  setProgramSchedule(key, null)
  const meta = PROGRAM_META[key]
  return relay('program', key, meta.name, `${meta.name} is now live — ${meta.blurb}`, now, sender)
}

/** Schedule a program to go live at `goLiveAt` (keeps it off to players until then). */
export function scheduleProgram(key: ProgramKey, goLiveAt: number): void {
  setProgramEnabled(key, false)
  setProgramSchedule(key, goLiveAt)
}

/** Turn a program off and clear any schedule (no relay). */
export function setProgramOff(key: ProgramKey): void {
  setProgramEnabled(key, false)
  setProgramSchedule(key, null)
}

/** Publish every scheduled program whose go-live time has passed. Idempotent: once a
 *  program is live its schedule is cleared, so it won't re-fire. Returns the keys published. */
export async function runDueSchedules(now: number, sender: typeof fetch = fetch): Promise<ProgramKey[]> {
  const cfg = getRewardsConfig()
  const due = PROGRAM_KEYS.filter(
    (k) => !cfg.enabled[k] && cfg.schedule[k] != null && now >= (cfg.schedule[k] as number),
  )
  for (const k of due) await publishProgram(k, now, sender)
  return due
}

/** Send a one-off test alert to the configured channels (to verify the wiring). */
export async function relayTest(now: number, sender: typeof fetch = fetch): Promise<RelayOutcome> {
  return relay(
    'test',
    'test',
    'Webhook test',
    'DimeBag-Bets rewards alerts are wired up. You’ll get a ping here whenever a reward feature is published.',
    now,
    sender,
  )
}
