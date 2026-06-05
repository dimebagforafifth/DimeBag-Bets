import { useReducer, useRef, useState } from 'react'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import {
  DEFAULT_HOUSE_CONFIG as DEFAULT_MINES_CONFIG,
  type MinesHouseConfig,
} from '../games/mines/index.js'
import { MinesGame } from '../games/mines/ui/MinesGame.js'
import {
  DEFAULT_CRASH_CONFIG,
  type CrashHouseConfig,
} from '../games/crash/index.js'
import { CrashGame } from '../games/crash/ui/CrashGame.js'

/**
 * Manager-controlled house settings (the vig). Today these are the shipping
 * defaults; at roll-up an admin panel / Supabase settings row feeds this single
 * source of truth — game logic never changes, only these values. Per game,
 * since each tunes its vig differently (Mines: edge + rounding; Crash: a base
 * plus a small manager spread that moves only probability).
 */
const MINES_CONFIG: MinesHouseConfig = DEFAULT_MINES_CONFIG
const CRASH_CONFIG: CrashHouseConfig = DEFAULT_CRASH_CONFIG

type GameKey = 'mines' | 'crash'
const GAMES: { key: GameKey; label: string }[] = [
  { key: 'mines', label: 'Mines' },
  { key: 'crash', label: 'Crash' },
]

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
  const [active, setActive] = useState<GameKey>('mines')
  const account = accountRef.current

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          DimeBag<span className="brand-dot">·</span>Bets
        </div>
        <nav className="game-switch">
          {GAMES.map((g) => (
            <button
              key={g.key}
              className={`game-tab ${active === g.key ? 'is-active' : ''}`}
              onClick={() => setActive(g.key)}
            >
              {g.label}
            </button>
          ))}
        </nav>
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
        {active === 'mines' ? (
          <MinesGame account={account} houseConfig={MINES_CONFIG} onBalanceChange={refresh} />
        ) : (
          <CrashGame account={account} houseConfig={CRASH_CONFIG} onBalanceChange={refresh} />
        )}
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
