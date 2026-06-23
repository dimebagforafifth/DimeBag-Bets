/**
 * Operator analytics suite — the figures DK/Flutter watch, in credits: hold % by
 * sport, parlay/SGP penetration, figure (house net) trend over time, cohort
 * retention, and credits-wagered-per-active-member. Pure + structural inputs over
 * the durable analytics feed + sportsbook bets; complements manager/reporting
 * (bookActivity/perGameHold/engagement) with the breakdowns those don't cover.
 * Read-only; integer cents.
 */

const DAY = 86_400_000
const z = (n: number): number => (n === 0 ? 0 : n)

/** A resolved money event — structurally manager/reporting's AnalyticsRecord. */
export interface AnRecord {
  time: number
  accountId: string
  gameKey: string
  game: string
  kind: 'wager' | 'bonus'
  stake: number
  profit: number // player's signed profit (house GGR = −profit)
  multiplier: number
  outcome: string
}

/** A settled/open sportsbook bet reduced to what the breakdowns need (adapted in
 *  crm/data.ts from BookBet + its legs). */
export interface AnBet {
  accountId: string
  mode: 'single' | 'parlay'
  sgp: boolean
  legs: number
  sports: string[] // distinct sports across legs (e.g. ['BASKETBALL'])
  leagues: string[] // distinct leagues across legs
  stakeCents: number
  status: 'open' | 'won' | 'lost' | 'push' | 'void' | 'cashed'
  returnCents?: number
  cashedOutCents?: number
}

/* ------------------------------ hold by sport ----------------------------- */

export interface SportHold {
  sport: string
  bets: number
  turnover: number
  houseGGR: number
  holdPct: number
}

/** House GGR on a settled bet = stake kept − value returned to the player. */
function houseGgrOf(b: AnBet): number {
  if (b.status === 'open') return 0
  const returned =
    b.status === 'cashed' ? (b.cashedOutCents ?? b.returnCents ?? 0) : (b.returnCents ?? 0)
  return b.stakeCents - returned
}

/** A bet's sport bucket: its single sport, or 'multi-sport' for a cross-sport parlay. */
function sportBucket(b: AnBet): string {
  if (b.sports.length === 0) return 'unknown'
  if (b.sports.length === 1) return b.sports[0]
  return 'multi-sport'
}

/** Hold % by sport across settled sportsbook bets, turnover desc. */
export function holdBySport(bets: AnBet[]): SportHold[] {
  const by = new Map<string, { bets: number; turnover: number; ggr: number }>()
  for (const b of bets) {
    if (b.status === 'open') continue
    const s = sportBucket(b)
    const e = by.get(s) ?? { bets: 0, turnover: 0, ggr: 0 }
    e.bets += 1
    e.turnover += b.stakeCents
    e.ggr += houseGgrOf(b)
    by.set(s, e)
  }
  return [...by.entries()]
    .map(([sport, e]) => ({
      sport,
      bets: e.bets,
      turnover: e.turnover,
      houseGGR: z(e.ggr),
      holdPct: e.turnover ? z(e.ggr / e.turnover) : 0,
    }))
    .sort((a, b) => b.turnover - a.turnover)
}

/* --------------------------- parlay / SGP mix ----------------------------- */

export interface ParlayMix {
  totalBets: number
  singles: number
  parlays: number
  sgp: number
  /** parlays / totalBets. */
  parlayPct: number
  /** SGP / totalBets — the SGP-penetration figure DK reports. */
  sgpPct: number
  /** parlay turnover / total turnover (parlays skew bigger). */
  parlayTurnoverPct: number
  avgParlayLegs: number
}

/** Parlay & same-game-parlay penetration across ALL sportsbook bets. */
export function parlayMix(bets: AnBet[]): ParlayMix {
  let singles = 0
  let parlays = 0
  let sgp = 0
  let turnover = 0
  let parlayTurnover = 0
  let parlayLegs = 0
  for (const b of bets) {
    turnover += b.stakeCents
    if (b.mode === 'parlay') {
      parlays += 1
      parlayTurnover += b.stakeCents
      parlayLegs += b.legs
      if (b.sgp) sgp += 1
    } else singles += 1
  }
  const total = bets.length
  return {
    totalBets: total,
    singles,
    parlays,
    sgp,
    parlayPct: total ? parlays / total : 0,
    sgpPct: total ? sgp / total : 0,
    parlayTurnoverPct: turnover ? parlayTurnover / turnover : 0,
    avgParlayLegs: parlays ? parlayLegs / parlays : 0,
  }
}

/* ------------------------------ figure trend ------------------------------ */

export interface TrendPoint {
  /** UTC day start (epoch ms) for this bucket. */
  dayStart: number
  /** House GGR that day (− player net), wagers only. */
  houseGGR: number
  /** Bonus cost that day. */
  bonusCost: number
  /** Running house net (cumulative GGR − bonus) up to and including this day. */
  cumulativeNet: number
}

/** Daily house-net trend over the last `days`, oldest→newest, gap-filled so a flat
 *  day still plots. */
export function figureTrend(records: AnRecord[], now: number, days: number): TrendPoint[] {
  const startDay = Math.floor((now - (days - 1) * DAY) / DAY)
  const ggr = new Array(days).fill(0)
  const bonus = new Array(days).fill(0)
  for (const r of records) {
    const d = Math.floor(r.time / DAY) - startDay
    if (d < 0 || d >= days) continue
    if (r.kind === 'bonus') bonus[d] += r.profit
    else ggr[d] += -r.profit
  }
  const out: TrendPoint[] = []
  let cum = 0
  for (let i = 0; i < days; i++) {
    cum += ggr[i] - bonus[i]
    out.push({
      dayStart: (startDay + i) * DAY,
      houseGGR: z(ggr[i]),
      bonusCost: z(bonus[i]),
      cumulativeNet: z(cum),
    })
  }
  return out
}

/* ---------------------------- cohort retention ---------------------------- */

export interface CohortRow {
  /** Cohort start (epoch ms, week-aligned to signup). */
  cohortStart: number
  label: string
  size: number
  /** retention[k] = fraction of the cohort active in the k-th period after signup. */
  retention: number[]
}

export interface SignupRef {
  id: string
  signupAt: number
}

/**
 * Weekly cohort retention. Players are bucketed by signup week; retention[k] is the
 * share active (≥1 wager) during the k-th `periodDays` window after their cohort
 * start. Reports every period the cohort has ENTERED — `floor((now−start)/period)+1`,
 * capped at `periods` — so the current, in-progress period is included and accumulates
 * live (it can legitimately read low/0% early in the window, by design, then climb as
 * the week fills). Future periods the cohort hasn't reached yet are never reported.
 */
export function cohortRetention(
  signups: SignupRef[],
  records: AnRecord[],
  now: number,
  opts: { periodDays?: number; periods?: number } = {},
): CohortRow[] {
  const period = (opts.periodDays ?? 7) * DAY
  const maxPeriods = opts.periods ?? 4

  // first wager time per player
  const firstWager = new Map<string, number>()
  const active: { id: string; time: number }[] = []
  for (const r of records) {
    if (r.kind !== 'wager') continue
    active.push({ id: r.accountId, time: r.time })
    const f = firstWager.get(r.accountId)
    if (f === undefined || r.time < f) firstWager.set(r.accountId, r.time)
  }

  // bucket players by signup week
  const cohorts = new Map<number, string[]>()
  for (const s of signups) {
    const cohortStart = Math.floor(s.signupAt / period) * period
    const list = cohorts.get(cohortStart) ?? []
    list.push(s.id)
    cohorts.set(cohortStart, list)
  }

  const activeByPlayer = new Map<string, number[]>()
  for (const a of active) {
    const list = activeByPlayer.get(a.id) ?? []
    list.push(a.time)
    activeByPlayer.set(a.id, list)
  }

  const rows: CohortRow[] = []
  for (const [cohortStart, members] of [...cohorts.entries()].sort((a, b) => a[0] - b[0])) {
    const elapsedPeriods = Math.min(maxPeriods, Math.floor((now - cohortStart) / period) + 1)
    if (elapsedPeriods <= 0) continue
    const retention: number[] = []
    for (let k = 0; k < elapsedPeriods; k++) {
      const from = cohortStart + k * period
      const to = from + period
      let activeCount = 0
      for (const id of members) {
        const times = activeByPlayer.get(id) ?? []
        if (times.some((t) => t >= from && t < to)) activeCount += 1
      }
      retention.push(members.length ? activeCount / members.length : 0)
    }
    rows.push({ cohortStart, label: weekLabel(cohortStart), size: members.length, retention })
  }
  return rows
}

function weekLabel(ms: number): string {
  const d = new Date(ms)
  const mon = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return `${mon}/${day}`
}

/* ------------------------- per active member ------------------------------ */

export interface PerActiveMember {
  activeMembers: number
  turnover: number
  /** credits wagered per active member (cents). */
  perMemberCents: number
  betsPerMember: number
}

/** Credits wagered per active member over the last `windowDays`. */
export function perActiveMember(
  records: AnRecord[],
  now: number,
  windowDays: number,
): PerActiveMember {
  const from = now - windowDays * DAY
  const players = new Set<string>()
  let turnover = 0
  let bets = 0
  for (const r of records) {
    if (r.kind !== 'wager' || r.time < from || r.time > now) continue
    players.add(r.accountId)
    turnover += r.stake
    bets += 1
  }
  const n = players.size
  return {
    activeMembers: n,
    turnover,
    perMemberCents: n ? Math.round(turnover / n) : 0,
    betsPerMember: n ? bets / n : 0,
  }
}

/* ------------------------------ net margin -------------------------------- */

/** House net margin = (GGR − bonus cost) / turnover, over the given records. */
export function netMarginPct(records: AnRecord[]): number {
  let turnover = 0
  let playerNet = 0
  let bonus = 0
  for (const r of records) {
    if (r.kind === 'bonus') bonus += r.profit
    else {
      turnover += r.stake
      playerNet += r.profit
    }
  }
  if (turnover === 0) return 0
  return z((-playerNet - bonus) / turnover)
}
