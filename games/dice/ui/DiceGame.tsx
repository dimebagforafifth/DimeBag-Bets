import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  DEFAULT_DICE_CONFIG,
  multiplierFor,
  playDice,
  randomServerSeed,
  verifyRoll,
  winChance,
  type DiceDirection,
  type DiceHouseConfig,
  type DiceOutcome,
  type DiceRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../features/sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './dice.css'

const DICE_RULES: ReactNode[] = [
  'Set your bet, then drag the line and choose to roll Over or Under it.',
  'A number from 0.00 to 100.00 is rolled. You win if it lands on your chosen side of the line.',
  'A narrower target is less likely but pays more; a wider one wins often but pays less.',
  <>
    <strong>Payout = bet × multiplier</strong> — a narrower target pays a higher multiplier. The
    roll is provably fair.
  </>,
]

interface DiceGameProps {
  account: Account
  houseConfig?: DiceHouseConfig
  onBalanceChange: () => void
}

/** ms between auto rolls — fast enough to feel live, slow enough to read each. */
const AUTO_INTERVAL = 320

export function DiceGame({
  account,
  houseConfig = DEFAULT_DICE_CONFIG,
  onBalanceChange,
}: DiceGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [target, setTarget] = useState(50.5)
  const [direction, setDirection] = useState<DiceDirection>('over')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<DiceRound | null>(null)
  const [history, setHistory] = useState<{ roll: number; outcome: DiceOutcome }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoOn, setAutoOn] = useState(false)
  const autoTimerRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed
  const rollRef = useRef<() => Promise<boolean>>(async () => false)

  const available = maxBet(account)
  const chance = winChance(target, direction)
  const multiplier = multiplierFor(chance, houseConfig)
  const profit = Math.round(bet * (multiplier - 1))
  // multiplier ≤ 1 means a "win" couldn't pay a profit (a near-certain target at a
  // high house edge) — the engine refuses it, so don't let the player place it.
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || multiplier <= 1
  const resolving = useResolving(account.id)

  // The server seed now comes from the platform fairness AUTHORITY (commit hash before play →
  // reveal), not a browser randomServerSeed(). Returns false only on a real failure (so auto
  // stops); a skipped re-entrant tick returns true so auto keeps running.
  async function roll(): Promise<boolean> {
    if (inFlightRef.current) return true // a mint is already in flight — skip, don't stop auto
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playDice(account, {
        stake: bet,
        target,
        direction,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      setRound(r)
      setHistory((h) => [{ roll: r.roll, outcome: r.outcome }, ...h].slice(0, 16))
      onBalanceChange()
      play('dice') // a soft tumble of the dice, not a hard whoosh
      // A push returns the stake — neither a win nor a loss; sound it neutrally.
      play(r.outcome === 'win' ? 'win' : r.outcome === 'push' ? 'draw' : 'lose')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      inFlightRef.current = false
    }
  }
  rollRef.current = roll

  function startAuto() {
    setAutoOn(true)
    clearInterval(autoTimerRef.current)
    autoTimerRef.current = window.setInterval(() => {
      void rollRef.current().then((ok) => {
        if (!ok) stopAuto() // out of funds / error → stop
      })
    }, AUTO_INTERVAL)
  }
  function stopAuto() {
    setAutoOn(false)
    clearInterval(autoTimerRef.current)
  }
  useEffect(() => () => clearInterval(autoTimerRef.current), [])
  useEffect(() => {
    if (mode === 'manual') stopAuto()
  }, [mode])

  return (
    <div className="dice">
      <section className="dice-panel">
        <div className="bet-tabs">
          <button
            className={`bet-tab ${mode === 'manual' ? 'is-active' : ''}`}
            disabled={autoOn}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
          <button
            className={`bet-tab ${mode === 'auto' ? 'is-active' : ''}`}
            disabled={autoOn}
            onClick={() => setMode('auto')}
          >
            Auto
          </button>
        </div>

        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button className="chip" onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}>
              ½
            </button>
            <button className="chip" onClick={() => setBet((b) => Math.min(available, b * 2))}>
              2×
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Profit on win</span>
          <div className="field-bet is-readonly">
            <span className="field-prefix">$</span>
            <span className="field-static">
              {(Math.abs(profit) / 100).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </label>

        {mode === 'manual' ? (
          <button className="action action-bet" onClick={roll} disabled={betInvalid || resolving}>
            Play
          </button>
        ) : autoOn ? (
          <button className="action action-stop" onClick={stopAuto}>
            Stop Auto
          </button>
        ) : (
          <button
            className="action action-bet"
            onClick={startAuto}
            disabled={betInvalid || resolving}
          >
            Start Auto
          </button>
        )}

        {error && <p className="dice-error">{error}</p>}
        {bet > available && !error && (
          <p className="dice-error">
            Stake exceeds what you can wager ({formatPoints(available)}).
          </p>
        )}
      </section>

      <section className="dice-stage">
        <div className="dice-history">
          {history.map((h, i) => (
            <span key={i} className={`pill pill-${h.outcome}`}>
              {h.roll.toFixed(2)}
            </span>
          ))}
        </div>

        <Board
          target={target}
          direction={direction}
          roll={round?.roll ?? null}
          outcome={round?.outcome ?? null}
          onTarget={(t) => {
            setTarget(t)
            setRound(null)
          }}
        />

        <div className="dice-fields">
          <Field label="Multiplier" value={multiplier.toFixed(4)} suffix="×" />
          <button
            className="dice-field is-button"
            onClick={() => {
              setDirection((d) => (d === 'over' ? 'under' : 'over'))
              setRound(null)
            }}
          >
            <span className="dice-field-label">Roll {direction === 'over' ? 'over' : 'under'}</span>
            <span className="dice-field-value">
              {target.toFixed(2)}
              <span className="dice-field-suffix">⇅</span>
            </span>
          </button>
          <Field label="Win chance" value={chance.toFixed(4)} suffix="%" />
        </div>
      </section>

      <Rules points={DICE_RULES} />

      <Fairness
        round={round}
        clientSeed={clientSeed}
        nextNonce={nonceRef.current + 1}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

function Board({
  target,
  direction,
  roll,
  outcome,
  onTarget,
}: {
  target: number
  direction: DiceDirection
  roll: number | null
  outcome?: DiceOutcome | null
  onTarget: (t: number) => void
}) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`
  return (
    <div className="dice-board">
      <div className="dice-ticks">
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className={`dice-track dir-${direction}`}>
        <span className="zone zone-lose" style={{ width: pct(target) }} />
        <span className="zone zone-win" style={{ left: pct(target), right: 0 }} />
        {roll != null && (
          <span
            className={`roll-flag ${outcome === 'win' ? 'is-win' : outcome === 'push' ? 'is-push' : 'is-loss'}`}
            style={{ left: pct(roll) }}
          >
            <span className="roll-flag-value">{roll.toFixed(2)}</span>
          </span>
        )}
        <span className="dice-handle" style={{ left: pct(target) }} />
        <input
          className="dice-range"
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={target}
          aria-label="target"
          onChange={(e) => onTarget(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

function Field({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="dice-field">
      <span className="dice-field-label">{label}</span>
      <span className="dice-field-value">
        {value}
        <span className="dice-field-suffix">{suffix}</span>
      </span>
    </div>
  )
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  onClientSeed,
}: {
  round: DiceRound | null
  clientSeed: string
  nextNonce: number
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifyRoll(round.serverSeed, round.clientSeed, round.nonce, round.roll) : null),
    [round],
  )
  return (
    <details className="fairness">
      <summary>Provably fair</summary>
      <div className="fairness-body">
        <Row label="Client seed">
          <input
            className="seed-input"
            value={clientSeed}
            onChange={(e) => onClientSeed(e.target.value)}
          />
        </Row>
        <Row label="Nonce">{round ? round.nonce : nextNonce}</Row>
        <Row label="Server seed (hashed)">
          <code className="seed">{round ? round.serverSeedHash : 'committed when you bet'}</code>
        </Row>
        {round && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ roll matches the committed seed' : '✗ mismatch'}
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

function formatPoints(cents: number): string {
  return formatMoney(cents)
}
