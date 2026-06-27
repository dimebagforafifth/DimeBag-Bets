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
import { fairnessClient } from '../../shared/fair.js'
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

// 3D art assets (nano-banana renders → transparent PNGs) living in public/game-tiles/
// chickenroad/. The chicken (side-on, facing its direction of travel), its hit +
// splat death frames, and the top-down vehicles all match the lobby icons / Dragon
// Tower look. The asphalt is the only opaque one — it's the road itself.
const ART_BASE = import.meta.env.BASE_URL.replace(/\/$/, '') + '/game-tiles/chickenroad/'
const CHICKEN_ART = `${ART_BASE}chicken.png`
const CHICKEN_HIT_ART = `${ART_BASE}chicken-hit.png`
const CHICKEN_SPLAT_ART = `${ART_BASE}chicken-splat.png`
const ASPHALT_ART = `${ART_BASE}asphalt.png`
const VEHICLE_ART = {
  red: `${ART_BASE}car-red.png`,
  blue: `${ART_BASE}car-blue.png`,
  truck: `${ART_BASE}car-truck.png`,
  police: `${ART_BASE}car-police.png`,
  icecream: `${ART_BASE}car-icecream.png`,
} as const
type VehicleArt = keyof typeof VEHICLE_ART

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
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [game, setGame] = useState<ChickenGameState | null>(null)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hop, setHop] = useState(0) // bumped each step so the hop animation replays
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const runnerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available
  const resolving = useResolving(account.id)
  const soundOn = useSoundEnabled()

  // Warm the bust + vehicle art up front so the splat/cars never flash in unloaded.
  useEffect(() => {
    for (const src of [CHICKEN_HIT_ART, CHICKEN_SPLAT_ART, ...Object.values(VEHICLE_ART)]) {
      const img = new Image()
      img.src = src
    }
  }, [])

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

  // Keep the chicken in view by scrolling ONLY the road viewport — never the page —
  // and only when the bird nears an edge. The screen around it stays still while the
  // chicken visibly moves forward, instead of the whole view re-centering each step.
  useEffect(() => {
    const view = scrollRef.current
    const runner = runnerRef.current
    if (!view || !runner) return
    const chickX = runner.offsetLeft // the chicken's centre within the road
    const margin = view.clientWidth * 0.28 // headroom kept at each edge
    if (chickX > view.scrollLeft + view.clientWidth - margin) {
      view.scrollTo({ left: chickX - view.clientWidth + margin, behavior: 'smooth' })
    } else if (chickX < view.scrollLeft + margin) {
      view.scrollTo({ left: Math.max(0, chickX - margin), behavior: 'smooth' })
    }
  }, [game?.position])

  // The (hidden) crash lane's server seed now comes from the platform fairness AUTHORITY
  // (commit hash before play → reveal after), not a browser randomServerSeed(). The road math
  // is unchanged.
  async function start() {
    if (inFlightRef.current || game?.status === 'active') return
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const g = createChickenGame(account, {
        stake: bet,
        difficulty,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      setGame(g)
      onBalanceChange()
      play('bet')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
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
            <button
              className="chip"
              disabled={!idle}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={!idle}
              onClick={() => setBet((b) => Math.min(available, b * 2))}
            >
              2×
            </button>
          </div>
        </label>
        {active && game!.position >= 1 && (
          <ProfitReadout total={Math.round(bet * game!.multiplier)} multiplier={game!.multiplier} />
        )}

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
            <button
              className="action action-cashout"
              onClick={doCash}
              disabled={game!.position < 1}
            >
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
          <p className="chick-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
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

        <div className="chick-scroll" ref={scrollRef}>
          <div
            className="chick-road"
            style={{ width: KERB_W + lanes * LANE_W, backgroundImage: `url(${ASPHALT_ART})` }}
          >
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
            <div ref={runnerRef} className="chick-runner" style={{ left: chickLeft }}>
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
          <WinPopup
            key={game.wager.id}
            multiplier={game.multiplier}
            stake={game.wager.stake}
            delayMs={POPUP_DELAY_MS}
          />
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

  // settled → the flattened roadkill pancake; mid-bust → the hit frame (wings up,
  // feathers flying) squashed flat by the slam; alive → the walking hen.
  const src = dead && settled ? CHICKEN_SPLAT_ART : dead ? CHICKEN_HIT_ART : CHICKEN_ART
  const cls = dead && settled ? 'is-splat' : dead ? 'is-roadkill' : 'is-walk'
  return (
    <div className={`chick-svg ${cls}`}>
      <img src={src} alt="" aria-hidden draggable={false} />
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
        <pattern
          id="cr-hazard"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
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
        <rect
          x="3"
          y="2"
          width="18"
          height="40"
          rx="5"
          fill="#1b1f25"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1"
        />
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

/** The bust: a car barrels straight down the crash lane and drives clean THROUGH
 *  the chicken (and off the bottom) — it never stops; the run just ends. */
function HitCar() {
  return (
    <div className="chick-hitcar" aria-hidden="true">
      <img className="chick-veh-img" src={VEHICLE_ART.red} alt="" draggable={false} />
    </div>
  )
}

/* ---------------------------- ambient traffic --------------------------- */

/** Purely-visual traffic on lanes the chicken can't reach yet — cars, trucks,
 *  cruisers and the odd ice cream van driving down on a loop. Each lane picks a
 *  vehicle + speed; a negative delay starts them scattered mid-road so the
 *  traffic reads as already flowing. */
const TRAFFIC: { art: VehicleArt; dur: number }[] = [
  { art: 'blue', dur: 2.4 }, // navy sedan
  { art: 'truck', dur: 3.4 }, // delivery truck
  { art: 'police', dur: 2.0 },
  { art: 'red', dur: 2.7 }, // red sedan
  { art: 'icecream', dur: 4.4 }, // ice cream van, ambling by
  { art: 'truck', dur: 3.7 }, // box truck
  { art: 'blue', dur: 2.2 },
  { art: 'red', dur: 2.9 },
  { art: 'police', dur: 2.6 },
]

function Traffic({ index }: { index: number }) {
  const v = TRAFFIC[index % TRAFFIC.length]
  const wide = v.art === 'truck' || v.art === 'icecream'
  return (
    <div
      className={`chick-traffic ${wide ? 'is-truck' : ''}`}
      style={{ animationDuration: `${v.dur}s`, animationDelay: `${-(index % 5) * 0.6}s` }}
      aria-hidden="true"
    >
      <img className="chick-veh-img" src={VEHICLE_ART[v.art]} alt="" draggable={false} />
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
        <path
          d="M8 15 L14 8 L44 8 L50 15 Z"
          fill="url(#cr-stone-top)"
          stroke="rgba(0,0,0,0.32)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* concrete front face */}
        <rect
          x="8"
          y="15"
          width="42"
          height="17"
          rx="1.5"
          fill="url(#cr-stone)"
          stroke="rgba(0,0,0,0.42)"
          strokeWidth="1.2"
        />
        {/* yellow/black hazard band across the front */}
        <rect x="8" y="19.5" width="42" height="8" fill="url(#cr-hazard)" />
        <rect
          x="8"
          y="19.5"
          width="42"
          height="8"
          fill="none"
          stroke="rgba(0,0,0,0.32)"
          strokeWidth="0.8"
        />
        {/* top-edge sheen + front outline */}
        <rect x="9.5" y="15.6" width="39" height="2.2" rx="1" fill="rgba(255,255,255,0.2)" />
        <rect
          x="8"
          y="15"
          width="42"
          height="17"
          rx="1.5"
          fill="none"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="1.2"
        />
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
            <Row label="Crash lane">
              {game.crashLane > game.lanes ? 'crossed safely' : game.crashLane}
            </Row>
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
