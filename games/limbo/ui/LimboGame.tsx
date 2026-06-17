import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
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
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { play as playSound } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './limbo.css'

const LIMBO_RULES: ReactNode[] = [
  'Set your bet and a target multiplier, then hit Bet.',
  'A random multiplier is drawn. Land at or above your target and you win; below it and you lose your bet.',
  'A higher target is harder to hit but pays more.',
  <>
    <strong>Payout = bet × your target multiplier.</strong> The draw is provably fair.
  </>,
]

/** How long the multiplier climbs to its result. */
const CLIMB_MS = 500
/** The ease-out puts the number on the result well before the exact settle; the
 *  moment it's visually there (this fraction of the climb) we free up the bet
 *  button so you can replay right away — slightly ahead of the final tick. */
const RESULT_VISIBLE_AT = 0.66
/** Pop the win card a beat after the climb has finished settling. */
const POPUP_DELAY_MS = CLIMB_MS + 160

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
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [target, setTarget] = useState(2)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<LimboRound | null>(null)
  const [display, setDisplay] = useState(1)
  const [history, setHistory] = useState<{ result: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const rafRef = useRef(0)

  const available = maxBet(account)
  const chance = winChanceFor(target, houseConfig)
  const profit = Math.round(bet * (target - 1))
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available
  const resolving = useResolving(account.id)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function animateTo(result: number, won: boolean) {
    cancelAnimationFrame(rafRef.current)
    playSound('click') // a soft, satisfying click as the climb launches
    const start = performance.now()
    const dur = CLIMB_MS
    let freed = false
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(1 + (result - 1) * eased)
      // Free the bet button the instant the number has visually landed (a touch
      // before the exact settle) so you can play again right away.
      if (!freed && t >= RESULT_VISIBLE_AT) {
        freed = true
        signalReveal(account.id)
      }
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else {
        setDisplay(result)
        playSound(won ? 'win' : 'lose') // result chime lands with the multiplier
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  // The server seed now comes from the platform fairness AUTHORITY (commit hash before play →
  // reveal after), not a browser randomServerSeed(). The payout/draw math is unchanged.
  async function play() {
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playLimbo(account, {
        stake: bet,
        target,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      setRound(r)
      setHistory((h) => [{ result: r.result, won: r.won }, ...h].slice(0, 16))
      onBalanceChange()
      animateTo(r.result, r.won)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
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

        {round?.won && (
          // key on the round so each Bet remounts it: the old card drops
          // instantly, and a new one re-pops (after the climb) only on a win.
          <WinPopup
            key={round.nonce}
            multiplier={round.target}
            stake={bet}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>

      <section className="limbo-panel">
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

        <div className="field">
          <span className="field-label">Target multiplier</span>
          <div className="stepper">
            <button className="stepper-btn" onClick={() => stepTarget(-0.5)}>
              −
            </button>
            <div className="stepper-value">
              <NumberInput
                className="field-input"
                value={target}
                min={MIN_TARGET}
                max={MAX_MULTIPLIER}
                onCommit={(n) => setTarget(n ?? MIN_TARGET)}
              />
              <span className="field-suffix">×</span>
            </div>
            <button className="stepper-btn" onClick={() => stepTarget(0.5)}>
              +
            </button>
          </div>
        </div>

        <div className="limbo-readout">
          <div className="limbo-stat">
            <span className="stat-label">Win chance</span>
            <span className="stat-value">{chance.toFixed(2)}%</span>
          </div>
          <div className="limbo-stat">
            <span className="stat-label">Profit</span>
            <span className="stat-value is-gain">{formatPoints(profit)}</span>
          </div>
        </div>

        <button className="action action-bet" onClick={play} disabled={betInvalid || resolving}>
          Play
        </button>
        {error && <p className="limbo-error">{error}</p>}
        {bet > available && !error && (
          <p className="limbo-error">
            Stake exceeds what you can wager ({formatPoints(available)}).
          </p>
        )}

        <Rules points={LIMBO_RULES} />

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
    () =>
      round ? verifyLimbo(round.serverSeed, round.clientSeed, round.nonce, round.result) : null,
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

function formatPoints(cents: number): string {
  return formatMoney(cents)
}
