import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet, resolveAtMultiplier } from '../../../core/index.js'
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
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './mines.css'

const MINES_RULES: ReactNode[] = [
  'Set your bet and how many mines hide on the 25-tile grid (1–24), then hit Bet.',
  'Click tiles to uncover gems. Each safe gem raises your multiplier — the more mines, the bigger each step.',
  'Hit a mine and the round ends — you lose your bet.',
  'Cash Out any time to bank bet × your current multiplier. Uncover every gem and it auto-pays the top.',
  <>
    <strong>Payout = bet × the multiplier you cash out at.</strong> The mine layout is provably
    fair, fixed before you play.
  </>,
]

const MINE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1) // 1..24

/** Cashing out is instant; give the gem-pop / board a brief beat to settle
 *  before the win card appears. */
const POPUP_DELAY_MS = 150

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
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [mineCount, setMineCount] = useState(3)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [game, setGame] = useState<MinesGameState | null>(null)
  const [bustTile, setBustTile] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, redrawGame] = useReducer((n: number) => n + 1, 0)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)

  // If the player leaves with a live board, settle the open wager so its stake
  // never strands in `pending`: cash out at the board's current value (a board
  // with no safe reveals just refunds). Resolves through core in the background.
  useSettleOnExit(() => {
    if (game?.status === 'active') {
      resolveAtMultiplier(account, game.wager, Math.max(1, currentMultiplier(game)))
    }
  })

  // The mine layout's server seed now comes from the platform fairness AUTHORITY (commit hash
  // before play → reveal after), not a browser randomServerSeed(). The mine math is unchanged.
  async function start() {
    if (inFlightRef.current || game?.status === 'active') return
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const next = createMinesGame(account, {
        stake: bet,
        mineCount,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      setBustTile(null)
      setGame(next)
      onBalanceChange()
      play('bet')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
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
  const resolving = useResolving(account.id)

  return (
    <div className="mines">
      <section className="mines-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />
        {active && game!.revealed.length >= 1 && (
          <ProfitReadout
            total={Math.round(bet * currentMultiplier(game!))}
            multiplier={currentMultiplier(game!)}
          />
        )}

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
            {game!.revealed.length < 1 ? 'Pick a tile' : 'Cash Out'}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="mines-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="mines-error">
            Stake exceeds what you can wager ({formatPoints(available)}).
          </p>
        )}

        <Readout game={game} bet={bet} mineCount={mineCount} houseConfig={houseConfig} />
      </section>

      <section className="mines-board-wrap">
        <Board game={game} bustTile={bustTile} interactive={active} onPick={pick} />
        {game && (game.status === 'cashed' || game.status === 'cleared') && (
          <WinPopup
            key={game.wager.id}
            multiplier={currentMultiplier(game)}
            stake={game.wager.stake}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>

      <Rules points={MINES_RULES} />

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
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(n)))
  return (
    <label className="field">
      <span className="field-label">Bet amount</span>
      <div className="field-bet">
        <span className="field-prefix">$</span>
        <NumberInput
          className="field-input"
          value={value / 100}
          min={0.01}
          disabled={disabled}
          onCommit={(d) => onChange(toCents(d ?? 0))}
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
          <code className="seed">{game ? game.serverSeedHash : 'generated when you bet'}</code>
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

/** A big, shiny faceted green gem — transparent PNG, keeps the .gem glow + pop. */
function Gem() {
  return (
    <img
      src="/game-tiles/mines/gem.png"
      alt="gem"
      className="icon gem"
      draggable={false}
      aria-hidden="true"
    />
  )
}

function Mine({ hit = false }: { hit?: boolean }) {
  return (
    <img
      src={hit ? '/game-tiles/mines/bomb-hit.png' : '/game-tiles/mines/bomb.png'}
      alt={hit ? 'mine exploding' : 'mine'}
      className={`icon bomb ${hit ? 'mine-boom' : ''}`}
      draggable={false}
      aria-hidden="true"
    />
  )
}

/** Money to the penny; carries no real value (§1). Stored as integer cents. */
function formatPoints(cents: number): string {
  return formatMoney(cents)
}
