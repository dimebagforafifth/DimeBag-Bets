import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  DEFAULT_LIMBO_CONFIG,
  MAX_MULTIPLIER,
  MIN_TARGET,
  playLimbo,
  randomServerSeed,
  verifyLimbo,
  winChanceFor,
  type LimboHouseConfig,
  type LimboRound,
} from '../index.js'
import './limbo.css'

interface LimboGameProps {
  account: Account
  houseConfig?: LimboHouseConfig
  onBalanceChange: () => void
}

export function LimboGame({
  account,
  houseConfig = DEFAULT_LIMBO_CONFIG,
  onBalanceChange,
}: LimboGameProps) {
  const [bet, setBet] = useState(10)
  const [target, setTarget] = useState(2)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<LimboRound | null>(null)
  const [display, setDisplay] = useState(1)
  const [history, setHistory] = useState<{ result: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const rafRef = useRef(0)

  const available = availableToWager(account)
  const chance = winChanceFor(target, houseConfig)
  const profit = Math.round(bet * (target - 1))
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function animateTo(result: number) {
    cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const dur = 600
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(1 + (result - 1) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else setDisplay(result)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function play() {
    setError(null)
    try {
      nonceRef.current += 1
      const r = playLimbo(account, {
        stake: bet,
        target,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      setRound(r)
      setHistory((h) => [{ result: r.result, won: r.won }, ...h].slice(0, 16))
      onBalanceChange()
      animateTo(r.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const stepTarget = (delta: number) => {
    const next = Math.round((target + delta) * 100) / 100
    setTarget(Math.min(MAX_MULTIPLIER, Math.max(MIN_TARGET, next)))
  }

  const mod = round ? (round.won ? 'is-win' : 'is-loss') : ''

  return (
    <div className="limbo">
      <section className="limbo-stage">
        <div className="limbo-history">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.result.toFixed(2)}×
            </span>
          ))}
        </div>
        <div className={`limbo-result ${mod}`}>
          <div className="limbo-multiplier">{display.toFixed(2)}×</div>
          <div className="limbo-caption">
            {round
              ? round.won
                ? `Cleared ${round.target.toFixed(2)}× — won ${formatPoints(Math.round(bet * (round.target - 1)))}`
                : `Missed ${round.target.toFixed(2)}× — lost ${formatPoints(bet)}`
              : `Target ${target.toFixed(2)}×`}
          </div>
        </div>
      </section>

      <section className="limbo-panel">
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

        <div className="field">
          <span className="field-label">Target multiplier</span>
          <div className="stepper">
            <button className="stepper-btn" onClick={() => stepTarget(-0.5)}>
              −
            </button>
            <div className="stepper-value">
              <input
                className="field-input"
                type="number"
                min={MIN_TARGET}
                step={0.5}
                value={target}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value) * 100) / 100
                  setTarget(Math.min(MAX_MULTIPLIER, Math.max(MIN_TARGET, n || MIN_TARGET)))
                }}
              />
              <span className="field-suffix">×</span>
            </div>
            <button className="stepper-btn" onClick={() => stepTarget(0.5)}>
              +
            </button>
          </div>
        </div>

        <div className="limbo-readout">
          <div className="stat">
            <span className="stat-label">Win chance</span>
            <span className="stat-value">{chance.toFixed(2)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Win pays</span>
            <span className="stat-value">{formatPoints(profit)}</span>
          </div>
        </div>

        <button className="action action-bet" onClick={play} disabled={betInvalid}>
          Bet
        </button>
        {error && <p className="limbo-error">{error}</p>}
        {bet > available && !error && (
          <p className="limbo-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}

        <Fairness
          round={round}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + 1}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
  )
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  onClientSeed,
}: {
  round: LimboRound | null
  clientSeed: string
  nextNonce: number
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifyLimbo(round.serverSeed, round.clientSeed, round.nonce, round.result) : null),
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
                {verified ? '✓ result matches the committed seed' : '✗ mismatch'}
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
