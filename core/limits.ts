/**
 * Responsible-play self-limits — the player-owned betting guardrails (Expert addition #1).
 *
 * A player may set, for their own account:
 *   - a WAGER cap   — the most they may stake in a period (day/week),
 *   - a LOSS cap    — the most their net loss may reach in a period,
 *   - a COOL-OFF    — a self-exclusion window during which NO wager is accepted,
 *   - a SESSION reminder — a soft time-on-platform nudge (UI only; never a gate).
 *
 * ENFORCEMENT mirrors the economy-mode floor pattern (economy.ts): this module holds only
 * POLICY as plain module state — no store, no persistence/clock import beyond an injectable
 * seam — and `placeWager` consults `assertWithinLimits` exactly as it consults the economy
 * floor. The app layer owns the persisted `player_limits` rows and pushes them in via
 * `setPlayerLimit`, and wires the period-to-date usage reader to the durable ledger.
 *
 * RESPONSIBLE-PLAY DIRECTION (the standard pattern): a player may always TIGHTEN a limit
 * immediately (lower a cap, start/extend a cool-off). LOOSENING — raising a cap, removing
 * one, or shortening a cool-off — only takes effect after a fixed delay, so a limit can't be
 * bypassed in the heat of the moment.
 *
 * OFF-BY-DEFAULT INVARIANT: a player with no limits set is not tracked at all —
 * `assertWithinLimits` returns immediately, so placement is byte-for-byte identical to today.
 * No money moves here; this is purely a GATE that accepts or rejects.
 */

export type LimitKind = 'wager' | 'loss' | 'session' | 'cooloff'
export type LimitPeriod = 'day' | 'week'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
/** Jan 1 1970 was a Thursday; Jan 5 1970 was the first Monday (= 4 days in). Anchoring the
 *  week grid there aligns every weekly bucket to Monday 00:00 UTC — a sensible reset boundary. */
const WEEK_ANCHOR_MS = 4 * DAY_MS

/** How long a LOOSENING change waits before it takes effect (the standard 24-hour cool-down). */
export const LOOSEN_DELAY_MS = DAY_MS

/** The numeric magnitude of a limit, kept generic so one shape covers every kind:
 *   - wager / loss : `amountCents` is the cap in integer cents; `until` is null.
 *   - cooloff      : `until` is the epoch-ms the exclusion runs to; `amountCents` is null.
 *   - session      : `amountCents` is the reminder interval in MINUTES (not cents); soft only. */
export interface LimitInput {
  kind: LimitKind
  period?: LimitPeriod | null
  amountCents?: number | null
  until?: number | null
}

/** A stored limit: the input plus when it was set and when it becomes effective. */
export interface ActiveLimit extends LimitInput {
  setAt: number
  effectiveAt: number
}

/** Per-kind slot: the limit in force, plus an optional pending LOOSENING not yet effective. */
interface KindSlot {
  active: ActiveLimit
  pending: ActiveLimit | null
}

type PlayerSlots = Map<LimitKind, KindSlot>

const byPlayer = new Map<string, PlayerSlots>()

/* ------------------------------- injectable seams -------------------------- */

/** Period-to-date usage for a player, summed over the durable ledger by the app layer. */
export interface LimitUsage {
  /** Total staked (turnover) in the period, integer cents. */
  wageredCents: number
  /** Net loss in the period (losses − wins), integer cents; negative when net ahead. */
  netLossCents: number
}

export type LimitUsageReader = (playerId: string, sinceMs: number) => LimitUsage

const ZERO_USAGE: LimitUsage = { wageredCents: 0, netLossCents: 0 }
let usageReader: LimitUsageReader = () => ZERO_USAGE

/**
 * Wire the period-to-date usage source (the app points this at the durable book ledger).
 * Off-by-default: with no reader set, usage reads zero, so only a stake that ALONE exceeds a
 * cap (or an active cool-off) can reject — never a phantom rejection from imagined history.
 */
export function setLimitUsageReader(reader: LimitUsageReader): void {
  usageReader = reader
}

let clock: () => number = () => Date.now()
/** Inject the clock (tests pin it; cool-off + period math + the loosen delay all read it). */
export function setLimitsClock(fn: () => number): void {
  clock = fn
}

/* ------------------------------- period math ------------------------------- */

/** The epoch-ms start of the period containing `now` — a day (UTC midnight) or a
 *  Monday-aligned week. Exported so the app's ledger usage reader buckets identically. */
export function periodStartMs(period: LimitPeriod, now: number): number {
  if (period === 'week') {
    return Math.floor((now - WEEK_ANCHOR_MS) / WEEK_MS) * WEEK_MS + WEEK_ANCHOR_MS
  }
  return Math.floor(now / DAY_MS) * DAY_MS
}

/* ------------------------------- strictness -------------------------------- */

/**
 * How restrictive a limit is, as a scalar (higher = stricter), so set() can tell a TIGHTEN
 * from a LOOSEN. A missing cap / no cool-off is the least restrictive (−∞).
 *   - wager / loss : a LOWER cap is stricter → −amountCents.
 *   - cooloff      : a LATER expiry is stricter → until.
 *   - session      : a SHORTER reminder is stricter → −minutes (soft, but kept consistent).
 */
function restrictiveness(l: LimitInput): number {
  if (l.kind === 'cooloff') return l.until == null ? -Infinity : l.until
  return l.amountCents == null ? -Infinity : -l.amountCents
}

/* ------------------------------- promotion --------------------------------- */

/** Promote a due pending loosening into the active slot (lazy, on read), using the clock. */
function promote(slot: KindSlot, now: number): KindSlot {
  if (slot.pending && slot.pending.effectiveAt <= now) {
    return { active: slot.pending, pending: null }
  }
  return slot
}

/* --------------------------------- the API --------------------------------- */

/**
 * Set (or change) one of a player's limits. TIGHTENING applies immediately; LOOSENING is
 * scheduled `LOOSEN_DELAY_MS` out (and, for a cool-off, never before the current exclusion
 * would have ended). Returns the resulting effective limit + whether the change was deferred.
 */
export function setPlayerLimit(
  playerId: string,
  input: LimitInput,
): { effective: ActiveLimit; deferred: boolean } {
  const now = clock()
  let slots = byPlayer.get(playerId)
  if (!slots) {
    slots = new Map()
    byPlayer.set(playerId, slots)
  }

  const existing = slots.get(input.kind)
  const candidate: ActiveLimit = { ...input, setAt: now, effectiveAt: now }

  // First time this kind is set → effective now (tightening from "unlimited").
  if (!existing) {
    slots.set(input.kind, { active: candidate, pending: null })
    return { effective: candidate, deferred: false }
  }

  const current = promote(existing, now)
  // A session reminder is a SOFT nudge, never a placement gate, so the "can't loosen in the
  // heat of the moment" rule doesn't apply — its changes (including turning it off) are
  // immediate. The protective caps + cool-off keep the tighten-now / loosen-later discipline.
  const tighten =
    input.kind === 'session' || restrictiveness(input) >= restrictiveness(current.active)
  if (tighten) {
    // A tighten supersedes any queued loosening.
    slots.set(input.kind, { active: candidate, pending: null })
    return { effective: candidate, deferred: false }
  }

  // Loosening: hold the current (stricter) limit; queue the change for later.
  let effectiveAt = now + LOOSEN_DELAY_MS
  if (input.kind === 'cooloff' && current.active.until != null) {
    effectiveAt = Math.max(effectiveAt, current.active.until) // can't end an exclusion early
  }
  const pending: ActiveLimit = { ...input, setAt: now, effectiveAt }
  slots.set(input.kind, { active: current.active, pending })
  return { effective: current.active, deferred: true }
}

/**
 * Restore a persisted per-kind slot VERBATIM (the app store calls this at boot to rehydrate
 * core from `player_limits`, without re-deriving the tighten/loosen decision — the stored
 * `effectiveAt` already encodes it; a pending whose time has passed promotes lazily on read).
 */
export function installPlayerLimit(
  playerId: string,
  kind: LimitKind,
  slot: { active: ActiveLimit; pending: ActiveLimit | null },
): void {
  let slots = byPlayer.get(playerId)
  if (!slots) {
    slots = new Map()
    byPlayer.set(playerId, slots)
  }
  slots.set(kind, { active: slot.active, pending: slot.pending })
}

/** Remove a limit of `kind` — a LOOSENING, so it takes effect only after the delay. */
export function clearPlayerLimit(playerId: string, kind: LimitKind): { deferred: boolean } {
  const slots = byPlayer.get(playerId)
  if (!slots || !slots.has(kind)) return { deferred: false }
  const cleared: LimitInput =
    kind === 'cooloff'
      ? { kind, until: null }
      : { kind, period: slots.get(kind)!.active.period, amountCents: null }
  const { deferred } = setPlayerLimit(playerId, cleared)
  // A cleared (null) limit that is effective NOW carries no constraint — drop the slot so the
  // player returns to untracked (preserving the off-by-default fast path).
  const slot = slots.get(kind)
  if (slot && restrictiveness(slot.active) === -Infinity && !slot.pending) slots.delete(kind)
  if (slots.size === 0) byPlayer.delete(playerId)
  return { deferred }
}

/** The limits currently in force for a player (due pendings promoted), keyed by kind. */
export function getEffectiveLimits(playerId: string): Partial<Record<LimitKind, ActiveLimit>> {
  const slots = byPlayer.get(playerId)
  if (!slots) return {}
  const now = clock()
  const out: Partial<Record<LimitKind, ActiveLimit>> = {}
  for (const [kind, slot] of slots) {
    const promoted = promote(slot, now)
    if (promoted !== slot) slots.set(kind, promoted) // memoise the promotion
    if (restrictiveness(promoted.active) !== -Infinity) out[kind] = promoted.active
  }
  return out
}

/** Full per-kind state incl. any queued (not-yet-effective) loosening — for the UI to show
 *  "a looser limit takes effect on …". A read; never mutates. */
export function getPlayerLimitState(
  playerId: string,
): Partial<Record<LimitKind, { active: ActiveLimit; pending: ActiveLimit | null }>> {
  const slots = byPlayer.get(playerId)
  if (!slots) return {}
  const now = clock()
  const out: Partial<Record<LimitKind, { active: ActiveLimit; pending: ActiveLimit | null }>> = {}
  for (const [kind, slot] of slots) out[kind] = promote(slot, now)
  return out
}

/** Whether a player has any limits configured (for the off-by-default fast path + UI). */
export function hasLimits(playerId: string): boolean {
  return byPlayer.has(playerId)
}

/**
 * THE GATE. Throws a player-facing error (games/sportsbook show it verbatim — no raw cents)
 * if `stake` would breach an active wager/loss cap, or any wager is attempted during a
 * cool-off. A no-op for an unlimited player, so default placement is unchanged.
 *
 * Period-to-date usage comes from the durable ledger (RESOLVED turnover/result) PLUS the
 * account's live `pending` — every credit currently at risk in an ungraded bet. Counting
 * `pending` closes the evasion where many simultaneous open bets, none yet graded, would each
 * see zero resolved usage; it also errs safe (an open position's worst case is a full loss).
 * No double-count: a stake is in `pending` until it grades, then in the resolved ledger.
 */
export function assertWithinLimits(account: { id: string; pending: number }, stake: number): void {
  const slots = byPlayer.get(account.id)
  if (!slots) return // off-by-default fast path: untracked player, zero overhead
  const now = clock()
  const eff = getEffectiveLimits(account.id)

  if (eff.cooloff && eff.cooloff.until != null && now < eff.cooloff.until) {
    throw new Error('a cool-off is active on this account')
  }
  if (eff.wager && eff.wager.amountCents != null) {
    const since = periodStartMs(eff.wager.period ?? 'day', now)
    const { wageredCents } = usageReader(account.id, since)
    if (wageredCents + account.pending + stake > eff.wager.amountCents) {
      throw new Error('this wager would exceed your wager limit')
    }
  }
  if (eff.loss && eff.loss.amountCents != null) {
    const since = periodStartMs(eff.loss.period ?? 'day', now)
    const { netLossCents } = usageReader(account.id, since)
    // Worst case every open stake + the new one loses, so gate on net-loss + pending + stake.
    if (netLossCents + account.pending + stake > eff.loss.amountCents) {
      throw new Error('this wager would exceed your loss limit')
    }
  }
}

/** Test/boot helper: clear every player's limits + reset the injected seams to defaults. */
export function __resetLimits(): void {
  byPlayer.clear()
  usageReader = () => ZERO_USAGE
  clock = () => Date.now()
}
