import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  cashOut,
  createMinesGame,
  currentMultiplier,
  DEFAULT_HOUSE_CONFIG,
  minesMultiplier,
  nextMultiplier,
  randomServerSeed,
  revealProof,
  revealTile,
  safeTiles,
  TOTAL_TILES,
  verifyMines,
  type MinesGame as MinesGameState,
  type MinesHouseConfig,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { play } from '../../../sound/index.js'
import './mines.css'

const MINE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1..24

interface MinesGameProps {
  account: Account
  /** Manager-controlled house settings (vig); falls back to the default. */
  houseConfig?: MinesHouseConfig
  /** Tell the shell the shared balance moved, so the header re-renders. */
  onBalanceChange: () => void
}

/**
 * The Mines vertical slice (CLAUDE.md §7) — one clean view, one primary action.
 * All money flows through `core` via the engine; this component holds no points.
 */
export function MinesGame({
  account,
  houseConfig = DEFAULT_HOUSE_CONFIG,
  onBalanceChange,
}: MinesGameProps) {
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
        config: houseConfig,
      })
      setBustTile(null)
      setGame(next)
      onBalanceChange()
      play('bet')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function pick(tile: number) {
    if (!game || game.status !== 'active' || game.revealed.includes(tile)) return
    const res = revealTile(account, game, tile)
    if (res.hitMine) {
      setBustTile(tile)
      play('boom')
    } else if (res.status === 'cleared') {
      play('win') // last safe tile auto-resolves the round as a win
    } else {
      play('reveal', { step: game.revealed.length }) // ladders up per safe pick
    }
    redrawGame() // engine mutates `game` in place; force the grid to repaint
    onBalanceChange()
  }

  function cash() {
    if (!game || game.status !== 'active' || game.revealed.length < 1) return
    cashOut(account, game)
    play('win')
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

        <Readout game={game} bet={bet} mineCount={mineCount} houseConfig={houseConfig} />
      </section>

      <section className="mines-board-wrap">
        <Board game={game} bustTile={bustTile} interactive={active} onPick={pick} />
        {game && (game.status === 'cashed' || game.status === 'cleared') && (
          <WinPopup
            multiplier={currentMultiplier(game)}
            amount={Math.round(game.wager.stake * (currentMultiplier(game) - 1))}
          />
        )}
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
  houseConfig,
}: {
  game: MinesGameState | null
  bet: number
  mineCount: number
  houseConfig: MinesHouseConfig
}) {
  // Before a round: preview the first-gem multiplier for the chosen mine count.
  if (!game) {
    return (
      <dl className="readout">
        <Stat label="Gems" value={`${safeTiles(mineCount)}`} />
        <Stat
          label="Next tile"
          value={`${minesMultiplier(mineCount, 1, houseConfig).toFixed(2)}×`}
        />
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
            {(kind === 'mine' || kind === 'mine-hit') && <Mine hit={kind === 'mine-hit'} />}
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

/** A big, shiny faceted green gem — table + crown + pavilion facets, sparkles. */
function Gem() {
  return (
    <svg viewBox="0 0 24 24" className="icon gem" aria-hidden="true">
      {/* crown body behind the facets */}
      <polygon className="gem-crown" points="3,9 7,3 17,3 21,9" />
      {/* pavilion (lower) facets — alternating shades for depth */}
      <polygon className="gem-p1" points="3,9 8,9 12,22" />
      <polygon className="gem-p2" points="8,9 12,9 12,22" />
      <polygon className="gem-p3" points="12,9 16,9 12,22" />
      <polygon className="gem-p4" points="16,9 21,9 12,22" />
      {/* table (top, brightest) + crown side facets */}
      <polygon className="gem-table" points="6,9 7,3 17,3 18,9" />
      <polygon className="gem-cl" points="3,9 7,3 6,9" />
      <polygon className="gem-cr" points="21,9 17,3 18,9" />
      {/* glossy streak across the table */}
      <polygon className="gem-gloss" points="8,4 14,4 13,6 9,6" opacity="0.55" />
      {/* girdle line */}
      <line className="gem-girdle" x1="3" y1="9" x2="21" y2="9" strokeWidth="0.6" opacity="0.4" />
      {/* sparkles */}
      <path className="gem-sparkle gem-spark" d="M10 5.2 L10.7 6.6 L12.1 7.3 L10.7 8 L10 9.4 L9.3 8 L7.9 7.3 L9.3 6.6 Z" />
      <circle className="gem-spark" cx="15.5" cy="6" r="0.7" opacity="0.9" />
    </svg>
  )
}

function Mine({ hit = false }: { hit?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon bomb ${hit ? 'mine-boom' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id="bombBody" cx="37%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#5c6573" />
          <stop offset="45%" stopColor="#2a313b" />
          <stop offset="100%" stopColor="#0c1015" />
        </radialGradient>
      </defs>

      {hit && (
        <g className="boom-spikes">
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 9
            return (
              <line
                key={i}
                x1={12 + Math.cos(a) * 8}
                y1={14 + Math.sin(a) * 8}
                x2={12 + Math.cos(a) * 13}
                y2={14 + Math.sin(a) * 13}
              />
            )
          })}
        </g>
      )}

      {/* fuse cap + curved fuse + burning spark */}
      <rect x="10.6" y="3.4" width="2.8" height="3.2" rx="0.7" fill="#3a414c" />
      <path
        d="M12.4 4 C 15.5 1.2, 19 2.4, 19 5.4"
        fill="none"
        stroke="#b9924c"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <g className="bomb-spark">
        <circle cx="19" cy="5.4" r="2.1" fill="#ff9d2a" opacity="0.55" />
        <circle cx="19" cy="5.4" r="1.3" fill="#ffd24a" />
        <circle cx="19" cy="5.4" r="0.6" fill="#fff7da" />
      </g>

      {/* sphere body with specular highlight */}
      <circle cx="12" cy="14.5" r="8" fill="url(#bombBody)" />
      <ellipse cx="9" cy="11.4" rx="2.6" ry="1.7" fill="#ffffff" opacity="0.3" />
      <circle cx="8.4" cy="10.9" r="0.8" fill="#ffffff" opacity="0.9" />
    </svg>
  )
}

/** Points displayed with "$" but no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
