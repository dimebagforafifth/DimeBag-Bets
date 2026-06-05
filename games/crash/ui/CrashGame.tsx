import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  cashOut,
  crashRound,
  createCrashGame,
  DEFAULT_CRASH_CONFIG,
  multiplierAt,
  randomServerSeed,
  revealProof,
  verifyCrashPoint,
  type CrashGame as CrashGameState,
  type CrashHouseConfig,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { play } from '../../../sound/index.js'
import './crash.css'

interface CrashGameProps {
  account: Account
  /** Manager-controlled house settings (vig); falls back to the default. */
  houseConfig?: CrashHouseConfig
  /** Tell the shell the shared balance moved, so the header re-renders. */
  onBalanceChange: () => void
}

interface HistoryEntry {
  crashPoint: number
  won: boolean
}

/**
 * The Crash vertical slice (CLAUDE.md §7), modeled on Stake's Manual mode: two
 * inputs (Bet Amount, Cashout At) and a rocket that climbs a multiplier-vs-time
 * curve until it crashes. One primary action (Bet → Cash Out). All money flows
 * through `core`; this component holds no points. The house edge lives only in
 * the crash-point math, so the flight looks identical at any vig.
 */
export function CrashGame({
  account,
  houseConfig = DEFAULT_CRASH_CONFIG,
  onBalanceChange,
}: CrashGameProps) {
  const [bet, setBet] = useState(10)
  const [cashoutAt, setCashoutAt] = useState<number | null>(2)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<CrashGameState | null>(null)
  const [live, setLive] = useState(1)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const gameRef = useRef<CrashGameState | null>(null)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0) // highest climb "rung" we've sounded this flight

  const running = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = availableToWager(account)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function finish(g: CrashGameState) {
    setGame({ ...g })
    setHistory((h) => [{ crashPoint: g.crashPoint, won: g.status === 'cashed' }, ...h].slice(0, 16))
    onBalanceChange()
  }

  function tick(now: number) {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    const m = multiplierAt(now - startRef.current)

    if (m >= g.crashPoint) {
      crashRound(account, g)
      setLive(g.crashPoint)
      finish(g)
      play('boom')
      return
    }
    if (cashoutAt && cashoutAt < g.crashPoint && m >= cashoutAt) {
      cashOut(account, g, cashoutAt)
      setLive(cashoutAt)
      finish(g)
      play('win')
      return
    }
    const rung = Math.floor((m - 1) * 4) // a rising tick every 0.25× climbed
    if (rung > lastTickRef.current) {
      lastTickRef.current = rung
      play('tick', { step: rung })
    }
    setLive(m)
    rafRef.current = requestAnimationFrame(tick)
  }

  function start() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createCrashGame(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      gameRef.current = g
      setGame(g)
      setLive(1)
      lastTickRef.current = 0
      onBalanceChange()
      play('bet')
      startRef.current = performance.now()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function manualCash() {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    const m = multiplierAt(performance.now() - startRef.current)
    if (m <= 1 || m >= g.crashPoint) return
    cancelAnimationFrame(rafRef.current)
    cashOut(account, g, m)
    setLive(m)
    finish(g)
    play('win')
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh
  const targetProfit = cashoutAt ? Math.round(bet * (cashoutAt - 1)) : null

  return (
    <div className="crash">
      <section className="crash-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />
        <CashoutAtField value={cashoutAt} disabled={running} onChange={setCashoutAt} />

        {running ? (
          <button className="action action-cashout" onClick={manualCash} disabled={live <= 1}>
            {live <= 1 ? (
              'Cash Out'
            ) : (
              <>
                Cash Out {live.toFixed(2)}× ·{' '}
                <strong>{formatPoints(Math.round(bet * (live - 1)))}</strong>
              </>
            )}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid}>
            Bet
          </button>
        )}

        <p className="crash-hint">
          {cashoutAt
            ? `Auto cash out at ${cashoutAt.toFixed(2)}× → win ${formatPoints(targetProfit ?? 0)}`
            : 'No target set — cash out by hand before it crashes'}
        </p>
        {error && <p className="crash-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="crash-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <Stage
        status={game?.status ?? 'idle'}
        live={live}
        caption={caption(game, bet)}
        history={history}
        win={
          game && game.status === 'cashed'
            ? {
                multiplier: game.cashOutMultiplier ?? 1,
                amount: Math.round(game.wager.stake * ((game.cashOutMultiplier ?? 1) - 1)),
              }
            : null
        }
      />

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

/* ----------------------------- rocket stage ----------------------------- */

const STAGE_W = 160
const STAGE_H = 100
const TOP_MARGIN = 0.12
const Y_REFS = [2, 4, 10] // multiplier reference lines on the climb

/** Where the rocket sits at flight progress s ∈ [0,1] (origin bottom-left). */
function flightPoint(s: number): [number, number] {
  const x = s * STAGE_W
  const climb = Math.pow(s, 1.4) // accelerating launch arc
  const y = STAGE_H - climb * STAGE_H * (1 - TOP_MARGIN)
  return [x, y]
}

/** The y (in viewBox units) where the curve passes a given multiplier. */
function yForMultiplier(m: number): number {
  const [, y] = flightPoint(1 - 1 / m)
  return y
}

function Stage({
  status,
  live,
  caption,
  history,
  win,
}: {
  status: CrashGameState['status'] | 'idle'
  live: number
  caption: string
  history: HistoryEntry[]
  win: { multiplier: number; amount: number } | null
}) {
  const progress = live > 1 ? 1 - 1 / live : 0
  const samples = 36
  const pts: [number, number][] = []
  for (let i = 0; i <= samples; i++) pts.push(flightPoint((progress * i) / samples))
  const line = 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L')
  const [rx, ry] = flightPoint(progress)
  const area = `${line} L${rx.toFixed(2)},${STAGE_H} L0,${STAGE_H} Z`

  const [ax, ay] = flightPoint(Math.max(0, progress - 0.01))
  const [bx, by] = flightPoint(Math.min(1, progress + 0.01))
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI

  const busted = status === 'busted'
  const showFlight = status === 'active' ? live > 1 : status === 'cashed' || status === 'busted'

  return (
    <div className={`crash-stage ${stageMod(status, live)}`}>
      <Scene />

      {history.length > 0 && (
        <div className="crash-history">
          {history.map((e, i) => (
            <span key={i} className={`pill ${pillTone(e.crashPoint)}`}>
              {e.crashPoint.toFixed(2)}×
            </span>
          ))}
        </div>
      )}

      <svg className="crash-chart" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none">
        {showFlight && (
          <>
            <path className="trail-area" d={area} />
            <path className="trail-line" d={line} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {showFlight &&
        (busted ? (
          <div className="rocket-holder" style={place(rx, ry)}>
            <Burst />
          </div>
        ) : (
          <div className="rocket-holder" style={place(rx, ry, angle)}>
            <Rocket />
          </div>
        ))}

      <div className="crash-overlay">
        <div className="crash-multiplier">{live.toFixed(2)}×</div>
        <div className="crash-caption">
          {status === 'active' ? 'Current payout' : caption}
        </div>
      </div>
      {win && <WinPopup multiplier={win.multiplier} amount={win.amount} />}
    </div>
  )
}

/** Position a stage element at viewBox point (x,y) as a percentage, optionally rotated. */
function place(x: number, y: number, angle?: number): React.CSSProperties {
  const t = `translate(-50%, -50%)${angle != null ? ` rotate(${angle}deg)` : ''}`
  return { left: `${(x / STAGE_W) * 100}%`, top: `${(y / STAGE_H) * 100}%`, transform: t }
}

/** Decorative night scene — static, so memoized to skip per-frame re-renders. */
const Scene = memo(function Scene() {
  return (
    <>
      <svg className="crash-scene" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="moonGrad" cx="40%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#eef6ff" />
            <stop offset="70%" stopColor="#cfe0f0" />
            <stop offset="100%" stopColor="#9fb6cc" />
          </radialGradient>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(180,210,235,0.45)" />
            <stop offset="100%" stopColor="rgba(180,210,235,0)" />
          </radialGradient>
        </defs>

        <circle cx="26" cy="24" r="26" fill="url(#moonGlow)" />
        <circle cx="26" cy="24" r="12" fill="url(#moonGrad)" />
        <circle cx="22" cy="20" r="2.2" fill="#b9cad9" opacity="0.6" />
        <circle cx="30" cy="27" r="1.6" fill="#b9cad9" opacity="0.5" />
        <circle cx="28" cy="19" r="1.1" fill="#b9cad9" opacity="0.5" />

        <g className="stars">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              className={s.big ? 'star star-big' : 'star'}
              style={{ animationDelay: `${s.tw}s` }}
            />
          ))}
        </g>

        {/* sleek layered skyline — our own identity, cleaner than the reference */}
        <path
          className="ridge ridge-back"
          d="M0,100 L0,74 L18,62 L34,71 L52,55 L72,68 L96,52 L120,64 L142,55 L160,63 L160,100 Z"
        />
        <path
          className="ridge ridge-front"
          d="M0,100 L0,86 L22,76 L40,84 L60,72 L82,82 L104,73 L128,83 L160,76 L160,100 Z"
        />
        <g className="skyline">
          {SKYLINE.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={100 - b.y} rx="0.4" />
          ))}
        </g>
      </svg>

      {/* multiplier reference lines + labels, aligned to the climb */}
      <div className="crash-axis">
        {Y_REFS.map((m) => (
          <div key={m} className="axis-row" style={{ top: `${yForMultiplier(m)}%` }}>
            <span className="axis-label">{m}×</span>
            <span className="axis-line" />
          </div>
        ))}
      </div>
    </>
  )
})

function Rocket() {
  // Drawn nose-right; the holder rotates it to follow the curve (flame trails).
  return (
    <svg className="rocket" viewBox="-14 -9 28 18" aria-hidden="true">
      <path className="rocket-flame" d="M-7,-2.4 L-15,0 L-7,2.4 Z" />
      <path className="rocket-fin" d="M-7,-3.6 L-10.5,-7.5 L-5,-3.6 Z" />
      <path className="rocket-fin" d="M-7,3.6 L-10.5,7.5 L-5,3.6 Z" />
      <path
        className="rocket-body"
        d="M11,0 C7,-5 -3,-5.4 -7,-4.2 L-7,4.2 C-3,5.4 7,5 11,0 Z"
      />
      <circle className="rocket-port" cx="3" cy="0" r="2.1" />
      <circle className="rocket-port-glow" cx="3" cy="0" r="1" />
    </svg>
  )
}

function Burst() {
  return (
    <svg className="burst" viewBox="-12 -12 24 24" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5
        return (
          <line
            key={i}
            x1={Math.cos(a) * 2.5}
            y1={Math.sin(a) * 2.5}
            x2={Math.cos(a) * 10}
            y2={Math.sin(a) * 10}
          />
        )
      })}
      <circle cx="0" cy="0" r="3.5" />
    </svg>
  )
}

function pillTone(crashPoint: number): string {
  if (crashPoint >= 10) return 'pill-hot'
  if (crashPoint >= 2) return 'pill-win'
  return 'pill-low'
}

function stageMod(status: CrashGameState['status'] | 'idle', live: number): string {
  if (status === 'busted') return 'is-busted'
  if (status === 'cashed') return 'is-cashed'
  if (status === 'active' && live > 1) return 'is-running'
  return ''
}

function caption(game: CrashGameState | null, bet: number): string {
  if (!game) return 'Set your bet and launch'
  if (game.status === 'busted')
    return `Crashed @ ${game.crashPoint.toFixed(2)}× — lost ${formatPoints(bet)}`
  if (game.status === 'cashed') {
    const m = game.cashOutMultiplier ?? 1
    return `Cashed @ ${m.toFixed(2)}× — won ${formatPoints(Math.round(bet * (m - 1)))}`
  }
  return 'Current payout'
}

/* deterministic starfield + skyline (computed once, no per-render randomness) */
const STARS = (() => {
  let seed = 20260605
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  return Array.from({ length: 48 }, () => ({
    x: rnd() * 160,
    y: rnd() * 60,
    r: 0.2 + rnd() * 0.55,
    tw: rnd() * 3.5,
    big: rnd() > 0.85,
  }))
})()

const SKYLINE = (() => {
  let seed = 99173
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const out: { x: number; y: number; w: number }[] = []
  let x = 4
  while (x < 156) {
    const w = 3 + rnd() * 5
    out.push({ x, y: 84 + rnd() * 10, w })
    x += w + 1.5 + rnd() * 2
  }
  return out
})()

/* ------------------------------ controls ------------------------------- */

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

const round2 = (n: number) => Math.round(n * 100) / 100

/** One clean control: type a target, or step it by 0.5 with −/+. Empty = off. */
function CashoutAtField({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled: boolean
  onChange: (n: number | null) => void
}) {
  const step = (delta: number) => {
    const next = round2((value ?? 2) + delta)
    onChange(next > 1 ? next : null)
  }
  return (
    <div className="field">
      <span className="field-label">Cashout at</span>
      <div className="stepper">
        <button className="stepper-btn" disabled={disabled} onClick={() => step(-0.5)}>
          −
        </button>
        <div className="stepper-value">
          <input
            className="field-input"
            type="number"
            min={1.01}
            step={0.5}
            placeholder="Off"
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const n = round2(Number(e.target.value))
              onChange(e.target.value.trim() !== '' && n > 1 ? n : null)
            }}
          />
          <span className="field-suffix">×</span>
        </div>
        <button className="stepper-btn" disabled={disabled} onClick={() => step(0.5)}>
          +
        </button>
      </div>
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
  game: CrashGameState | null
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
        ? verifyCrashPoint(proof.serverSeed, proof.clientSeed, proof.nonce, proof.crashPoint)
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
            <Row label="Crash point">{proof.crashPoint.toFixed(2)}×</Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ crash point matches the committed seed' : '✗ mismatch'}
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

/** Points displayed with "$" but no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
