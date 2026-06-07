/**
 * Operator reporting — pure analytics over a durable record feed (CLAUDE.md §2,
 * §4: honest by default). Every function here is PURE and read-only: it takes a
 * snapshot of `AnalyticsRecord`s (the manager analytics store mirrors them off the
 * app ledger, see analytics-store.ts) and rolls them into the figures a book
 * operator reads — turnover, hold, engagement — never touching the money model.
 *
 * Convention: a record's `profit` is the PLAYER's signed profit in cents (the same
 * sign core uses on the figure). The HOUSE's gross gaming revenue is therefore the
 * negative of that — players losing is the book winning. Money is integer cents.
 */

/** One durable money event: a resolved wager, or a manager bonus grant. */
export interface AnalyticsRecord {
  /** Monotonic id assigned by the store (stable ordering, dedupe). */
  seq: number
  /** Epoch ms when it resolved. */
  time: number
  /** Which player's figure moved. */
  accountId: string
  /** 'mines' | 'sportsbook' | 'bonus' | … (the resolving game, or a bonus). */
  gameKey: string
  /** Display label for the game/source. */
  game: string
  /** A real wager vs. a manager bonus grant (promo cost, not gameplay). */
  kind: 'wager' | 'bonus'
  /** Cents put at risk (0 for a bonus). */
  stake: number
  /** PLAYER's signed profit in cents (house GGR is the negative of this). */
  profit: number
  /** Return multiple: 0 loss, 1 push/void, > 1 win. */
  multiplier: number
  outcome: string
}

const DAY_MS = 86_400_000

/** Normalize −0 → 0 so a flat/empty report never shows a stray "−0". */
const z = (n: number): number => (n === 0 ? 0 : n)

/** Records whose time is in [from, to) — a half-open window so adjacent ranges
 *  never double-count the same instant. */
export function inRange(records: AnalyticsRecord[], from: number, to: number): AnalyticsRecord[] {
  return records.filter((r) => r.time >= from && r.time < to)
}

/* ------------------------------ book-wide -------------------------------- */

export interface BookActivity {
  /** Number of wagers placed (excludes bonuses). */
  bets: number
  /** Total staked (handle) in cents — wagers only. */
  turnover: number
  /** Distinct players who wagered. */
  players: number
  /** Players' net winnings in cents (signed). */
  playerNet: number
  /** House gross gaming revenue in cents (= −playerNet on wagers). */
  houseGGR: number
  /** Hold = houseGGR / turnover (0 when no turnover). */
  holdPct: number
  /** Total bonus points granted to players in cents (a house cost). */
  bonusCost: number
  /** House net after promo cost: houseGGR − bonusCost. */
  houseNet: number
}

export function bookActivity(records: AnalyticsRecord[]): BookActivity {
  let bets = 0
  let turnover = 0
  let playerNet = 0
  let bonusCost = 0
  const players = new Set<string>()
  for (const r of records) {
    if (r.kind === 'bonus') {
      bonusCost += r.profit
      continue
    }
    bets += 1
    turnover += r.stake
    playerNet += r.profit
    players.add(r.accountId)
  }
  const houseGGR = z(-playerNet)
  return {
    bets,
    turnover,
    players: players.size,
    playerNet: z(playerNet),
    houseGGR,
    holdPct: turnover > 0 ? houseGGR / turnover : 0,
    bonusCost,
    houseNet: z(houseGGR - bonusCost),
  }
}

/* ----------------------------- per game ---------------------------------- */

export interface GameHold {
  gameKey: string
  game: string
  bets: number
  turnover: number
  /** House GGR for this game (cents). */
  houseGGR: number
  /** houseGGR / turnover. */
  holdPct: number
  players: number
}

/** Per-game performance & hold across ALL players. Sorted by turnover desc. */
export function perGameHold(records: AnalyticsRecord[]): GameHold[] {
  const byGame = new Map<string, { game: string; bets: number; turnover: number; net: number; players: Set<string> }>()
  for (const r of records) {
    if (r.kind !== 'wager') continue
    let g = byGame.get(r.gameKey)
    if (!g) {
      g = { game: r.game, bets: 0, turnover: 0, net: 0, players: new Set() }
      byGame.set(r.gameKey, g)
    }
    g.bets += 1
    g.turnover += r.stake
    g.net += r.profit
    g.players.add(r.accountId)
  }
  return [...byGame.entries()]
    .map(([gameKey, g]) => ({
      gameKey,
      game: g.game,
      bets: g.bets,
      turnover: g.turnover,
      houseGGR: z(-g.net),
      holdPct: g.turnover > 0 ? z(-g.net / g.turnover) : 0,
      players: g.players.size,
    }))
    .sort((a, b) => b.turnover - a.turnover)
}

/* ---------------------------- per player --------------------------------- */

export interface PlayerActivity {
  accountId: string
  bets: number
  turnover: number
  /** Player's net in cents (signed). */
  net: number
  /** Total bonuses granted to this player (cents). */
  bonus: number
  firstActive: number
  lastActive: number
}

/** Per-player activity across the feed. Sorted by turnover desc. */
export function perPlayerActivity(records: AnalyticsRecord[]): PlayerActivity[] {
  const byPlayer = new Map<string, PlayerActivity>()
  for (const r of records) {
    let p = byPlayer.get(r.accountId)
    if (!p) {
      p = { accountId: r.accountId, bets: 0, turnover: 0, net: 0, bonus: 0, firstActive: r.time, lastActive: r.time }
      byPlayer.set(r.accountId, p)
    }
    p.firstActive = Math.min(p.firstActive, r.time)
    p.lastActive = Math.max(p.lastActive, r.time)
    if (r.kind === 'bonus') {
      p.bonus += r.profit
      continue
    }
    p.bets += 1
    p.turnover += r.stake
    p.net += r.profit
  }
  return [...byPlayer.values()].sort((a, b) => b.turnover - a.turnover)
}

/* ---------------------------- engagement --------------------------------- */

export interface Engagement {
  /** Distinct players who wagered in the current window. */
  active: number
  /** First-ever activity fell inside the current window. */
  newPlayers: number
  /** Active in the window AND had activity before it. */
  returning: number
  /** Have wagered at some point, but not in the current window. */
  dormant: number
  /** Active in the PRIOR window of equal length but NOT the current one. */
  churned: number
  /** Of players active in the prior window, the fraction also active now. */
  retentionPct: number
  windowDays: number
}

/**
 * Window-over-window engagement. The current window is the last `windowDays`
 * ending at `now`; the prior window is the equal-length span before it.
 * `now` is injected so this stays pure (and testable).
 */
export function engagement(records: AnalyticsRecord[], now: number, windowDays: number): Engagement {
  const span = windowDays * DAY_MS
  const curStart = now - span
  const priorStart = now - 2 * span

  const firstSeen = new Map<string, number>()
  const activeNow = new Set<string>()
  const activePrior = new Set<string>()
  const everActive = new Set<string>()

  for (const r of records) {
    if (r.kind !== 'wager') continue
    everActive.add(r.accountId)
    const seen = firstSeen.get(r.accountId)
    if (seen === undefined || r.time < seen) firstSeen.set(r.accountId, r.time)
    if (r.time >= curStart && r.time <= now) activeNow.add(r.accountId)
    else if (r.time >= priorStart && r.time < curStart) activePrior.add(r.accountId)
  }

  let newPlayers = 0
  let returning = 0
  for (const id of activeNow) {
    if ((firstSeen.get(id) as number) >= curStart) newPlayers += 1
    else returning += 1
  }
  let churned = 0
  let retained = 0
  for (const id of activePrior) {
    if (activeNow.has(id)) retained += 1
    else churned += 1
  }
  let dormant = 0
  for (const id of everActive) if (!activeNow.has(id)) dormant += 1

  return {
    active: activeNow.size,
    newPlayers,
    returning,
    dormant,
    churned,
    retentionPct: activePrior.size > 0 ? retained / activePrior.size : 0,
    windowDays,
  }
}

/* ------------------------------- export ---------------------------------- */

/** Serialize rows to CSV. Values are quoted/escaped; numbers/strings only. Pure —
 *  the UI hands the result to a Blob download. */
export function toCSV(rows: Record<string, string | number>[], columns?: string[]): string {
  if (rows.length === 0) return ''
  const cols = columns ?? Object.keys(rows[0])
  const esc = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = cols.map(esc).join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(',')).join('\n')
  return `${head}\n${body}`
}
