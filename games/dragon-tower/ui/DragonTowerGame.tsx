import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet, resolveAtMultiplier } from '../../../core/index.js'
import {
  cashOut,
  createTowerGame,
  currentMultiplier,
  DEFAULT_HOUSE_CONFIG,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  nextMultiplier,
  pickTile,
  randomServerSeed,
  revealProof,
  ROWS,
  towerMultiplier,
  verifyTower,
  type TowerDifficulty,
  type TowerGame as TowerGameState,
  type TowerHouseConfig,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play } from '../../../features/sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './dragon-tower.css'

/** Let the climb/settle read on the board before the win card appears. */
const POPUP_DELAY_MS = 220

const TOWER_RULES: ReactNode[] = [
  <>
    <u>Set your bet, pick a difficulty, and hit Bet</u> to start a climb.
  </>,
  <>
    <u>Five difficulties, from Easy to Master.</u> Easier modes give safer picks and a steady climb;
    harder modes are riskier but pay much more each row.
  </>,
  <>
    The tower is 9 rows tall. In each row, <u>tap one tile</u>: find an egg 🥚 to move up, but avoid
    the skull 💀.
  </>,
  <>
    <u>Every egg climbs you one row and raises your multiplier.</u> Each row up is worth more than
    the last.
  </>,
  <>
    <u>Hit a skull and the climb ends — you lose your bet.</u> So the higher you go, the more you’re
    risking.
  </>,
  <>
    <u>Press Cash Out after any row to bank your winnings.</u> Reach the top row and it auto-pays
    the max multiplier.
  </>,
  <>
    <strong>Payout = bet × the multiplier you cash out at.</strong> The whole tower is provably fair
    — fixed before you start climbing.
  </>,
]

interface DragonTowerProps {
  account: Account
  houseConfig?: TowerHouseConfig
  onBalanceChange: () => void
}

/**
 * The Dragon Tower vertical slice (CLAUDE.md §7) — one clean view, one primary
 * action. All money flows through `core` via the engine; this component holds
 * no points.
 */
export function DragonTowerGame({
  account,
  houseConfig = DEFAULT_HOUSE_CONFIG,
  onBalanceChange,
}: DragonTowerProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [difficulty, setDifficulty] = useState<TowerDifficulty>('medium')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [game, setGame] = useState<TowerGameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)

  // If the player leaves mid-climb, cash out at the current row's value so the
  // stake never strands in pending (a tower with no picks just refunds). Background.
  useSettleOnExit(() => {
    if (game?.status === 'active') {
      resolveAtMultiplier(account, game.wager, Math.max(1, currentMultiplier(game)))
    }
  })

  // The tower layout's server seed now comes from the platform fairness AUTHORITY (commit hash
  // before play → reveal after), not a browser randomServerSeed(). The tower math is unchanged.
  async function start() {
    if (inFlightRef.current || game?.status === 'active') return
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const next = createTowerGame(account, {
        stake: bet,
        difficulty,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
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
    if (!game || game.status !== 'active') return
    const res = pickTile(account, game, tile)
    if (res.hitSkull) play('boom')
    else if (res.status === 'cleared') play('win')
    else play('reveal', { step: game.picks.length })
    redraw()
    onBalanceChange()
  }

  function cash() {
    if (!game || game.status !== 'active' || game.picks.length < 1) return
    cashOut(account, game)
    play('win')
    redraw()
    onBalanceChange()
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh
  const resolving = useResolving(account.id)
  const canCash = active && game!.picks.length >= 1

  return (
    <div className="tower">
      <section className="tower-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />
        {canCash && (
          <ProfitReadout
            total={Math.round(bet * currentMultiplier(game!))}
            multiplier={currentMultiplier(game!)}
          />
        )}

        <label className="field">
          <span className="field-label">Difficulty</span>
          <select
            className="field-input"
            value={difficulty}
            disabled={!idle}
            onChange={(e) => setDifficulty(e.target.value as TowerDifficulty)}
          >
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTIES[d].label}
              </option>
            ))}
          </select>
        </label>

        {active ? (
          <button className="action action-cashout" onClick={cash} disabled={!canCash}>
            {canCash ? 'Cash Out' : 'Pick a tile to climb'}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="tower-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="tower-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}

        <Readout game={game} bet={bet} difficulty={difficulty} houseConfig={houseConfig} />
      </section>

      <section className="tower-stage">
        <Tower game={game} difficulty={difficulty} houseConfig={houseConfig} onPick={pick} />
        {game && (game.status === 'cashed' || game.status === 'cleared') && (
          <WinPopup
            key={game.wager.id}
            multiplier={currentMultiplier(game)}
            stake={game.wager.stake}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>

      <Rules points={TOWER_RULES} />

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
  difficulty,
  houseConfig,
}: {
  game: TowerGameState | null
  bet: number
  difficulty: TowerDifficulty
  houseConfig: TowerHouseConfig
}) {
  if (!game) {
    return (
      <dl className="readout">
        <Stat
          label="First row"
          value={`${towerMultiplier(difficulty, 1, houseConfig).toFixed(2)}×`}
        />
        <Stat
          label="Top row"
          value={`${towerMultiplier(difficulty, ROWS, houseConfig).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}×`}
        />
      </dl>
    )
  }
  const cur = currentMultiplier(game)
  const nxt = nextMultiplier(game)
  if (game.status === 'busted') {
    return <p className="readout-result is-loss">Hit a skull — lost {formatMoney(bet)}.</p>
  }
  if (game.status === 'cashed' || game.status === 'cleared') {
    return (
      <p className="readout-result is-win">
        {game.status === 'cleared' ? 'Reached the top! ' : 'Cashed out '}
        {cur.toFixed(2)}× · won {formatMoney(Math.round(game.wager.stake * (cur - 1)))}
      </p>
    )
  }
  return (
    <dl className="readout">
      <Stat label="Current" value={`${cur.toFixed(2)}×`} highlight />
      <Stat label="Next row" value={nxt == null ? '—' : `${nxt.toFixed(2)}×`} />
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

type TileKind = 'hidden' | 'locked' | 'egg-up' | 'egg-dim' | 'skull' | 'skull-hit'

function Tower({
  game,
  difficulty,
  houseConfig,
  onPick,
}: {
  game: TowerGameState | null
  difficulty: TowerDifficulty
  houseConfig: TowerHouseConfig
  onPick: (tile: number) => void
}) {
  const diff = game?.difficulty ?? difficulty
  const tiles = DIFFICULTIES[diff].tiles
  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const lvl = game?.picks.length ?? 0

  function kindOf(row: number, tile: number): TileKind {
    if (!game) return row === 0 ? 'hidden' : 'locked' // preview: bottom row "ready"
    const skull = game.layout[row].includes(tile)
    const picked = row < lvl && game.picks[row] === tile
    if (picked) return 'egg-up'
    if (active && row === lvl) return 'hidden'
    if (row < lvl || ended) {
      if (skull)
        return ended && game.bustRow === row && game.bustTile === tile ? 'skull-hit' : 'skull'
      return 'egg-dim'
    }
    return 'locked'
  }

  // Render top row first (row index ROWS-1 down to 0): you climb upward.
  const rows = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)

  return (
    <div className={`tower-grid is-${diff}`}>
      {rows.map((row) => {
        const target = active && row === lvl
        const mult = towerMultiplier(diff, row + 1, houseConfig)
        return (
          <div
            key={row}
            className={`tower-row ${target ? 'is-target' : ''} ${row < lvl ? 'is-done' : ''}`}
          >
            <span className="tower-mult">{mult.toFixed(2)}×</span>
            <div className="tower-tiles">
              {Array.from({ length: tiles }, (_, tile) => {
                const kind = kindOf(row, tile)
                const interactive = active && row === lvl && kind === 'hidden'
                return (
                  <button
                    key={tile}
                    className={`ttile ttile-${kind}`}
                    disabled={!interactive}
                    onClick={() => interactive && onPick(tile)}
                    aria-label={`row ${row + 1} tile ${tile + 1}`}
                  >
                    {(kind === 'egg-up' || kind === 'egg-dim') && <Egg />}
                    {(kind === 'skull' || kind === 'skull-hit') && (
                      <Skull hit={kind === 'skull-hit'} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
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
  game: TowerGameState | null
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
        ? verifyTower(
            proof.serverSeed,
            proof.clientSeed,
            proof.nonce,
            proof.difficulty,
            proof.layout,
          )
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
                {verified ? '✓ tower matches the committed seed' : '✗ mismatch'}
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

/** A glowing dragon egg — the safe pick. A jewel-bright golden shell with scale
 *  ridges, a hot specular highlight, and a twinkle. */
function Egg() {
  return (
    <svg viewBox="0 0 24 24" className="icon egg" aria-hidden="true">
      <defs>
        <radialGradient id="eggBody" cx="36%" cy="26%" r="85%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="28%" stopColor="#ffd84d" />
          <stop offset="64%" stopColor="#ff9f2e" />
          <stop offset="100%" stopColor="#b5530c" />
        </radialGradient>
      </defs>
      <path
        className="egg-shell"
        d="M12 2.3 C 16.6 2.3, 19.7 9, 19.7 14 C 19.7 18.6, 16.3 21.7, 12 21.7 C 7.7 21.7, 4.3 18.6, 4.3 14 C 4.3 9, 7.4 2.3, 12 2.3 Z"
        fill="url(#eggBody)"
      />
      {/* scale ridges across the shell */}
      <g fill="#9c4a08" opacity="0.32">
        <path d="M7.6 11.8 q4.4 -3 8.8 0 q-4.4 2.1 -8.8 0Z" />
        <path d="M7.1 15.4 q4.9 -3 9.8 0 q-4.9 2.2 -9.8 0Z" />
      </g>
      {/* hot specular highlight + a sparkle twinkle */}
      <ellipse cx="9.2" cy="7.4" rx="2.5" ry="1.6" fill="#fff8e6" opacity="0.85" />
      <path
        className="egg-glint"
        d="M14.8 8.4 l0.6 1.6 1.6 0.6 -1.6 0.6 -0.6 1.6 -0.6 -1.6 -1.6 -0.6 1.6 -0.6 Z"
        fill="#fffbe9"
      />
    </svg>
  )
}

/** A horned beast-skull with burning eyes — the bad pick that ends the climb.
 *  On-theme for the dragon's tower; the eyes blaze and flare on a hit. */
function Skull({ hit = false }: { hit?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon skull ${hit ? 'skull-boom' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id="skullEye" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#fff1b0" />
          <stop offset="38%" stopColor="#ff7a18" />
          <stop offset="100%" stopColor="#b00018" />
        </radialGradient>
      </defs>
      {/* curved horns */}
      <path d="M7 5.4 C 5.2 3.9, 4.5 2.4, 5 1.3 C 6.4 2.2, 7.5 3.6, 7.9 5.3 Z" fill="#cdd6df" />
      <path
        d="M17 5.4 C 18.8 3.9, 19.5 2.4, 19 1.3 C 17.6 2.2, 16.5 3.6, 16.1 5.3 Z"
        fill="#cdd6df"
      />
      {/* cranium + jaw */}
      <path
        d="M12 3 C 7.3 3, 4 6.3, 4 10.6 C 4 13.2, 5.2 15, 6.8 16 L 6.8 18.4 C 6.8 19.3, 7.5 20, 8.4 20 L 15.6 20 C 16.5 20, 17.2 19.3, 17.2 18.4 L 17.2 16 C 18.8 15, 20 13.2, 20 10.6 C 20 6.3, 16.7 3, 12 3 Z"
        fill="#eef3f7"
      />
      {/* burning eye sockets */}
      <circle className="skull-eye" cx="9" cy="11" r="2.4" fill="url(#skullEye)" />
      <circle className="skull-eye" cx="15" cy="11" r="2.4" fill="url(#skullEye)" />
      {/* nose + teeth */}
      <path d="M12 13.3 l1.4 2.4 -2.8 0 Z" fill="#1b2733" />
      <rect x="9.2" y="17.6" width="1.2" height="2.4" rx="0.4" fill="#c2ccd6" />
      <rect x="11.4" y="17.6" width="1.2" height="2.4" rx="0.4" fill="#c2ccd6" />
      <rect x="13.6" y="17.6" width="1.2" height="2.4" rx="0.4" fill="#c2ccd6" />
    </svg>
  )
}
