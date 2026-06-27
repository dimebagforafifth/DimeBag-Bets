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
import { fairnessClient } from '../../shared/fair.js'
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
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

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

  // The open's server seed now comes from the platform fairness AUTHORITY (commit hash before
  // play → reveal after), not a browser randomServerSeed(). The tier math is unchanged.
  async function openIt() {
    if (inFlightRef.current || opening) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    setShowOdds(false) // close the odds panel when a new case opens
    clearTimeout(soundTimer.current)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playCases(account, {
        stake: bet,
        risk,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
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
        setHistory((h) => [{ multiplier: r.multiplier, won: r.multiplier > 1 }, ...h].slice(0, 16))
        // hold the win/loss cue until the case has popped open and shown the prize
        soundTimer.current = window.setTimeout(
          () => play(r.multiplier > 1 ? 'win' : 'lose'),
          RESULT_SOUND_DELAY_MS,
        )
      }, OPEN_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const showResult = round != null && !opening

  return (
    <>
      <div className="cases" style={{ '--accent': 'var(--gold)' } as CSSProperties}>
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
            <p className="cases-error">
              Stake exceeds what you can wager ({formatMoney(available)}).
            </p>
          )}
        </section>

        <section className="cases-stage">
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
                    <CaseBox open={landed} />
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

/**
 * A premium treasure chest rendered as two stacked transparent PNGs sharing the
 * same footprint: chest-closed.png shown at rest, chest-open.png (lid up, glowing)
 * shown the instant the cell lands. The reveal is a state swap — the closed image
 * crossfades/scales out while the open image fades in (replacing the old rotateX
 * lid hinge, which doesn't apply to a flat <img>) — with the tier-coloured bloom
 * (.cases-chest-bloom) kept layered on top so the spilling light still reads.
 *
 * One chest art is reused for all 52 reel cells (the old 5 decorative wood variants
 * are dropped). Purely cosmetic (aria-hidden); the prize shows in the reel-level
 * .cases-reel-result pill.
 */
const CaseBox = memo(function CaseBox({ open }: { open: boolean }) {
  return (
    <div className={`cases-chest ${open ? 'is-open' : ''}`} aria-hidden="true">
      <span className="cases-chest-shadow" />
      {/* closed art at rest; crossfades out as the lid pops on open */}
      <img
        className="cases-chest-img cases-chest-img-closed"
        src="/game-assets/cases/chest-closed.png"
        alt=""
        draggable={false}
      />
      {/* open art (lid up, glowing) — fades/scales in to read as the reveal */}
      <img
        className="cases-chest-img cases-chest-img-open"
        src="/game-assets/cases/chest-open.png"
        alt=""
        draggable={false}
      />
      {/* tier-coloured bloom at the opening, layered above the chest art */}
      <span className="cases-chest-bloom" />
    </div>
  )
})

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
            Average return <strong>{returnPct}%</strong> · House edge <strong>{edgePct}%</strong>
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
  return m === 0
    ? '0'
    : m >= 100
      ? Math.round(m).toString()
      : (Math.round(m * 100) / 100).toString()
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
