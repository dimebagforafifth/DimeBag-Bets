import { useReducer, useRef, useState, type CSSProperties } from 'react'
import type { Account } from '../core/index.js'
import { availableToWager } from '../core/index.js'
import { GAMES, findGame } from './games.js'

/**
 * The app shell (CLAUDE.md §5). It owns the one shared account — the single
 * balance every game reads/writes via `core` (§3) — and routes between the
 * Casino lobby and an individual game page. Games are fully separate (each in
 * its own module, mounted one at a time); the only thing they share is the
 * balance. At roll-up this is where auth and the wider casino/sportsbook nav
 * hang off the same account.
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
  // null = the Casino lobby; otherwise the active game's key.
  const [route, setRoute] = useState<string | null>(null)
  const account = accountRef.current
  const game = findGame(route)

  return (
    <div className="app">
      <header className="app-header">
        <button className="brand" onClick={() => setRoute(null)}>
          DimeBag<span className="brand-dot">·</span>Bets
        </button>
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
        {game ? (
          <div className="game-page">
            <button className="crumb" onClick={() => setRoute(null)}>
              ← Casino
            </button>
            <game.Component account={account} onBalanceChange={refresh} />
          </div>
        ) : (
          <Lobby onPlay={setRoute} />
        )}
      </main>

      <footer className="app-footer">
        Points only — no real-money value, no buy-in, no cash-out.
      </footer>
    </div>
  )
}

/** The Casino hub: every registered game as a card. One tap opens its page. */
function Lobby({ onPlay }: { onPlay: (key: string) => void }) {
  return (
    <div className="lobby">
      <div className="lobby-head">
        <h1 className="lobby-title">Casino</h1>
        <p className="lobby-sub">Provably-fair originals — one balance across every game.</p>
      </div>
      <div className="lobby-grid">
        {GAMES.map((g) => (
          <button
            key={g.key}
            className="game-card"
            style={{ '--accent': g.accent } as CSSProperties}
            onClick={() => onPlay(g.key)}
          >
            <span className="card-icon">
              <GameIcon kind={g.key} />
            </span>
            <span className="card-name">{g.name}</span>
            <span className="card-tag">{g.tagline}</span>
            <span className="card-play">Play →</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function GameIcon({ kind }: { kind: string }) {
  if (kind === 'crash') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14 3c3.5 1.5 5.5 5 5 9l-3.5 3.5-4-4L15 8a4 4 0 0 0-1-5z"
          fill="currentColor"
        />
        <path d="M9.5 14.5 7 17m2-5-3 1 1.5 3 3-1z" fill="currentColor" opacity="0.6" />
        <circle cx="14.5" cy="8.5" r="1.4" fill="#0a1622" />
      </svg>
    )
  }
  // gem (mines)
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 22 9l-10 13L2 9 12 2z" fill="currentColor" />
      <path d="M12 2 22 9l-10 4L2 9 12 2z" fill="#fff" opacity="0.25" />
    </svg>
  )
}

/** Points are shown with a "$" but carry no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
