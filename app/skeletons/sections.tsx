/**
 * Section-shaped skeletons — content-shaped loading placeholders, one per surface
 * archetype, built from the brand <Skeleton> primitives. Each mirrors the real
 * section's footprint (grid/rows/panels) so when a section's lazy chunk (or, later,
 * its async data) is in flight, the user sees the shape of what's coming with no
 * layout shift when it lands — never a spinner-on-blank.
 *
 * The shell maps an active section to one of these via `sectionSkeleton()` (see
 * ./index.ts). Adding a new section? Map it there; fall back to GenericSectionSkeleton.
 */

import {
  Skeleton,
  SkeletonText,
  SkeletonCircle,
  SkeletonRegion,
} from '../../components/brand/index.js'
import './skeletons.css'

/** N repeated nodes — a tiny helper to keep the archetypes terse. */
function repeat(n: number, fn: (i: number) => React.ReactNode) {
  return Array.from({ length: n }, (_, i) => fn(i))
}

/* ---- Casino lobby: hero + the Arcade card grid ---- */
export function LobbySkeleton() {
  return (
    <SkeletonRegion label="Loading the lobby" className="skel-lobby">
      <div className="skel-hero">
        <div className="skel-hero-copy">
          <Skeleton width={140} height={20} radius={999} />
          <Skeleton width="70%" height={40} />
          <Skeleton width="90%" height={14} />
          <div className="skel-row">
            <Skeleton width={150} height={44} radius={12} />
            <Skeleton width={120} height={44} radius={12} />
          </div>
        </div>
        <Skeleton className="skel-hero-art" height={180} radius={18} />
      </div>
      <div className="skel-grid">
        {repeat(12, (i) => (
          <Skeleton key={i} className="skel-card" height={150} radius={12} />
        ))}
      </div>
    </SkeletonRegion>
  )
}

/* ---- A single game page: board + control panel ---- */
export function GameSkeleton() {
  return (
    <SkeletonRegion label="Loading the game" className="skel-game">
      <Skeleton width={120} height={16} />
      <div className="skel-game-body">
        <Skeleton className="skel-game-board" height={360} radius={14} />
        <div className="skel-game-panel">
          {repeat(4, (i) => (
            <div className="skel-field" key={i}>
              <Skeleton width="40%" height={10} />
              <Skeleton height={40} radius={10} />
            </div>
          ))}
          <Skeleton height={48} radius={12} />
        </div>
      </div>
    </SkeletonRegion>
  )
}

/* ---- Tabular section: a head row + N rows (leaderboard, players) ---- */
export function TableSkeleton({ rows = 8, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="skel-table">
      <Skeleton width={180} height={26} />
      <div className="skel-rows">
        {repeat(rows, (i) => (
          <div className="skel-table-row" key={i}>
            <SkeletonCircle size={28} />
            <Skeleton width={`${40 + ((i * 7) % 40)}%`} height={14} />
            <Skeleton className="skel-cell-end" width={64} height={14} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/* ---- My Bets: head, the 4-figure strip, "By side" (2 cards), stats, history ---- */
export function BetsSkeleton() {
  return (
    <SkeletonRegion label="Loading your bets" className="skel-bets">
      <Skeleton width={160} height={28} />
      <Skeleton width="60%" height={12} />
      {/* mybets-figure: 4 figures */}
      <div className="skel-figure-strip">
        {repeat(4, (i) => (
          <Skeleton key={i} height={76} radius={12} />
        ))}
      </div>
      {/* "By side": Casino + Sportsbook side cards */}
      <div className="skel-sides">
        {repeat(2, (i) => (
          <Skeleton key={i} height={96} radius={12} />
        ))}
      </div>
      {/* Statistics tiles */}
      <div className="skel-tiles">
        {repeat(8, (i) => (
          <Skeleton key={i} height={58} radius={12} />
        ))}
      </div>
      {/* Bet history rows */}
      <div className="skel-rows">
        {repeat(5, (i) => (
          <div className="skel-table-row" key={i}>
            <Skeleton width="40%" height={14} />
            <Skeleton className="skel-cell-end" width={64} height={14} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/* ---- A social feed: avatar + two text lines per item ---- */
export function FeedSkeleton({ items = 6 }: { items?: number }) {
  return (
    <SkeletonRegion label="Loading the feed" className="skel-feed">
      <Skeleton width={160} height={26} />
      {repeat(items, (i) => (
        <div className="skel-feed-item" key={i}>
          <SkeletonCircle size={36} />
          <div className="skel-feed-body">
            <Skeleton width="30%" height={12} />
            <SkeletonText lines={2} lastWidth="70%" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/* ---- A form: label/field rows + a save button (profile, limits) ---- */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <SkeletonRegion label="Loading" className="skel-form">
      <Skeleton width={180} height={26} />
      {repeat(fields, (i) => (
        <div className="skel-field" key={i}>
          <Skeleton width="35%" height={11} />
          <Skeleton height={42} radius={10} />
        </div>
      ))}
      <Skeleton width={140} height={44} radius={12} />
    </SkeletonRegion>
  )
}

/* ---- Sportsbook: a few event rows (matchup + three odds buttons) ---- */
export function BookSkeleton({ events = 5 }: { events?: number }) {
  return (
    <SkeletonRegion label="Loading the sportsbook" className="skel-book">
      <Skeleton width={200} height={26} />
      {repeat(events, (i) => (
        <div className="skel-event" key={i}>
          <div className="skel-event-teams">
            <Skeleton width="60%" height={14} />
            <Skeleton width="50%" height={14} />
          </div>
          <div className="skel-odds">
            {repeat(3, (j) => (
              <Skeleton key={j} className="skel-odd" height={48} radius={10} />
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/* ---- A dashboard-style section: stat tiles + a card grid ---- */
export function DashboardSkeleton({
  tiles = 3,
  cards = 6,
  label = 'Loading',
}: {
  tiles?: number
  cards?: number
  label?: string
}) {
  return (
    <SkeletonRegion label={label} className="skel-dash">
      <Skeleton width={200} height={28} />
      <div className="skel-tiles">
        {repeat(tiles, (i) => (
          <Skeleton key={i} height={72} radius={12} />
        ))}
      </div>
      <div className="skel-grid">
        {repeat(cards, (i) => (
          <Skeleton key={i} className="skel-card" height={132} radius={12} />
        ))}
      </div>
    </SkeletonRegion>
  )
}

/* ---- Operator console: a figures strip + the section card grid ---- */
export function ConsoleSkeleton() {
  return (
    <SkeletonRegion label="Loading the console" className="skel-console">
      {/* FiguresStrip renders exactly 4 figures (Balance / This Week / Today / Active). */}
      <div className="skel-figures">
        {repeat(4, (i) => (
          <Skeleton key={i} height={68} radius={12} />
        ))}
      </div>
      <div className="skel-grid">
        {repeat(9, (i) => (
          <Skeleton key={i} className="skel-card" height={120} radius={12} />
        ))}
      </div>
    </SkeletonRegion>
  )
}

/* ---- Fallback for any section without a bespoke shape ---- */
export function GenericSectionSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="skel-generic">
      <Skeleton width={200} height={28} />
      <SkeletonText lines={3} />
      <div className="skel-grid">
        {repeat(6, (i) => (
          <Skeleton key={i} className="skel-card" height={120} radius={12} />
        ))}
      </div>
    </SkeletonRegion>
  )
}
