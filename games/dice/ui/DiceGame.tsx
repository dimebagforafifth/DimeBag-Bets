import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  DEFAULT_DICE_CONFIG,
  multiplierFor,
  playDice,
  randomServerSeed,
  verifyRoll,
  winChance,
  type DiceDirection,
  type DiceHouseConfig,
  type DiceRound,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { play } from '../../../sound/index.js'
import './dice.css'

interface DiceGameProps {
  account: Account
  houseConfig?: DiceHouseConfig
  onBalanceChange: () => void
}

export function DiceGame({
  account,
  houseConfig = DEFAULT_DICE_CONFIG,
  onBalanceChange,
}: DiceGameProps) {
  const [bet, setBet] = useState(10)
  const [target, setTarget] = useState(50.5)
  const [direction, setDirection] = useState<DiceDirection>('over')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<DiceRound | null>(null)
  const [history, setHistory] = useState<{ roll: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)

  const available = availableToWager(account)
  const chance = winChance(target, direction)
  const multiplier = multiplierFor(chance, houseConfig)
  const profit = Math.round(bet * (multiplier - 1))
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available

  function roll() {
    setError(null)
    try {
      nonceRef.current += 1
      const r = playDice(account, {
        stake: bet,
        target,
        direction,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      setRound(r)
      setHistory((h) => [{ roll: r.roll, won: r.won }, ...h].slice(0, 16))
      onBalanceChange()
      play('roll')
      play(r.won ? 'win' : 'lose')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="dice">
      <section className="dice-panel">
        <div className="bet-tabs">
          <button className="bet-tab is-active">Manual</button>
          <button className="bet-tab" disabled title="Coming soon">
            Auto
          </button>
        </div>

        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <input
              className="field-input"
              type="number"
              min={1}
              value={bet}
              onChange={(e) => setBet(Math.floor(Number(e.target.value)) || 0)}
            />
            <button className="chip" onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}>
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
            <span className="field-static">{Math.abs(profit).toLocaleString('en-US')}</span>
          </div>
        </label>

        <button className="action action-bet" onClick={roll} disabled={betInvalid}>
          Bet
        </button>

        <p className="dice-hint">
          {round
            ? round.won
              ? `Rolled ${round.roll.toFixed(2)} — won ${formatPoints(Math.round(bet * (round.multiplier - 1)))}`
              : `Rolled ${round.roll.toFixed(2)} — lost ${formatPoints(bet)}`
            : 'Set your odds and roll'}
        </p>
        {error && <p className="dice-error">{error}</p>}
        {bet > available && !error && (
          <p className="dice-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <section className="dice-stage">
        <div className="dice-history">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.roll.toFixed(2)}
            </span>
          ))}
        </div>

        <Board
          target={target}
          direction={direction}
          roll={round?.roll ?? null}
          won={round?.won}
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
        {round?.won && (
          <WinPopup multiplier={round.multiplier} amount={Math.round(bet * (round.multiplier - 1))} />
        )}
      </section>

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
  won,
  onTarget,
}: {
  target: number
  direction: DiceDirection
  roll: number | null
  won?: boolean
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
          <span className={`roll-flag ${won ? 'is-win' : 'is-loss'}`} style={{ left: pct(roll) }}>
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

function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
