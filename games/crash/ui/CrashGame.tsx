import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  cashOut,
  crashRound,
  createCrashGame,
  DEFAULT_CRASH_CONFIG,
  frameDecision,
  multiplierAt,
  randomServerSeed,
  revealProof,
  verifyCrashPoint,
  type CrashGame as CrashGameState,
  type CrashHouseConfig,
} from '../index.js'
import { fairnessClient, verifyServerSeed } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { play } from '../../../sound/index.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './crash.css'

const CRASH_RULES: ReactNode[] = [
  'Place your bet before the round starts.',
  'A multiplier climbs from 1.00× and keeps rising — until it randomly crashes.',
  'Hit Cash Out before the crash to win bet × the multiplier at that instant.',
  'If it crashes before you cash out, you lose your bet.',
  <>
    <strong>Payout = bet × the multiplier when you cash out.</strong> The crash point is set from a
    provably-fair seed before the round, so it can’t move.
  </>,
]

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

/** The flight stops the instant you cash out — the bet's session is closed
 *  there — so the win card only needs a short beat after the climb halts. */
const POPUP_DELAY_MS = 340

/** The base pop-in length of the shared win card (matches theme.css's 0.4s). */
const POPUP_POP_MS = 400

/** Playback speeds the player can pick. The climb can feel slow at 1×; 2×/3×
 *  compress the same flight in wall-clock time. This is presentation only — it
 *  scales elapsed time, never the seed-derived crash point, so a round plays out
 *  identically (same crash point, same fairness proof) at any speed. */
const SPEEDS = [1, 2, 3] as const
type Speed = (typeof SPEEDS)[number]

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
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [cashoutAt, setCashoutAt] = useState<number | null>(null) // no auto-cashout preset — starts at 0/off
  const [speed, setSpeed] = useState<Speed>(1)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  // The round's platform commitment (server-seed hash published before play). The seed now
  // comes from the fairness AUTHORITY, not a client-side randomServerSeed(). See fair.ts.
  const [commitment, setCommitment] = useState<{ commitId: string; serverSeedHash: string } | null>(
    null,
  )
  const nonceRef = useRef(0)
  const startingRef = useRef(false) // guards the async bet against a double-start
  const speedRef = useRef<Speed>(1) // read inside the rAF loop without a stale closure

  const [game, setGame] = useState<CrashGameState | null>(null)
  const [live, setLive] = useState(1)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const gameRef = useRef<CrashGameState | null>(null)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0) // highest climb "rung" we've sounded this flight
  const liveRef = useRef(1) // the exact multiplier last painted this frame (what the player sees)

  const running = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)

  // If the player leaves mid-flight, the round crashes without them — settle the
  // open bet as a loss in the background so the stake doesn't strand in pending.
  // (Refunding would let players dodge a crash by navigating away.)
  useSettleOnExit(() => {
    const g = gameRef.current
    if (g?.status === 'active') crashRound(account, g)
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function finish(g: CrashGameState) {
    setGame({ ...g })
    setHistory((h) => [{ crashPoint: g.crashPoint, won: g.status === 'cashed' }, ...h].slice(0, 16))
    onBalanceChange()
  }

  function tick(now: number) {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    const m = multiplierAt((now - startRef.current) * speedRef.current)

    // Auto-cashout is resolved before the crash (see frameDecision): on a dropped
    // frame `m` can leap past both the target and the crash point at once, and a
    // crossed cashout target must still pay.
    const decision = frameDecision(m, g.crashPoint, cashoutAt)
    if (decision.type === 'cashout') {
      cashOut(account, g, decision.at)
      setLive(decision.at)
      finish(g)
      play('win')
      return
    }
    if (decision.type === 'crash') {
      crashRound(account, g)
      setLive(g.crashPoint)
      finish(g)
      play('boom')
      return
    }
    const rung = Math.floor((m - 1) * 4) // a rising tick every 0.25× climbed
    if (rung > lastTickRef.current) {
      lastTickRef.current = rung
      play('tick', { step: rung })
    }
    liveRef.current = m
    setLive(m)
    rafRef.current = requestAnimationFrame(tick)
  }

  async function start() {
    if (startingRef.current || gameRef.current?.status === 'active') return
    startingRef.current = true
    setError(null)
    try {
      // The server seed is minted and committed by the platform fairness authority
      // (games/shared/fair.ts → /api/fairness), not by randomServerSeed() in this browser, so
      // the client/operator can't pick a favourable one. The hash is committed first; the seed
      // is revealed next. INTERIM: the live client-timed clock needs the crash point now, so we
      // take the reveal immediately — the genuine withhold-until-after-play flow is the
      // server-timed-clock SEAM (resolveCrash + realtime; see docs/odds-and-fairness/provably-fair-server.md).
      const commit = await fairnessClient.commit()
      const revealed = await fairnessClient.reveal(commit.commitId)
      nonceRef.current += 1
      const g = createCrashGame(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: revealed.serverSeed,
        config: houseConfig,
      })
      setCommitment(commit)
      gameRef.current = g
      setGame(g)
      liveRef.current = 1
      setLive(1)
      lastTickRef.current = 0
      onBalanceChange()
      play('bet')
      startRef.current = performance.now()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      startingRef.current = false
    }
  }

  function manualCash() {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    // Cash out at the multiplier the player is actually looking at — the value the
    // last animation frame painted (liveRef) — not a fresh recompute at click time.
    // Recomputing advanced the multiplier a few ms past what was on screen, so the
    // settled value jittered above the number the player clicked. The painted value
    // is always a valid climbing frame (< crashPoint, or tick would have crashed it).
    const m = liveRef.current
    if (m <= 1 || m >= g.crashPoint) return
    cancelAnimationFrame(rafRef.current)
    cashOut(account, g, m)
    setLive(m)
    finish(g)
    play('win')
  }

  /** Switch playback speed, even mid-flight. We re-anchor the start time so the
   *  virtual elapsed (and thus the multiplier on screen) stays continuous —
   *  the rocket keeps climbing from where it is, just faster or slower. */
  function changeSpeed(next: Speed) {
    if (running) {
      const now = performance.now()
      const virtualElapsed = (now - startRef.current) * speedRef.current
      startRef.current = now - virtualElapsed / next
    }
    speedRef.current = next
    setSpeed(next)
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh
  const resolving = useResolving(account.id)

  return (
    <div className="crash">
      <section className="crash-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />
        {running && live > 1 && <ProfitReadout total={Math.round(bet * live)} multiplier={live} />}
        <CashoutAtField value={cashoutAt} disabled={running} onChange={setCashoutAt} />
        <SpeedField value={speed} onChange={changeSpeed} />

        {running ? (
          <button className="action action-cashout" onClick={manualCash} disabled={live <= 1}>
            Cash Out
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="crash-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="crash-error">
            Stake exceeds what you can wager ({formatPoints(available)}).
          </p>
        )}
      </section>

      <Stage
        status={game?.status ?? 'idle'}
        live={live}
        speed={speed}
        caption={caption(game, bet)}
        history={history}
        win={
          game && game.status === 'cashed'
            ? {
                multiplier: game.cashOutMultiplier ?? 1,
                stake: game.wager.stake,
              }
            : null
        }
      />

      <Rules points={CRASH_RULES} />

      <Fairness
        game={game}
        ended={ended}
        clientSeed={clientSeed}
        editable={idle}
        nextNonce={nonceRef.current + (idle ? 1 : 0)}
        committedHash={commitment?.serverSeedHash ?? null}
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
  speed,
  caption,
  history,
  win,
}: {
  status: CrashGameState['status'] | 'idle'
  live: number
  speed: Speed
  caption: string
  history: HistoryEntry[]
  win: { multiplier: number; stake: number } | null
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
    <div
      className={`crash-stage ${stageMod(status, live)}`}
      style={{ '--flame-flicker': `${0.18 / speed}s` } as CSSProperties}
    >
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
        <div className="crash-caption">{status === 'active' ? 'Current payout' : caption}</div>
      </div>
      {win && (
        <WinPopup
          multiplier={win.multiplier}
          stake={win.stake}
          delayMs={POPUP_DELAY_MS / speed}
          popMs={POPUP_POP_MS / speed}
        />
      )}
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
      <path className="rocket-body" d="M11,0 C7,-5 -3,-5.4 -7,-4.2 L-7,4.2 C-3,5.4 7,5 11,0 Z" />
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

/* Rocket-themed bust lines, recycled per round instead of a flat "Crashed @".
   Picked deterministically from the crash point so it stays put across re-renders
   of the same bust but varies game to game. */
const BUST_LINES = [
  { icon: '💥', text: 'Blown to bits at' },
  { icon: '🪦', text: 'Rekt at' },
  { icon: '🚀', text: 'Rocket down at' },
  { icon: '🔥', text: 'Crashed and burned at' },
  { icon: '💨', text: 'Up in smoke at' },
  { icon: '🌊', text: 'Splashdown at' },
]

function bustLine(crashPoint: number) {
  return BUST_LINES[Math.floor(crashPoint * 100) % BUST_LINES.length]
}

function caption(game: CrashGameState | null, bet: number): string {
  if (!game) return 'Set your bet and launch'
  if (game.status === 'busted') {
    const b = bustLine(game.crashPoint)
    return `${b.icon} ${b.text} ${game.crashPoint.toFixed(2)}× — lost ${formatPoints(bet)}`
  }
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
          onCommit={(d) => onChange(Math.max(1, toCents(d ?? 0)))}
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
          <NumberInput
            className="field-input"
            value={value}
            min={1.01}
            allowEmpty
            placeholder="0"
            disabled={disabled}
            onCommit={onChange}
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

/** Playback-speed picker — three chips (1×/2×/3×). Switchable any time, even
 *  mid-flight, since it only rescales time, not odds. */
function SpeedField({ value, onChange }: { value: Speed; onChange: (s: Speed) => void }) {
  return (
    <div className="field">
      <span className="field-label">Speed</span>
      <div className="crash-speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`chip crash-speed-chip ${s === value ? 'is-on' : ''}`}
            onClick={() => onChange(s)}
            aria-pressed={s === value}
          >
            {s}×
          </button>
        ))}
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
  committedHash,
  onClientSeed,
}: {
  game: CrashGameState | null
  ended: boolean
  clientSeed: string
  editable: boolean
  nextNonce: number
  /** The server-seed hash the platform authority committed before play (null until a bet). */
  committedHash: string | null
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
  // The revealed seed must hash to the commitment the platform published BEFORE the round —
  // proof the seed wasn't swapped after the bet.
  const commitmentHonored = useMemo(
    () => (proof && committedHash ? verifyServerSeed(proof.serverSeed, committedHash) : null),
    [proof, committedHash],
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
            <Row label="Crash point">{proof.crashPoint.toFixed(2)}×</Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ crash point matches the committed seed' : '✗ mismatch'}
              </span>
            </Row>
            {commitmentHonored != null && (
              <Row label="Platform commitment">
                <span className={commitmentHonored ? 'verify-ok' : 'verify-bad'}>
                  {commitmentHonored
                    ? '✓ revealed seed matches the hash the platform committed before play'
                    : '✗ seed does not match the platform commitment'}
                </span>
              </Row>
            )}
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

/** Money to the penny; carries no real value (§1). Stored as integer cents. */
function formatPoints(cents: number): string {
  return formatMoney(cents)
}
