/**
 * Line-override store — manual price overrides the publish gate applies AFTER Lane A's pipeline.
 * An active, un-expired override forces a selection's published price; clearing it (or its expiry
 * passing) reverts to the pipeline price on the next publish. Persisted (mock/local default,
 * off-by-default — an empty store changes nothing). Moves no money.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { LineOverride } from './types.js'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<LineOverride[]> = persistedDoc<LineOverride[]>(store, 'trading.overrides', {
  version: 1,
  initial: [],
})

let overrides: LineOverride[] = DOC.load()
const listeners = new Set<() => void>()
let version = 0

// Expiry timers, keyed by override id. An override is time-bound, but the publish gate only
// re-evaluates when something NOTIFIES it — in mock/off-by-default mode there's no poll to re-run
// it at expiry. So when an override has an `expires_at` we schedule a notify() for that moment;
// the odds-source subscriber then re-publishes and the now-expired override drops out (reverts).
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTimer(id: string): void {
  const t = timers.get(id)
  if (t !== undefined) {
    clearTimeout(t)
    timers.delete(id)
  }
}
function scheduleExpiry(row: LineOverride, now: number): void {
  clearTimer(row.id)
  if (row.expires_at == null) return
  const delay = Math.max(0, row.expires_at - now)
  const t = setTimeout(() => {
    timers.delete(row.id)
    notify() // re-publish: the gate now sees this override as expired and reverts the price
  }, delay)
  // Don't keep the process alive on this timer (Node) — harmless no-op in the browser/happy-dom.
  ;(t as { unref?: () => void }).unref?.()
  timers.set(row.id, t)
}

function notify(): void {
  version += 1
  for (const l of listeners) l()
}
function save(): void {
  DOC.save(overrides)
  notify()
}

// Reschedule expiry for any persisted overrides on load (best-effort; uses wall-clock now).
for (const row of overrides) if (row.expires_at != null) scheduleExpiry(row, Date.now())

export function subscribeOverrides(l: () => void): () => void {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export function overridesVersion(): number {
  return version
}
export function getOverrides(): readonly LineOverride[] {
  return overrides
}

let seq = 0
const nextId = (): string => `ovr_${(seq += 1)}_${overrides.length}`

export interface SetOverrideInput {
  marketId: string
  selectionId: string
  override_odds: number
  override_prob?: number | null
  reason: string
  set_by: string
  set_at: number
  expires_at?: number | null
}

/** Add (or replace, by market+selection) an override and activate it. */
export function setOverride(input: SetOverrideInput): LineOverride {
  const row: LineOverride = {
    id: nextId(),
    marketId: input.marketId,
    selectionId: input.selectionId,
    override_odds: input.override_odds,
    override_prob: input.override_prob ?? null,
    reason: input.reason,
    set_by: input.set_by,
    set_at: input.set_at,
    expires_at: input.expires_at ?? null,
    active: true,
  }
  // Replacing an existing override on this selection — drop its expiry timer.
  for (const o of overrides) {
    if (o.marketId === input.marketId && o.selectionId === input.selectionId) clearTimer(o.id)
  }
  overrides = [
    ...overrides.filter(
      (o) => !(o.marketId === input.marketId && o.selectionId === input.selectionId),
    ),
    row,
  ]
  scheduleExpiry(row, input.set_at)
  save()
  return row
}

/** Clear (deactivate) the override on a selection — published price reverts to the pipeline. */
export function clearOverride(marketId: string, selectionId: string): void {
  const before = overrides.length
  for (const o of overrides) {
    if (o.marketId === marketId && o.selectionId === selectionId) clearTimer(o.id)
  }
  overrides = overrides.filter((o) => !(o.marketId === marketId && o.selectionId === selectionId))
  if (overrides.length !== before) save()
}

/** Whether an override is currently in force (active + not past its expiry at `now`). */
export function isOverrideLive(o: LineOverride, now: number): boolean {
  return o.active && (o.expires_at == null || now < o.expires_at)
}

/** The live override for a selection, or null (none / inactive / expired). */
export function liveOverrideFor(
  marketId: string,
  selectionId: string,
  now: number,
): LineOverride | null {
  const o = overrides.find((x) => x.marketId === marketId && x.selectionId === selectionId)
  return o && isOverrideLive(o, now) ? o : null
}

/** Test reset. */
export function __resetOverrides(): void {
  for (const id of [...timers.keys()]) clearTimer(id)
  overrides = []
  seq = 0
  save()
}
