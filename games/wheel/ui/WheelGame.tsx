import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  buildWheel,
  DEFAULT_WHEEL_CONFIG,
  legend,
  playWheel,
  randomServerSeed,
  RISKS,
  SEGMENT_OPTIONS,
  verifySpin,
  type WheelHouseConfig,
  type WheelRisk,
  type WheelRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './wheel.css'

const WHEEL_RULES: ReactNode[] = [
  'Set your bet, choose a risk level and how many segments the wheel has, then spin.',
  'The wheel stops on a random segment and pays that segment’s multiplier.',
  'Low risk fills most segments with small wins; high risk is mostly 0× with one big jackpot pocket.',
  <>
    <strong>Payout = bet × the segment you land on</strong> (0× segments lose the bet). The spin is
    provably fair.
  </>,
]

interface WheelGameProps {
  account: Account
  houseConfig?: WheelHouseConfig
  onBalanceChange: () => void
}

const SPIN_MS = 3600 // wheel spin duration; the result lands when it ends

export function WheelGame({
  account,
  houseConfig = DEFAULT_WHEEL_CONFIG,
  onBalanceChange,
}: WheelGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [risk, setRisk] = useState<WheelRisk>('medium')
  const [segments, setSegments] = useState(30)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<WheelRound | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef(0)

  const available = maxBet(account)
  const table = useMemo(
    () => buildWheel(risk, segments, houseConfig),
    [risk, segments, houseConfig],
  )
  const tiers = useMemo(() => legend(table), [table])
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || spinning
  const resolving = useResolving(account.id)

  useEffect(() => () => clearTimeout(timer.current), [])

  const colors = useMemo(() => buildColorMap(table), [table])
  const gradient = useMemo(() => conicGradient(table, colors), [table, colors])

  // The server seed now comes from the platform fairness AUTHORITY (commit hash before play →
  // reveal after), not a browser randomServerSeed(). The spin math is unchanged.
  async function spin() {
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playWheel(account, {
        stake: bet,
        risk,
        segments,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      onBalanceChange()
      setRound(r)
      setSpinning(true)

      // Rotate so the landed segment's center stops under the top pointer.
      const arc = 360 / segments
      const segCenter = (r.segment + 0.5) * arc
      const desiredMod = (360 - segCenter + 360) % 360
      setRotation((cur) => {
        const curMod = ((cur % 360) + 360) % 360
        let delta = desiredMod - curMod
        if (delta < 0) delta += 360
        return cur + 360 * 4 + delta
      })

      // Start the spin sound on the NEXT animation frame — the same frame the
      // wheel's CSS transition begins to paint — so the ticking lines up exactly
      // with the wheel starting to move, not a frame or two early on the click.
      requestAnimationFrame(() => play('spin', { durationMs: SPIN_MS }))

      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setSpinning(false)
        setHistory((h) => [{ multiplier: r.multiplier, won: r.multiplier > 1 }, ...h].slice(0, 16))
        play(r.multiplier > 1 ? 'win' : 'lose')
      }, SPIN_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const showResult = round != null && !spinning

  return (
    <div className="wheel">
      <span className="sr-only" role="status" aria-live="polite">
        {showResult
          ? `Landed on ${round!.multiplier}×${round!.multiplier > 1 ? ', you won' : ', no win'}`
          : ''}
      </span>
      <section className="wheel-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={spinning}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={spinning}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={spinning}
              onClick={() => setBet((b) => Math.min(available, b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        <div className="field">
          <span className="field-label">Risk</span>
          <div className="wheel-chips">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip ${risk === r ? 'is-on' : ''}`}
                aria-pressed={risk === r}
                disabled={spinning}
                onClick={() => setRisk(r)}
              >
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Segments</span>
          <div className="wheel-chips">
            {SEGMENT_OPTIONS.map((n) => (
              <button
                key={n}
                className={`chip ${segments === n ? 'is-on' : ''}`}
                aria-pressed={segments === n}
                disabled={spinning}
                onClick={() => setSegments(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button className="action action-bet" onClick={spin} disabled={betInvalid || resolving}>
          Play
        </button>

        {error && <p className="wheel-error">{error}</p>}
        {bet > available && !error && (
          <p className="wheel-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}
      </section>

      <section className="wheel-stage">
        <div className="wheel-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier}×
            </span>
          ))}
        </div>

        <div className={`wheel-wrap ${showResult && round!.multiplier > 1 ? 'is-win' : ''}`}>
          <span className="wheel-pointer" />
          <div
            className="wheel-disc"
            style={{
              background: gradient,
              transform: `rotate(${rotation}deg)`,
              transition: spinning
                ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
                : 'none',
            }}
          />
          <div className={`wheel-hub ${showResult && round!.multiplier > 1 ? 'is-win' : ''}`}>
            <span
              className="wheel-hub-value"
              style={showResult ? { color: colorFor(round!.multiplier, colors) } : undefined}
            >
              {showResult ? `${round!.multiplier}×` : ''}
            </span>
          </div>
        </div>

        <div className="wheel-legend">
          {tiers.map((t) => (
            <div
              key={t.multiplier}
              className={`wheel-legend-item ${
                showResult && t.multiplier === round!.multiplier ? 'is-hit' : ''
              }`}
              style={{ '--swatch': colorFor(t.multiplier, colors) } as CSSProperties}
            >
              {t.multiplier.toFixed(2)}×
            </div>
          ))}
        </div>

        <Rules points={WHEEL_RULES} />

        <Fairness
          round={showResult ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          editable={!spinning}
          onClientSeed={setClientSeed}
        />

        {showResult && round!.multiplier > 1 && (
          <WinPopup key={round!.nonce} multiplier={round!.multiplier} stake={bet} delayMs={200} />
        )}
      </section>
    </div>
  )
}

/** Losing pockets are a faint graphite — a touch lighter than the wheel body
 *  (--bg), so a 0× is its own subtle marker and doesn't disappear into the dark
 *  centre. */
const LOSE_COLOR = '#26262a'

/** A gold-anchored ramp (the only accent), spread low → high so neighbouring
 *  multiplier tiers stay distinct without introducing competing accents: calm
 *  green for the common low wins, climbing through amber/deep gold to the brand
 *  gold, and a hot red at the rare top tier. */
const WIN_PALETTE = [
  '#46c88a', // green (calm, common low win)
  '#7a9a5e', // green→gold transition
  '#b89a3e', // deep amber
  '#d4a83f', // amber
  '#f0be4a', // brand gold
  '#f5c459', // bright gold glint
  '#e89a3a', // hot amber
  '#e0556e', // red (hottest top tier)
]

/** Map every distinct winning multiplier to its own palette colour. Tiers are
 *  ranked low → high and spread across the palette so the common low wins stay
 *  calm (green/teal) while the rare top multiplier lands on the hottest hue. */
function buildColorMap(table: number[]): Map<number, string> {
  const wins = [...new Set(table.filter((m) => m > 0))].sort((a, b) => a - b)
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

/** A segment's colour: its tier's palette colour, or slate for a losing pocket. */
function colorFor(multiplier: number, colors: Map<number, string>): string {
  return colors.get(multiplier) ?? LOSE_COLOR
}

/** Build the conic-gradient that paints the segments around the rim, with a thin
 *  dark separator at each boundary so the blocks read as distinct (Stake-style). */
function conicGradient(table: number[], colors: Map<number, string>): string {
  const n = table.length
  const gap = 0.7 // deg of dark gap between neighbouring segments
  const sep = '#101113'
  const stops = table
    .map((m, i) => {
      const a = (i / n) * 360
      const b = ((i + 1) / n) * 360
      const c = colorFor(m, colors)
      return `${c} ${a.toFixed(3)}deg ${(b - gap).toFixed(3)}deg, ${sep} ${(b - gap).toFixed(3)}deg ${b.toFixed(3)}deg`
    })
    .join(', ')
  return `conic-gradient(${stops})`
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: WheelRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      round
        ? verifySpin(round.serverSeed, round.clientSeed, round.nonce, round.segments, round.segment)
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
                {verified ? '✓ segment matches the committed seed' : '✗ mismatch'}
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
