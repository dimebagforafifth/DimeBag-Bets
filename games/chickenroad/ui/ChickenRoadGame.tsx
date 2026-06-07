import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet, resolveAtMultiplier } from '../../../core/index.js'
import {
  cashOut,
  createChickenGame,
  DEFAULT_CHICKEN_CONFIG,
  DIFFICULTIES,
  laneMultipliers,
  nextMultiplier,
  randomServerSeed,
  SPECS,
  step,
  verifyCrashLane,
  type ChickenGame as ChickenGameState,
  type ChickenHouseConfig,
  type Difficulty,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play, startTraffic, stopTraffic, useSoundEnabled } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import './chickenroad.css'

const CHICKEN_RULES: ReactNode[] = [
  'Set your bet and a difficulty, then hit Bet to send the chicken across the road.',
  'Tap to step forward one lane at a time. Each safe lane raises your multiplier.',
  'Harder difficulties survive each lane less often, so they climb much faster — but a splat ends the run and you lose your bet.',
  'Cash Out any time to bank bet × your current multiplier. Reach the far side and it auto-pays the top.',
  <>
    <strong>Payout = bet × the multiplier you cash out at.</strong> Each lane’s outcome is provably
    fair.
  </>,
]

interface ChickenRoadGameProps {
  account: Account
  houseConfig?: ChickenHouseConfig
  onBalanceChange: () => void
}

const POPUP_DELAY_MS = 360
/** Road geometry (px). The chicken slides across using these. */
const KERB_W = 64
const LANE_W = 84

/** Horizontal centre (px) of the chicken at a given position (0 = sidewalk). */
function runnerLeft(position: number): number {
  if (position <= 0) return KERB_W / 2
  return KERB_W + (position - 1) * LANE_W + LANE_W / 2
}

export function ChickenRoadGame({
  account,
  houseConfig = DEFAULT_CHICKEN_CONFIG,
  onBalanceChange,
}: ChickenRoadGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<ChickenGameState | null>(null)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hop, setHop] = useState(0) // bumped each step so the hop animation replays
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const runnerRef = useRef<HTMLDivElement | null>(null)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available
  const resolving = useResolving(account.id)
  const soundOn = useSoundEnabled()

  // A faint city-street bed (engine rumble + the odd passing car / distant siren)
  // plays only while a round is live and sound is on. Re-runs on mute so toggling
  // sound stops/starts it; always torn down on unmount.
  useEffect(() => {
    if (!active || !soundOn) return
    startTraffic()
    return () => stopTraffic()
  }, [active, soundOn])

  // If the player leaves mid-crossing, cash out at the current lane's value so the
  // stake never strands in pending (still at the start just refunds). Background.
  useSettleOnExit(() => {
    if (game?.status === 'active') {
      resolveAtMultiplier(account, game.wager, Math.max(1, game.multiplier))
    }
  })

  const ladder = useMemo(
    () => laneMultipliers(idle ? difficulty : game!.difficulty, houseConfig),
    [difficulty, game, idle, houseConfig],
  )

  // Keep the chicken in view as it crosses.
  useEffect(() => {
    runnerRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [game?.position])

  function start() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createChickenGame(account, {
        stake: bet,
        difficulty,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      setGame(g)
      onBalanceChange()
      play('bet')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function doStep() {
    if (!game || game.status !== 'active') return
    const res = step(account, game)
    setHop((h) => h + 1)
    if (res.hit) {
      play('car') // a car just drives straight through — the engine roars by
      setHistory((h) => [{ multiplier: game.multiplier, won: false }, ...h].slice(0, 16))
    } else if (res.status === 'cleared') {
      play('win')
      signalReveal(account.id) // reached the far side — the win is on screen now
      setHistory((h) => [{ multiplier: game.multiplier, won: true }, ...h].slice(0, 16))
    } else {
      play('reveal', { step: game.position })
    }
    redraw()
    onBalanceChange()
  }

  function doCash() {
    if (!game || game.status !== 'active' || game.position < 1) return
    const m = game.multiplier
    cashOut(account, game)
    signalReveal(account.id) // win is on screen instantly → release its ledger entry now
    setHistory((h) => [{ multiplier: m, won: true }, ...h].slice(0, 16))
    play('win')
    redraw()
    onBalanceChange()
  }

  const nextMult = game ? nextMultiplier(game) : ladder[0]
  const lanes = game ? game.lanes : SPECS[difficulty].lanes
  const position = game?.position ?? 0
  const busted = game?.status === 'busted'
  const chickState = busted ? 'splat' : 'idle'
  // The chicken sits on the spot it has reached; on a bust that's the crash lane it
  // stepped onto, where a car slams straight down onto it.
  const chickLeft = runnerLeft(position)

  return (
    <div className="chick">
      <section className="chick-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={!idle}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button className="chip" disabled={!idle} onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}>
              ½
            </button>
            <button className="chip" disabled={!idle} onClick={() => setBet((b) => Math.min(available, b * 2))}>
              2×
            </button>
          </div>
        </label>
        {active && game!.position >= 1 && <ProfitReadout total={Math.round(bet * game!.multiplier)} multiplier={game!.multiplier} />}

        <div className="field">
          <span className="field-label">Difficulty</span>
          <div className="chick-diffs">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={`chip ${difficulty === d ? 'is-on' : ''}`}
                disabled={!idle}
                onClick={() => setDifficulty(d)}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {active ? (
          <>
            <button className="action action-bet" onClick={doStep}>
              {nextMult ? `Step → ${nextMult}×` : 'Step'}
            </button>
            <button className="action action-cashout" onClick={doCash} disabled={game!.position < 1}>
              {game!.position < 1 ? 'Take a step first' : 'Cash Out'}
            </button>
          </>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="chick-error">{error}</p>}
        {bet > available && !error && (
          <p className="chick-error">Stake exceeds what you can wager ({formatMoney(available)}).</p>
        )}
      </section>

      <section className="chick-stage">
        <div className="chick-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className="chick-scroll">
          <div className="chick-road" style={{ width: KERB_W + lanes * LANE_W }}>
            {/* gradients/filters shared by every vehicle + the chicken (declared once) */}
            <RoadDefs />

            {/* the sidewalk the chicken starts from */}
            <div className="chick-kerb" style={{ width: KERB_W }} />

            {/* a traffic light at the head of the street, stuck on red */}
            <TrafficLight />

            {/* the lanes of the road */}
            <div className="chick-lanes" style={{ left: KERB_W, right: 0 }}>
              {ladder.map((m, idx) => {
                const lane = idx + 1
                const isCurrent = position === lane
                const isNext = active && position + 1 === lane
                const isCrash = busted && lane === game!.crashLane
                const isPassed = position > lane && !isCrash
                const kind = isCrash
                  ? 'crash'
                  : isCurrent
                    ? 'current'
                    : isPassed
                      ? 'passed'
                      : isNext
                        ? 'next'
                        : 'future'
                return (
                  <div
                    key={lane}
                    className={`chick-lane is-${kind}`}
                    style={{ width: LANE_W }}
                    onClick={isNext ? doStep : undefined}
                  >
                    <span className="chick-lane-line" />
                    {/* lanes the chicken can't reach yet: ambient traffic drives by */}
                    {kind === 'future' && <Traffic index={lane} />}
                    {/* a heavy stone drops onto each boundary the chicken clears,
                        blocking the lane behind it */}
                    {isPassed && <RoadBlock />}
                    {/* the bust: a car slams straight down onto the chicken */}
                    {isCrash && <HitCar />}
                    {/* the landing spot the chicken jumps onto, with its multiplier */}
                    <span className="chick-spot">
                      <span className="chick-spot-mult">{m}×</span>
                    </span>
                  </div>
                )
              })}
            </div>

            {/* the chicken, sliding across the road */}
            <div
              ref={runnerRef}
              className="chick-runner"
              style={{ left: chickLeft }}
            >
              <Chicken key={hop} state={chickState} />
            </div>
          </div>
        </div>

        <Rules points={CHICKEN_RULES} />

        <Fairness
          game={ended ? game : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (idle ? 1 : 0)}
          editable={idle}
          onClientSeed={setClientSeed}
        />

        {game && (game.status === 'cashed' || game.status === 'cleared') && (
          <WinPopup key={game.wager.id} multiplier={game.multiplier} stake={game.wager.stake} delayMs={POPUP_DELAY_MS} />
        )}
      </section>
    </div>
  )
}

/**
 * A little drawn chicken — bobs/hops when alive. On a splat it plays an animated
 * death: it braces, gets slammed flat as the car runs it over (synced to the
 * car's drive), then settles into a roadkill splat with X-eyes.
 */
function Chicken({ state }: { state: 'idle' | 'splat' }) {
  const dead = state === 'splat'
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!dead) return
    const t = setTimeout(() => setSettled(true), 640) // once the slam has settled
    return () => clearTimeout(t)
  }, [dead])

  if (dead && settled) {
    return (
      <div className="chick-svg is-splat">
        <SplatBody />
      </div>
    )
  }
  if (dead) {
    return (
      <div className="chick-svg is-roadkill">
        <WalkBody />
      </div>
    )
  }
  return (
    <div className="chick-svg is-walk">
      <WalkBody />
    </div>
  )
}

/** Gradients shared by every vehicle and the chicken. Declared once at the road
 *  so each car/chicken references them by id (no per-instance duplicate ids). */
function RoadDefs() {
  return (
    <svg className="chick-defs" width="0" height="0" aria-hidden="true">
      <defs>
        {/* metallic body sheen: bright top-left → clear → shaded bottom-right.
            Colour-agnostic, so it overlays any car colour for a glossy look. */}
        <linearGradient id="cr-gloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.28" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.62" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.34" />
        </linearGradient>
        {/* window glass — cool, brighter at the top edge */}
        <linearGradient id="cr-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4eefc" />
          <stop offset="0.5" stopColor="#9fb4d4" />
          <stop offset="1" stopColor="#7d93b4" />
        </linearGradient>
        {/* warm headlight glow */}
        <radialGradient id="cr-head" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7d6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff7d6" stopOpacity="0" />
        </radialGradient>
        {/* hen plumage — soft cream volume shading */}
        <radialGradient id="cr-hen" cx="0.4" cy="0.34" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f1f4f7" />
          <stop offset="1" stopColor="#d3dae1" />
        </radialGradient>
        <radialGradient id="cr-hen-head" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e1e7ed" />
        </radialGradient>
        {/* stone block — granite body + a sunlit top facet */}
        <linearGradient id="cr-stone" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#9aa1a8" />
          <stop offset="0.55" stopColor="#7c838b" />
          <stop offset="1" stopColor="#5b6066" />
        </linearGradient>
        <linearGradient id="cr-stone-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bcc3c9" />
          <stop offset="1" stopColor="#909aa1" />
        </linearGradient>
        {/* yellow/black hazard stripes for the blockade band */}
        <pattern id="cr-hazard" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill="#f6c81f" />
          <rect width="7" height="14" fill="#1a1d22" />
        </pattern>
        {/* soft halo for the lit red traffic light */}
        <radialGradient id="cr-redglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff3b3b" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff3b3b" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/** A roadside traffic light at the head of the street, stuck on RED — a dark
 *  signal head (red / amber / green) on a pole, the red lamp lit with a halo. */
function TrafficLight() {
  return (
    <div className="chick-trafficlight" aria-hidden="true">
      <svg viewBox="0 0 24 80" aria-hidden="true">
        {/* pole + base */}
        <rect x="10" y="40" width="4" height="38" rx="1.5" fill="#363c44" />
        <rect x="6" y="77" width="12" height="3" rx="1.5" fill="#2a2f36" />
        {/* signal housing */}
        <rect x="3" y="2" width="18" height="40" rx="5" fill="#1b1f25" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
        {/* red lamp — lit, with a halo */}
        <circle cx="12" cy="11" r="9" fill="url(#cr-redglow)" />
        <circle cx="12" cy="11" r="5" fill="#ff4d4d" stroke="#7a1414" strokeWidth="0.8" />
        <circle cx="10.4" cy="9.4" r="1.5" fill="#ffd0d0" opacity="0.85" />
        {/* amber + green — off */}
        <circle cx="12" cy="23" r="5" fill="#4a3c1c" stroke="#2a2310" strokeWidth="0.8" />
        <circle cx="12" cy="35" r="5" fill="#1d4029" stroke="#102415" strokeWidth="0.8" />
      </svg>
    </div>
  )
}

/** The upright, alive hen — a shaded 3/4 view with layered wing + tail feathers,
 *  a three-lobed comb, two-part beak and a catch-lit eye. */
function WalkBody() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* legs + 3-toed feet (the group rotates a touch each step) */}
      <g className="chick-legs" stroke="#e8902a" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M21 37 v7" />
        <path d="M28 37 v7" />
        <path d="M21 44 l-3 2.4 M21 44 l3 2.4" />
        <path d="M28 44 l-3 2.4 M28 44 l3 2.4" />
      </g>
      {/* tail feathers (back-left), layered */}
      <path d="M9 27 q-6 -4 -3 -12 q4 4 7 7 Z" fill="#dbe2e9" stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
      <path d="M8 28 q-4 -3 -3 -9 q3 3 6 6 Z" fill="#eef2f6" />
      {/* body */}
      <ellipse cx="22" cy="29" rx="14.5" ry="12.5" fill="url(#cr-hen)" stroke="rgba(0,0,0,0.10)" strokeWidth="0.7" />
      {/* breast highlight */}
      <ellipse cx="27" cy="32" rx="8" ry="7" fill="#ffffff" opacity="0.5" />
      {/* folded wing with feather lines */}
      <path d="M16 24 q11 1 13 10 q-8 4 -14 -1 Z" fill="#e6ecf2" stroke="rgba(0,0,0,0.10)" strokeWidth="0.7" />
      <path d="M19 28 q6 1 8 6 M18 31 q6 0 9 4" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" fill="none" />
      {/* neck into head */}
      <path d="M28 20 q4 6 1 12 q-5 -1 -6 -7 Z" fill="url(#cr-hen)" />
      {/* head */}
      <circle cx="33" cy="16" r="8" fill="url(#cr-hen-head)" stroke="rgba(0,0,0,0.10)" strokeWidth="0.7" />
      {/* comb — three lobes with a darker base crease */}
      <g fill="#e0354c">
        <ellipse cx="29.5" cy="8.5" rx="2.6" ry="3" />
        <ellipse cx="33" cy="7" rx="2.8" ry="3.2" />
        <ellipse cx="36.4" cy="8.8" rx="2.4" ry="2.8" />
      </g>
      <path d="M28 10 q5 -2 10 0" stroke="#b9243a" strokeWidth="1.3" fill="none" />
      {/* beak — upper + lower */}
      <path d="M40.5 15 l7 1.5 l-7 2 Z" fill="#f4a523" />
      <path d="M40.5 17.6 l6 1.2 l-6 1.6 Z" fill="#d6831a" />
      {/* wattle */}
      <path d="M39 20.5 q2.5 4.5 -1 6 q-2 -2.5 -1 -6 Z" fill="#e0354c" />
      {/* eye + catchlight */}
      <circle cx="35" cy="15" r="2.1" fill="#20262e" />
      <circle cx="35.7" cy="14.3" r="0.7" fill="#ffffff" />
    </svg>
  )
}

/** The flattened roadkill hen — a squashed body, loose feathers and X-eyes. */
function SplatBody() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {/* tyre-smear shadow under the squash */}
      <ellipse cx="24" cy="40" rx="19" ry="6.5" fill="#1d2733" opacity="0.18" />
      {/* flattened body */}
      <path d="M9 40 q5 -9 15 -9 q10 0 15 9 q-15 3 -30 0 Z" fill="url(#cr-hen)" stroke="rgba(0,0,0,0.12)" strokeWidth="0.7" />
      {/* loose feathers knocked free */}
      <path d="M8 31 q-3 -2 -2 -6 q3 2 4 5 Z" fill="#eef2f6" opacity="0.9" />
      <path d="M41 30 q3 -2 2 -6 q-3 2 -4 5 Z" fill="#eef2f6" opacity="0.9" />
      {/* squished comb */}
      <g fill="#e0354c" opacity="0.85">
        <circle cx="20" cy="33" r="1.8" />
        <circle cx="24" cy="32.2" r="2" />
        <circle cx="28" cy="33" r="1.8" />
      </g>
      {/* X-eyes */}
      <path d="M18 35 l3.4 3.4 M21.4 35 l-3.4 3.4" stroke="#20262e" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M27 35 l3.4 3.4 M30.4 35 l-3.4 3.4" stroke="#20262e" strokeWidth="1.5" strokeLinecap="round" />
      {/* beak */}
      <path d="M24 38 l4 1 l-4 1.4 Z" fill="#f4a523" />
    </svg>
  )
}

/**
 * A detailed top-down car, tinted. Shared by the hit car and the ambient traffic.
 * It faces DOWN the lane (headlights lead at the bottom, taillights at the top),
 * matching the drive-off-the-bottom animation. A shared gloss gradient overlays
 * any body colour for a metallic sheen; glass + headlight glows come from the
 * shared defs too, so every instance reuses the same ids.
 */
function CarBody({ color }: { color: string }) {
  return (
    <svg className="chick-car-body" viewBox="0 0 44 72" aria-hidden="true">
      {/* tyres at the corners, each with a faint rim highlight */}
      <g fill="#15171c">
        <rect x="1" y="13" width="6.5" height="14" rx="2.6" />
        <rect x="36.5" y="13" width="6.5" height="14" rx="2.6" />
        <rect x="1" y="45" width="6.5" height="14" rx="2.6" />
        <rect x="36.5" y="45" width="6.5" height="14" rx="2.6" />
      </g>
      <g fill="rgba(255,255,255,0.12)">
        <rect x="2.4" y="15" width="3.6" height="2.6" rx="1.2" />
        <rect x="37.9" y="15" width="3.6" height="2.6" rx="1.2" />
        <rect x="2.4" y="47" width="3.6" height="2.6" rx="1.2" />
        <rect x="37.9" y="47" width="3.6" height="2.6" rx="1.2" />
      </g>
      {/* body shell + metallic sheen overlay */}
      <rect x="5" y="2" width="34" height="68" rx="13" fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
      <rect x="5" y="2" width="34" height="68" rx="13" fill="url(#cr-gloss)" />
      {/* hood + trunk shut-lines */}
      <line x1="10" y1="16" x2="34" y2="16" stroke="rgba(0,0,0,0.18)" strokeWidth="0.9" />
      <line x1="10" y1="56" x2="34" y2="56" stroke="rgba(0,0,0,0.18)" strokeWidth="0.9" />
      {/* roof panel — a touch lighter than the body */}
      <rect x="9" y="24" width="26" height="24" rx="8" fill="rgba(255,255,255,0.10)" />
      {/* rear window (top) + windshield (bottom) */}
      <path d="M12 24.5 q10 -3.5 20 0 l-2 6.5 q-8 -2.6 -16 0 Z" fill="url(#cr-glass)" />
      <path d="M12 47.5 q10 3.5 20 0 l-2 -6.5 q-8 2.6 -16 0 Z" fill="url(#cr-glass)" />
      {/* a bright reflection streak across the windshield */}
      <path d="M15 25.4 q8 -2 17 0 l-1 2 q-7.5 -1.7 -15 0 Z" fill="rgba(255,255,255,0.4)" />
      {/* side windows */}
      <rect x="10.5" y="33" width="3" height="9" rx="1.4" fill="url(#cr-glass)" />
      <rect x="30.5" y="33" width="3" height="9" rx="1.4" fill="url(#cr-glass)" />
      {/* side mirrors near the front */}
      <path d="M5 41 l-3 1.4 l0 3 l3 -0.6 Z" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <path d="M39 41 l3 1.4 l0 3 l-3 -0.6 Z" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      {/* headlight glow + lamps at the front (bottom) */}
      <ellipse cx="13" cy="63" rx="5" ry="4" fill="url(#cr-head)" />
      <ellipse cx="31" cy="63" rx="5" ry="4" fill="url(#cr-head)" />
      <rect x="9.5" y="62.5" width="7" height="3.4" rx="1.7" fill="#fff3c4" />
      <rect x="27.5" y="62.5" width="7" height="3.4" rx="1.7" fill="#fff3c4" />
      {/* taillights at the back (top) with a soft glow */}
      <rect x="9.5" y="5.2" width="7" height="3" rx="1.5" fill="#ff5550" />
      <rect x="27.5" y="5.2" width="7" height="3" rx="1.5" fill="#ff5550" />
    </svg>
  )
}

/** The bust: a car barrels straight down the crash lane and drives clean THROUGH
 *  the chicken (and off the bottom) — it never stops; the run just ends. */
function HitCar() {
  return (
    <div className="chick-hitcar" aria-hidden="true">
      <CarBody color="#cf2f44" />
    </div>
  )
}

/* ---------------------------- ambient traffic --------------------------- */

/** Top-down delivery truck — a long box trailer (steer axle + dual rears) with a
 *  coloured cab, headlight glow and the shared metallic sheen. */
function TruckBody({ color }: { color: string }) {
  return (
    <svg className="chick-veh" viewBox="0 0 44 104" aria-hidden="true">
      {/* tyres — dual rears under the box, a steer axle under the cab */}
      <g fill="#15171c">
        <rect x="1" y="22" width="6" height="11" rx="2.2" />
        <rect x="37" y="22" width="6" height="11" rx="2.2" />
        <rect x="1" y="40" width="6" height="11" rx="2.2" />
        <rect x="37" y="40" width="6" height="11" rx="2.2" />
        <rect x="1" y="64" width="6.5" height="13" rx="2.4" />
        <rect x="36.5" y="64" width="6.5" height="13" rx="2.4" />
      </g>
      {/* box trailer (back, top) + sheen + corrugation lines */}
      <rect x="4" y="2" width="36" height="60" rx="3" fill="#eef1f4" stroke="rgba(0,0,0,0.32)" strokeWidth="1" />
      <rect x="4" y="2" width="36" height="60" rx="3" fill="url(#cr-gloss)" opacity="0.5" />
      <g stroke="rgba(0,0,0,0.10)" strokeWidth="1">
        <line x1="4" y1="18" x2="40" y2="18" />
        <line x1="4" y1="32" x2="40" y2="32" />
        <line x1="4" y1="46" x2="40" y2="46" />
      </g>
      {/* cab (front, bottom) in the truck's colour */}
      <rect x="5" y="63" width="34" height="38" rx="8" fill={color} stroke="rgba(0,0,0,0.34)" strokeWidth="1" />
      <rect x="5" y="63" width="34" height="38" rx="8" fill="url(#cr-gloss)" />
      {/* windshield */}
      <path d="M10 70 q12 -3 24 0 l-2.5 7.5 q-9.5 -2.6 -19 0 Z" fill="url(#cr-glass)" />
      {/* headlight glow + lamps */}
      <ellipse cx="13" cy="96" rx="4.5" ry="3.5" fill="url(#cr-head)" />
      <ellipse cx="31" cy="96" rx="4.5" ry="3.5" fill="url(#cr-head)" />
      <rect x="9.5" y="95.5" width="7" height="3.2" rx="1.5" fill="#fff3c4" />
      <rect x="27.5" y="95.5" width="7" height="3.2" rx="1.5" fill="#fff3c4" />
    </svg>
  )
}

/** Top-down police cruiser — white livery with a black door band, a front push
 *  bar and a roof light bar whose red/blue halves flash alternately (CSS). */
function PoliceBody() {
  return (
    <svg className="chick-veh chick-police" viewBox="0 0 44 72" aria-hidden="true">
      {/* tyres */}
      <g fill="#15171c">
        <rect x="1" y="13" width="6.5" height="14" rx="2.6" />
        <rect x="36.5" y="13" width="6.5" height="14" rx="2.6" />
        <rect x="1" y="45" width="6.5" height="14" rx="2.6" />
        <rect x="36.5" y="45" width="6.5" height="14" rx="2.6" />
      </g>
      {/* white shell + sheen */}
      <rect x="5" y="2" width="34" height="68" rx="13" fill="#f2f5f8" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
      <rect x="5" y="2" width="34" height="68" rx="13" fill="url(#cr-gloss)" opacity="0.55" />
      {/* black door band with thin gold trim (classic cruiser livery) */}
      <rect x="5" y="40" width="34" height="16" fill="#10151c" opacity="0.92" />
      <rect x="5" y="40" width="34" height="2.2" fill="#cfa53a" opacity="0.8" />
      <rect x="5" y="53.8" width="34" height="2.2" fill="#cfa53a" opacity="0.8" />
      {/* front push (bull) bar */}
      <line x1="11" y1="68.5" x2="33" y2="68.5" stroke="#2b3038" strokeWidth="2.2" strokeLinecap="round" />
      {/* roof panel */}
      <rect x="9" y="24" width="26" height="24" rx="8" fill="rgba(255,255,255,0.08)" />
      {/* rear window + windshield */}
      <path d="M12 24.5 q10 -3.5 20 0 l-2 6.5 q-8 -2.6 -16 0 Z" fill="url(#cr-glass)" />
      <path d="M12 47.5 q10 3.5 20 0 l-2 -6.5 q-8 2.6 -16 0 Z" fill="url(#cr-glass)" />
      {/* roof light bar — flashing red / blue, each with a soft glow */}
      <rect x="11.5" y="33.5" width="21" height="6" rx="2" fill="#0b0f14" />
      <circle className="chick-glow-a" cx="16" cy="36.5" r="6" fill="#ff2e2e" opacity="0.4" />
      <circle className="chick-glow-b" cx="28" cy="36.5" r="6" fill="#2e6bff" opacity="0.4" />
      <rect className="chick-flash-a" x="12.5" y="34.4" width="9" height="4.2" rx="1.2" fill="#ff3b3b" />
      <rect className="chick-flash-b" x="22.5" y="34.4" width="9" height="4.2" rx="1.2" fill="#3b6bff" />
      {/* headlight glow + lamps */}
      <ellipse cx="13" cy="63" rx="5" ry="4" fill="url(#cr-head)" />
      <ellipse cx="31" cy="63" rx="5" ry="4" fill="url(#cr-head)" />
      <rect x="9.5" y="62.5" width="7" height="3.4" rx="1.7" fill="#fff3c4" />
      <rect x="27.5" y="62.5" width="7" height="3.4" rx="1.7" fill="#fff3c4" />
    </svg>
  )
}

/** Top-down ice cream van — a white box van in pastel livery with a soft-serve
 *  emblem on the roof. Pure decoration; the jingle comes from the sound bed. */
function IceCreamBody() {
  return (
    <svg className="chick-veh" viewBox="0 0 44 88" aria-hidden="true">
      {/* tyres */}
      <g fill="#15171c">
        <rect x="1" y="18" width="6.5" height="13" rx="2.4" />
        <rect x="36.5" y="18" width="6.5" height="13" rx="2.4" />
        <rect x="1" y="56" width="6.5" height="13" rx="2.4" />
        <rect x="36.5" y="56" width="6.5" height="13" rx="2.4" />
      </g>
      {/* white body + sheen */}
      <rect x="5" y="2" width="34" height="84" rx="9" fill="#fbf8f2" stroke="rgba(0,0,0,0.32)" strokeWidth="1" />
      <rect x="5" y="2" width="34" height="84" rx="9" fill="url(#cr-gloss)" opacity="0.5" />
      {/* pastel livery bands */}
      <rect x="5" y="30" width="34" height="7" fill="#ff9fc2" opacity="0.92" />
      <rect x="5" y="41" width="34" height="5" fill="#79d3cf" opacity="0.92" />
      {/* sprinkles scattered on the side */}
      <g>
        <rect x="11" y="50" width="2.6" height="1.4" rx="0.7" fill="#ff7eb0" transform="rotate(20 11 50)" />
        <rect x="20" y="53" width="2.6" height="1.4" rx="0.7" fill="#79d3cf" transform="rotate(-25 20 53)" />
        <rect x="28" y="51" width="2.6" height="1.4" rx="0.7" fill="#ffd34e" transform="rotate(40 28 51)" />
        <rect x="16" y="56" width="2.6" height="1.4" rx="0.7" fill="#9b8cff" transform="rotate(-10 16 56)" />
        <rect x="31" y="56" width="2.6" height="1.4" rx="0.7" fill="#ff7eb0" transform="rotate(15 31 56)" />
      </g>
      {/* roof soft-serve emblem — cone + scoop + cherry */}
      <path d="M19 16 L25 16 L22 25 Z" fill="#e0b074" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
      <circle cx="22" cy="14" r="4.4" fill="#ffd9e6" stroke="rgba(0,0,0,0.14)" strokeWidth="0.5" />
      <circle cx="22" cy="11.4" r="1.5" fill="#ff6fa5" />
      {/* windshield (front, bottom) */}
      <path d="M10 72 q12 -3 24 0 l-2.5 7.5 q-9.5 -2.6 -19 0 Z" fill="url(#cr-glass)" />
      {/* headlight glow + lamps */}
      <ellipse cx="13" cy="83" rx="4.5" ry="3.5" fill="url(#cr-head)" />
      <ellipse cx="31" cy="83" rx="4.5" ry="3.5" fill="url(#cr-head)" />
      <rect x="9.5" y="82.5" width="7" height="3.2" rx="1.5" fill="#fff3c4" />
      <rect x="27.5" y="82.5" width="7" height="3.2" rx="1.5" fill="#fff3c4" />
    </svg>
  )
}

/** Purely-visual traffic on lanes the chicken can't reach yet — cars, trucks,
 *  cruisers and the odd ice cream van driving down on a loop. Each lane picks a
 *  vehicle + speed; a negative delay starts them scattered mid-road so the
 *  traffic reads as already flowing. */
const TRAFFIC = [
  { kind: 'car', color: '#2c4a78', dur: 2.4 }, // navy sedan
  { kind: 'truck', color: '#9a6b2f', dur: 3.4 }, // delivery truck
  { kind: 'police', color: '', dur: 2.0 },
  { kind: 'car', color: '#b0353c', dur: 2.7 }, // red
  { kind: 'icecream', color: '', dur: 4.4 }, // ice cream van, ambling by
  { kind: 'truck', color: '#5b636d', dur: 3.7 }, // grey box truck
  { kind: 'car', color: '#c8ccd2', dur: 2.2 }, // silver
  { kind: 'car', color: '#26292f', dur: 2.9 }, // black
  { kind: 'police', color: '', dur: 2.6 },
] as const

function Traffic({ index }: { index: number }) {
  const v = TRAFFIC[index % TRAFFIC.length]
  const wide = v.kind === 'truck' || v.kind === 'icecream'
  return (
    <div
      className={`chick-traffic ${wide ? 'is-truck' : ''}`}
      style={{ animationDuration: `${v.dur}s`, animationDelay: `${-(index % 5) * 0.6}s` }}
      aria-hidden="true"
    >
      {v.kind === 'truck' ? (
        <TruckBody color={v.color} />
      ) : v.kind === 'police' ? (
        <PoliceBody />
      ) : v.kind === 'icecream' ? (
        <IceCreamBody />
      ) : (
        <CarBody color={v.color} />
      )}
    </div>
  )
}

/** A heavy concrete road blockade that drops out of the sky onto the boundary
 *  the chicken just crossed — a deliberate barrier (concrete + hazard stripes)
 *  that blocks the lane behind. The slam cracks the asphalt and kicks up dust. */
function RoadBlock() {
  return (
    <div className="chick-block" aria-hidden="true">
      <svg className="chick-block-svg" viewBox="0 0 58 40" aria-hidden="true">
        {/* contact shadow */}
        <ellipse cx="29" cy="35" rx="25" ry="5" fill="rgba(0,0,0,0.35)" />
        {/* dark support feet */}
        <rect x="12" y="29" width="5" height="9" rx="1.4" fill="#343a42" />
        <rect x="41" y="29" width="5" height="9" rx="1.4" fill="#343a42" />
        {/* beveled concrete top face */}
        <path d="M8 15 L14 8 L44 8 L50 15 Z" fill="url(#cr-stone-top)" stroke="rgba(0,0,0,0.32)" strokeWidth="1" strokeLinejoin="round" />
        {/* concrete front face */}
        <rect x="8" y="15" width="42" height="17" rx="1.5" fill="url(#cr-stone)" stroke="rgba(0,0,0,0.42)" strokeWidth="1.2" />
        {/* yellow/black hazard band across the front */}
        <rect x="8" y="19.5" width="42" height="8" fill="url(#cr-hazard)" />
        <rect x="8" y="19.5" width="42" height="8" fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth="0.8" />
        {/* top-edge sheen + front outline */}
        <rect x="9.5" y="15.6" width="39" height="2.2" rx="1" fill="rgba(255,255,255,0.2)" />
        <rect x="8" y="15" width="42" height="17" rx="1.5" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
      </svg>
      {/* the slam cracks the asphalt under the stone and kicks up a little dust
          (both timed to the stone's landing in CSS) */}
      <span className="chick-impact-cracks">
        <svg viewBox="0 0 54 22" aria-hidden="true">
          <ellipse cx="27" cy="14" rx="20" ry="6" fill="rgba(0,0,0,0.3)" />
          <g stroke="#14171c" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d="M27 13 l-9 -5 l-3 -4" />
            <path d="M27 13 l-7 5 l-5 3" />
            <path d="M27 13 l8 -5 l5 -3" />
            <path d="M27 13 l9 5 l4 3" />
            <path d="M27 13 l-1 -8" />
            <path d="M27 13 l2 8" />
          </g>
          <g stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" fill="none">
            <path d="M26.4 13.6 l-9 -5 l-3 -4" />
            <path d="M27.6 13.6 l8 -5 l5 -3" />
          </g>
        </svg>
      </span>
      <span className="chick-impact-dust">
        <svg viewBox="0 0 54 22" aria-hidden="true">
          <g fill="rgba(210,206,198,0.8)">
            <circle cx="13" cy="12" r="3.2" />
            <circle cx="41" cy="12" r="3" />
            <circle cx="27" cy="9" r="2.6" />
            <circle cx="19" cy="14" r="2.2" />
            <circle cx="35" cy="14" r="2.4" />
          </g>
        </svg>
      </span>
    </div>
  )
}

function Fairness({
  game,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  game: ChickenGameState | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      game
        ? verifyCrashLane(
            game.serverSeed,
            game.clientSeed,
            game.nonce,
            SPECS[game.difficulty].survival,
            game.lanes,
            game.crashLane,
          )
        : null,
    [game],
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
        <Row label="Nonce">{game ? game.nonce : nextNonce}</Row>
        <Row label="Server seed (hashed)">
          <code className="seed">{game ? game.serverSeedHash : 'committed when you bet'}</code>
        </Row>
        {game && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{game.serverSeed}</code>
            </Row>
            <Row label="Crash lane">{game.crashLane > game.lanes ? 'crossed safely' : game.crashLane}</Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ crash lane matches the committed seed' : '✗ mismatch'}
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
