import { useReducer, useRef } from 'react'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import { DEFAULT_HOUSE_CONFIG, type MinesHouseConfig } from '../games/mines/index.js'
import { MinesGame } from '../games/mines/ui/MinesGame.js'

/**
 * Manager-controlled house settings (the vig + rounding policy). Today this is
 * the shipping default (1% edge, floored = slightly house-favorable). At roll-up
 * an admin panel / Supabase settings row feeds this single source of truth —
 * game logic never changes, only this value.
 */
const HOUSE_CONFIG: MinesHouseConfig = DEFAULT_HOUSE_CONFIG

/**
 * The app shell (CLAUDE.md §5). For Phase 0 it owns the one shared account —
 * the single balance every module reads/writes via `core` (§3). At roll-up
 * (Phase 2) this is where auth + more games/sportsbook hang off the same
 * account; games stay unaware of each other.
 */
export function App() {
  // core mutates the account in place, so hold it in a ref and re-render on demand.
  const accountRef = useRef<Account>({
    id: 'demo-player',
    creditLimit: 1000,
    balance: 0,
    pending: 0,
  })
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const account = accountRef.current

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          DimeBag<span className="brand-dot">·</span>Bets
        </div>
        <div className="figure">
          <div className="figure-block">
            <span className="figure-label">Balance</span>
            <span className={`figure-value ${account.balance < 0 ? 'is-down' : ''}`}>
              {formatPoints(account.balance)}
            </span>
          </div>
          <div className="figure-block">
            <span className="figure-label">To wager</span>
            <span className="figure-value">{formatPoints(availableToWager(account))}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <MinesGame account={account} houseConfig={HOUSE_CONFIG} onBalanceChange={refresh} />
      </main>

      <footer className="app-footer">
        Points only — no real-money value, no buy-in, no cash-out.
      </footer>
    </div>
  )
}

/** Points are shown with a "$" but carry no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
