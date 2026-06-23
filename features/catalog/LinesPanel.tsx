import { useSyncExternalStore } from 'react'
import { TradingDesk } from '../../sportsbook/trading/ui/TradingDesk.js'
import type { CirclingApi } from '../../sportsbook/trading/ui/LineControls.js'
import { getBookVersion, subscribeBook, listPlayers, mutateBook } from '../../app/book-store.js'
import { setMaxWager } from '../org/index.js'
import './catalog.css'

/** The holding limit a circled player is dropped to (cents) — $5 a bet. */
const HOLDING_LIMIT = 500

/**
 * Sportsbook Lines — the Trading Desk with Simple/Advanced line management. The desk
 * itself holds no points; this wrapper injects the one operator action that touches the
 * book's accounts — CIRCLING — through the real org max-bet lever (via mutateBook), so a
 * circled player's limit drops to a holding amount on every market. Everything else in
 * the desk routes through the overlay/precedence pipeline. Renders only the body.
 */
export function LinesPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const players = listPlayers().map((p) => ({
    id: p.id,
    name: p.name,
    maxWager: p.account.maxWager ?? null,
    circled: p.account.maxWager != null && p.account.maxWager <= HOLDING_LIMIT,
  }))
  const circling: CirclingApi = {
    players,
    setCircled: (id, on) => mutateBook((o) => setMaxWager(o, id, on ? HOLDING_LIMIT : null)),
  }
  return (
    <div className="feat">
      <TradingDesk circling={circling} />
    </div>
  )
}
