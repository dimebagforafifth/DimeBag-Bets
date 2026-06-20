/**
 * Discovery — "players to follow", the discovery leaderboard, and follow-by-sport. Every list is
 * a pure RANKING over the read-only projection: it reads stats, never writes a credit. The pure
 * core (rank*, suggest*) takes an injected `statsOf` so it's deterministic and unit-testable; the
 * store-backed wrappers below feed it the live projection + follow graph + community scope.
 */

import { downline } from '../org/index.js'
import { getBook } from '../app/book-store.js'
import {
  listProfiles,
  profileStats,
  statsForWindow,
  type ProfileSplit,
  type ProfileStats,
  type StatsWindow,
} from './projection.js'
import { followingOf, friendsOfFriends } from './follow-graph.js'
import { canView } from './privacy.js'
import { communitySettings, type DiscoveryScope } from './community-settings.js'

/** Leaderboard metrics — all window-aware, so a window switch re-ranks consistently. */
export type LeaderMetric = 'net' | 'roi' | 'winRate'

export const LEADER_METRICS: { key: LeaderMetric; label: string }[] = [
  { key: 'net', label: 'Net' },
  { key: 'roi', label: 'ROI' },
  { key: 'winRate', label: 'Win rate' },
]

export interface RankedPlayer {
  rank: number
  id: string
  name: string
  metric: LeaderMetric
  /** The metric value used for the ranking (cents for net, fraction for roi, percent for winRate). */
  value: number
  stats: ProfileStats
}

export interface SuggestedPlayer {
  id: string
  name: string
  reason: 'friends-of-friends' | 'top-roi'
  /** A one-line reason ("N mutuals" or a ROI figure). No full stats are carried client-side so a
   *  private player's projection is never bundled into a suggestion. */
  detail: string
}

export interface SportRankedPlayer {
  rank: number
  id: string
  name: string
  split: ProfileSplit
}

/** The metric value for a player over a window. */
function metricValue(stats: ProfileStats, metric: LeaderMetric, window: StatsWindow): number {
  const p = statsForWindow(stats, window)
  switch (metric) {
    case 'net':
      return p.net
    case 'roi':
      return p.roi
    case 'winRate':
      return p.winRate
  }
}

export interface RankOpts {
  metric: LeaderMetric
  window: StatsWindow
  /** Rate metrics (roi/winRate) need a sample floor so a 1-bet 100% doesn't top the board. */
  minDecided?: number
  limit?: number
}

/**
 * Rank candidates by a metric over a window. For rate metrics (roi/winRate) a player must have at
 * least `minDecided` decided bets in the window to qualify (default 3) — otherwise small samples
 * dominate. `net` is absolute, so it has no floor. Deterministic tie-break: value, then net, then id.
 */
export function rankPlayers(
  candidates: { id: string; name: string }[],
  statsOf: (id: string) => ProfileStats,
  opts: RankOpts,
): RankedPlayer[] {
  const minDecided = opts.minDecided ?? 3
  const rate = opts.metric === 'roi' || opts.metric === 'winRate'
  const rows = candidates
    .map((c) => ({ c, stats: statsOf(c.id) }))
    .filter(({ stats }) => !rate || statsForWindow(stats, opts.window).decided >= minDecided)
    .map(({ c, stats }) => ({
      id: c.id,
      name: c.name,
      stats,
      value: metricValue(stats, opts.metric, opts.window),
      net: statsForWindow(stats, opts.window).net,
    }))
    .sort((a, b) => b.value - a.value || b.net - a.net || a.id.localeCompare(b.id))
  const limited = opts.limit != null ? rows.slice(0, opts.limit) : rows
  return limited.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    metric: opts.metric,
    value: r.value,
    stats: r.stats,
  }))
}

const pct = (fraction: number): string =>
  `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`

/**
 * Blend follow suggestions: friends-of-friends first (strongest signal — ranked by mutual count),
 * then top-ROI-this-week to fill. Excludes the viewer + anyone already excluded (self/followed).
 */
export function suggestPlayers(opts: {
  candidates: { id: string; name: string }[]
  statsOf: (id: string) => ProfileStats
  fof: { id: string; mutuals: number }[]
  exclude: ReadonlySet<string>
  /** Whether the VIEWER may see a candidate's stats — gates the ROI-detail fill (privacy). */
  statsViewable?: (id: string) => boolean
  limit?: number
}): SuggestedPlayer[] {
  const { candidates, statsOf, fof, exclude } = opts
  const statsViewable = opts.statsViewable ?? (() => true)
  const limit = opts.limit ?? 6
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const out: SuggestedPlayer[] = []
  const taken = new Set<string>(exclude)

  // Friends-of-friends suggestions carry only a "N mutuals" detail (no stat), so they're shown
  // regardless of the candidate's stats privacy — following is how you'd unlock their numbers.
  for (const f of fof) {
    if (taken.has(f.id) || !byId.has(f.id)) continue
    taken.add(f.id)
    out.push({
      id: f.id,
      name: byId.get(f.id)!.name,
      reason: 'friends-of-friends',
      detail: `${f.mutuals} mutual${f.mutuals === 1 ? '' : 's'}`,
    })
    if (out.length >= limit) return out
  }

  // The top-ROI fill reveals a stat (ROI), so only include candidates whose stats the viewer may
  // see — a private player never has their ROI leaked through a suggestion.
  const remaining = candidates.filter((c) => !taken.has(c.id) && statsViewable(c.id))
  for (const r of rankPlayers(remaining, statsOf, {
    metric: 'roi',
    window: 'week',
    minDecided: 3,
  })) {
    if (out.length >= limit) break
    out.push({
      id: r.id,
      name: r.name,
      reason: 'top-roi',
      detail: `${pct(r.value)} ROI · 7d`,
    })
  }
  return out
}

/** Rank candidates by their net in one sport (follow-by-sport). Players with no action there drop. */
export function rankBySport(
  candidates: { id: string; name: string }[],
  statsOf: (id: string) => ProfileStats,
  sportKey: string,
  opts: { limit?: number } = {},
): SportRankedPlayer[] {
  const rows = candidates
    .map((c) => ({ c, split: statsOf(c.id).bySport.find((s) => s.key === sportKey) }))
    .filter((r): r is { c: { id: string; name: string }; split: ProfileSplit } => !!r.split)
    .sort((a, b) => b.split.net - a.split.net || a.c.id.localeCompare(b.c.id))
  const limited = opts.limit != null ? rows.slice(0, opts.limit) : rows
  return limited.map((r, i) => ({ rank: i + 1, id: r.c.id, name: r.c.name, split: r.split }))
}

/* --------------------------- store-backed wrappers --------------------------- */

/** The candidate set for a scope: the whole tenant, or the viewer's downline (profiles only). */
export function scopedCandidates(
  viewerId: string,
  scope: DiscoveryScope,
  now: number,
): { id: string; name: string }[] {
  const all = listProfiles()
  void now
  if (scope === 'global') return all
  const org = getBook()
  if (!org.members[viewerId]) return all // viewer not in the tree (demo) → fall back to tenant
  const ids = new Set(downline(org, viewerId).map((m) => m.id))
  const within = all.filter((p) => ids.has(p.id))
  // Intentional: an empty downline (e.g. a player, or an agent with no players) falls back to the
  // tenant board so the surface is never blank. The scope toggle is a lens, not an access control
  // (the leaderboard is privacy-gated separately); Lane D's Community Settings can hide the toggle
  // for roles where downline scope isn't meaningful.
  return within.length ? within : all
}

/** "Players to follow" for a viewer, from the live projection + follow graph. */
export function suggestionsFor(viewerId: string, now: number, limit = 6): SuggestedPlayer[] {
  const exclude = new Set<string>([viewerId, ...followingOf(viewerId)])
  return suggestPlayers({
    candidates: listProfiles(),
    statsOf: (id) => profileStats(id, now),
    fof: friendsOfFriends(viewerId),
    exclude,
    statsViewable: (id) => canView(viewerId, id, 'stats'),
    limit,
  })
}

/**
 * The discovery leaderboard, scoped + ranked from the live projection. PRIVACY: a player only
 * appears if the viewer may see their `stats` block (a private player isn't ranked on a public
 * board with their net exposed); the viewer always sees themselves.
 */
export function leaderboardFor(
  viewerId: string,
  now: number,
  opts: { metric: LeaderMetric; window: StatsWindow; scope: DiscoveryScope; limit?: number },
): RankedPlayer[] {
  const candidates = scopedCandidates(viewerId, opts.scope, now).filter((c) =>
    canView(viewerId, c.id, 'stats'),
  )
  return rankPlayers(candidates, (id) => profileStats(id, now), {
    metric: opts.metric,
    window: opts.window,
    limit: opts.limit,
  })
}

/**
 * Follow-by-sport leaderboard, scoped + ranked from the live projection. PRIVACY: gated on the
 * `splits` block (the by-sport net is splits data).
 */
export function sportLeaderboardFor(
  viewerId: string,
  now: number,
  sportKey: string,
  opts: { scope: DiscoveryScope; limit?: number },
): SportRankedPlayer[] {
  const candidates = scopedCandidates(viewerId, opts.scope, now).filter((c) =>
    canView(viewerId, c.id, 'splits'),
  )
  return rankBySport(candidates, (id) => profileStats(id, now), sportKey, { limit: opts.limit })
}

/**
 * Every sport that appears in any profile's by-sport splits (for the sport filter). PRIVACY: only
 * scans profiles whose `splits` block the viewer may see, so the dropdown can't reveal which
 * sports a private player bets.
 */
export function availableSports(viewerId: string, now: number): { key: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const p of listProfiles()) {
    if (!canView(viewerId, p.id, 'splits')) continue
    for (const s of profileStats(p.id, now).bySport) {
      if (!seen.has(s.key)) seen.set(s.key, s.label)
    }
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** The default scope a viewer's discovery opens at (per Community Settings). */
export function defaultScopeFor(): DiscoveryScope {
  return communitySettings().defaultScope
}
