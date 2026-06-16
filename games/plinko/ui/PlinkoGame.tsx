import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  MAX_ROWS,
  MIN_ROWS,
  payouts,
  playPlinko,
  randomServerSeed,
  RISKS,
  rtpOf,
  verifyDrop,
  type PlinkoRisk,
  type PlinkoRound,
} from '../index.js'
import { play } from '../../../sound/index.js'
import './plinko.css'

interface PlinkoGameProps {
  account: Account
  onBalanceChange: () => void
}

/** Gap between the ball bouncing off each peg row, in ms. */
const STEP_MS = 95

interface Ball {
  id: number
  path: number[]
  slot: number
  multiplier: number
  rows: number
  step: number // which peg row it has reached, 0..rows
}

export function PlinkoGame({ account, onBalanceChange }: PlinkoGameProps) {
  const [bet, setBet] = useState(10)
  const [risk, setRisk] = useState<PlinkoRisk>('medium')
  const [rows, setRows] = useState(16)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [balls, setBalls] = useState<Ball[]>([])
  const [history, setHistory] = useState<{ multiplier: number; profit: number }[]>([])
  const [flash, setFlash] = useState<{ slot: number; key: number } | null>(null)
  const [lastRound, setLastRound] = useState<PlinkoRound | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ballIdRef = useRef(0)
  const timers = useRef<Set<number>>(new Set())
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
    },
    [],
  )

  const available = availableToWager(account)
  const table = useMemo(() => payouts(rows, risk), [rows, risk])
  const rtp = useMemo(() => rtpOf(rows, risk), [rows, risk])
  const maxMult = Math.max(...table)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available

  function later(fn: () => void, ms: number) {
    const t = window.setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }

  function drop() {
    setError(null)
    try {
      nonceRef.current += 1
      const r = playPlinko(account, {
        stake: bet,
        rows,
        risk,
        clientSeed,
        nonce: nonceRef.current,
      })
      // The figure already moved (engine settles instantly). Update the display
      // now so a fast string of drops keeps `availableToWager` honest, then let
      // the ball fall for the visual payoff.
      onBalanceChange()
      setLastRound(r)
      play('bet')

      const id = (ballIdRef.current += 1)
      setBalls((bs) => [
        ...bs,
        { id, path: r.path, slot: r.slot, multiplier: r.multiplier, rows: r.rows, step: 0 },
      ])

      const advance = (step: number) => {
        setBalls((bs) => bs.map((b) => (b.id === id ? { ...b, step } : b)))
        if (step < r.rows) {
          play('tick', { step }) // a soft peg-bounce tick as the ball falls
          later(() => advance(step + 1), STEP_MS)
        } else {
          setFlash({ slot: r.slot, key: id })
          setHistory((h) => [{ multiplier: r.multiplier, profit: r.profit }, ...h].slice(0, 18))
          play(r.profit > 0 ? 'win' : r.profit < 0 ? 'lose' : 'draw')
          later(() => setBalls((bs) => bs.filter((b) => b.id !== id)), 360)
        }
      }
      later(() => advance(1), STEP_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="plinko">
      <section className="plinko-panel">
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
            <button
              className="chip"
              onClick={() => setBet((b) => Math.max(1, Math.min(available, b * 2)))}
            >
              2×
            </button>
          </div>
        </label>

        <div className="field">
          <span className="field-label">Risk</span>
          <div className="plinko-risks">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip ${risk === r ? 'is-on' : ''}`}
                onClick={() => setRisk(r)}
              >
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Rows</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              onClick={() => setRows((n) => Math.max(MIN_ROWS, n - 1))}
              disabled={rows <= MIN_ROWS}
            >
              −
            </button>
            <div className="stepper-value">
              <input className="field-input" type="number" value={rows} readOnly />
            </div>
            <button
              className="stepper-btn"
              onClick={() => setRows((n) => Math.min(MAX_ROWS, n + 1))}
              disabled={rows >= MAX_ROWS}
            >
              +
            </button>
          </div>
        </div>

        <button className="action action-bet" onClick={drop} disabled={betInvalid}>
          Bet
        </button>

        <p className="plinko-hint">
          {`${rows} rows · up to ${fmtMult(maxMult)} · ${(rtp * 100).toFixed(1)}% RTP`}
        </p>
        {error && <p className="plinko-error">{error}</p>}
        {bet > available && !error && (
          <p className="plinko-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <section className="plinko-stage">
        <div className="plinko-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.profit > 0 ? 'pill-win' : h.profit < 0 ? 'pill-loss' : ''}`}>
              {fmtMult(h.multiplier)}
            </span>
          ))}
        </div>

        <Board rows={rows} balls={balls} />

        <div className="plinko-buckets">
          {table.map((m, slot) => (
            <div
              key={slot}
              className={`plinko-bucket ${flash?.slot === slot ? 'is-hit' : ''}`}
              style={{ background: bucketColor(m, slot, rows) }}
              data-flash={flash?.slot === slot ? flash.key : undefined}
            >
              {fmtMult(m)}
            </div>
          ))}
        </div>

        <Fairness
          round={lastRound}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + 1}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
  )
}

/** The peg triangle with the falling balls overlaid. */
function Board({ rows, balls }: { rows: number; balls: Ball[] }) {
  return (
    <div className="plinko-board" style={{ aspectRatio: `${rows + 2} / ${rows}` }}>
      <div className="plinko-pegs">
        {Array.from({ length: rows }, (_, i) => (
          <div className="plinko-pegrow" key={i}>
            {Array.from({ length: i + 3 }, (_, j) => (
              <span className="plinko-peg" key={j} />
            ))}
          </div>
        ))}
      </div>
      {balls.map((b) => {
        const { leftPct, topPct } = ballPos(b)
        return (
          <span
            key={b.id}
            className="plinko-ball"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          />
        )
      })}
    </div>
  )
}

/** Ball position as a % of the board, from its path so far. Starts centered at
 *  the top; each right-bounce nudges it half a slot right, each left half left;
 *  at the final step it sits over its landing bucket's center. */
function ballPos(b: Ball): { leftPct: number; topPct: number } {
  const k = b.step
  let rights = 0
  for (let i = 0; i < k; i++) rights += b.path[i]
  const xCell = b.rows / 2 + 0.5 * (2 * rights - k) // 0..rows
  return {
    leftPct: ((xCell + 0.5) / (b.rows + 1)) * 100,
    topPct: (k / b.rows) * 100,
  }
}

/** Edge buckets run hot (red); the center cools to amber — Stake's heat map. */
function bucketColor(_m: number, slot: number, rows: number): string {
  const center = rows / 2
  const t = Math.abs(slot - center) / center // 0 center … 1 edge
  const hue = 45 - 45 * t // amber center → red edge
  return `hsl(${hue}, 90%, ${56 - 6 * t}%)`
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  onClientSeed,
}: {
  round: PlinkoRound | null
  clientSeed: string
  nextNonce: number
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      round
        ? verifyDrop(round.serverSeed, round.clientSeed, round.nonce, round.rows, round.slot)
        : null,
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
          <code className="seed">{round ? round.serverSeedHash : 'generated when you bet'}</code>
        </Row>
        {round && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ drop matches the committed seed' : '✗ mismatch'}
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

/** Compact multiplier label: 1000×, 5.6×, 0.2×. */
function fmtMult(m: number): string {
  return `${m}×`
}

function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
