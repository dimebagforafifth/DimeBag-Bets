import { describe, it, expect } from 'vitest'
import { detectAbuse, flagsForPlayer } from './abuse.js'
import type {
  AbuseCluster,
  AbuseFlag,
  BehaviorFeatures,
  PlayerSignals,
  SessionStamp,
} from './types.js'

/* --------------------------- hand-crafted builders ------------------------- */

function session(at: number, deviceId = 'dev', ipHash = 'ip', durationMin = 30): SessionStamp {
  return { at, deviceId, ipHash, durationMin }
}

function signals(over: Partial<PlayerSignals> & { playerId: string }): PlayerSignals {
  return {
    signupAt: 0,
    deviceIds: [],
    ipHashes: [],
    sessions: [],
    ...over,
  }
}

function signalMap(...list: PlayerSignals[]): Map<string, PlayerSignals> {
  return new Map(list.map((s) => [s.playerId, s]))
}

/** A neutral behaviour row that triggers NONE of the leaderboard-gaming rule. */
function behavior(over: Partial<BehaviorFeatures> & { playerId: string }): BehaviorFeatures {
  return {
    name: over.playerId,
    bets: 0,
    turnoverCents: 0,
    netCents: 0,
    avgStakeCents: 0,
    medianStakeCents: 0,
    stakeTier: 'low',
    topGameKey: '',
    topGameName: '',
    topGameShare: 0,
    casinoShare: 0,
    sportsbookShare: 0,
    productLean: 'mixed',
    parlayShare: 0,
    sgpShare: 0,
    signupAt: 0,
    daysSinceSignup: 0,
    firstActive: 0,
    lastActive: 0,
    recencyDays: 0,
    activeDays: 0,
    betsPerActiveDay: 0,
    topUps: 0,
    sessions: 0,
    avgSessionMin: 0,
    winRate: 0,
    churnRisk: 0,
    ...over,
  }
}

const MIN = 60_000

/* helpers to pull a single cluster/flag */
function clustersOfKind(cs: AbuseCluster[], kind: AbuseCluster['kind']): AbuseCluster[] {
  return cs.filter((c) => c.kind === kind)
}
function flagsOfKind(fs: AbuseFlag[], kind: AbuseFlag['kind']): AbuseFlag[] {
  return fs.filter((f) => f.kind === kind)
}

/* ============================ shared device =============================== */

describe('shared device → multi-account', () => {
  it('two players on one device form a shared-device cluster + multi-account flags on both', () => {
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['devX'] }),
      signals({ playerId: 'B', deviceIds: ['devX'] }),
    )
    const { clusters, flags } = detectAbuse(map, [])

    const device = clustersOfKind(clusters, 'shared-device')
    expect(device).toHaveLength(1)
    // members are sorted
    expect(device[0].playerIds).toEqual(['A', 'B'])
    expect(device[0].sharedKeys).toEqual(['devX'])
    expect(device[0].severity).toBe('medium') // exactly 2 members → sev(2)
    expect(device[0].evidence).toBe('2 accounts on the same device.')
    expect(device[0].id).toBe('cl_shared-device_0')

    const multi = flagsOfKind(flags, 'multi-account')
    expect(multi).toHaveLength(2)
    const a = multi.find((f) => f.playerId === 'A')!
    const b = multi.find((f) => f.playerId === 'B')!
    expect(a.relatedPlayerIds).toEqual(['B'])
    expect(b.relatedPlayerIds).toEqual(['A'])
    expect(a.severity).toBe('medium')
    expect(a.detail).toBe('Shares a device with 1 other account(s).')

    // no IP cluster gets reported (no ipHashes given)
    expect(clustersOfKind(clusters, 'shared-ip')).toHaveLength(0)
  })

  it('does not flag a lone account with a unique device', () => {
    const map = signalMap(
      signals({ playerId: 'solo', deviceIds: ['devSolo'] }),
      signals({ playerId: 'other', deviceIds: ['devOther'] }),
    )
    const { clusters, flags } = detectAbuse(map, [])
    expect(clusters).toHaveLength(0)
    expect(flags).toHaveLength(0)
  })
})

/* =========================== union-find transitivity ====================== */

describe('union-find transitivity', () => {
  it('A-B share dev1 and B-C share dev2 → ONE cluster of {A,B,C}', () => {
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['dev1'] }),
      signals({ playerId: 'B', deviceIds: ['dev1', 'dev2'] }),
      signals({ playerId: 'C', deviceIds: ['dev2'] }),
    )
    const { clusters, flags } = detectAbuse(map, [])

    const device = clustersOfKind(clusters, 'shared-device')
    expect(device).toHaveLength(1)
    expect(device[0].playerIds).toEqual(['A', 'B', 'C'])
    // both devices linked members within the group
    expect([...device[0].sharedKeys].sort()).toEqual(['dev1', 'dev2'])
    expect(device[0].severity).toBe('high') // 3 members → sev(3)
    expect(device[0].evidence).toBe('3 accounts on the same device.')

    const multi = flagsOfKind(flags, 'multi-account')
    expect(multi).toHaveLength(3)
    const a = multi.find((f) => f.playerId === 'A')!
    expect([...a.relatedPlayerIds].sort()).toEqual(['B', 'C'])
    expect(a.detail).toBe('Shares a device with 2 other account(s).')
    expect(a.severity).toBe('high')
  })
})

/* ============================== referral ring ============================= */

describe('referral / rakeback ring', () => {
  it('a referrer with 2 referred accounts → referral-ring cluster + rakeback-abuse flags on all three', () => {
    const map = signalMap(
      signals({ playerId: 'farmer' }),
      signals({ playerId: 'ref1', referrerId: 'farmer' }),
      signals({ playerId: 'ref2', referrerId: 'farmer' }),
    )
    const { clusters, flags } = detectAbuse(map, [])

    const ring = clustersOfKind(clusters, 'referral-ring')
    expect(ring).toHaveLength(1)
    // members = [farmer, ...referred].sort()
    expect(ring[0].playerIds).toEqual(['farmer', 'ref1', 'ref2'])
    expect(ring[0].sharedKeys).toEqual(['farmer'])
    expect(ring[0].severity).toBe('medium') // sev(referred.length=2)
    expect(ring[0].evidence).toBe('farmer referred 2 accounts.')

    const rake = flagsOfKind(flags, 'rakeback-abuse')
    expect(rake).toHaveLength(3)
    const f = rake.find((x) => x.playerId === 'farmer')!
    expect(f.detail).toBe('Referred 2 accounts (referral farming).')
    expect([...f.relatedPlayerIds].sort()).toEqual(['ref1', 'ref2'])
    expect(f.severity).toBe('medium')

    const r1 = rake.find((x) => x.playerId === 'ref1')!
    expect(r1.detail).toBe("Part of farmer's referral ring.")
    expect([...r1.relatedPlayerIds].sort()).toEqual(['farmer', 'ref2'])
  })

  it('a referrer with only 1 referred account does NOT form a ring', () => {
    const map = signalMap(
      signals({ playerId: 'farmer' }),
      signals({ playerId: 'only', referrerId: 'farmer' }),
    )
    const { clusters, flags } = detectAbuse(map, [])
    expect(clustersOfKind(clusters, 'referral-ring')).toHaveLength(0)
    expect(flagsOfKind(flags, 'rakeback-abuse')).toHaveLength(0)
  })
})

/* ============================== collusion ring =========================== */

describe('collusion ring', () => {
  it('3 distinct-device accounts on one ipHash with overlapping sessions → collusion-ring + collusion flags', () => {
    // each on its OWN device (so NOT a shared-device subset), same ipHash, sessions within 30 min
    const map = signalMap(
      signals({
        playerId: 'P1',
        deviceIds: ['d1'],
        ipHashes: ['netZ'],
        sessions: [session(100 * MIN, 'd1', 'netZ')],
      }),
      signals({
        playerId: 'P2',
        deviceIds: ['d2'],
        ipHashes: ['netZ'],
        sessions: [session(110 * MIN, 'd2', 'netZ')], // 10 min after P1
      }),
      signals({
        playerId: 'P3',
        deviceIds: ['d3'],
        ipHashes: ['netZ'],
        sessions: [session(125 * MIN, 'd3', 'netZ')], // 15 min after P2
      }),
    )
    const { clusters, flags } = detectAbuse(map, [])

    // no shared-device cluster (all distinct devices)
    expect(clustersOfKind(clusters, 'shared-device')).toHaveLength(0)

    const collusion = clustersOfKind(clusters, 'collusion-ring')
    expect(collusion).toHaveLength(1)
    expect(collusion[0].playerIds).toEqual(['P1', 'P2', 'P3'])
    expect(collusion[0].sharedKeys).toEqual(['netZ'])
    expect(collusion[0].severity).toBe('high')
    expect(collusion[0].evidence).toBe('3 distinct-device accounts co-active on one network.')

    // a collusion-ring is NOT also reported as a plain shared-ip
    expect(clustersOfKind(clusters, 'shared-ip')).toHaveLength(0)

    const colFlags = flagsOfKind(flags, 'collusion')
    expect(colFlags).toHaveLength(3)
    const p1 = colFlags.find((f) => f.playerId === 'P1')!
    expect(p1.severity).toBe('high')
    expect([...p1.relatedPlayerIds].sort()).toEqual(['P2', 'P3'])
    expect(p1.detail).toBe('Co-active with 2 distinct-device accounts on a shared network.')
  })

  it('3 distinct-device accounts on one ip but NO overlapping sessions → shared-ip (low), NOT collusion', () => {
    const map = signalMap(
      signals({
        playerId: 'H1',
        deviceIds: ['hd1'],
        ipHashes: ['home'],
        sessions: [session(0, 'hd1', 'home')],
      }),
      signals({
        playerId: 'H2',
        deviceIds: ['hd2'],
        ipHashes: ['home'],
        sessions: [session(200 * MIN, 'hd2', 'home')], // > 30 min from any other
      }),
      signals({
        playerId: 'H3',
        deviceIds: ['hd3'],
        ipHashes: ['home'],
        sessions: [session(500 * MIN, 'hd3', 'home')],
      }),
    )
    const { clusters, flags } = detectAbuse(map, [])

    expect(clustersOfKind(clusters, 'collusion-ring')).toHaveLength(0)
    expect(flagsOfKind(flags, 'collusion')).toHaveLength(0)

    const ip = clustersOfKind(clusters, 'shared-ip')
    expect(ip).toHaveLength(1)
    expect(ip[0].playerIds).toEqual(['H1', 'H2', 'H3'])
    expect(ip[0].sharedKeys).toEqual(['home'])
    expect(ip[0].severity).toBe('low')
    expect(ip[0].evidence).toBe('3 accounts on the same network (possible household).')
  })

  it('a pure household of 2 (shared ip, no co-session) is a low shared-ip, never collusion', () => {
    const map = signalMap(
      signals({ playerId: 'M1', deviceIds: ['md1'], ipHashes: ['flat'], sessions: [session(0)] }),
      signals({
        playerId: 'M2',
        deviceIds: ['md2'],
        ipHashes: ['flat'],
        sessions: [session(300 * MIN)],
      }),
    )
    const { clusters, flags } = detectAbuse(map, [])
    const ip = clustersOfKind(clusters, 'shared-ip')
    expect(ip).toHaveLength(1)
    expect(ip[0].severity).toBe('low')
    // only 2 members → fails the >=3 collusion gate regardless of co-session
    expect(clustersOfKind(clusters, 'collusion-ring')).toHaveLength(0)
    expect(flagsOfKind(flags, 'collusion')).toHaveLength(0)
  })

  it('shared-ip that is a pure subset of a shared-device cluster is skipped (no dup)', () => {
    // both share BOTH device and ip → ipGroup members all device-linked → skipped
    const map = signalMap(
      signals({ playerId: 'X', deviceIds: ['sd'], ipHashes: ['si'] }),
      signals({ playerId: 'Y', deviceIds: ['sd'], ipHashes: ['si'] }),
    )
    const { clusters } = detectAbuse(map, [])
    expect(clustersOfKind(clusters, 'shared-device')).toHaveLength(1)
    expect(clustersOfKind(clusters, 'shared-ip')).toHaveLength(0)
    expect(clustersOfKind(clusters, 'collusion-ring')).toHaveLength(0)
  })
})

/* ============================ leaderboard gaming ========================== */

describe('leaderboard / rakeback gaming (behaviour)', () => {
  it('micro-stake, high-frequency, ≈break-even turnover → leaderboard-gaming flag', () => {
    // |net|/turnover = 30000/1000000 = 0.03 < 0.04 ✓
    const b = behavior({
      playerId: 'grind',
      bets: 30,
      stakeTier: 'micro',
      betsPerActiveDay: 10,
      turnoverCents: 1_000_000,
      netCents: -30_000,
    })
    const { flags } = detectAbuse(new Map(), [b])
    const lg = flagsOfKind(flags, 'leaderboard-gaming')
    expect(lg).toHaveLength(1)
    expect(lg[0].playerId).toBe('grind')
    expect(lg[0].severity).toBe('medium')
    expect(lg[0].relatedPlayerIds).toEqual([])
  })

  it('does not flag when any single condition fails', () => {
    const base = {
      playerId: 'p',
      bets: 30,
      stakeTier: 'micro' as const,
      betsPerActiveDay: 10,
      turnoverCents: 1_000_000,
      netCents: -30_000,
    }
    // too few bets
    expect(
      flagsOfKind(
        detectAbuse(new Map(), [behavior({ ...base, bets: 29 })]).flags,
        'leaderboard-gaming',
      ),
    ).toHaveLength(0)
    // not micro
    expect(
      flagsOfKind(
        detectAbuse(new Map(), [behavior({ ...base, stakeTier: 'low' })]).flags,
        'leaderboard-gaming',
      ),
    ).toHaveLength(0)
    // too few bets/day
    expect(
      flagsOfKind(
        detectAbuse(new Map(), [behavior({ ...base, betsPerActiveDay: 9 })]).flags,
        'leaderboard-gaming',
      ),
    ).toHaveLength(0)
    // net swing too large: 50000/1000000 = 0.05 ≥ 0.04
    expect(
      flagsOfKind(
        detectAbuse(new Map(), [behavior({ ...base, netCents: -50_000 })]).flags,
        'leaderboard-gaming',
      ),
    ).toHaveLength(0)
    // zero turnover → churnsTurnover false
    expect(
      flagsOfKind(
        detectAbuse(new Map(), [behavior({ ...base, turnoverCents: 0, netCents: 0 })]).flags,
        'leaderboard-gaming',
      ),
    ).toHaveLength(0)
  })
})

/* ============================== flagsForPlayer =========================== */

describe('flagsForPlayer', () => {
  it('returns only the flags for the requested player id', () => {
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['devX'] }),
      signals({ playerId: 'B', deviceIds: ['devX'] }),
    )
    const result = detectAbuse(map, [])
    const onlyA = flagsForPlayer(result, 'A')
    expect(onlyA).toHaveLength(1)
    expect(onlyA.every((f) => f.playerId === 'A')).toBe(true)
    expect(onlyA[0].kind).toBe('multi-account')

    expect(flagsForPlayer(result, 'nobody')).toEqual([])
  })

  it('returns every flag a player accrues across detectors', () => {
    // A shares a device with B (multi-account) AND is part of a referral ring (rakeback)
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['devX'] }),
      signals({ playerId: 'B', deviceIds: ['devX'], referrerId: 'A' }),
      signals({ playerId: 'C', referrerId: 'A' }),
    )
    const result = detectAbuse(map, [])
    const onlyA = flagsForPlayer(result, 'A')
    const kinds = onlyA.map((f) => f.kind).sort()
    expect(kinds).toEqual(['multi-account', 'rakeback-abuse'])
  })
})

/* ============================ cluster ordering ============================ */

describe('cluster severity ordering', () => {
  it('sorts clusters high → medium → low', () => {
    const map = signalMap(
      // low: pure household of two (shared ip, distinct devices, no co-session)
      signals({ playerId: 'L1', deviceIds: ['ld1'], ipHashes: ['lan'], sessions: [session(0)] }),
      signals({
        playerId: 'L2',
        deviceIds: ['ld2'],
        ipHashes: ['lan'],
        sessions: [session(999 * MIN)],
      }),
      // high: three accounts on one device
      signals({ playerId: 'H1', deviceIds: ['hd'] }),
      signals({ playerId: 'H2', deviceIds: ['hd'] }),
      signals({ playerId: 'H3', deviceIds: ['hd'] }),
    )
    const { clusters } = detectAbuse(map, [])
    const rank = { high: 0, medium: 1, low: 2 } as const
    for (let i = 1; i < clusters.length; i++) {
      expect(rank[clusters[i - 1].severity]).toBeLessThanOrEqual(rank[clusters[i].severity])
    }
    expect(clusters[0].severity).toBe('high')
    expect(clusters[clusters.length - 1].severity).toBe('low')
  })
})

describe('shared-network cluster spanning two device clusters (regression)', () => {
  it('does NOT drop an IP group just because every member is device-linked elsewhere', () => {
    // A+B share dev1 (device cluster 1); C+D share dev2 (device cluster 2); all four
    // sit on one network. The old dedup skipped this (every member was in the global
    // device-linked set), wrongly dropping a real 4-account shared-network signal.
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['dev1'], ipHashes: ['netX'] }),
      signals({ playerId: 'B', deviceIds: ['dev1'], ipHashes: ['netX'] }),
      signals({ playerId: 'C', deviceIds: ['dev2'], ipHashes: ['netX'] }),
      signals({ playerId: 'D', deviceIds: ['dev2'], ipHashes: ['netX'] }),
    )
    const { clusters } = detectAbuse(map, [])
    // both device clusters still surface
    expect(clusters.filter((c) => c.kind === 'shared-device')).toHaveLength(2)
    // and the cross-cluster shared network is now kept (not collusion: only 2 distinct devices)
    const ip = clusters.find((c) => c.kind === 'shared-ip')
    expect(ip).toBeDefined()
    expect(ip!.playerIds).toEqual(['A', 'B', 'C', 'D'])
  })

  it('still skips an IP group wholly inside ONE device cluster (no dup)', () => {
    const map = signalMap(
      signals({ playerId: 'A', deviceIds: ['dev1'], ipHashes: ['netX'] }),
      signals({ playerId: 'B', deviceIds: ['dev1'], ipHashes: ['netX'] }),
    )
    const { clusters } = detectAbuse(map, [])
    expect(clusters.filter((c) => c.kind === 'shared-device')).toHaveLength(1)
    expect(clusters.find((c) => c.kind === 'shared-ip')).toBeUndefined()
  })
})
