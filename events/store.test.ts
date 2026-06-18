/**
 * The competition store runs entirely on the shared `core`: a paid entry HOLDS the fee
 * (pending up, figure flat); close COLLECTS it (a 'loss' on the held wager); payout GRANTS
 * prizes (core.grant). Plus the lifecycle guards, the eligibility gate, and a real ranking
 * off settled ledger activity. Integer cents; no separate money path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getBook } from '../app/book-store.js'
import { placeWager, resolveAtMultiplier, onGrant, type Account } from '../core/index.js'
import { metricValue } from './metrics.js'
import {
  createCompetition,
  joinCompetition,
  closeCompetition,
  payCompetition,
  getCompetition,
  isEntered,
  statusOf,
  leaderboard,
  __resetCompetitions,
  type CreateCompetitionInput,
} from './store.js'
import { seedDemoCompetitions } from './seed.js'

const NOW = 1_750_000_000_000 // far from the wall clock, so real ledger times fall outside windows
const DAY = 86_400_000

function player(id = 'p-marco') {
  const m = getBook().members[id]
  if (!m) throw new Error('no seeded player ' + id)
  return m
}
function input(over: Partial<CreateCompetitionInput> = {}): CreateCompetitionInput {
  return {
    name: 'Race',
    theme: 'weekly_race',
    metric: 'wagered',
    startsAt: NOW - DAY,
    endsAt: NOW + DAY, // live at NOW
    entryFeeCents: 0,
    guaranteedCents: 100_000,
    payoutSplit: [1],
    eligibility: { kind: 'all' },
    createdBy: 'operator',
    ...over,
  }
}
const join = (id: string, account: Account, name: string, now = NOW) =>
  joinCompetition({ competitionId: id, account, playerName: name, now })

beforeEach(() => {
  __resetCompetitions()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('createCompetition', () => {
  it('creates an open competition; rejects a bad spec', () => {
    const c = createCompetition(input())
    expect(c.settlement).toBe('open')
    expect(getCompetition(c.id)).toBe(c)
    expect(() => createCompetition(input({ name: '   ' }))).toThrow(/name/)
    expect(() => createCompetition(input({ startsAt: NOW, endsAt: NOW }))).toThrow(/end after/)
    expect(() => createCompetition(input({ endsAt: Infinity }))).toThrow(/finite/) // no uncloseable event
    expect(() => createCompetition(input({ entryFeeCents: -1 }))).toThrow(/cents/)
    expect(() => createCompetition(input({ payoutSplit: [] }))).toThrow(/at least one/)
    expect(() => createCompetition(input({ payoutSplit: [0.6, 0.6] }))).toThrow(/more than/)
  })
})

describe('joinCompetition — entry holds through core', () => {
  it('a paid entry holds the fee in pending, figure unchanged', () => {
    const m = player()
    const before = m.account.balance
    const c = createCompetition(input({ entryFeeCents: 5_000 }))
    const e = join(c.id, m.account, m.name)
    expect(m.account.pending).toBe(5_000)
    expect(m.account.balance).toBe(before)
    expect(e.wager?.status).toBe('open')
    expect(isEntered(c.id, m.account.id)).toBe(true)
  })

  it('a free entry records without touching core', () => {
    const m = player()
    const before = { b: m.account.balance, p: m.account.pending }
    const e = join(createCompetition(input({ entryFeeCents: 0 })).id, m.account, m.name)
    expect(e.wager).toBeUndefined()
    expect(m.account).toMatchObject({ balance: before.b, pending: before.p })
  })

  it('refuses a double entry, entries once closed, and a fee beyond available', () => {
    const m = player()
    const c = createCompetition(input({ entryFeeCents: 1_000 }))
    join(c.id, m.account, m.name)
    expect(() => join(c.id, m.account, m.name)).toThrow(/already entered/)

    const ended = createCompetition(input({ startsAt: NOW - 3 * DAY, endsAt: NOW - DAY }))
    expect(statusOf(ended, NOW)).toBe('ended')
    expect(() => join(ended.id, m.account, m.name)).toThrow(/closed/)

    const pricey = createCompetition(input({ entryFeeCents: 999_999_999 }))
    const lena = player('p-lena')
    expect(() => join(pricey.id, lena.account, lena.name)).toThrow() // core rejects over-available
  })
})

describe('eligibility gate', () => {
  it('a downline-scoped competition only admits that agent’s roster', () => {
    // book seed: Marco + Lena sit under agent 'a-e'; Dana sits under the manager.
    const c = createCompetition(input({ eligibility: { kind: 'downline', agentId: 'a-e' } }))
    const marco = player('p-marco')
    const dana = player('p-dana')
    expect(() => join(c.id, dana.account, dana.name)).toThrow(/not eligible/)
    expect(join(c.id, marco.account, marco.name)).toBeTruthy()
  })
})

describe('lifecycle open→close→payout (money only through core)', () => {
  it('close collects the fee (loss) and payout grants the prize (grant)', () => {
    const m = player('p-tariq')
    const start = m.account.balance
    const c = createCompetition(
      input({ entryFeeCents: 5_000, guaranteedCents: 100_000, payoutSplit: [1] }),
    )
    join(c.id, m.account, m.name)
    expect(m.account.pending).toBe(5_000)

    // CLOSE — the held fee is collected through core: figure down by the fee, hold released.
    closeCompetition(c.id, NOW + 2 * DAY)
    expect(m.account.pending).toBe(0)
    expect(m.account.balance).toBe(start - 5_000)
    const closed = getCompetition(c.id)!
    expect(closed.settlement).toBe('closed')
    expect(closed.prizePoolCents).toBe(105_000) // 100k guarantee + one 5k fee

    // PAY — the sole entrant is rank 1 and wins the whole pool, granted through core.
    let granted = 0
    const off = onGrant((e) => {
      if (e.accountId === m.account.id) granted += e.cents
    })
    const payouts = payCompetition(c.id, NOW + 2 * DAY)
    off()
    expect(payouts).toHaveLength(1)
    expect(payouts[0].prizeCents).toBe(105_000)
    expect(granted).toBe(105_000) // paid via core.grant, not a side path
    expect(m.account.balance).toBe(start - 5_000 + 105_000)
    expect(getCompetition(c.id)!.settlement).toBe('paid')
  })

  it('distributes to multiple ranks (name tiebreak when activity is equal)', () => {
    const lena = player('p-lena')
    const marco = player('p-marco')
    const lb = lena.account.balance
    const mb = marco.account.balance
    const c = createCompetition(
      input({ entryFeeCents: 1_000, guaranteedCents: 98_000, payoutSplit: [0.7, 0.3] }),
    )
    join(c.id, lena.account, lena.name)
    join(c.id, marco.account, marco.name)
    closeCompetition(c.id, NOW + 2 * DAY)
    const payouts = payCompetition(c.id, NOW + 2 * DAY)
    const byName = Object.fromEntries(payouts.map((p) => [p.name, p.prizeCents]))
    // pool = 98,000 + 2×1,000 = 100,000 → Lena (name-first on the 0-0 tie) 70%, Marco 30%
    expect(byName['Lena']).toBe(70_000)
    expect(byName['Marco']).toBe(30_000)
    expect(lena.account.balance).toBe(lb - 1_000 + 70_000)
    expect(marco.account.balance).toBe(mb - 1_000 + 30_000)
  })

  it('refuses to close before the window ends (no early settle of a live/upcoming event)', () => {
    const live = createCompetition(input({ startsAt: NOW - DAY, endsAt: NOW + DAY }))
    expect(() => closeCompetition(live.id, NOW)).toThrow(/still live/)
    const upcoming = createCompetition(input({ startsAt: NOW + DAY, endsAt: NOW + 2 * DAY }))
    expect(() => closeCompetition(upcoming.id, NOW)).toThrow(/still live/)
  })

  it('freezes the winner list at close; payout grants exactly the frozen amount', () => {
    const m = player('p-tariq')
    const start = m.account.balance
    const c = createCompetition(
      input({ entryFeeCents: 0, guaranteedCents: 100_000, payoutSplit: [1] }),
    )
    join(c.id, m.account, m.name)
    closeCompetition(c.id, NOW + 2 * DAY)
    const frozen = getCompetition(c.id)!.payouts!
    expect(frozen).toHaveLength(1)
    expect(frozen[0]).toMatchObject({ accountId: m.account.id, rank: 1, prizeCents: 100_000 })
    const paid = payCompetition(c.id, NOW + 2 * DAY)
    expect(paid).toEqual(frozen) // grants the frozen snapshot verbatim — no re-derivation
    expect(m.account.balance).toBe(start + 100_000)
  })

  it('guards the lifecycle order', () => {
    const after = NOW + 2 * DAY
    const c = createCompetition(input())
    expect(() => payCompetition(c.id, after)).toThrow(/closed before payout/)
    closeCompetition(c.id, after)
    expect(() => closeCompetition(c.id, after)).toThrow(/already closed/)
    payCompetition(c.id, after)
    expect(() => payCompetition(c.id, after)).toThrow(/closed before payout/)
  })
})

describe('demo competitions are display-only', () => {
  it('refuse join / close / pay and move no money (no grants, figures unchanged)', () => {
    let grants = 0
    const off = onGrant(() => grants++)
    seedDemoCompetitions(NOW)
    const m = player()
    const before = { b: m.account.balance, p: m.account.pending }
    expect(() => join('demo-weekly-race', m.account, m.name)).toThrow(/sample/i)
    expect(() => closeCompetition('demo-weekly-race', NOW)).toThrow(/display-only/i)
    expect(() => payCompetition('demo-finished-monthly', NOW)).toThrow(/display-only/i)
    off()
    expect(grants).toBe(0) // nothing was granted
    expect(m.account).toMatchObject({ balance: before.b, pending: before.p })
  })
})

describe('entry-fee holds never score (no leak into betting metrics)', () => {
  it('a collected entry fee is excluded from a player metric — only real bets count', () => {
    const m = player('p-priya')
    const start = Date.now()
    // a real winning bet
    const real = placeWager(m.account, 1_000)
    resolveAtMultiplier(m.account, real, 3) // win → +2,000
    // join a paid competition + close it → the 5,000 fee is collected through core, tagged as
    // a competition entry (window 1000–2000 is already over so it's immediately closeable)
    const c = createCompetition(input({ entryFeeCents: 5_000, startsAt: 1_000, endsAt: 2_000 }))
    join(c.id, m.account, m.name, 1_500)
    closeCompetition(c.id, 3_000)
    const end = Date.now() + DAY
    expect(metricValue('wagered', m.account.id, start, end)).toBe(1_000) // the 5,000 fee excluded
    expect(metricValue('net_profit', m.account.id, start, end)).toBe(2_000) // the −5,000 fee excluded
  })

  it('closing a paid competition does not leak its entry fee into an overlapping live one', () => {
    const m = player('p-dana')
    const t0 = Date.now()
    const liveB = createCompetition(
      input({ metric: 'net_profit', startsAt: t0 - DAY, endsAt: t0 + DAY }),
    )
    // a paid event whose tiny window is already over (closeable), entered by the same player
    const paidA = createCompetition(input({ entryFeeCents: 5_000, startsAt: 1_000, endsAt: 2_000 }))
    join(liveB.id, m.account, m.name, t0)
    join(paidA.id, m.account, m.name, 1_500)
    const before = leaderboard(liveB, Date.now()).find((s) => s.accountId === m.account.id)!.value
    closeCompetition(paidA.id, 3_000) // collects the 5,000 fee through core at wall-clock now
    const after = leaderboard(liveB, Date.now()).find((s) => s.accountId === m.account.id)!.value
    expect(after).toBe(before) // the entry-fee 'loss' did NOT pollute B's net_profit
  })
})

describe('standings rank off real settled activity', () => {
  it('a net_profit board ranks the bigger winner first', () => {
    const priya = player('p-priya')
    const dana = player('p-dana')
    const t0 = Date.now() // window from here excludes any earlier test residue

    const w1 = placeWager(priya.account, 1_000)
    resolveAtMultiplier(priya.account, w1, 4) // +3,000
    const w2 = placeWager(dana.account, 2_000)
    resolveAtMultiplier(dana.account, w2, 0) // −2,000

    const c = createCompetition(
      input({ metric: 'net_profit', startsAt: t0, endsAt: Date.now() + DAY }),
    )
    join(c.id, priya.account, priya.name, Date.now())
    join(c.id, dana.account, dana.name, Date.now())

    const board = leaderboard(c, Date.now())
    expect(board[0].accountId).toBe(priya.account.id) // +3,000 net beats −2,000
    expect(board[1].accountId).toBe(dana.account.id)
  })
})
