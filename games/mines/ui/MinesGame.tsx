import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  cashOut,
  createMinesGame,
  currentMultiplier,
  minesMultiplier,
  nextMultiplier,
  randomServerSeed,
  revealProof,
  revealTile,
  safeTiles,
  TOTAL_TILES,
  verifyMines,
  type MinesGame as MinesGameState,
} from '../index.js'
import './mines.css'

const MINE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1..24

interface MinesGameProps {
  account: Account
  /** Tell the shell the shared balance moved, so the header re-renders. */
  onBalanceChange: () => void
}

/**
 * The Mines vertical slice (CLAUDE.md §7) — one clean view, one primary action.
 * All money flows through `core` via the engine; this component holds no points.
 */
export function MinesGame({ account, onBalanceChange }: MinesGameProps) {
  const [bet, setBet] = useState(10)
  const [mineCount, setMineCount] = useState(3)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<MinesGameState | null>(null)
  const [bustTile, setBustTile] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, redrawGame] = useReducer((n: number) => n + 1, 0)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = availableToWager(account)

  function start() {
    setError(null)
    try {
      nonceRef.current += 1
      const next = createMinesGame(account, {
        stake: bet,
        mineCount,
        clientSeed,
        nonce: nonceRef.current,
      })
      setBustTile(null)
      setGame(next)
      onBalanceChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function pick(tile: number) {
    if (!game || game.status !== 'active' || game.revealed.includes(tile)) return
    const res = revealTile(account, game, tile)
    if (res.hitMine) setBustTile(tile)
    redrawGame() // engine mutates `game` in place; force the grid to repaint
    onBalanceChange()
  }

  function cash() {
    if (!game || game.status !== 'active' || game.revealed.length < 1) return
    cashOut(account, game)
    redrawGame()
    onBalanceChange()
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh

  return (
    <div className="mines">
      <section className="mines-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />

        <label className="field">
          <span className="field-label">Mines</span>
          <select
            className="field-input"
            value={mineCount}
            disabled={!idle}
            onChange={(e) => setMineCount(Number(e.target.value))}
          >
            {MINE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {active ? (
          <button
            className="action action-cashout"
            onClick={cash}
            disabled={game!.revealed.length < 1}
          >
            {game!.revealed.length < 1 ? (
              'Pick a tile'
            ) : (
              <>
                Cash Out{' '}
                <strong>{formatPoints(Math.round(bet * (currentMultiplier(game!) - 1)))}</strong>
              </>
            )}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid}>
            Bet
          </button>
        )}

        {error && <p className="mines-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="mines-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}

        <Readout game={game} bet={bet} mineCount={mineCount} />
      </section>

      <section className="mines-board-wrap">
        <Board
          game={game}
          bustTile={bustTile}
          interactive={active}
          onPick={pick}
        />
      </section>

      <Fairness
        game={game}
        ended={ended}
        clientSeed={clientSeed}
        editable={idle}
        nextNonce={nonceRef.current + (idle ? 1 : 0)}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

function BetField({
  value,
  disabled,
  max,
  onChange,
}: {
  value: number
  disabled: boolean
  max: number
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.floor(n)))
  return (
    <label className="field">
      <span className="field-label">Bet amount</span>
      <div className="field-bet">
        <span className="field-prefix">$</span>
        <input
          className="field-input"
          type="number"
          min={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.floor(Number(e.target.value)) || 0)}
        />
        <button className="chip" disabled={disabled} onClick={() => onChange(clamp(value / 2))}>
          ½
        </button>
        <button className="chip" disabled={disabled} onClick={() => onChange(clamp(value * 2))}>
          2×
        </button>
      </div>
    </label>
  )
}

function Readout({
  game,
  bet,
  mineCount,
}: {
  game: MinesGameState | null
  bet: number
  mineCount: number
}) {
  // Before a round: preview the first-gem multiplier for the chosen mine count.
  if (!game) {
    return (
      <dl className="readout">
        <Stat label="Gems" value={`${safeTiles(mineCount)}`} />
        <Stat label="Next tile" value={`${minesMultiplier(mineCount, 1).toFixed(2)}×`} />
      </dl>
    )
  }
  const cur = currentMultiplier(game)
  const nxt = nextMultiplier(game)
  if (game.status === 'busted') {
    return <p className="readout-result is-loss">Hit a mine — lost {formatPoints(bet)}.</p>
  }
  if (game.status === 'cashed' || game.status === 'cleared') {
    return (
      <p className="readout-result is-win">
        {game.status === 'cleared' ? 'Cleared the board! ' : 'Cashed out '}
        {cur.toFixed(2)}× · won {formatPoints(Math.round(game.wager.stake * (cur - 1)))}
      </p>
    )
  }
  return (
    <dl className="readout">
      <Stat label="Current" value={`${cur.toFixed(2)}×`} highlight />
      <Stat label="Next tile" value={nxt == null ? '—' : `${nxt.toFixed(2)}×`} />
    </dl>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="stat">
      <dt className="stat-label">{label}</dt>
      <dd className={`stat-value ${highlight ? 'is-hot' : ''}`}>{value}</dd>
    </div>
  )
}

function Board({
  game,
  bustTile,
  interactive,
  onPick,
}: {
  game: MinesGameState | null
  bustTile: number | null
  interactive: boolean
  onPick: (tile: number) => void
}) {
  const ended = game != null && game.status !== 'active'
  return (
    <div className="board">
      {Array.from({ length: TOTAL_TILES }, (_, i) => {
        const revealed = game?.revealed.includes(i) ?? false
        const isMine = game?.mines.includes(i) ?? false
        let kind: 'hidden' | 'gem' | 'gem-dim' | 'mine' | 'mine-hit' = 'hidden'
        if (revealed) kind = 'gem'
        else if (ended && isMine) kind = i === bustTile ? 'mine-hit' : 'mine'
        else if (ended && !isMine) kind = 'gem-dim'

        return (
          <button
            key={i}
            className={`tile tile-${kind}`}
            disabled={!interactive || revealed}
            onClick={() => onPick(i)}
            aria-label={`tile ${i + 1}`}
          >
            {(kind === 'gem' || kind === 'gem-dim') && <Gem />}
            {(kind === 'mine' || kind === 'mine-hit') && <Mine />}
          </button>
        )
      })}
    </div>
  )
}

function Fairness({
  game,
  ended,
  clientSeed,
  editable,
  nextNonce,
  onClientSeed,
}: {
  game: MinesGameState | null
  ended: boolean
  clientSeed: string
  editable: boolean
  nextNonce: number
  onClientSeed: (s: string) => void
}) {
  const proof = ended && game ? revealProof(game) : null
  const verified = useMemo(
    () =>
      proof
        ? verifyMines(proof.serverSeed, proof.clientSeed, proof.nonce, proof.mineCount, proof.mines)
        : null,
    [proof],
  )

  return (
    <details className="fairness">
      <summary>Provably fair</summary>
      <div className="fairness-body">
        <Row label="Client seed">
          <input
            className="seed-input"
            value={clientSeed}
            disabled={!editable}
            onChange={(e) => onClientSeed(e.target.value)}
          />
        </Row>
        <Row label="Nonce">{game && !ended ? game.nonce : nextNonce}</Row>
        <Row label="Server seed (hashed)">
          <code className="seed">{game ? game.serverSeedHash : 'committed when you bet'}</code>
        </Row>
        {proof && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{proof.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ layout matches the committed seed' : '✗ mismatch'}
              </span>
            </Row>
          </>
        )}
      </div>
    </details>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fair-row">
      <span className="fair-label">{label}</span>
      <span className="fair-value">{children}</span>
    </div>
  )
}

function Gem() {
  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <path d="M12 2 22 9l-10 13L2 9 12 2z" fill="currentColor" opacity="0.9" />
      <path d="M12 2 22 9l-10 4L2 9 12 2z" fill="#fff" opacity="0.25" />
    </svg>
  )
}

function Mine() {
  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <circle cx="12" cy="13" r="7" fill="currentColor" />
      <rect x="11" y="2.5" width="2" height="4" rx="1" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="1.6" fill="#fff" opacity="0.5" />
    </svg>
  )
}

/** Points displayed with "$" but no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
