import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  colorOf,
  OUTSIDE_BETS,
  playRoulette,
  randomServerSeed,
  spotFor,
  verifySpin,
  WHEEL_ORDER,
  type RouletteBet,
  type RouletteRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../sound/index.js'
import { formatMoney } from '../../shared/money.js'
import './roulette.css'

const SPIN_MS = 4800 // wheel spin duration; the result lands when it ends
const SPIN_EASE = 'cubic-bezier(0.15, 0.82, 0.18, 1)' // fast launch → long glide to rest
const N = WHEEL_ORDER.length // 37 pockets

const ROULETTE_RULES: ReactNode[] = [
  'Pick a chip size, then click the felt to drop chips — on a single number, a colour, even/odd, a dozen, a column, or the 1–18 / 19–36 halves. Stack as many bets as you like; the chip sits right on the spot you bet.',
  'Hit Spin. The ball races the rim against the wheel, rattles the frets, and drops into one pocket (0–36); every bet covering that number pays.',
  'The tighter the bet, the bigger it pays: a single number pays 35:1, a dozen or column 2:1, red/black or even/odd 1:1.',
  'The green 0 belongs to no colour, dozen, or column — bets on those don’t cover it.',
  <>
    <strong>Payout = your chips on the winning pocket × their odds.</strong> The pocket is drawn
    from a provably-fair seed you can verify after the spin.
  </>,
]

/** The three number rows of the felt, in display order (top pays column 3). */
const TOP_ROW = Array.from({ length: 12 }, (_, i) => 3 + i * 3) // 3,6,…,36
const MID_ROW = Array.from({ length: 12 }, (_, i) => 2 + i * 3) // 2,5,…,35
const BOTTOM_ROW = Array.from({ length: 12 }, (_, i) => 1 + i * 3) // 1,4,…,34

/** The on-disc angle (clockwise from 12 o'clock) of pocket index i's centre. The
 *  conic gradient, the printed numbers, and the ball's landing all use this one
 *  formula, so they agree to the degree. */
const pocketAngle = (i: number) => ((i + 0.5) / N) * 360

/** Static conic-gradient painting the 37 pockets around the wheel in real order. */
const WHEEL_GRADIENT = (() => {
  const tone = (num: number) =>
    colorOf(num) === 'green' ? '#179a4c' : colorOf(num) === 'red' ? '#cf3a44' : '#1d2733'
  const stops = WHEEL_ORDER.map((num, i) => {
    const a = ((i / N) * 360).toFixed(3)
    const b = (((i + 1) / N) * 360).toFixed(3)
    return `${tone(num)} ${a}deg ${b}deg`
  }).join(', ')
  return `conic-gradient(from 0deg, ${stops})`
})()

/** Compact chip label: $10, $10.50 — short enough to sit on a felt cell. */
function chipLabel(cents: number): string {
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

/** A value that fits on a chip face: $11, $11.50, $1.3k, $250k. */
function chipFace(cents: number): string {
  const d = cents / 100
  if (d >= 100000) return `$${Math.round(d / 1000)}k`
  if (d >= 1000) return `$${(d / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return chipLabel(cents)
}

/** Casino-style colour by total value — the whole stake on a spot is shown as
 *  one combined chip (e.g. a $1 + a $10 chip become a single $11 chip). */
function chipTone(cents: number): string {
  if (cents >= 10000) return 'black' // $100+
  if (cents >= 2500) return 'green' // $25+
  if (cents >= 1000) return 'blue' // $10+
  if (cents >= 500) return 'red' // $5+
  return 'white' // $1+
}

/** A real circular poker chip sitting on a felt spot, showing the combined total.
 *  Keyed by value upstream so it re-pops each time the stake on the spot changes.
 *  It is pure aria-hidden decoration and `pointer-events:none` (in CSS), fully
 *  contained inside its cell, so it can never intercept a click meant for this or
 *  a neighbouring spot — that is the bug this whole rebuild kills. */
function RouletteChip({ cents }: { cents: number }) {
  return (
    <span className={`rl-chip-token tone-${chipTone(cents)}`} aria-hidden="true">
      <span className="rl-chip-token-val">{chipFace(cents)}</span>
    </span>
  )
}

export function RouletteGame({ account, onBalanceChange }: RouletteGameProps) {
  const [chip, setChip] = useState(100) // current bet size, cents ($1.00)
  // The felt is an ORDERED list of chip placements; per-spot totals (`stakes`)
  // are derived from it. Keeping the order is what makes Undo exact.
  const [placements, setPlacements] = useState<{ id: string; amount: number }[]>([])
  const [lastPlacements, setLastPlacements] = useState<{ id: string; amount: number }[]>([])
  const [hoverNumbers, setHoverNumbers] = useState<Set<number> | null>(null)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<RouletteRound | null>(null)
  const [spinning, setSpinning] = useState(false)
  // The wheel stays still — only the BALL travels (it's what decides the result),
  // like watching a real table from above the rim. The ball's angle accumulates
  // (never snaps back), so re-spins keep orbiting; it comes to rest in the winning
  // pocket at that pocket's fixed angle on the stationary disc.
  const ballRotRef = useRef(0)
  const wheelRot = 0
  const [ballRot, setBallRot] = useState(0)
  const [history, setHistory] = useState<{ pocket: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const available = maxBet(account)
  const resolving = useResolving(account.id)
  const stakes = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of placements) m[p.id] = (m[p.id] ?? 0) + p.amount
    return m
  }, [placements])
  const totalStaked = useMemo(() => placements.reduce((a, p) => a + p.amount, 0), [placements])
  const showResult = round != null && !spinning
  const hasBets = placements.length > 0
  const canRebet = !hasBets && lastPlacements.length > 0 && !spinning && !resolving

  /** Drop one chip on a spot, unless it would overrun what's available. */
  function placeChip(id: string) {
    if (spinning) return
    setError(null)
    if (totalStaked + chip > available) {
      setError(`Not enough to add that chip (you can wager ${formatMoney(available)}).`)
      return
    }
    setPlacements((p) => [...p, { id, amount: chip }])
    play('select')
  }

  /** Take back the most recently placed chip. */
  function undo() {
    if (spinning || !hasBets) return
    setError(null)
    setPlacements((p) => p.slice(0, -1))
    play('select')
  }

  /** Double every chip on the felt, if it still fits what's left to wager. */
  function double() {
    if (spinning || !hasBets) return
    if (totalStaked * 2 > available) {
      setError(`Doubling would exceed what you can wager (${formatMoney(available)}).`)
      return
    }
    setError(null)
    setPlacements((p) => [...p, ...p])
    play('select')
  }

  /** Re-place the exact bets from the last spin (only when the felt is empty). */
  function rebet() {
    if (!canRebet) return
    const total = lastPlacements.reduce((a, p) => a + p.amount, 0)
    if (total > available) {
      setError(`Not enough to repeat that bet (you can wager ${formatMoney(available)}).`)
      return
    }
    setError(null)
    setPlacements(lastPlacements)
    play('select')
  }

  function clearBets() {
    if (spinning || !hasBets) return
    setPlacements([])
    setError(null)
  }

  /** Run one spin against an explicit set of placements — the live felt, or a
   *  repeated bet. Stakes are computed from `pls` here, so a one-click repeat can
   *  spin immediately without waiting for a state round-trip. */
  // The pocket's server seed now comes from the platform fairness AUTHORITY (commit hash
  // before play → reveal after), not a browser randomServerSeed(). The spin math is unchanged.
  async function runSpin(pls: { id: string; amount: number }[]) {
    if (inFlightRef.current || spinning || pls.length === 0) return // a mint is already in flight
    const total = pls.reduce((a, p) => a + p.amount, 0)
    if (total > available) {
      setError(`Not enough to place that bet (you can wager ${formatMoney(available)}).`)
      return
    }
    inFlightRef.current = true
    setError(null)
    setHoverNumbers(null) // don't leave a coverage highlight glowing through the spin
    setLastPlacements(pls) // remember this layout so Repeat can replay it
    setPlacements(pls) // reflect the (possibly repeated) chips on the felt
    const st: Record<string, number> = {}
    for (const p of pls) st[p.id] = (st[p.id] ?? 0) + p.amount
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const bets: RouletteBet[] = Object.entries(st).map(([id, stake]) => {
        const spot = spotFor(id)
        return { label: spot.label, numbers: spot.numbers, stake }
      })
      const r = playRoulette(account, {
        bets,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
      })
      onBalanceChange()
      setRound(r)
      setSpinning(true)
      // the ball racing the rim → clattering into a pocket, slowing as it goes; on
      // the next frame so it lines up with the orbit animation starting to paint.
      requestAnimationFrame(() => play('roulette', { durationMs: SPIN_MS }))

      // The winning pocket's fixed angle on the (stationary) disc.
      const winIndex = (WHEEL_ORDER as readonly number[]).indexOf(r.pocket)
      const theta = pocketAngle(winIndex)

      // Ball: orbit counter-clockwise (decreasing angle) several laps, then settle
      // on the winning pocket where it sits on the still disc — screenAngle = theta.
      const target = ((theta % 360) + 360) % 360
      const cur = ((ballRotRef.current % 360) + 360) % 360
      let down = cur - target // how far CCW to the pocket within one turn
      if (down < 0) down += 360
      const ballFinal = ballRotRef.current - (360 * 9 + down) // nine fast laps, then settle
      ballRotRef.current = ballFinal
      setBallRot(ballFinal)

      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setSpinning(false)
        setHistory((h) => [{ pocket: r.pocket, won: r.profit > 0 }, ...h].slice(0, 18))
        play(r.profit > 0 ? 'win' : 'lose')
        setPlacements([]) // the round is settled; clear the felt for the next spin
      }, SPIN_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  /** Spin the chips currently on the felt. */
  function spin() {
    void runSpin(placements)
  }
  /** One click: re-place the last spin's exact chips and spin them again. */
  function repeatAndSpin() {
    void runSpin(lastPlacements)
  }

  const winPocket = showResult ? round!.pocket : null
  // While the result shows, every cell whose bet covers the winning pocket
  // flashes — both the straight number and each outside box (Red, a dozen, …).
  const winCoverIds = useMemo(() => {
    if (winPocket == null) return null
    const ids = new Set<string>([`n${winPocket}`])
    for (const b of OUTSIDE_BETS) if (b.numbers.includes(winPocket)) ids.add(b.id)
    return ids
  }, [winPocket])

  return (
    <div className="roulette">
      <span className="sr-only" role="status" aria-live="polite">
        {showResult
          ? round!.profit > 0
            ? `Pocket ${round!.pocket}. Won ${formatMoney(round!.profit)}.`
            : round!.profit < 0
              ? `Pocket ${round!.pocket}. Lost ${formatMoney(-round!.profit)}.`
              : `Pocket ${round!.pocket}. Push — stake returned.`
          : ''}
      </span>

      <div className="rl-top-zone">
        <div className="rl-wheel-area">
          <Wheel
            wheelRot={wheelRot}
            ballRot={ballRot}
            spinning={spinning}
            hasRound={round != null}
            roundKey={round?.nonce ?? 0}
            winPocket={winPocket}
          />

          <div className="rl-readout">
            {spinning ? (
              <span className="rl-readout-spin">No more bets — ball’s rolling…</span>
            ) : showResult ? (
              <span className={`rl-readout-pill rl-${colorOf(round!.pocket)}`}>
                {round!.pocket}
              </span>
            ) : (
              <span className="rl-readout-idle">Place your chips, then spin</span>
            )}
            {showResult && (
              <span
                className={`rl-result ${round!.profit > 0 ? 'is-win' : round!.profit < 0 ? 'is-loss' : ''}`}
              >
                {round!.profit > 0
                  ? `Won ${formatMoney(round!.profit)}`
                  : round!.profit < 0
                    ? `Lost ${formatMoney(-round!.profit)}`
                    : 'Push — stake returned'}
              </span>
            )}
          </div>

          <div className="rl-historybar" aria-hidden="true">
            {history.length === 0 ? (
              <span className="rl-history-empty">Recent spins appear here</span>
            ) : (
              history.map((h, i) => (
                <span key={i} className={`pill rl-pill rl-${colorOf(h.pocket)}`}>
                  {h.pocket}
                </span>
              ))
            )}
          </div>

          {showResult && round!.profit > 0 && (
            <WinPopup
              key={round!.nonce}
              multiplier={round!.returned / round!.totalStake}
              stake={round!.totalStake}
              delayMs={200}
            />
          )}
        </div>

        <section className="rl-controls">
          <ChipField value={chip} disabled={spinning} onChange={setChip} />

          <div className="rl-staked">
            <span className="field-label">Total staked</span>
            <span className="rl-staked-value">{formatMoney(totalStaked)}</span>
          </div>

          {hasBets ? (
            <button
              className="action action-bet rl-spin"
              onClick={spin}
              disabled={spinning || resolving}
            >
              Play
            </button>
          ) : canRebet ? (
            // no chips down, but a previous bet exists — Play quick-replays it
            <button className="action action-bet rl-spin" onClick={repeatAndSpin}>
              Play
            </button>
          ) : (
            <button className="action action-bet rl-spin" onClick={spin} disabled>
              Play
            </button>
          )}
          <div className="rl-actions">
            <button className="chip" onClick={undo} disabled={spinning || !hasBets}>
              Undo
            </button>
            <button className="chip" onClick={double} disabled={spinning || !hasBets}>
              Double
            </button>
            <button className="chip" onClick={rebet} disabled={!canRebet}>
              Repeat
            </button>
            <button className="chip" onClick={clearBets} disabled={spinning || !hasBets}>
              Clear
            </button>
          </div>

          {error && <p className="rl-error">{error}</p>}
        </section>
      </div>

      <div className="rl-board-scroll">
        <Board
          stakes={stakes}
          winCoverIds={winCoverIds}
          disabled={spinning}
          coverNumbers={hoverNumbers}
          onPlace={placeChip}
          onHover={setHoverNumbers}
        />
      </div>

      <Rules points={ROULETTE_RULES} />

      <Fairness
        round={showResult ? round : null}
        clientSeed={clientSeed}
        nextNonce={nonceRef.current + (round ? 0 : 1)}
        editable={!spinning}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

interface RouletteGameProps {
  account: Account
  onBalanceChange: () => void
}

/* ------------------------------- the wheel ------------------------------ */

function Wheel({
  wheelRot,
  ballRot,
  spinning,
  hasRound,
  roundKey,
  winPocket,
}: {
  wheelRot: number
  ballRot: number
  spinning: boolean
  hasRound: boolean
  roundKey: number
  winPocket: number | null
}) {
  const spinTransition = spinning ? `transform ${SPIN_MS}ms ${SPIN_EASE}` : 'none'
  // A different bounce profile each spin (chosen by the nonce) so the ball never
  // drops the same way twice — purely cosmetic, it still lands in the seed-decided
  // pocket, so the house odds are untouched.
  const variant = ((roundKey % 3) + 3) % 3
  const dropName = variant === 0 ? 'rl-ball-drop' : `rl-ball-drop-${variant}`
  const wobbleName = variant === 0 ? 'rl-ball-wobble' : `rl-ball-wobble-${variant}`
  return (
    <div className={`rl-wheel-wrap ${spinning ? 'is-spinning' : ''}`}>
      {/* the spinning disc: pockets, frets, and the printed numbers all turn together.
          The premium wheel art is the base layer (empty bowl/rim/gold hub, no numbers);
          the conic gradient, frets, and number ring still ride on top so the seed-decided
          winning pocket is computed and shown exactly as before. */}
      <div
        className="rl-wheel"
        style={{
          background: WHEEL_GRADIENT,
          transform: `rotate(${wheelRot}deg)`,
          transition: spinTransition,
        }}
      >
        <img
          className="rl-wheel-art"
          src="/game-assets/roulette/wheel.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <div className="rl-frets" aria-hidden="true" />
        <div className="rl-turret" aria-hidden="true">
          {Array.from({ length: 4 }, (_, k) => (
            <span key={k} style={{ transform: `rotate(${k * 90}deg)` }} />
          ))}
        </div>
        {WHEEL_ORDER.map((num, i) => (
          <span
            key={num}
            className={`rl-num rl-num-${colorOf(num)} ${!spinning && winPocket === num ? 'is-win' : ''}`}
            style={{ transform: `rotate(${pocketAngle(i).toFixed(2)}deg)` }}
          >
            <b>{num}</b>
          </span>
        ))}
      </div>

      {/* fixed ring of deflector diamonds the ball rattles through near the end */}
      <div className="rl-deflectors" aria-hidden="true">
        {Array.from({ length: 8 }, (_, k) => (
          <i key={k} style={{ transform: `rotate(${k * 45}deg)` }} />
        ))}
      </div>

      {/* the ball: the orbit sets its angle (lands in the pocket), the wobble
          rattles it sideways through the frets, the drop carries it in with a
          few decaying bounces. Layered so each transform stays independent. */}
      <div
        className="rl-orbit"
        style={{ transform: `rotate(${ballRot}deg)`, transition: spinTransition }}
      >
        {hasRound && (
          <div
            className="rl-ball-wobble"
            key={`w${roundKey}`}
            style={spinning ? { animation: `${wobbleName} ${SPIN_MS}ms linear both` } : undefined}
          >
            <div
              className="rl-ball-drop"
              key={`d${roundKey}`}
              style={
                spinning
                  ? { animation: `${dropName} ${SPIN_MS}ms linear both` }
                  : { transform: 'translateY(var(--rl-pocket-drop))' }
              }
            >
              <img
                className="rl-ball"
                src="/game-assets/roulette/ball.png"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <span className="rl-ball-shadow" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      <div className="rl-hub" aria-hidden="true" />
      <div className="rl-pointer" aria-hidden="true" />
    </div>
  )
}

/* ------------------------------- the felt ------------------------------- */

function Board({
  stakes,
  winCoverIds,
  disabled,
  coverNumbers,
  onPlace,
  onHover,
}: {
  stakes: Record<string, number>
  winCoverIds: Set<string> | null
  disabled: boolean
  coverNumbers: Set<number> | null
  onPlace: (id: string) => void
  onHover: (nums: Set<number> | null) => void
}) {
  /** Shared coverage-highlight handlers: light up exactly the numbers a spot
   *  covers, on hover AND keyboard focus (so it isn't mouse-only). */
  const coverProps = (id: string) => {
    const show = () => {
      if (!disabled) onHover(new Set(spotFor(id).numbers))
    }
    const hide = () => onHover(null)
    return { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide }
  }

  /** Fold any staked total into the cell's spoken name (the visual chip is hidden). */
  const withStake = (base: string, staked?: number) =>
    staked ? `${base}, ${chipLabel(staked)} staked` : base

  // IMPORTANT: cells are rendered by plain FUNCTIONS that return a host <button>,
  // NOT inline <Component/>s. An inline component defined inside Board gets a new
  // function identity on every render, so React unmounts+remounts every cell each
  // time the board re-renders (which happens on hover, via the coverage highlight).
  // A button that remounts between mousedown and mouseup never fires a `click` —
  // that was THE "can't place chips anywhere" bug. Host <button> elements reconcile
  // in place, so clicks are reliable.

  /** A single straight-number cell on the grid (id `n0`..`n36`). */
  const numberCell = (n: number, extraClass = '') => {
    const id = `n${n}`
    const staked = stakes[id]
    return (
      <button
        type="button"
        key={id}
        className={`rl-cell rl-num-cell rl-${colorOf(n)} ${extraClass} ${
          winCoverIds?.has(id) ? 'is-hit' : ''
        } ${coverNumbers?.has(n) ? 'is-cover' : ''}`}
        disabled={disabled}
        onClick={() => onPlace(id)}
        aria-label={withStake(`number ${n}`, staked)}
        {...coverProps(id)}
      >
        <span className="rl-cell-label">{n}</span>
        {staked ? <RouletteChip key={staked} cents={staked} /> : null}
      </button>
    )
  }

  /** An outside / group cell (Red, Even, a dozen, a column, …). */
  const outsideCell = ({
    id,
    label,
    tone,
    ariaLabel,
  }: {
    id: string
    label: ReactNode
    tone?: 'red' | 'black'
    ariaLabel: string
  }) => {
    const staked = stakes[id]
    return (
      <button
        type="button"
        key={id}
        className={`rl-cell rl-outside-cell ${tone ? `rl-${tone} rl-even-color` : 'rl-outside'} ${
          winCoverIds?.has(id) ? 'is-hit' : ''
        }`}
        disabled={disabled}
        onClick={() => onPlace(id)}
        aria-label={withStake(ariaLabel, staked)}
        {...coverProps(id)}
      >
        <span className="rl-cell-label">{label}</span>
        {staked ? <RouletteChip key={staked} cents={staked} /> : null}
      </button>
    )
  }

  const dozens = OUTSIDE_BETS.filter((b) => b.id.startsWith('dozen'))
  const evens = OUTSIDE_BETS.filter((b) =>
    ['low', 'even', 'red', 'black', 'odd', 'high'].includes(b.id),
  )
  // The grid is laid out in true display order: 0 column, then 12 number columns
  // (each a top/mid/bottom number), then the 2:1 column-bet stub column.
  const numberColumns = TOP_ROW.map((top, i) => [top, MID_ROW[i], BOTTOM_ROW[i]] as const)
  const cols = ['col3', 'col2', 'col1'] // align top→bottom with the number rows

  return (
    <section className="rl-board">
      {/* The inside grid: every cell is an independent <button>, laid out as real
          CSS-grid tracks. Nothing absolutely positioned overlaps it, so every
          spot is reliably clickable (the old "only 0 is clickable" bug). */}
      <div className="rl-inside">
        <div className="rl-zero-col">{numberCell(0, 'rl-zero')}</div>

        <div className="rl-numbers">
          {numberColumns.map(([top, mid, bottom]) => (
            <div className="rl-numcolumn" key={top}>
              {numberCell(top)}
              {numberCell(mid)}
              {numberCell(bottom)}
            </div>
          ))}
        </div>

        <div className="rl-colbets">
          {cols.map((id) => outsideCell({ id, label: '2:1', ariaLabel: 'column, pays 2 to 1' }))}
        </div>
      </div>

      <div className="rl-dozens">
        {dozens.map((b) =>
          outsideCell({ id: b.id, label: b.label, ariaLabel: `${b.label}, pays 2 to 1` }),
        )}
      </div>

      <div className="rl-evens">
        {evens.map((b) =>
          b.id === 'red' || b.id === 'black'
            ? outsideCell({
                id: b.id,
                tone: b.id,
                ariaLabel: b.id === 'red' ? 'Red' : 'Black',
                label: <span className="rl-diamond">◆</span>,
              })
            : outsideCell({ id: b.id, label: b.label, ariaLabel: `${b.label}, pays even money` }),
        )}
      </div>
    </section>
  )
}

/* ------------------------------- controls ------------------------------- */

const CHIP_SIZES = [100, 500, 1000, 2500, 10000] // $1 / $5 / $10 / $25 / $100

function ChipField({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <div className="field">
      <span className="field-label">Chip size</span>
      {/* Round poker chips — click one to pick it up, then click the table to
          drop it. Always selectable (we only check you can afford it when you
          actually place a chip), so the picker never dead-ends. */}
      <div className="rl-chip-row">
        {CHIP_SIZES.map((c) => (
          <button
            type="button"
            key={c}
            className={`rl-chipbtn tone-${chipTone(c)} ${value === c ? 'is-on' : ''}`}
            aria-pressed={value === c}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            <span className="rl-chipbtn-val">{chipFace(c)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: RouletteRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      round ? verifySpin(round.serverSeed, round.clientSeed, round.nonce, round.pocket) : null,
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
          <code className="seed">{round ? round.serverSeedHash : 'committed when you spin'}</code>
        </Row>
        {round && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
            </Row>
            <Row label="Winning pocket">{round.pocket}</Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ pocket matches the committed seed' : '✗ mismatch'}
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
