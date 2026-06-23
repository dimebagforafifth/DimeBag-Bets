/**
 * Scheduled-promos cron worker (CLAUDE.md §6) — the SERVER side of the recurring-bonus
 * runner. The in-app runner (manager/promotions/schedule-runner.ts) only ticks while a tab
 * is open; this is the backstop a Vercel Cron / external pinger hits (api/run-promos.ts) so
 * schedules fire even with nobody on the site.
 *
 * Cost / safety discipline, mirroring runPollCycle:
 *  - MOCK (default, no keys): a true no-op — `{ mode:'mock', ran:false }`. Nothing to read
 *    server-side, so the in-app runner stays the only path and the no-keys app is unchanged.
 *  - LIVE (keys present): reads the persisted schedule doc from Supabase, fires every DUE
 *    bonus through the injected `send`, advances each (recurring re-arms, 'once' deactivates)
 *    and writes the doc back. Money moves only through `send` (the server-authoritative grant
 *    path) — never here. With no `send` wired it reports `ran:false` and advances NOTHING, so
 *    a bonus is never silently dropped.
 *
 * Pure schedule math (`dueSchedules` / `nextFireAt`) is reused from manager/promotions; the
 * tiny advance step mirrors schedule-store.markFired (kept here to avoid importing the
 * localStorage-coupled store into the persistence layer).
 */

import { getSupabaseEnv, type EnvSource } from './supabase/env.js'
import { createRestKvTransport, type FetchLike } from './supabase/kv-transport.js'
import { tenantNamespace } from './tenant.js'
import { dueSchedules, nextFireAt, type ScheduledBonus } from '../manager/promotions/schedule.js'
import type { BonusDraft } from '../manager/promotions/promotions.js'

/** Mirrors persistence/doc.ts persistedDoc + the schedule-store doc shape/key/version. */
const SCHEDULE_KEY = 'manager.schedules'
const SCHEDULE_VERSION = 1
interface ScheduleDoc {
  seq: number
  schedules: ScheduledBonus[]
}
interface Envelope<T> {
  v: number
  data: T
}

export interface PromoCronResult {
  mode: 'mock' | 'live'
  /** Whether the cron actually processed schedules (read + advanced). */
  ran: boolean
  fired: number
  failed: number
  /** Why it didn't run, when ran === false. */
  reason?: string
}

/** Loads/saves the persisted ScheduleDoc. Default: a Supabase kv-transport source. */
export interface ScheduleSource {
  load(): Promise<ScheduleDoc>
  save(doc: ScheduleDoc): Promise<void>
}

export interface PromoCronOptions {
  /** Injectable env (tests); default reads the ambient SUPABASE_* keys. */
  envSource?: EnvSource
  /** Injectable fetch for the default transport (tests). */
  fetchImpl?: FetchLike
  /** Document namespace (default `'dimebag'`, tenant-scoped like every store). */
  namespace?: string
  /** Clock (tests). Default: Date.now(). */
  now?: number
  /** Inject the schedule source (tests). Default: Supabase transport, or null with no keys. */
  source?: ScheduleSource | null
  /**
   * Dispatch a due bonus server-side. REQUIRED to actually fire — money moves through the
   * server-authoritative grant path, which needs the book/org hydrated on the server (see
   * docs/operations/provisioning.md). Without it the cron reports `ran:false` and advances nothing.
   */
  send?: (draft: BonusDraft) => void
}

/** A Supabase kv-transport-backed schedule source (the production default). */
function restScheduleSource(opts: PromoCronOptions, env: NonNullable<ReturnType<typeof getSupabaseEnv>>): ScheduleSource {
  const transport = createRestKvTransport({
    env,
    namespace: tenantNamespace(opts.namespace ?? 'dimebag'),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  })
  return {
    async load() {
      const rows = await transport.loadAll()
      const row = rows.find((r) => r.key === SCHEDULE_KEY)
      const envelope = row?.value as Envelope<ScheduleDoc> | undefined
      return envelope && envelope.v === SCHEDULE_VERSION ? envelope.data : { seq: 0, schedules: [] }
    },
    async save(doc) {
      await transport.upsert(SCHEDULE_KEY, { v: SCHEDULE_VERSION, data: doc })
    },
  }
}

/** Advance one fired schedule — recurring re-arms past any missed windows, 'once' ends.
 *  Mirrors manager/promotions/schedule-store.ts markFired. */
function advance(s: ScheduledBonus, now: number): void {
  s.lastFired = now
  let next = nextFireAt(s.fireAt, s.recurrence)
  while (next > 0 && next <= now) next = nextFireAt(next, s.recurrence)
  if (next > 0) s.fireAt = next
  else s.active = false
}

/**
 * Run ONE scheduled-promos cycle. Mock-safe (no keys → no-op). See the module header for
 * the live contract. Never throws on a single failing bonus — it's counted and still
 * advanced so it can't spin the cron.
 */
export async function runScheduledPromosCron(opts: PromoCronOptions = {}): Promise<PromoCronResult> {
  const env = getSupabaseEnv(opts.envSource)
  const source = opts.source ?? (env ? restScheduleSource(opts, env) : null)
  if (!source) {
    return {
      mode: 'mock',
      ran: false,
      fired: 0,
      failed: 0,
      reason: 'Supabase not configured — cron no-op (the in-app runner handles schedules while open)',
    }
  }
  if (!opts.send) {
    return {
      mode: 'live',
      ran: false,
      fired: 0,
      failed: 0,
      reason: 'no bonus dispatcher wired (server money path — see docs/operations/provisioning.md)',
    }
  }

  const now = opts.now ?? Date.now()
  const doc = await source.load()
  const due = dueSchedules(doc.schedules, now)
  let fired = 0
  let failed = 0
  for (const s of due) {
    try {
      opts.send(s.draft)
      fired += 1
    } catch {
      failed += 1
    }
    advance(s, now)
  }
  if (due.length > 0) await source.save(doc)
  return { mode: 'live', ran: true, fired, failed }
}
