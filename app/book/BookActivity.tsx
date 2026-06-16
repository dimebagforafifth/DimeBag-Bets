/**
 * Live book activity — the manager surface for the lane. A row per placed bet
 * (player, pick(s), stake, status), already scoped to the viewer by `betsForViewer`:
 * a manager sees the whole book, an agent only their downline, a player only their
 * own. The header shows total still at risk. Credit/balance only.
 */

import { formatMoney } from '../../games/shared/money.js'
import { atRiskCents, type BookBet } from './bets-store.js'

function legSummary(bet: BookBet): string {
  if (bet.legs.length === 1) return bet.legs[0].pick
  return `${bet.mode === 'parlay' ? `${bet.legs.length}-leg parlay` : 'Singles'} · ${bet.legs.map((l) => l.pick).join(', ')}`
}

function BetRow({ bet, showWho }: { bet: BookBet; showWho: boolean }) {
  return (
    <div className="bk-betrow">
      <div className="bk-betrow-main">
        <div className="bk-betrow-pick">{legSummary(bet)}</div>
        {showWho && <div className="bk-betrow-who">{bet.playerName}</div>}
      </div>
      <span className="bk-betrow-stake">{formatMoney(bet.stakeCents)}</span>
      <span className={`bk-status is-${bet.status}`}>
        {bet.status === 'open' ? 'Open' : bet.status}
      </span>
    </div>
  )
}

export function BookActivity({
  bets,
  title,
  showWho,
}: {
  bets: BookBet[]
  /** "Live activity" (staff) or "My bets" (player). */
  title: string
  /** Show the player name per row (staff views) vs hide it (a player's own bets). */
  showWho: boolean
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
        bets.slice(0, 12).map((b) => <BetRow key={b.id} bet={b} showWho={showWho} />)
      )}
    </div>
  )
}
