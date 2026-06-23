/**
 * Profile v2 — the rich, read-only profile of one player, rendered from the projection. Lifetime
 * + windowed W/L · ROI · units · net · biggest win · streaks, a cumulative-P&L graph, by-sport /
 * by-market / by-game splits, CLV (where data exists), tail-success (where data exists), badges +
 * VIP tier. Per-block privacy hides blocks from non-followers. No control here moves money.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  profileStats,
  statsForWindow,
  STATS_WINDOWS,
  type ProfileSplit,
  type StatsWindow,
} from '../projection.js'
import {
  canView,
  isFullyHidden,
  privacyOf,
  setBlockVisibility,
  PROFILE_BLOCKS,
  type ProfileBlock,
  type Visibility,
} from '../privacy.js'
import { follow, isFollowing, unfollow, followCounts } from '../follow-graph.js'
import { formatMoney } from '../../../games/shared/money.js'
import { PnlChart } from './PnlChart.js'
// Round-4 C: the CLV-beat credibility card (closing-line beat + value-vs-taken). Imported from
// its component path (not the splits/ barrel) to avoid the barrel's section self-registration here.
import { ClvBeatCard } from '../../splits/ui/ClvBeatCard.js'
import { LockedBlock, moneyTone, pct, signedMoney, StatCell, units as fmtUnits } from './bits.js'

export function ProfileView({
  ownerId,
  viewerId,
  now,
  players,
  onPick,
}: {
  ownerId: string
  viewerId: string
  now: number
  players: { id: string; name: string }[]
  onPick: (id: string) => void
}): ReactNode {
  const [window, setWindow] = useState<StatsWindow>('lifetime')
  const [editingPrivacy, setEditingPrivacy] = useState(false)
  const stats = profileStats(ownerId, now)
  const isOwner = viewerId === ownerId
  const show = (block: ProfileBlock): boolean => canView(viewerId, ownerId, block)
  const vis = privacyOf(ownerId)
  const counts = followCounts(ownerId)

  const period = statsForWindow(stats, window)
  const t = stats.tier

  return (
    <section className="prof">
      <header className="prof-head">
        <div className="prof-id">
          {/* The VIP tier is derived from lifetime wagered, so it's stats-block data — gate it
              with the rest of the headline stats (don't leak rank/wagered past a private block). */}
          {show('stats') && (
            <span className="prof-tier" style={{ '--rank': t.current.color } as CSSProperties}>
              {t.current.id === 'none' ? 'Unranked' : t.current.name}
            </span>
          )}
          <h1 className="prof-name">{stats.name}</h1>
          {stats.demoSeeded && <span className="prof-demo">demo data</span>}
          <span className="prof-follow-counts">
            {counts.followers} follower{counts.followers === 1 ? '' : 's'} · {counts.following}{' '}
            following
          </span>
        </div>

        <div className="prof-head-right">
          {players.length > 1 && (
            <select
              className="prof-switch"
              value={ownerId}
              onChange={(e) => onPick(e.target.value)}
              aria-label="View a player's profile"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {!isOwner && viewerId && <FollowButton viewerId={viewerId} ownerId={ownerId} />}
          {isOwner && (
            <button
              className="action prof-privacy-btn"
              onClick={() => setEditingPrivacy((v) => !v)}
            >
              {editingPrivacy ? 'Done' : 'Privacy'}
            </button>
          )}
        </div>

        {show('stats') && t.next && (
          <div className="prof-tierbar" title={`${formatMoney(t.remaining)} to ${t.next.name}`}>
            <div className="prof-tierbar-fill" style={{ width: `${Math.round(t.pct * 100)}%` }} />
          </div>
        )}
      </header>

      {isOwner && editingPrivacy && <PrivacyEditor ownerId={ownerId} />}

      {!isOwner && isFullyHidden(viewerId, ownerId) ? (
        <div className="prof-private">This profile is private.</div>
      ) : (
        <div className="prof-body">
          {/* Headline stats — windowed W/L, ROI, net, plus lifetime units. */}
          {show('stats') ? (
            <>
              <div className="prof-windows">
                {STATS_WINDOWS.map((w) => (
                  <button
                    key={w.key}
                    className={`chip ${window === w.key ? 'is-on' : ''}`}
                    onClick={() => setWindow(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="prof-stats">
                <StatCell
                  label="Net"
                  value={signedMoney(period.net)}
                  tone={moneyTone(period.net)}
                  big
                />
                <StatCell label="ROI" value={pct(period.roi)} tone={moneyTone(period.net)} big />
                <StatCell
                  label="Units · lifetime"
                  value={fmtUnits(stats.units)}
                  tone={moneyTone(stats.units)}
                />
                <StatCell label="Record" value={`${period.wins}–${period.losses}`} />
                <StatCell label="Win rate" value={`${period.winRate.toFixed(0)}%`} />
                <StatCell label="Wagered" value={formatMoney(period.wagered)} />
                <StatCell label="Bets" value={String(period.bets)} />
              </div>
            </>
          ) : (
            <LockedBlock visibility={vis.stats === 'private' ? 'private' : 'followers'} />
          )}

          {/* Cumulative P&L (lifetime). */}
          <div className="prof-section">
            <h2 className="prof-h2">Performance</h2>
            {show('performance') ? (
              <PnlChart pnl={stats.pnl} label="Cumulative P&L · lifetime" />
            ) : (
              <LockedBlock visibility={vis.performance === 'private' ? 'private' : 'followers'} />
            )}
          </div>

          {/* Splits + CLV + tail-success. */}
          <div className="prof-section">
            <h2 className="prof-h2">Where they win</h2>
            {show('splits') ? (
              <>
                <div className="prof-split-grid">
                  <SplitCard
                    title="By sport"
                    rows={stats.bySport}
                    empty="No sportsbook detail yet."
                  />
                  <SplitCard
                    title="By market"
                    rows={stats.byMarket}
                    empty="No sportsbook detail yet."
                  />
                  <SplitCard title="By game" rows={stats.byGame} empty="No settled games yet." />
                </div>
                <div className="prof-cards">
                  <ClvCard stats={stats} />
                  {/* Round-4 C: closing-line-beat credibility for the viewed player (honestly gated). */}
                  <ClvBeatCard accountId={ownerId} />
                  <TailCard stats={stats} />
                </div>
              </>
            ) : (
              <LockedBlock visibility={vis.splits === 'private' ? 'private' : 'followers'} />
            )}
          </div>

          {/* Badges + streak + biggest win. */}
          <div className="prof-section">
            <h2 className="prof-h2">Highlights</h2>
            {show('badges') ? (
              <div className="prof-cards">
                <StreakCard stats={stats} />
                <BiggestWinCard stats={stats} />
                {stats.badges.length > 0 && (
                  <div className="prof-badges">
                    {stats.badges.map((b) => (
                      <div className={`prof-badge tone-${b.tone}`} key={b.id} title={b.detail}>
                        <span className="prof-badge-label">{b.label}</span>
                        <span className="prof-badge-detail">{b.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <LockedBlock visibility={vis.badges === 'private' ? 'private' : 'followers'} />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function FollowButton({ viewerId, ownerId }: { viewerId: string; ownerId: string }): ReactNode {
  const following = isFollowing(viewerId, ownerId)
  return (
    <button
      className={`action prof-follow ${following ? 'is-following' : ''}`}
      onClick={() => (following ? unfollow(viewerId, ownerId) : follow(viewerId, ownerId))}
    >
      {following ? 'Following ✓' : 'Follow'}
    </button>
  )
}

function PrivacyEditor({ ownerId }: { ownerId: string }): ReactNode {
  const current = privacyOf(ownerId)
  return (
    <div className="prof-privacy">
      <p className="prof-privacy-note">Choose who can see each block of your profile.</p>
      {PROFILE_BLOCKS.map((b) => (
        <label className="prof-privacy-row" key={b.key}>
          <span className="prof-privacy-label">
            {b.label}
            <span className="prof-privacy-hint">{b.hint}</span>
          </span>
          <select
            className="prof-privacy-select"
            value={current[b.key]}
            onChange={(e) => setBlockVisibility(ownerId, b.key, e.target.value as Visibility)}
            aria-label={`Who can see ${b.label}`}
          >
            <option value="public">Everyone</option>
            <option value="followers">Followers only</option>
            <option value="private">Only me</option>
          </select>
        </label>
      ))}
    </div>
  )
}

function SplitCard({
  title,
  rows,
  empty,
}: {
  title: string
  rows: ProfileSplit[]
  empty: string
}): ReactNode {
  const top = rows.slice(0, 6)
  return (
    <div className="prof-split">
      <span className="prof-split-title">{title}</span>
      {top.length ? (
        <div className="prof-split-rows">
          {top.map((r) => (
            <div className="prof-split-row" key={r.key}>
              <span className="prof-split-name">{r.label}</span>
              <span className="prof-split-bets">{r.bets}</span>
              <span className={`prof-split-net ${moneyTone(r.net)}`}>{signedMoney(r.net)}</span>
            </div>
          ))}
        </div>
      ) : (
        <span className="prof-split-empty">{empty}</span>
      )}
    </div>
  )
}

function ClvCard({ stats }: { stats: ReturnType<typeof profileStats> }): ReactNode {
  const c = stats.clv
  return (
    <div className="prof-card">
      <span className="prof-card-label">Beats the close (CLV)</span>
      {c.available ? (
        <>
          <span className={`prof-card-value ${c.beatRate >= 50 ? 'is-up' : 'is-down'}`}>
            {c.beatRate.toFixed(0)}%
          </span>
          <span className="prof-card-sub">
            {pct(c.avgClvPct / 100)} avg · {c.sampleSize} priced bets
          </span>
        </>
      ) : (
        <>
          <span className="prof-card-value is-even">n/a</span>
          <span className="prof-card-sub">{c.note}</span>
        </>
      )}
    </div>
  )
}

function TailCard({ stats }: { stats: ReturnType<typeof profileStats> }): ReactNode {
  const tw = stats.tailSuccess
  return (
    <div className="prof-card">
      <span className="prof-card-label">Tail success</span>
      {tw.available ? (
        <>
          <span className={`prof-card-value ${tw.successRate >= 50 ? 'is-up' : 'is-down'}`}>
            {tw.successRate.toFixed(0)}%
          </span>
          <span className="prof-card-sub">
            {tw.wins}/{tw.settled} tails won
          </span>
        </>
      ) : (
        <>
          <span className="prof-card-value is-even">n/a</span>
          {/* SEAM: available once tailed bets are tagged with their origin. */}
          <span className="prof-card-sub">{tw.note}</span>
        </>
      )}
    </div>
  )
}

function StreakCard({ stats }: { stats: ReturnType<typeof profileStats> }): ReactNode {
  const s = stats.streak
  const live =
    s.currentKind === 'none' ? '—' : `${s.current} ${s.currentKind}${s.current === 1 ? '' : 's'}`
  return (
    <div className="prof-card">
      <span className="prof-card-label">Current streak</span>
      <span
        className={`prof-card-value ${s.currentKind === 'win' ? 'is-up' : s.currentKind === 'loss' ? 'is-down' : ''}`}
      >
        {live}
      </span>
      <span className="prof-card-sub">
        best {s.longestWin}W · {s.longestLoss}L
      </span>
    </div>
  )
}

function BiggestWinCard({ stats }: { stats: ReturnType<typeof profileStats> }): ReactNode {
  const hl = stats.biggestWin
  return (
    <div className="prof-card">
      <span className="prof-card-label">Biggest win</span>
      {hl ? (
        <>
          <span className={`prof-card-value ${moneyTone(hl.profit)}`}>
            {signedMoney(hl.profit)}
          </span>
          <span className="prof-card-sub">
            {hl.game}
            {hl.multiplier > 1 ? ` · ${Number(hl.multiplier.toFixed(2))}×` : ''}
          </span>
        </>
      ) : (
        <span className="prof-card-value is-even">—</span>
      )}
    </div>
  )
}
