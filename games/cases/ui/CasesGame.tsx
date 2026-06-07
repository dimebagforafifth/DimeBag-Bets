import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  buildTiers,
  cumulativeWeights,
  DEFAULT_CASES_CONFIG,
  playCases,
  randomServerSeed,
  RISKS,
  verifyCase,
  type CasesHouseConfig,
  type CasesRisk,
  type CasesRound,
  type Tier,
} from '../index.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './cases.css'

const CASES_RULES: ReactNode[] = [
  'Set your bet, pick a risk level, then open the case.',
  'The reel slides across a long strip of multipliers and stops with one cell centred under the marker — that is your prize.',
  'Low risk lands small wins often; high risk is mostly blanks but the tail reaches a huge jackpot.',
  <>
    <strong>Payout = bet × the cell you land on</strong> (a 0× blank loses the bet). Each open is
    provably fair.
  </>,
]

interface CasesGameProps {
  account: Account
  houseConfig?: CasesHouseConfig
  onBalanceChange: () => void
}

const OPEN_MS = 4200 // reel slide duration; the prize lands when it ends
const RESULT_SOUND_DELAY_MS = 700 // hold the win/loss cue until the case opens & reveals
const CELL_PITCH = 104 // a cell is 96px wide + 8px gap
const STRIP_LEN = 52 // cells drawn on the strip (looks full while sliding)
const LANDING = 46 // the index the winning cell occupies (far right → a long slide)

export function CasesGame({
  account,
  houseConfig = DEFAULT_CASES_CONFIG,
  onBalanceChange,
}: CasesGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [risk, setRisk] = useState<CasesRisk>('medium')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<CasesRound | null>(null)
  const [opening, setOpening] = useState(false)
  const [strip, setStrip] = useState<number[]>(() => initialStrip(risk, houseConfig))
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  // whether the all-outcomes odds panel is open (toggled by tapping any colour)
  const [showOdds, setShowOdds] = useState(false)
  const timer = useRef(0)
  const soundTimer = useRef(0)

  const available = maxBet(account)
  const tiers = useMemo(() => buildTiers(risk, houseConfig), [risk, houseConfig])
  const colors = useMemo(() => buildColorMap(tiers), [tiers])
  const legend = useMemo(() => legendRows(tiers), [tiers])
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || opening
  const resolving = useResolving(account.id)

  // Rebuild the resting preview only when the risk/config changes — NOT when a spin
  // ends — so the landed result stays under the marker until the next open is played.
  useEffect(() => {
    if (opening) return
    setRound(null) // changing risk clears the previous result
    setStrip(initialStrip(risk, houseConfig))
    setOffset(0)
    setAnimate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk, houseConfig])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      clearTimeout(soundTimer.current)
    },
    [],
  )

  function openIt() {
    setError(null)
    setShowOdds(false) // close the odds panel when a new case opens
    clearTimeout(soundTimer.current)
    try {
      nonceRef.current += 1
      const r = playCases(account, {
        stake: bet,
        risk,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      onBalanceChange()
      play('spin', { durationMs: OPEN_MS }) // the reel whirs + ticks down to the prize

      // Build a fresh strip with the WINNING tier fixed at the landing index, the
      // rest sampled from the distribution so the reel looks varied and full.
      const cells = sampleStrip(tiers, houseConfig, r.tierIndex)
      setStrip(cells)
      setRound(r)
      setOpening(true)

      // start from the resting position, then slide left to centre the landing cell
      setAnimate(false)
      setOffset(0)
      // next frame: enable the transition and translate to the landing offset
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimate(true)
          setOffset(-LANDING * CELL_PITCH)
        })
      })

      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setOpening(false)
        play('chest') // the satisfying unlatch + lid creak the instant the case opens
        setHistory((h) =>
          [{ multiplier: r.multiplier, won: r.multiplier > 1 }, ...h].slice(0, 16),
        )
        // hold the win/loss cue until the case has popped open and shown the prize
        soundTimer.current = window.setTimeout(
          () => play(r.multiplier > 1 ? 'win' : 'lose'),
          RESULT_SOUND_DELAY_MS,
        )
      }, OPEN_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const showResult = round != null && !opening

  return (
    <>
    <div className="cases" style={{ '--accent': '#ffb84d' } as CSSProperties}>
      <span className="sr-only" role="status" aria-live="polite">
        {showResult
          ? `Opened ${round!.multiplier}×${round!.multiplier > 1 ? ', you won' : ', no win'}`
          : ''}
      </span>

      <section className="cases-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={opening}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={opening}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={opening}
              onClick={() => setBet((b) => Math.min(available, b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        <div className="field">
          <span className="field-label">Risk</span>
          <div className="cases-chips">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip ${risk === r ? 'is-on' : ''}`}
                aria-pressed={risk === r}
                disabled={opening}
                onClick={() => setRisk(r)}
              >
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <button className="action action-bet" onClick={openIt} disabled={betInvalid || resolving}>
          Open case
        </button>

        {error && <p className="cases-error">{error}</p>}
        {bet > available && !error && (
          <p className="cases-error">Stake exceeds what you can wager ({formatMoney(available)}).</p>
        )}

      </section>

      <section className="cases-stage">
        <ChestDefs />
        <div className="cases-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {formatMult(h.multiplier)}×
            </span>
          ))}
        </div>

        <div
          className={`cases-reel ${showResult && round!.multiplier > 1 ? 'is-win' : ''}`}
          style={
            showResult && round!.multiplier > 1
              ? ({ '--win-color': colorFor(round!.multiplier, colors) } as CSSProperties)
              : undefined
          }
        >
          <span className="cases-marker" />
          <span className="cases-reel-edge is-l" />
          <span className="cases-reel-edge is-r" />
          <div
            className="cases-strip"
            style={{
              transform: `translateX(${offset}px)`,
              transition: animate
                ? `transform ${OPEN_MS}ms cubic-bezier(0.12, 0.7, 0.16, 1)`
                : 'none',
            }}
          >
            {strip.map((m, i) => {
              const landed = showResult && i === LANDING
              return (
                <div
                  key={i}
                  className={`cases-cell ${landed ? 'is-landed' : ''} ${
                    landed && round!.multiplier > 1 ? 'is-win' : ''
                  }`}
                  style={{ '--swatch': colorFor(m, colors) } as CSSProperties}
                >
                  <CaseBox open={landed} variant={i} />
                </div>
              )
            })}
          </div>
          {showResult && (
            <div
              key={round!.nonce}
              className={`cases-reel-result ${round!.multiplier > 1 ? 'is-win' : 'is-loss'}`}
              style={{ '--swatch': colorFor(round!.multiplier, colors) } as CSSProperties}
            >
              {formatMult(round!.multiplier)}×
            </div>
          )}
        </div>

        <CasePayouts
          legend={legend}
          colors={colors}
          show={showOdds}
          onToggle={() => setShowOdds((v) => !v)}
          hit={showResult ? round!.multiplier : null}
        />

        <Fairness
          round={showResult ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          editable={!opening}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
    {/* How to play sits between the game card and the per-game ledger rendered below it */}
    <Rules points={CASES_RULES} />
    </>
  )
}

/* ----------------------------- helpers ---------------------------------- */

/** Closed chests vary cosmetically: 5 wood stains + a lid emblem, picked by cell
 *  index. Purely decorative — it does NOT hint at the prize (revealed only on open). */
const CHEST_WOOD = ['chestWoodA', 'chestWoodB', 'chestWoodC', 'chestWoodD', 'chestWoodE']
const CHEST_LIDWOOD = ['chestLidA', 'chestLidB', 'chestLidC', 'chestLidD', 'chestLidE']
const CHEST_EMBLEM = ['diamond', 'round', 'sparkle', 'plus', 'studs']

/** A small brass emblem on the lid; its shape varies by variant for variety. */
function LidEmblem({ kind }: { kind: string }) {
  switch (kind) {
    case 'round':
      return (
        <>
          <circle cx="100" cy="41" r="5" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.6" />
          <circle cx="100" cy="41" r="2" fill="url(#chestRivet)" />
        </>
      )
    case 'sparkle':
      return (
        <path d="M100 34 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.6" />
      )
    case 'plus':
      return (
        <path d="M97 35 h6 v3.5 h3.5 v6 h-3.5 v3.5 h-6 v-3.5 h-3.5 v-6 h3.5 Z" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.6" />
      )
    case 'studs':
      return (
        <>
          <circle cx="91" cy="41" r="2" fill="url(#chestRivet)" />
          <circle cx="100" cy="41" r="2" fill="url(#chestRivet)" />
          <circle cx="109" cy="41" r="2" fill="url(#chestRivet)" />
        </>
      )
    case 'diamond':
    default:
      return (
        <path d="M100 34 l6.5 7 -6.5 7 -6.5 -7 Z" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.6" />
      )
  }
}

/**
 * A brown wooden treasure chest, drawn as two overlaid SVGs that share one
 * coordinate space (viewBox "0 20 200 124"): a static BODY (wood box, brass
 * corner brackets + straps, and a glowing interior that's hidden until open) and
 * a LID that hinges up-and-back. The lid is its OWN positioned <svg> element (not
 * an inner <g>) because 3D CSS transforms render reliably on HTML/SVG-root
 * elements but are flattened on SVG sub-groups in several browsers.
 *
 * The wood + brass are UNIFORM (never tier-tinted). Only the light spilling out of
 * an opened chest takes var(--swatch) (the winning tier colour), set on .cases-cell.
 * All gradient/clip ids live once in <ChestDefs/> (rendered a single time) and are
 * referenced here by url(#...), so the 52 reel instances never duplicate an id.
 *
 * Purely cosmetic (aria-hidden); the prize shows in the reel-level .cases-reel-result.
 */
const CaseBox = memo(function CaseBox({ open, variant = 0 }: { open: boolean; variant?: number }) {
  const v = ((variant % CHEST_WOOD.length) + CHEST_WOOD.length) % CHEST_WOOD.length
  const wood = `url(#${CHEST_WOOD[v]})`
  const lidWood = `url(#${CHEST_LIDWOOD[v]})`
  return (
    <div className={`cases-chest ${open ? 'is-open' : ''}`} aria-hidden="true">
      <span className="cases-chest-shadow" />

      {/* ---- body: wooden box + brass + the glowing interior (revealed on open) ---- */}
      <svg
        className="cases-chest-body"
        viewBox="0 20 200 124"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        role="presentation"
      >
        <path
          d="M14 92 q0 -16 16 -16 h140 q16 0 16 16 v34 q0 14 -14 14 H28 q-14 0 -14 -14 Z"
          fill={wood}
          stroke="url(#chestWoodEdge)"
          strokeWidth="1.5"
        />
        {/* vertical plank seams */}
        <g stroke="url(#chestSeam)" strokeWidth="1.4" fill="none">
          <path d="M58 80 V138" />
          <path d="M100 80 V140" />
          <path d="M142 80 V138" />
        </g>
        {/* warm top-edge rim highlight */}
        <path
          d="M16 92 q0 -14 16 -14 h136 q16 0 16 14"
          fill="none"
          stroke="url(#chestRimLight)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* L-shaped brass corner brackets */}
        <g fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.8">
          <path d="M16 118 h12 v6 h-12 v14 q0 4 4 4 h8 v6 h-10 q-12 0 -12 -12 Z" />
          <path d="M184 118 h-12 v6 h12 v14 q0 4 -4 4 h-8 v6 h10 q12 0 12 -12 Z" />
        </g>
        {/* two vertical brass straps with rivets */}
        <g>
          <rect x="55" y="80" width="11" height="60" rx="2" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.8" />
          <rect x="134" y="80" width="11" height="60" rx="2" fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.8" />
          <circle cx="60.5" cy="100" r="1.8" fill="url(#chestRivet)" />
          <circle cx="60.5" cy="132" r="1.8" fill="url(#chestRivet)" />
          <circle cx="139.5" cy="100" r="1.8" fill="url(#chestRivet)" />
          <circle cx="139.5" cy="132" r="1.8" fill="url(#chestRivet)" />
        </g>
        {/* the glowing open mouth — drawn ON TOP of the body, hidden until open */}
        <g className="cases-chest-interior">
          <path
            d="M28 84 q0 -10 12 -10 h120 q12 0 12 10 v2 q0 9 -12 9 H40 q-12 0 -12 -9 Z"
            fill="url(#chestCavity)"
          />
          <g className="cases-chest-rays">
            <polygon points="100,92 86,30 96,34" />
            <polygon points="100,92 100,24 110,32" />
            <polygon points="100,92 118,32 124,42" />
            <polygon points="100,92 72,36 82,44" />
            <polygon points="100,92 130,42 140,54" />
          </g>
          <ellipse className="cases-chest-innerlight" cx="100" cy="88" rx="66" ry="13" fill="url(#chestInnerLight)" />
        </g>
      </svg>

      {/* tier-coloured bloom at the opening, sitting over the body but under the lid */}
      <span className="cases-chest-bloom" />

      {/* ---- lid: its own SVG so the 3D hinge is reliable; flips up-and-back ---- */}
      <svg
        className="cases-chest-lid"
        viewBox="0 20 200 124"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        role="presentation"
      >
        {/* domed wood + detail (cubic dome bulges UP). No clip-path — the seams sit
            inside the dome and the straps are short enough to stay on it, so 52
            chests don't each pay for an SVG clip while the reel slides. */}
        <g>
          <path d="M16 78 C16 40 56 28 100 28 C144 28 184 40 184 78 Z" fill={lidWood} />
          {/* concentric plank seams following the dome */}
          <g stroke="url(#chestSeam)" strokeWidth="1.3" fill="none">
            <path d="M30 78 C30 50 62 42 100 42 C138 42 170 50 170 78" />
            <path d="M46 78 C46 58 72 52 100 52 C128 52 154 58 154 78" />
            <path d="M64 78 C64 66 82 62 100 62 C118 62 136 66 136 78" />
          </g>
          {/* brass straps continuing the body straps up over the lower dome */}
          <g fill="url(#chestBrass)" stroke="url(#chestBrassEdge)" strokeWidth="0.8">
            <rect x="55" y="48" width="11" height="30" rx="2" />
            <rect x="134" y="48" width="11" height="30" rx="2" />
          </g>
        </g>
        {/* lit top edge + crisp outline */}
        <path d="M16 78 C16 40 56 28 100 28 C144 28 184 40 184 78" fill="none" stroke="url(#chestRimLight)" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 78 C16 40 56 28 100 28 C144 28 184 40 184 78 Z" fill="none" stroke="url(#chestWoodEdge)" strokeWidth="1.5" />
        <circle cx="60.5" cy="56" r="1.8" fill="url(#chestRivet)" />
        <circle cx="139.5" cy="56" r="1.8" fill="url(#chestRivet)" />
        {/* a small brass emblem — its shape varies by variant for visual variety */}
        <LidEmblem kind={CHEST_EMBLEM[v]} />
        {/* ornate brass lock plate on the lid front — lifts away with the lid */}
        <g>
          <path d="M82 48 h36 v13 q0 13 -18 17 q-18 -4 -18 -17 Z" fill="url(#chestLock)" stroke="url(#chestBrassEdge)" strokeWidth="1" />
          <path d="M85 50 h9 v24 q-6 -2 -9 -10 Z" fill="url(#chestLockShine)" />
          <circle cx="100" cy="61" r="5" fill="none" stroke="url(#chestBrassEdge)" strokeWidth="0.9" />
          <circle cx="100" cy="61" r="3.2" fill="#180d04" />
          <path d="M98.4 63 h3.2 l1.1 9 h-5.4 Z" fill="#180d04" />
        </g>
      </svg>
    </div>
  )
})

/** Every gradient/clipPath id used by CaseBox, declared ONCE. Rendered a single
 *  time (outside the 52-cell reel loop) so the ids never duplicate. Draws nothing
 *  itself (0×0). Wood/brass gradients are tier-neutral; the tier colour only ever
 *  appears via CSS var(--swatch) in the bloom/rays/glow. */
function ChestDefs() {
  return (
    <svg className="cases-chest-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {/* ---- 5 wood stains for closed-chest variety (body + lid each) ---- */}
        {/* A — classic oak */}
        <linearGradient id="chestWoodA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a86b33" /><stop offset="38%" stopColor="#8a5226" /><stop offset="100%" stopColor="#4f2b14" />
        </linearGradient>
        <linearGradient id="chestLidA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a86b33" /><stop offset="45%" stopColor="#7a4620" /><stop offset="100%" stopColor="#5d3318" />
        </linearGradient>
        {/* B — dark walnut */}
        <linearGradient id="chestWoodB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a4a2a" /><stop offset="38%" stopColor="#5a3318" /><stop offset="100%" stopColor="#33200f" />
        </linearGradient>
        <linearGradient id="chestLidB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#84512e" /><stop offset="45%" stopColor="#5a331a" /><stop offset="100%" stopColor="#3a2410" />
        </linearGradient>
        {/* C — red mahogany */}
        <linearGradient id="chestWoodC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9c5638" /><stop offset="38%" stopColor="#7a3820" /><stop offset="100%" stopColor="#451d10" />
        </linearGradient>
        <linearGradient id="chestLidC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a85e3a" /><stop offset="45%" stopColor="#7a3a1f" /><stop offset="100%" stopColor="#52260f" />
        </linearGradient>
        {/* D — golden honey */}
        <linearGradient id="chestWoodD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8893f" /><stop offset="38%" stopColor="#956322" /><stop offset="100%" stopColor="#583714" />
        </linearGradient>
        <linearGradient id="chestLidD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c2954f" /><stop offset="45%" stopColor="#8a5d28" /><stop offset="100%" stopColor="#5c3a16" />
        </linearGradient>
        {/* E — weathered grey-brown */}
        <linearGradient id="chestWoodE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86735c" /><stop offset="38%" stopColor="#5e4a38" /><stop offset="100%" stopColor="#342619" />
        </linearGradient>
        <linearGradient id="chestLidE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#90795f" /><stop offset="45%" stopColor="#5e4631" /><stop offset="100%" stopColor="#372818" />
        </linearGradient>
        <linearGradient id="chestWoodEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b3e1e" />
          <stop offset="100%" stopColor="#2b1a0e" />
        </linearGradient>
        <linearGradient id="chestSeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2110" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#1f1107" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="chestRimLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7b878" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c98a4b" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="chestBrass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d88a" />
          <stop offset="48%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#8a6510" />
        </linearGradient>
        <linearGradient id="chestBrassEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7e7af" />
          <stop offset="100%" stopColor="#6e4e12" />
        </linearGradient>
        <linearGradient id="chestLock" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcefbf" />
          <stop offset="40%" stopColor="#e8c247" />
          <stop offset="100%" stopColor="#9a7414" />
        </linearGradient>
        <linearGradient id="chestLockShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff6da" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff6da" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="chestRivet" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff2c4" />
          <stop offset="55%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#6e4e12" />
        </radialGradient>
        <linearGradient id="chestCavity" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c0f06" />
          <stop offset="100%" stopColor="#0a0502" />
        </linearGradient>
        <radialGradient id="chestInnerLight" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#fff8e1" />
          <stop offset="45%" stopColor="#ffe7a8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffe7a8" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/** A compact row of payout colours under the reel. Tapping any colour toggles a
 *  single panel listing EVERY outcome's multiplier and its % chance of hitting.
 *  The colour that just won glows (`hit`). */
function CasePayouts({
  legend,
  colors,
  show,
  onToggle,
  hit,
}: {
  legend: { multiplier: number; probability: number }[]
  colors: Map<number, string>
  show: boolean
  onToggle: () => void
  hit: number | null
}) {
  // The realized return is the probability-weighted mean of these exact outcomes,
  // Σ P·multiplier — so the < 100% figure (and the gap to 100%) IS the house edge,
  // shown straight from the odds listed above it.
  const rtp = legend.reduce((acc, r) => acc + r.probability * r.multiplier, 0)
  const returnPct = (rtp * 100).toFixed(1)
  const edgePct = ((1 - rtp) * 100).toFixed(1)
  return (
    <div className="cases-payouts">
      {show && (
        <div className="cases-odds" role="dialog" aria-label="Payout odds">
          {legend.map((row) => (
            <div className="cases-odds-row" key={row.multiplier}>
              <span
                className={`cases-odds-dot ${row.multiplier === 0 ? 'is-blank' : ''}`}
                style={{ '--swatch': colorFor(row.multiplier, colors) } as CSSProperties}
              />
              <span className="cases-odds-mult">{formatMult(row.multiplier)}×</span>
              <span className="cases-odds-pct">
                {oddsLabel(row.probability)}
                <span className="cases-odds-word"> chance</span>
              </span>
            </div>
          ))}
          <div className="cases-odds-edge">
            Average return <strong>{returnPct}%</strong> · House edge{' '}
            <strong>{edgePct}%</strong>
          </div>
        </div>
      )}
      <div className="cases-swatches">
        {legend.map((row) => (
          <button
            key={row.multiplier}
            type="button"
            className={`cases-swatch ${row.multiplier === 0 ? 'is-blank' : ''} ${
              hit === row.multiplier ? 'is-hit' : ''
            } ${show ? 'is-active' : ''}`}
            style={{ '--swatch': colorFor(row.multiplier, colors) } as CSSProperties}
            onClick={onToggle}
            aria-expanded={show}
            aria-label={`${formatMult(row.multiplier)} times, ${oddsLabel(row.probability)} chance`}
          />
        ))}
      </div>
    </div>
  )
}

/** A blank reads as a muted slate; wins get a vivid hue from the palette. */
const LOSE_COLOR = '#2a3744'

/** A spread of bright, vivid, clearly-distinct hues, low → high multiplier. */
const WIN_PALETTE = [
  '#27e36b', // green
  '#10e0d0', // teal
  '#33a0ff', // blue
  '#9b5cff', // violet
  '#ff4fd2', // magenta
  '#ff9a14', // orange
  '#ff3b3b', // red
  '#ffe23d', // gold
]

/** Map every distinct winning multiplier to its own palette colour (low → high). */
function buildColorMap(tiers: Tier[]): Map<number, string> {
  const wins = [...new Set(tiers.map((t) => t.multiplier).filter((m) => m > 0))].sort(
    (a, b) => a - b,
  )
  const map = new Map<number, string>()
  wins.forEach((m, i) => {
    const color =
      wins.length <= WIN_PALETTE.length
        ? WIN_PALETTE[Math.round((i / Math.max(1, wins.length - 1)) * (WIN_PALETTE.length - 1))]
        : WIN_PALETTE[i % WIN_PALETTE.length]
    map.set(m, color)
  })
  return map
}

/** A multiplier's colour: its palette hue, or slate for a 0× blank. */
function colorFor(multiplier: number, colors: Map<number, string>): string {
  return colors.get(multiplier) ?? LOSE_COLOR
}

/** Distinct multipliers + their TOTAL probability — collapses the (possibly
 *  several) 0× blank tiers into one legend row, sorted high → low so the jackpot
 *  reads first. */
function legendRows(tiers: Tier[]): { multiplier: number; probability: number }[] {
  const byMult = new Map<number, number>()
  for (const t of tiers) byMult.set(t.multiplier, (byMult.get(t.multiplier) ?? 0) + t.probability)
  return [...byMult.entries()]
    .map(([multiplier, probability]) => ({ multiplier, probability }))
    .sort((a, b) => b.multiplier - a.multiplier)
}

/** A short multiplier label (e.g. 0, 1.98, 707.14). */
function formatMult(m: number): string {
  return m === 0 ? '0' : m >= 100 ? Math.round(m).toString() : (Math.round(m * 100) / 100).toString()
}

/** A probability as a percentage (never "1 in N"): whole % for common outcomes,
 *  more decimals for the rare tails so a jackpot never rounds to 0%. */
function oddsLabel(p: number): string {
  if (p <= 0) return '—'
  const pct = p * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  if (pct >= 0.1) return `${pct.toFixed(2)}%`
  return `${Number(pct.toPrecision(2))}%`
}

/** Pick a tier index from a uniform draw over the cumulative weights. */
function pickTierIndex(cum: number[], u: number): number {
  for (let i = 0; i < cum.length; i++) if (u < cum[i]) return i
  return cum.length - 1
}

/** A varied resting strip (cosmetic; never settled), sampled from the curve. */
function initialStrip(risk: CasesRisk, config: CasesHouseConfig): number[] {
  return sampleStrip(buildTiers(risk, config), config, -1)
}

/**
 * Build the visible reel: STRIP_LEN cells sampled from the tier distribution so
 * the strip looks full and representative, with the WINNING tier's multiplier
 * forced into the LANDING slot (when winTierIndex ≥ 0) so the cell that stops
 * under the marker shows exactly the seed-derived prize.
 */
function sampleStrip(tiers: Tier[], _config: CasesHouseConfig, winTierIndex: number): number[] {
  const cum = cumulativeWeights(tiers)
  const cells: number[] = []
  for (let i = 0; i < STRIP_LEN; i++) {
    // a cosmetic, distribution-weighted fill (Math.random is fine — purely visual)
    cells.push(tiers[pickTierIndex(cum, Math.random())].multiplier)
  }
  if (winTierIndex >= 0) cells[LANDING] = tiers[winTierIndex].multiplier
  return cells
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: CasesRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      round
        ? verifyCase(round.serverSeed, round.clientSeed, round.nonce, round.risk, {
            tierIndex: round.tierIndex,
            multiplier: round.multiplier,
          })
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
            disabled={!editable}
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
                {verified ? '✓ prize matches the committed seed' : '✗ mismatch'}
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
