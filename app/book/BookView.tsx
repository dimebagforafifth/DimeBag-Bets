/**
 * The book — the player-facing sportsbook for the SGO odds lane. It consumes the
 * odds CONTRACT through the cache hook (`useBookOdds`), renders the lobby/event view
 * + bet slip, and places bets through `core` (so they move the player's figure and
 * roll up the book). Staff also get the role-scoped live-activity panel; demo gets
 * the simulate control. Nothing here touches the feed — when the real cache lands,
 * only the source flips (see app/book/odds-source.ts), no UI change.
 *
 * VANTAGE: graphite-and-gold, Saira Condensed, near-white values. Credit/balance only.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { availableToWager, type Account } from '../../core/index.js'
import type { Role } from '../../org/index.js'
import { useBookOdds } from './odds-source.js'
import { getBetsVersion, subscribeBets, betsForViewer, type BookBet } from './bets-store.js'
import { legFromSelection, movedLegKeys, type SlipLeg, type SlipMode } from './slip.js'
import { placeBookBet, cashOutBookBet, liveCashOutOffer } from './placement.js'
import { BookLobby } from './BookLobby.js'
import { EventView } from './EventView.js'
import { BetBuilder } from './BetBuilder.js'
import { BetSlip } from './BetSlip.js'
import { BookActivity } from './BookActivity.js'
import { SimulateControl } from './SimulateControl.js'
import type { NormalizedEvent, NormalizedMarket, Selection } from '../../lib/odds/contract.js'
import './book.css'

export function BookView({
  account,
  playerName,
  role,
  viewerId,
  isDemo = false,
  onBalanceChange,
}: {
  account: Account
  playerName: string
  /** The signed-in viewer's role — scopes the live-activity panel. */
  role: Role
  /** The signed-in viewer's member id — scopes the live-activity panel. */
  viewerId: string
  /** Demo mode (no Supabase keys) → show the simulate-betting control. */
  isDemo?: boolean
  /** Nudge the app header to re-read the figure after a place (pending move). */
  onBalanceChange?: () => void
}) {
  const { events, source } = useBookOdds()
  // Re-render when book activity changes (a bet placed / settled anywhere).
  useSyncExternalStore(subscribeBets, getBetsVersion)

  const [activeLeague, setActiveLeague] = useState<string | null>(null)
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [legs, setLegs] = useState<SlipLeg[]>([])
  const [mode, setMode] = useState<SlipMode>('single')
  const [stakeCents, setStakeCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const leagues = useMemo(() => [...new Set(events.map((e) => e.leagueId))], [events])
  const slipKeys = useMemo(() => new Set(legs.map((l) => l.key)), [legs])
  const movedKeys = useMemo(() => new Set(movedLegKeys(legs, events)), [legs, events])
  const openEvent = openEventId ? (events.find((e) => e.eventId === openEventId) ?? null) : null
  const available = availableToWager(account)
  const bets = betsForViewer(viewerId, role)

  function toggle(event: NormalizedEvent, market: NormalizedMarket, sel: Selection) {
    setError(null)
    setLegs((cur) =>
      cur.some((l) => l.key === sel.selectionId)
        ? cur.filter((l) => l.key !== sel.selectionId)
        : [...cur, legFromSelection(event, market, sel)],
    )
  }

  function accept() {
    // Re-lock every moved leg to its current displayed price.
    setLegs((cur) =>
      cur.map((l) => {
        const ev = events.find((e) => e.eventId === l.eventId)
        const m = ev?.markets.find((mk) => mk.marketId === l.marketId)
        const s = m?.selections.find((x) => x.selectionId === l.key)
        return s ? { ...l, price: { ...s.priceDisplay } } : l
      }),
    )
    setError(null)
  }

  function place() {
    const effMode: SlipMode = legs.length >= 2 ? mode : 'single'
    try {
      placeBookBet({
        account,
        playerName,
        placedBy: playerName,
        legs,
        mode: effMode,
        stakeCents,
        now: Date.now(),
      })
      setLegs([])
      setStakeCents(0)
      setError(null)
      onBalanceChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the bet.')
    }
  }

  // The current full cash-out offer for an open bet, valued off the LIVE slate (null when
  // not cashable OR a leg's market is suspended — the gate freezes cash-out). Recomputed as
  // the slate moves, so the offer ticks with the odds.
  const cashOutValueFor = useCallback(
    (bet: BookBet): number | null => liveCashOutOffer(bet, events),
    [events],
  )

  const onCashOut = useCallback(
    (betId: string, fraction: number) => {
      cashOutBookBet(betId, events, { fraction, now: Date.now() })
      onBalanceChange?.()
    },
    [events, onBalanceChange],
  )

  const board = openEvent ? (
    <EventView
      event={openEvent}
      slipKeys={slipKeys}
      onToggle={toggle}
      onBack={() => setOpenEventId(null)}
      viewerId={viewerId}
    />
  ) : (
    <BookLobby
      events={events}
      leagues={leagues}
      activeLeague={activeLeague}
      onLeague={setActiveLeague}
      slipKeys={slipKeys}
      onToggle={toggle}
      onOpenEvent={(id) => {
        setOpenEventId(id)
        setBuilderOpen(false) // always land on the markets view first
      }}
      viewerId={viewerId}
    />
  )

  if (builderOpen && openEvent) {
    return (
      <div className="bk">
        <BetBuilder
          key={openEvent.eventId}
          event={openEvent}
          account={account}
          playerName={playerName}
          onBack={() => setBuilderOpen(false)}
          onPlaced={() => {
            setBuilderOpen(false)
            onBalanceChange?.()
          }}
        />
      </div>
    )
  }

  return (
    <div className="bk">
      <div className="bk-main">
        <div className="bk-head">
          <h1 className="bk-title">Sportsbook</h1>
          <span className={`bk-source ${source === 'live' ? 'is-live' : ''}`}>
            {source === 'live' ? 'Live feed' : 'Demo feed'}
          </span>
        </div>
        {openEvent && (
          <button type="button" className="bk-build-cta" onClick={() => setBuilderOpen(true)}>
            ＋ Build a same-game bet
          </button>
        )}
        {board}
      </div>

      <div className="bk-aside">
        <BetSlip
          legs={legs}
          mode={mode}
          onMode={setMode}
          stakeCents={stakeCents}
          onStake={setStakeCents}
          movedKeys={movedKeys}
          available={available}
          error={error}
          onRemove={(key) => setLegs((cur) => cur.filter((l) => l.key !== key))}
          onClear={() => setLegs([])}
          onPlace={place}
          onAccept={accept}
        />

        <BookActivity
          bets={bets}
          title={role === 'player' ? 'My bets' : 'Live activity'}
          showWho={role !== 'player'}
          cashOutValueFor={cashOutValueFor}
          onCashOut={onCashOut}
        />

        {isDemo && <SimulateControl now={() => Date.now()} onChange={() => onBalanceChange?.()} />}
      </div>
    </div>
  )
}
