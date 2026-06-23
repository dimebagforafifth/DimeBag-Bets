/**
 * The book lobby — a league filter over the Big-6 slate, then event cards grouped
 * Live → Upcoming. Each card shows the three game lines (moneyline / spread / total)
 * as tap-to-add chips, modelled on how DraftKings/FanDuel lay out a card, plus a
 * "More wagers" button into the full event view (props + alternate lines).
 */

import type { NormalizedEvent, NormalizedMarket } from '../../lib/odds/contract.js'
import { PriceChip, type ToggleLeg } from './MarketChips.js'
import { MarketSplitBar } from '../../features/splits/index.js'

function startLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The first market of a (type) — the MAIN line; later same-type markets are alts. */
function mainMarket(
  event: NormalizedEvent,
  type: NormalizedMarket['type'],
): NormalizedMarket | undefined {
  return event.markets.find((m) => m.type === type)
}

function MarketColumn({
  title,
  event,
  market,
  slipKeys,
  onToggle,
}: {
  title: string
  event: NormalizedEvent
  market: NormalizedMarket | undefined
  slipKeys: Set<string>
  onToggle: ToggleLeg
}) {
  return (
    <div className="bk-col">
      <div className="bk-col-head">{title}</div>
      {market ? (
        market.selections
          .slice(0, 2)
          .map((s) => (
            <PriceChip
              key={s.selectionId}
              event={event}
              market={market}
              sel={s}
              on={slipKeys.has(s.selectionId)}
              onToggle={onToggle}
            />
          ))
      ) : (
        <div className="bk-empty">—</div>
      )}
    </div>
  )
}

function EventCard({
  event,
  slipKeys,
  onToggle,
  onOpen,
  viewerId,
}: {
  event: NormalizedEvent
  slipKeys: Set<string>
  onToggle: ToggleLeg
  onOpen: (id: string) => void
  viewerId: string
}) {
  const extra = event.markets.length - 3 // beyond the three game lines
  const ml = mainMarket(event, 'moneyline')
  return (
    <div className="bk-event">
      <div className="bk-event-top">
        <div className="bk-teams">
          {event.away}
          <span className="bk-at">@</span>
          {event.home}
        </div>
        <div className="bk-event-meta">
          <span className="bk-league-tag">{event.leagueId}</span>
          {event.status === 'live' ? (
            <span className="bk-livebadge">● LIVE</span>
          ) : (
            <span className="bk-time">{startLabel(event.startsAt)}</span>
          )}
        </div>
      </div>
      <div className="bk-cols">
        <MarketColumn
          title="Moneyline"
          event={event}
          market={mainMarket(event, 'moneyline')}
          slipKeys={slipKeys}
          onToggle={onToggle}
        />
        <MarketColumn
          title="Spread"
          event={event}
          market={mainMarket(event, 'spread')}
          slipKeys={slipKeys}
          onToggle={onToggle}
        />
        <MarketColumn
          title="Total"
          event={event}
          market={mainMarket(event, 'total')}
          slipKeys={slipKeys}
          onToggle={onToggle}
        />
      </div>
      {/* Round-4 C: one compact public-split signal per card (moneyline, tickets-only) — a clean
          discovery hint; the full per-market splits live in EventView. Empty → "No action yet". */}
      {ml && <MarketSplitBar marketId={ml.marketId} viewerId={viewerId} showHandle={false} />}
      {extra > 0 && (
        <button type="button" className="bk-more" onClick={() => onOpen(event.eventId)}>
          More wagers ({extra}) →
        </button>
      )}
    </div>
  )
}

export function BookLobby({
  events,
  leagues,
  activeLeague,
  onLeague,
  slipKeys,
  onToggle,
  onOpenEvent,
  viewerId,
}: {
  events: NormalizedEvent[]
  leagues: string[]
  activeLeague: string | null
  onLeague: (league: string | null) => void
  slipKeys: Set<string>
  onToggle: ToggleLeg
  onOpenEvent: (id: string) => void
  viewerId: string
}) {
  const shown = activeLeague ? events.filter((e) => e.leagueId === activeLeague) : events
  const live = shown.filter((e) => e.status === 'live')
  const upcoming = shown.filter((e) => e.status !== 'live')

  return (
    <div className="bk-main">
      <div className="bk-leagues">
        <button
          type="button"
          className={`bk-league-chip ${activeLeague === null ? 'is-on' : ''}`}
          onClick={() => onLeague(null)}
        >
          All
        </button>
        {leagues.map((l) => (
          <button
            key={l}
            type="button"
            className={`bk-league-chip ${activeLeague === l ? 'is-on' : ''}`}
            onClick={() => onLeague(l)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="bk-board">
        {live.length > 0 && (
          <div>
            <h3 className="bk-group-title is-live">Live now</h3>
            <div className="bk-events">
              {live.map((e) => (
                <EventCard
                  key={e.eventId}
                  event={e}
                  slipKeys={slipKeys}
                  onToggle={onToggle}
                  onOpen={onOpenEvent}
                  viewerId={viewerId}
                />
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="bk-group-title">Upcoming</h3>
          <div className="bk-events">
            {upcoming.map((e) => (
              <EventCard
                key={e.eventId}
                event={e}
                slipKeys={slipKeys}
                onToggle={onToggle}
                onOpen={onOpenEvent}
                viewerId={viewerId}
              />
            ))}
            {upcoming.length === 0 && (
              <div className="bk-empty">No upcoming games in this league.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
