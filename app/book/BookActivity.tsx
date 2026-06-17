/**
 * Live book activity — the manager surface for the lane. A row per placed bet
 * (player, pick(s), stake, status), already scoped to the viewer by `betsForViewer`:
 * a manager sees the whole book, an agent only their downline, a player only their
 * own. The header shows total still at risk. Credit/balance only.
 */

import { formatMoney } from '../../games/shared/money.js'
import { atRiskCents, type BookBet } from './bets-store.js'

function legSummary(bet: BookBet): string {
  const sgp =
    bet.mode === 'parlay' &&
    bet.legs.length >= 2 &&
    bet.legs.every((l) => l.eventId === bet.legs[0].eventId)
  if (bet.legs.length === 1) return bet.legs[0].pick
  const label = sgp
    ? `${bet.legs.length}-leg SGP`
    : bet.mode === 'parlay'
      ? `${bet.legs.length}-leg parlay`
      : 'Singles'
  return `${label} · ${bet.legs.map((l) => l.pick).join(', ')}`
}

function BetRow({
  bet,
  showWho,
  cashOutValueFor,
  onCashOut,
}: {
  bet: BookBet
  showWho: boolean
  cashOutValueFor?: (bet: BookBet) => number | null
  onCashOut?: (betId: string, fraction: number) => void
}) {
  const offer = bet.status === 'open' && cashOutValueFor ? cashOutValueFor(bet) : null
  return (
    <div className="bk-betrow">
      <div className="bk-betrow-main">
        <div className="bk-betrow-pick">{legSummary(bet)}</div>
        {showWho && <div className="bk-betrow-who">{bet.playerName}</div>}
        {bet.cashedOutCents != null && bet.cashedOutCents > 0 && (
          <div className="bk-betrow-cashed">Cashed {formatMoney(bet.cashedOutCents)}</div>
        )}
      </div>
      <span className="bk-betrow-stake">{formatMoney(bet.stakeCents)}</span>
      {offer != null && offer > 0 && onCashOut ? (
        // SEAM (Agent D): functional cash-out controls — final visual polish via theme tokens.
        <span className="bk-cashout-grp">
          <button
            type="button"
            className="bk-cashout"
            onClick={() => onCashOut(bet.id, 1)}
            title="Cash out the full bet now"
          >
            Cash out {formatMoney(offer)}
          </button>
          <button
            type="button"
            className="bk-cashout-half"
            onClick={() => onCashOut(bet.id, 0.5)}
            title="Cash out half, let the rest ride"
          >
            ½
          </button>
        </span>
      ) : (
        <span className={`bk-status is-${bet.status}`}>
          {bet.status === 'open' ? 'Open' : bet.status}
        </span>
      )}
    </div>
  )
}

export function BookActivity({
  bets,
  title,
  showWho,
  cashOutValueFor,
  onCashOut,
}: {
  bets: BookBet[]
  /** "Live activity" (staff) or "My bets" (player). */
  title: string
  /** Show the player name per row (staff views) vs hide it (a player's own bets). */
  showWho: boolean
  /** Current full cash-out offer (cents) for an open bet, or null if not cashable. When
   *  omitted (or paired with no `onCashOut`) the cash-out controls are hidden. */
  cashOutValueFor?: (bet: BookBet) => number | null
  /** Cash out `fraction` (1 = full, 0.5 = half) of a bet. */
  onCashOut?: (betId: string, fraction: number) => void
}) {
  const risk = atRiskCents(bets)
  return (
    <div className="bk-panel">
      <div className="bk-panel-head">
        <h3 className="bk-panel-h">{title}</h3>
        {risk > 0 && (
          <span className="bk-panel-risk">
            At risk <b>{formatMoney(risk)}</b>
          </span>
        )}
      </div>
      {bets.length === 0 ? (
        <p className="bk-empty">No bets yet.</p>
      ) : (
        bets
          .slice(0, 12)
          .map((b) => (
            <BetRow
              key={b.id}
              bet={b}
              showWho={showWho}
              cashOutValueFor={cashOutValueFor}
              onCashOut={onCashOut}
            />
          ))
      )}
    </div>
  )
}
