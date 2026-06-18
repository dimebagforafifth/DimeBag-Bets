/**
 * Abuse / collusion detection — links accounts by shared integrity signals and
 * flags the no-cash motives the white paper calls out: multi-account, P2P
 * collusion, and rakeback / leaderboard gaming (NOT laundering — there's no cash
 * out). Pure over the synthesized signals layer + behaviour. Read-only.
 */

import type {
  AbuseCluster,
  AbuseFlag,
  BehaviorFeatures,
  ClusterKind,
  PlayerSignals,
} from './types.js'

/* ------------------------------ union-find -------------------------------- */

class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    let p = this.parent.get(x)
    if (p === undefined) {
      this.parent.set(x, x)
      return x
    }
    if (p !== x) {
      p = this.find(p)
      this.parent.set(x, p)
    }
    return p
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/** Group player ids that share any value of `keyOf` (transitively). Returns groups
 *  of size ≥ 2 with the shared keys that linked them. */
function clusterByKey(
  players: string[],
  keysOf: (id: string) => string[],
): { members: string[]; keys: string[] }[] {
  const uf = new UnionFind()
  const keyToPlayers = new Map<string, string[]>()
  for (const id of players) {
    uf.find(id) // register
    for (const k of keysOf(id)) {
      const list = keyToPlayers.get(k) ?? []
      list.push(id)
      keyToPlayers.set(k, list)
    }
  }
  // union everyone who shares a key
  for (const [, ids] of keyToPlayers) {
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i])
  }
  // collect groups
  const groups = new Map<string, Set<string>>()
  for (const id of players) {
    const root = uf.find(id)
    const g = groups.get(root) ?? new Set<string>()
    g.add(id)
    groups.set(root, g)
  }
  const out: { members: string[]; keys: string[] }[] = []
  for (const [, set] of groups) {
    if (set.size < 2) continue
    const members = [...set].sort()
    // the keys actually shared within this group
    const keys = [...keyToPlayers.entries()]
      .filter(([, ids]) => ids.filter((x) => set.has(x)).length >= 2)
      .map(([k]) => k)
    out.push({ members, keys })
  }
  return out
}

const sev = (n: number): 'low' | 'medium' | 'high' => (n >= 3 ? 'high' : n >= 2 ? 'medium' : 'low')

/** Do any two members have sessions starting within `windowMin` of each other?
 *  (co-presence — a collusion tell when the accounts are on DIFFERENT devices.) */
function hasCoSessions(
  members: string[],
  signals: Map<string, PlayerSignals>,
  windowMin: number,
): boolean {
  const win = windowMin * 60_000
  const starts = members.map((id) => ({
    id,
    times: (signals.get(id)?.sessions ?? []).map((s) => s.at),
  }))
  for (let i = 0; i < starts.length; i++) {
    for (let j = i + 1; j < starts.length; j++) {
      for (const a of starts[i].times)
        for (const b of starts[j].times) if (Math.abs(a - b) <= win) return true
    }
  }
  return false
}

export interface AbuseResult {
  clusters: AbuseCluster[]
  flags: AbuseFlag[]
}

/** Detect linked-account clusters + per-player abuse flags. */
export function detectAbuse(
  signals: Map<string, PlayerSignals>,
  behavior: BehaviorFeatures[],
): AbuseResult {
  const ids = [...signals.keys()]
  const clusters: AbuseCluster[] = []
  const flags: AbuseFlag[] = []
  let cid = 0
  const mk = (
    kind: ClusterKind,
    g: { members: string[]; keys: string[] },
    severity: 'low' | 'medium' | 'high',
    evidence: string,
  ): AbuseCluster => ({
    id: `cl_${kind}_${cid++}`,
    kind,
    playerIds: g.members,
    sharedKeys: g.keys,
    severity,
    evidence,
  })

  // 1) shared device — the strongest multi-account tell
  const deviceGroups = clusterByKey(ids, (id) => signals.get(id)?.deviceIds ?? [])
  // member → its device-cluster index, so the IP pass can tell whether an IP group
  // is merely a subset of ONE device cluster (dedup) vs. spans different ones (keep).
  const deviceClusterId = new Map<string, number>()
  deviceGroups.forEach((g, idx) => g.members.forEach((m) => deviceClusterId.set(m, idx)))
  for (const g of deviceGroups) {
    clusters.push(
      mk(
        'shared-device',
        g,
        sev(g.members.length),
        `${g.members.length} accounts on the same device.`,
      ),
    )
    for (const m of g.members)
      flags.push({
        playerId: m,
        kind: 'multi-account',
        severity: sev(g.members.length),
        detail: `Shares a device with ${g.members.length - 1} other account(s).`,
        relatedPlayerIds: g.members.filter((x) => x !== m),
      })
  }

  // 2) shared network — household (low) on its own; collusion when co-present on distinct devices
  const ipGroups = clusterByKey(ids, (id) => signals.get(id)?.ipHashes ?? [])
  for (const g of ipGroups) {
    // Skip ONLY when this IP group is wholly inside a SINGLE device cluster (already
    // surfaced as multi-account). An IP group that spans two different device clusters
    // — or includes any non-device-linked account — is a genuine shared-network signal
    // and must NOT be dropped (the earlier global-set check wrongly swallowed those).
    const dc = g.members.map((m) => deviceClusterId.get(m))
    if (dc[0] !== undefined && dc.every((x) => x === dc[0])) continue
    const distinctDevices = new Set(g.members.flatMap((m) => signals.get(m)?.deviceIds ?? [])).size
    const colluding =
      g.members.length >= 3 &&
      distinctDevices >= g.members.length &&
      hasCoSessions(g.members, signals, 30)
    if (colluding) {
      clusters.push(
        mk(
          'collusion-ring',
          g,
          'high',
          `${g.members.length} distinct-device accounts co-active on one network.`,
        ),
      )
      for (const m of g.members)
        flags.push({
          playerId: m,
          kind: 'collusion',
          severity: 'high',
          detail: `Co-active with ${g.members.length - 1} distinct-device accounts on a shared network.`,
          relatedPlayerIds: g.members.filter((x) => x !== m),
        })
    } else {
      clusters.push(
        mk(
          'shared-ip',
          g,
          'low',
          `${g.members.length} accounts on the same network (possible household).`,
        ),
      )
    }
  }

  // 3) referral / rakeback ring — one account farming referred sign-ups
  const referredBy = new Map<string, string[]>()
  for (const id of ids) {
    const ref = signals.get(id)?.referrerId
    if (ref) {
      const list = referredBy.get(ref) ?? []
      list.push(id)
      referredBy.set(ref, list)
    }
  }
  for (const [farmer, referred] of referredBy) {
    if (referred.length < 2) continue
    const members = [farmer, ...referred].sort()
    const severity = sev(referred.length)
    clusters.push(
      mk(
        'referral-ring',
        { members, keys: [farmer] },
        severity,
        `${farmer} referred ${referred.length} accounts.`,
      ),
    )
    for (const m of members)
      flags.push({
        playerId: m,
        kind: 'rakeback-abuse',
        severity,
        detail:
          m === farmer
            ? `Referred ${referred.length} accounts (referral farming).`
            : `Part of ${farmer}'s referral ring.`,
        relatedPlayerIds: members.filter((x) => x !== m),
      })
  }

  // 4) leaderboard / rakeback gaming — micro-stake, high-churn turnover padding
  for (const b of behavior) {
    const churnsTurnover = b.turnoverCents > 0 && Math.abs(b.netCents) / b.turnoverCents < 0.04
    if (b.bets >= 30 && b.stakeTier === 'micro' && b.betsPerActiveDay >= 10 && churnsTurnover) {
      flags.push({
        playerId: b.playerId,
        kind: 'leaderboard-gaming',
        severity: 'medium',
        detail: `High-frequency micro-stakes churning turnover (≈break-even) — padding volume for rank/rakeback.`,
        relatedPlayerIds: [],
      })
    }
  }

  clusters.sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity],
  )
  return { clusters, flags }
}

/** All abuse flags for one player. */
export function flagsForPlayer(result: AbuseResult, playerId: string): AbuseFlag[] {
  return result.flags.filter((f) => f.playerId === playerId)
}
