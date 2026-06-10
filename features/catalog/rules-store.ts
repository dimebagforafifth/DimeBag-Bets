/**
 * rules-store — the book-level TRADING & GRADING rules singleton (Catalog ▸ Rules).
 *
 * This is the operator's default rulebook for how the sportsbook prices markets and
 * grades bets, modeled on CLAUDE.md §4 (house rules) and §3 (the money contract —
 * every value here is a DEFAULT that the place→grade→adjust flow and per-player
 * Limits read from; this store moves NO money and tracks NO points itself).
 *
 * Scope is trading/grading ONLY. Tenant Settings (branding, presentation, cadence)
 * live in control/ + app/settings-store.ts and are a different lane — do not fold
 * those knobs in here.
 *
 * Shape mirrors the other console stores (a module-level singleton + subscribe /
 * getVersion snapshot consumed by React via useSyncExternalStore), but deliberately
 * minimal: today the rules live in-memory only.
 *
 *   // SEAM: persist rules to Supabase / the settings-store later; today they live
 *   //       in-memory in this module (no persistence, resets on reload).
 *
 * COINS ONLY. All amount fields are integer CENTS (1/100 of a coin), matching the
 * money-in-cents convention (games/shared/money.ts) so they compose with core limits
 * without rounding. Percentages are stored as plain percent numbers (e.g. 4.5 = 4.5%).
 */

/** The trading + grading rulebook (book-level defaults). All *Cents fields are
 *  integer cents; *Pct fields are percent numbers; counts/minutes are whole units. */
export interface RulesConfig {
  /* --- 1) Grading rules (CLAUDE.md §4) --- */
  /** Void bets (return stake) when a game never becomes official. */
  voidNonOfficial: boolean
  /** An exact tie on a spread/total returns the stake (no win/loss). */
  pushReturnsStake: boolean

  /* --- 2) Market & limit defaults --- */
  /** Default market margin / vig, as a percent number (e.g. 4.5 = 4.5%). */
  defaultMarginPct: number
  /** Default max bet per ticket, in cents. */
  defaultMaxBetCents: number
  /** Default per-market exposure limit, in cents. */
  defaultMarketLimitCents: number
  /** Maximum number of legs allowed in a parlay. */
  maxParlayLegs: number
  /** Hard cap on a parlay's payout multiplier (e.g. 299 = 299×, CLAUDE.md §4). */
  maxParlayPayoutX: number

  /* --- 3) Responsible-play parameters (book-level defaults) --- */
  /** Default daily loss limit granted to a new player, in cents. */
  dailyLossLimitCents: number
  /** Session-time reminder interval, in minutes. */
  sessionReminderMins: number
  /** Whether the cool-off (self-exclusion) flow is offered. */
  coolOffEnabled: boolean
}

/**
 * Ship defaults — a 4.5% margin, a 1,000-coin max bet, a 5,000-coin per-market line,
 * 8-leg parlays capped at 299×, and a 500-coin daily loss limit with a 30-minute
 * session reminder. Tuned to read as sensible out of the box (CLAUDE.md §4).
 */
const DEFAULTS: RulesConfig = {
  voidNonOfficial: true,
  pushReturnsStake: true,
  defaultMarginPct: 4.5,
  defaultMaxBetCents: 100_000, // 1,000 coins
  defaultMarketLimitCents: 500_000, // 5,000 coins
  maxParlayLegs: 8,
  maxParlayPayoutX: 299,
  dailyLossLimitCents: 50_000, // 500 coins
  sessionReminderMins: 30,
  coolOffEnabled: true,
}

// The one live config object (stable reference; replaced wholesale on update so
// React's useSyncExternalStore sees a new version each change).
let config: RulesConfig = { ...DEFAULTS }
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  for (const l of listeners) l()
}

/* --------------------------------- the API -------------------------------- */

/** The live rules config (stable reference between updates). */
export function getRules(): RulesConfig {
  return config
}

/** The ship defaults (read-only reference for "reset to defaults"). */
export function getRulesDefaults(): RulesConfig {
  return DEFAULTS
}

/** Monotonic version, bumped on every update (the useSyncExternalStore snapshot). */
export function getRulesVersion(): number {
  return version
}

/** Subscribe to rules changes; returns an unsubscribe. */
export function subscribeRules(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Merge a partial change over the current rules, then notify.
 *  // SEAM: persist to Supabase / settings-store here later. */
export function updateRules(patch: Partial<RulesConfig>): void {
  config = { ...config, ...patch }
  notify()
}

/** Restore all rules to the ship defaults. */
export function resetRules(): void {
  config = { ...DEFAULTS }
  notify()
}
