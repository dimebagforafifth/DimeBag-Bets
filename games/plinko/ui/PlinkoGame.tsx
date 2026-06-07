import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  MAX_ROWS,
  MIN_ROWS,
  payouts,
  computePlinkoTable,
  playPlinko,
  randomServerSeed,
  RISKS,
  verifyDrop,
  type PlinkoHouseConfig,
  type PlinkoRisk,
  type PlinkoRound,
} from '../index.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import './plinko.css'

const PLINKO_RULES: ReactNode[] = [
  'Set your bet, pick the number of rows and a risk level, then drop the ball.',
  'The ball bounces down the pegs and lands in one of the multiplier slots along the bottom.',
  'Edge slots pay the most but are hardest to reach; centre slots pay the least. Higher risk and more rows stretch the extremes.',
  <>
    <strong>Payout = bet × the slot the ball lands in</strong> (slots below 1× lose part of the bet).
    The ball’s path is provably fair.
  </>,
]

interface PlinkoGameProps {
  account: Account
  /** Manager house edge; when set, the payout table is scaled to its RTP. */
  houseConfig?: PlinkoHouseConfig
  onBalanceChange: () => void
}

/* ---- physics (board-normalized: x,y in [0,1]) ---- */
// Hard-ball fall: the ball drops under gravity, strikes a peg, and DEFLECTS
// sideways into the next gap while continuing to fall — it never pops back up.
// Each strike is inelastic (it sheds a little vertical speed), so the descent is a
// clean, weighty, accelerating line. The horizontal speed of each hop is still
// SOLVED so the ball lands in the exact gap the fair seed dictates (cols[]) — the
// motion never changes the outcome, only how it looks getting there.
const GRAVITY = 2.0 // downward acceleration — a weighty, accelerating fall (eased well down for a slower, floatier drop)
const INIT_VY = 0.18 // gentle downward release speed onto the first peg
const RESTITUTION = 0.6 // fraction of vertical speed kept through a peg strike (no upward bounce)
const MAX_BALLS = 120 // perf guard for the constant Auto stream
const AUTO_INTERVAL = 130 // ms between auto drops — a steady, fair-paced rain

/** Set a ball's velocities for the descent from its current peg to the next gap.
 *  Vertical: it keeps falling — a peg strike only sheds a little speed, never an
 *  upward bounce. Horizontal: vx is solved from the fall time so the path lands
 *  EXACTLY on the next fair gap (cols[b+1]) — the motion never bends the odds. */
function launchHop(ball: Ball, release: boolean): void {
  if (ball.b >= ball.rows) {
    ball.vx = 0
    return
  }
  const yTo = (ball.b + 1) / (ball.rows + 1)
  ball.vy = release ? INIT_VY : ball.vy * RESTITUTION // fall on; never pop up
  const t = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * (yTo - ball.y))) / GRAVITY
  ball.vx = (ball.cols[ball.b + 1] - ball.cols[ball.b]) / t
}

interface Ball {
  id: number
  rows: number
  slot: number
  cols: number[] // gap centre after b bounces (0..rows) — the fair path
  sp: number
  x: number // current horizontal position, arcing gap → gap
  ox: number // tiny constant visual offset so stacked balls don't perfectly overlap
  vx: number // horizontal velocity for the current hop (solved to land in the fair gap)
  y: number
  vy: number
  b: number // pegs struck so far
  squash: number
  profit: number
  multiplier: number
}

export function PlinkoGame({ account, houseConfig, onBalanceChange }: PlinkoGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [risk, setRisk] = useState<PlinkoRisk>('medium')
  const [rows, setRows] = useState(16)
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [autoOn, setAutoOn] = useState(false)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [history, setHistory] = useState<{ multiplier: number; profit: number }[]>([])
  const [flashes, setFlashes] = useState<{ slot: number; key: number }[]>([])
  const [lastRound, setLastRound] = useState<PlinkoRound | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Balls live in a ref + a single rAF loop; we force a render each frame.
  const ballsRef = useRef<Ball[]>([])
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const ballIdRef = useRef(0)
  const flashKeyRef = useRef(0)
  const autoTimerRef = useRef(0)
  const autoTickRef = useRef<() => void>(() => {})

  const available = maxBet(account)
  // The displayed table = the canonical Stake table, or — once a manager changes
  // the edge — the generated edge-true table. It MUST match what the engine
  // settles on (we pass the same config to playPlinko).
  const table = useMemo(
    () => (houseConfig ? computePlinkoTable(rows, risk, houseConfig) : payouts(rows, risk)),
    [rows, risk, houseConfig],
  )
  // Longest bucket label (e.g. "1000×") — drives the fit-to-column font sizing so
  // labels never overflow when many rows make the buckets narrow.
  const bucketMaxLen = table.reduce((n, m) => Math.max(n, fmtMult(m).length), 1)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available
  const resolving = useResolving(account.id)
  // Risk and Rows reshape the whole board + payout table, so they CANNOT change
  // while balls are falling or an auto-drop session is running — only once all
  // betting has settled. Otherwise the buckets would move out from under a
  // ball mid-flight. (The frame loop re-renders each tick, so this stays live and
  // unlocks the instant the last ball lands.)
  const controlsLocked = ballsRef.current.length > 0 || autoOn

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(autoTimerRef.current)
    },
    [],
  )

  function ensureLoop() {
    if (rafRef.current) return
    lastTsRef.current = performance.now()
    rafRef.current = requestAnimationFrame(frame)
  }

  function frame(ts: number) {
    const dt = Math.min(0.04, (ts - lastTsRef.current) / 1000)
    lastTsRef.current = ts
    const landed: Ball[] = []
    for (const ball of ballsRef.current) {
      step(ball, dt, () => play('tick', { step: ball.b }))
      if (ball.b >= ball.rows && ball.y >= 1) landed.push(ball)
    }
    if (landed.length) {
      ballsRef.current = ballsRef.current.filter((b) => !landed.includes(b)) // disappear instantly
      const newFlashes = landed.map((b) => ({ slot: b.slot, key: (flashKeyRef.current += 1) }))
      setFlashes((f) => [...f, ...newFlashes])
      for (const b of newFlashes) {
        window.setTimeout(() => setFlashes((f) => f.filter((x) => x.key !== b.key)), 280)
      }
      setHistory((h) => [
        ...landed.map((b) => ({ multiplier: b.multiplier, profit: b.profit })),
        ...h,
      ].slice(0, 18))
      for (const b of landed) {
        play(b.profit > 0 ? 'win' : b.profit < 0 ? 'lose' : 'draw')
        signalReveal(account.id) // this ball landed → release its ledger entry now
      }
    }
    tick()
    if (ballsRef.current.length) rafRef.current = requestAnimationFrame(frame)
    else rafRef.current = 0
  }

  function spawnBall(r: PlinkoRound, jitter: number) {
    const sp = 1 / (r.rows + 1)
    const cols = [0.5]
    let x = 0.5
    for (let i = 0; i < r.rows; i++) {
      x += (r.path[i] ? 1 : -1) * (sp / 2)
      cols.push(x)
    }
    const ball: Ball = {
      id: (ballIdRef.current += 1),
      rows: r.rows,
      slot: r.slot,
      cols,
      sp,
      x: 0.5,
      ox: jitter, // small constant offset so simultaneous balls don't overlap
      vx: 0,
      y: 0,
      vy: INIT_VY,
      b: 0,
      squash: 0,
      profit: r.profit,
      multiplier: r.multiplier,
    }
    launchHop(ball, true) // aim the first drop at the apex gap
    ballsRef.current.push(ball)
  }

  function dropOne(): boolean {
    if (bet > available || ballsRef.current.length >= MAX_BALLS) return false
    nonceRef.current += 1
    const r = playPlinko(account, {
      stake: bet,
      rows,
      risk,
      clientSeed,
      nonce: nonceRef.current,
      config: houseConfig,
    })
    onBalanceChange() // figure already moved; keep availableToWager honest for rapid drops
    setLastRound(r)
    spawnBall(r, (ballsRef.current.length % 5) * 0.004 - 0.008)
    return true
  }

  function drop(): boolean {
    setError(null)
    try {
      const placed = dropOne()
      if (placed) {
        play('bet')
        ensureLoop()
      }
      return placed
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  // Auto streams ONE ball every tick (a constant rain, not batches). It keeps
  // running while balls clear the screen and only stops when you can't afford
  // the next drop.
  function autoTick() {
    if (bet > available) {
      stopAuto()
      return
    }
    if (ballsRef.current.length < MAX_BALLS && dropOne()) ensureLoop()
  }
  autoTickRef.current = autoTick

  function startAuto() {
    setAutoOn(true)
    clearInterval(autoTimerRef.current)
    autoTimerRef.current = window.setInterval(() => autoTickRef.current(), AUTO_INTERVAL)
  }
  function stopAuto() {
    setAutoOn(false)
    clearInterval(autoTimerRef.current)
  }
  useEffect(() => {
    if (mode === 'manual') stopAuto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <div className="plinko">
      <section className="plinko-panel">
        <div className="bet-tabs">
          <button
            className={`bet-tab ${mode === 'manual' ? 'is-active' : ''}`}
            disabled={controlsLocked}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
          <button
            className={`bet-tab ${mode === 'auto' ? 'is-active' : ''}`}
            disabled={controlsLocked}
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

        <div className="field">
          <span className="field-label">Risk</span>
          <div className="plinko-risks">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip ${risk === r ? 'is-on' : ''}`}
                disabled={controlsLocked}
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
              disabled={controlsLocked || rows <= MIN_ROWS}
            >
              −
            </button>
            <div className="stepper-value">
              <input className="field-input" type="number" value={rows} readOnly />
            </div>
            <button
              className="stepper-btn"
              onClick={() => setRows((n) => Math.min(MAX_ROWS, n + 1))}
              disabled={controlsLocked || rows >= MAX_ROWS}
            >
              +
            </button>
          </div>
        </div>

        {mode === 'manual' ? (
          // Manual mode is spammable: no ball-in-play / resolving lock — drop as
          // fast as you like (still bounded by affordability + the MAX_BALLS cap).
          <button className="action action-bet" onClick={drop} disabled={betInvalid}>
            Play
          </button>
        ) : autoOn ? (
          <button className="action action-stop" onClick={stopAuto}>
            Stop Auto
          </button>
        ) : (
          <button className="action action-bet" onClick={startAuto} disabled={betInvalid || resolving}>
            Start Auto
          </button>
        )}

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

        <div className="plinko-arena">
          <Board rows={rows} balls={ballsRef.current} />
          <div
            className="plinko-buckets"
            style={{ '--cols': table.length, '--maxlen': bucketMaxLen } as CSSProperties}
          >
            {table.map((m, slot) => {
              const hit = flashes.some((f) => f.slot === slot)
              const color = bucketColor(slot, rows)
              return (
                <div
                  key={slot}
                  className={`plinko-bucket ${hit ? 'is-hit' : ''}`}
                  style={{ background: color, '--bucket': color } as CSSProperties}
                >
                  {fmtMult(m)}
                </div>
              )
            })}
          </div>
        </div>

        <Rules points={PLINKO_RULES} />

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

/** Advance one ball one frame: gravity integrates the vertical velocity (it keeps
 *  falling), while a constant per-hop horizontal velocity carries it sideways.
 *  When it reaches the next peg row it snaps onto the fair gap and launches the
 *  next hop — deflecting sideways, never bouncing up. Because each hop's vx was
 *  solved to land on cols[b+1], the motion never changes which slot it ends in.
 *  onBounce fires per strike (for the peg tick). */
function step(ball: Ball, dt: number, onBounce: () => void): void {
  ball.vy += GRAVITY * dt
  ball.y += ball.vy * dt
  ball.x += ball.vx * dt
  ball.squash = Math.max(0, ball.squash - dt * 7)

  if (ball.b < ball.rows) {
    const pegY = (ball.b + 1) / (ball.rows + 1)
    if (ball.y >= pegY) {
      ball.y = pegY
      ball.x = ball.cols[ball.b + 1] // land exactly on the fair gap
      ball.b += 1
      ball.squash = 1
      onBounce()
      if (ball.b < ball.rows) {
        launchHop(ball, false) // deflect sideways and keep falling
      } else {
        // off the last peg — fall straight down into the bin (no bounce)
        ball.vx = 0
        ball.x = ball.cols[ball.rows]
        ball.vy *= RESTITUTION
      }
    }
  }
}

/** The peg triangle + falling balls. */
function Board({
  rows,
  balls,
}: {
  rows: number
  balls: Ball[]
}) {
  const sp = 1 / (rows + 1)
  const pegs: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) {
    const count = r + 3
    const start = 0.5 - ((count - 1) / 2) * sp
    const y = ((r + 1) / (rows + 1)) * 100
    for (let j = 0; j < count; j++) pegs.push({ x: (start + j * sp) * 100, y })
  }
  return (
    <div className="plinko-board" style={{ aspectRatio: '1.08' }}>
      <div className="plinko-field">
        {pegs.map((p, i) => (
          <span key={i} className="plinko-peg" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
        ))}
        {balls.map((b) => {
          const sx = 1 + b.squash * 0.12
          const sy = 1 - b.squash * 0.12
          const px = Math.max(0.01, Math.min(0.99, b.x + b.ox))
          return (
            <span
              key={b.id}
              className="plinko-ball"
              style={{
                left: `${px * 100}%`,
                top: `${Math.min(b.y, 1) * 100}%`,
                transform: `translate(-50%, -50%) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Edge buckets run hot (red); the center cools to yellow — Stake's heat map. */
function bucketColor(slot: number, rows: number): string {
  const center = rows / 2
  const t = Math.abs(slot - center) / center // 0 center … 1 edge
  const hue = 52 - 52 * t // yellow center → red edge
  return `hsl(${hue}, 92%, ${55 - 8 * t}%)`
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
          <code className="seed">{round ? round.serverSeedHash : 'committed when you bet'}</code>
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

function fmtMult(m: number): string {
  return `${m}×`
}

function formatPoints(cents: number): string {
  return formatMoney(cents)
}
