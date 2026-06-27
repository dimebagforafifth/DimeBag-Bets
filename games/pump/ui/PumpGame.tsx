import { assetUrl } from '../../shared/assetUrl.js'
import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet, resolveAtMultiplier } from '../../../core/index.js'
import {
  cashOut,
  createPumpGame,
  currentMultiplier,
  DEFAULT_HOUSE_CONFIG,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  maxPumps,
  nextMultiplier,
  pump,
  pumpMultiplier,
  randomServerSeed,
  revealProof,
  verifyPops,
  type PumpDifficulty,
  type PumpGame as PumpGameState,
  type PumpHouseConfig,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import './pump.css'

/** Let the burst/settle read on the stage before the win card appears. */
const POPUP_DELAY_MS = 220

/** After a pop, the burst is on screen instantly; release the ledger/lock after a
 *  short beat so the burst registers — instead of idling on the long safety ceiling
 *  and leaving the player waiting to start the next round. */
const POP_REVEAL_MS = 280

const PUMP_RULES: ReactNode[] = [
  'Set your bet, pick a difficulty (Easy, Medium, Hard or Expert), then hit Bet.',
  'The balloon has 25 hidden spots, and each pump opens the next one. A safe spot inflates the balloon a little more and raises your multiplier.',
  'Some of those spots are pops — Easy hides 1, Medium hides 3, Hard hides 5, Expert hides 10. Open a pop and the balloon bursts and you lose your bet. The more pops a mode hides, the more likely each pump bursts — but the faster the multiplier climbs.',
  'Cash Out any time to keep your winnings. Open every safe spot and it auto-pays the top multiplier.',
  <>
    <strong>Payout = bet × the multiplier you cash out at.</strong> Where the pops hide is set by a
    provably-fair seed, locked in before your first pump.
  </>,
]

interface PumpProps {
  account: Account
  houseConfig?: PumpHouseConfig
  onBalanceChange: () => void
}

/**
 * The Pump vertical slice (CLAUDE.md §7) — one clean view, one primary action.
 * All money flows through `core` via the engine; this component holds no points.
 */
export function PumpGame({
  account,
  houseConfig = DEFAULT_HOUSE_CONFIG,
  onBalanceChange,
}: PumpProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [difficulty, setDifficulty] = useState<PumpDifficulty>('medium')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [game, setGame] = useState<PumpGameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pumpTick, setPumpTick] = useState(0) // bumps on EVERY pump (incl. the popping one) to replay the plunger slam
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)

  // If the player leaves mid-inflate, cash the balloon out at its current value so
  // the stake never strands in pending (no pumps yet just refunds). Background.
  useSettleOnExit(() => {
    if (game?.status === 'active') {
      resolveAtMultiplier(account, game.wager, Math.max(1, currentMultiplier(game)))
    }
  })

  // The pop layout's server seed now comes from the platform fairness AUTHORITY (commit hash
  // before play → reveal after), not a browser randomServerSeed(). The pop math is unchanged.
  async function start() {
    if (inFlightRef.current || game?.status === 'active') return
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const next = createPumpGame(account, {
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

  function doPump() {
    if (!game || game.status !== 'active') return
    const res = pump(account, game)
    setPumpTick((t) => t + 1) // slam the plunger + shoot a puff of air, every press
    if (res.popped) {
      play('pop') // a real balloon burst, not the soft loss thud
      // the pop is on screen instantly; release its ledger entry / the resolving
      // lock after a short beat so you're not stuck waiting on the safety ceiling
      window.setTimeout(() => signalReveal(account.id), POP_REVEAL_MS)
    } else if (res.status === 'maxed') {
      play('win')
      signalReveal(account.id) // cleared every safe cell — the win is on screen now
    } else play('pump', { step: game.pumps }) // air being forced in, tightening each pump
    redraw()
    onBalanceChange()
  }

  function cash() {
    if (!game || game.status !== 'active' || game.pumps < 1) return
    cashOut(account, game)
    signalReveal(account.id) // win is on screen instantly → release its ledger entry now
    play('win')
    redraw()
    onBalanceChange()
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh
  const resolving = useResolving(account.id)
  const canCash = active && game!.pumps >= 1
  const canPump = active && game!.pumps < game!.maxPumps

  return (
    <div className="pump">
      <section className="pump-panel">
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
            onChange={(e) => setDifficulty(e.target.value as PumpDifficulty)}
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
            {canCash ? 'Cash Out' : 'Pump to start climbing'}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="pump-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="pump-error">Stake exceeds what you can wager ({formatMoney(available)}).</p>
        )}

        <Readout game={game} bet={bet} difficulty={difficulty} houseConfig={houseConfig} />
      </section>

      <section className="pump-stage">
        <Balloon
          game={game}
          difficulty={difficulty}
          tick={pumpTick}
          onPump={doPump}
          canPump={canPump}
        />
        <button className="pump-btn" onClick={doPump} disabled={!canPump}>
          {active ? 'Pump' : 'Place a bet to pump'}
        </button>
        {game && (game.status === 'cashed' || game.status === 'maxed') && (
          <WinPopup
            key={game.wager.id}
            multiplier={currentMultiplier(game)}
            stake={game.wager.stake}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>

      <Rules points={PUMP_RULES} />

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
  game: PumpGameState | null
  bet: number
  difficulty: PumpDifficulty
  houseConfig: PumpHouseConfig
}) {
  if (!game) {
    return (
      <dl className="readout">
        <Stat
          label="First pump"
          value={`${compact(pumpMultiplier(difficulty, 1, houseConfig))}×`}
        />
        <Stat
          label="Top win"
          value={`${compact(pumpMultiplier(difficulty, maxPumps(difficulty), houseConfig))}×`}
        />
      </dl>
    )
  }
  const cur = currentMultiplier(game)
  const nxt = nextMultiplier(game)
  if (game.status === 'popped') {
    return <p className="readout-result is-loss">Popped — lost {formatMoney(bet)}.</p>
  }
  if (game.status === 'cashed' || game.status === 'maxed') {
    return (
      <p className="readout-result is-win">
        {game.status === 'maxed' ? 'Maxed out! ' : 'Cashed out '}
        {cur.toFixed(2)}× · won {formatMoney(Math.round(game.wager.stake * (cur - 1)))}
      </p>
    )
  }
  return (
    <dl className="readout">
      <Stat label="Current" value={`${cur.toFixed(2)}×`} highlight />
      <Stat label="Next pump" value={nxt == null ? '—' : `${nxt.toFixed(2)}×`} />
    </dl>
  )
}

/** Big numbers (Expert tops 3.2M×) read better abbreviated in the tight readout. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(2)
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="stat">
      <dt className="stat-label">{label}</dt>
      <dd className={`stat-value ${highlight ? 'is-hot' : ''}`}>{value}</dd>
    </div>
  )
}

function Balloon({
  game,
  difficulty,
  tick,
  onPump,
  canPump,
}: {
  game: PumpGameState | null
  difficulty: PumpDifficulty
  tick: number
  onPump: () => void
  canPump: boolean
}) {
  const popped = game?.status === 'popped'
  const max = maxPumps(game?.difficulty ?? difficulty)
  const pumps = game?.pumps ?? 0
  // Fill toward the ceiling regardless of difficulty.
  const fill = max > 0 ? pumps / max : 0
  // Compounding inflation: starts small and blows up BIG — each pump is a bigger,
  // more dramatic jump than the last (accelerating pow), from 0.45× up to ~1.8×.
  const scale = 0.45 + Math.pow(fill, 1.15) * 1.35
  const label = game ? currentMultiplier(game).toFixed(2) : (1).toFixed(2)
  // tension reddens the balloon as it nears the top
  const tension = Math.round(fill * 100)

  return (
    <div className="balloon-wrap">
      <button
        className={`balloon ${popped ? 'is-popped' : ''} ${canPump ? 'is-live' : ''} ${
          !popped && tension >= 55 ? 'is-tense' : ''
        } ${!popped && tension >= 80 ? 'is-critical' : ''}`}
        style={{ ['--tension' as string]: `${tension}%` }}
        onClick={onPump}
        disabled={!canPump}
        aria-label="pump air into the balloon"
      >
        {/* The pump, the hose and the balloon share ONE coordinate space, so the
            hose stays plugged into the balloon's nozzle however big it inflates. */}
        <svg viewBox="0 0 240 360" className="pump-scene" aria-hidden="true">
          {/* the pump apparatus — one complete rig image (handle + cylinder + base);
              the whole rig presses down on each pump. No separate vector plunger,
              hose or valve — the art carries all of it. */}
          <g className={`pump-rig ${tick > 0 ? 'is-pumping' : ''}`} key={`rig-${tick}`}>
            <image
              className="pump-rig-img"
              href={assetUrl('/game-tiles/pump/pump-rig.png')}
              x="6"
              y="216"
              width="96"
              height="126"
              preserveAspectRatio="xMidYMax meet"
            />
          </g>

          {popped ? (
            <BurstScene />
          ) : (
            <g className="balloon-scale" style={{ transform: `scale(${scale})` }}>
              {/* a gentle tethered sway that turns into a nervous tremble as the
                  balloon nears bursting (driven by .is-tense / .is-critical) */}
              <g className="balloon-sway">
                {/* keyed by the pump count so the squash-stretch puff replays each pump */}
                <g className="balloon-inflate" key={pumps}>
                  <image
                    className="balloon-skin"
                    href={assetUrl('/game-tiles/pump/balloon.png')}
                    x="74"
                    y="80"
                    width="128"
                    height="136"
                    preserveAspectRatio="xMidYMax meet"
                  />
                  <text x="138" y="152" className="balloon-mult" textAnchor="middle">
                    {`${label}×`}
                  </text>
                </g>
              </g>
            </g>
          )}
        </svg>
      </button>
    </div>
  )
}

/** The popped balloon — a shockwave ring + the burst-shreds image, drawn where the
 *  balloon body was (centred ~128,164 in the shared scene). */
function BurstScene() {
  return (
    <g className="burst">
      <circle className="burst-ring" cx="128" cy="164" r="24" />
      <image
        className="burst-shreds"
        href={assetUrl("/game-tiles/pump/balloon-burst.png")}
        x="58"
        y="94"
        width="140"
        height="140"
        preserveAspectRatio="xMidYMid meet"
      />
      <text x="128" y="174" className="balloon-pop-label" textAnchor="middle">
        POP
      </text>
    </g>
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
  game: PumpGameState | null
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
        ? verifyPops(
            proof.serverSeed,
            proof.clientSeed,
            proof.nonce,
            proof.difficulty,
            proof.popPositions,
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
                {verified ? '✓ pops match the committed seed' : '✗ mismatch'}
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
