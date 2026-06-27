import '../../shared/chipVars.js'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  comboList,
  playSicBo,
  randomServerSeed,
  totalOdds,
  verifyRoll,
  type BetSpec,
  type BetType,
  type Dice,
  type SicBoBet,
  type SicBoRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { play } from '../../../sound/index.js'
import { formatMoney } from '../../shared/money.js'
import './sicbo.css'

const SICBO_RULES: ReactNode[] = [
  'Pick a chip, then click any spot on the table to drop it there. Stack as many spots as you like — each settles on its own. Right-click a spot to clear it; Undo lifts the last chip.',
  <>
    <strong>Small (4–10)</strong>, <strong>Big (11–17)</strong>, <strong>Odd</strong> and{' '}
    <strong>Even</strong> all pay 1:1 — but every one of them LOSES on a triple.
  </>,
  <>
    <strong>Single 1–6</strong> pays 1:1 / 2:1 / 3:1 when your face shows on one / two / three dice.
    A <strong>Combination</strong> of two faces pays 5:1 if both appear.
  </>,
  <>
    <strong>Double</strong> 10:1, <strong>Any Triple</strong> 30:1, <strong>Specific Triple</strong>{' '}
    180:1, and an exact <strong>Total</strong> pays the standard schedule (4/17 → 60:1, down to
    6:1).
  </>,
  'Every roll is drawn from a provably-fair seed you can verify after the fact.',
]

// The dice tumble, then come to rest ONE BY ONE. Once they've all settled there's
// a short suspense beat — the dice are clearly done, the total is shown, but the
// win/loss is withheld — and only THEN does the outcome reveal (highlights, the
// figure, the win/lose sound). Nothing about the result leaks while they roll.
const FLICKER_MS = 80 // how fast a still-tumbling die flicks a new face
const FIRST_LAND_MS = 560 // the first die comes to rest here…
const LAND_STAGGER = 140 // …each later die a beat after the previous…
const LAST_LAND_MS = FIRST_LAND_MS + 2 * LAND_STAGGER // …the third at 840ms — dice at rest
const SUSPENSE_MS = 420 // a real beat after the dice rest, before the win/loss reveals
const REVEAL_MS = LAST_LAND_MS + SUSPENSE_MS // 1260ms — the outcome is revealed

/** Chip denominations, like the felt at a real table ($1 / $5 / $10 / $25 / $100). */
const CHIP_SIZES = [100, 500, 1000, 2500, 10000]

const FACES = [1, 2, 3, 4, 5, 6] as const
const TOTALS = Array.from({ length: 14 }, (_, i) => i + 4) // 4..17
const COMBOS = comboList() // the 15 distinct two-dice pairs

/** A board-spot key: `type` plus its face/total params (so stakes stack per spot). */
const keyOf = (type: BetType, param?: number, param2?: number) =>
  [type, param, param2].filter((x) => x != null).join(':')

// Every spot the table offers, with the exact core BetSpec it stakes. Built once
// (pure) so a placement only has to carry the spot id; we look the spec up here.
const ALL_SPECS: { id: string; spec: BetSpec }[] = [
  { id: keyOf('small'), spec: { type: 'small' } },
  { id: keyOf('big'), spec: { type: 'big' } },
  { id: keyOf('odd'), spec: { type: 'odd' } },
  { id: keyOf('even'), spec: { type: 'even' } },
  ...FACES.map((f) => ({ id: keyOf('single', f), spec: { type: 'single' as BetType, param: f } })),
  ...TOTALS.map((t) => ({ id: keyOf('total', t), spec: { type: 'total' as BetType, param: t } })),
  ...COMBOS.map(([a, b]) => ({
    id: keyOf('combo', a, b),
    spec: { type: 'combo' as BetType, param: a, param2: b },
  })),
  ...FACES.map((f) => ({ id: keyOf('double', f), spec: { type: 'double' as BetType, param: f } })),
  { id: keyOf('anyTriple'), spec: { type: 'anyTriple' } },
  ...FACES.map((f) => ({ id: keyOf('triple', f), spec: { type: 'triple' as BetType, param: f } })),
]
const SPEC_BY_ID = new Map(ALL_SPECS.map((s) => [s.id, s.spec]))

/** Which spots the roll actually satisfies — drives the “this hit” highlight, so
 *  the player can see what came in even on spots they didn't stake. */
function hitKeys(dice: Dice): Set<string> {
  const s = new Set<string>()
  const total = dice[0] + dice[1] + dice[2]
  const triple = dice[0] === dice[1] && dice[1] === dice[2]
  if (!triple) {
    if (total >= 4 && total <= 10) s.add(keyOf('small'))
    if (total >= 11 && total <= 17) s.add(keyOf('big'))
    s.add(total % 2 === 1 ? keyOf('odd') : keyOf('even'))
  }
  for (const f of FACES) if (dice.includes(f)) s.add(keyOf('single', f))
  for (const [a, b] of COMBOS) if (dice.includes(a) && dice.includes(b)) s.add(keyOf('combo', a, b))
  for (const f of FACES) if (dice.filter((d) => d === f).length >= 2) s.add(keyOf('double', f))
  if (triple) {
    s.add(keyOf('anyTriple'))
    s.add(keyOf('triple', dice[0]))
  }
  s.add(keyOf('total', total))
  return s
}

interface SicBoGameProps {
  account: Account
  onBalanceChange: () => void
}

export function SicBoGame({ account, onBalanceChange }: SicBoGameProps) {
  const [chip, setChip] = useState(1000) // current chip size, cents ($10.00)
  // The table is an ORDERED list of chip placements; per-spot totals (`stakes`)
  // are derived from it. Keeping the order is what makes Undo exact.
  const [placements, setPlacements] = useState<{ id: string; amount: number }[]>([])
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<SicBoRound | null>(null)
  // idle → rolling (dice tumbling) → settled (dice at rest, suspense) → revealed (win/loss shown)
  const [phase, setPhase] = useState<'idle' | 'rolling' | 'settled' | 'revealed'>('idle')
  const [landed, setLanded] = useState(0) // how many dice have come to rest (0..3)
  const [shownDice, setShownDice] = useState<Dice>([1, 2, 3])
  const [history, setHistory] = useState<{ label: string; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const landedRef = useRef(0) // mirrors `landed` for the flicker interval (no stale closure)
  const tumble = useRef(0) // the face-flicker interval
  const timers = useRef<number[]>([]) // the per-die land timers + the announce timer

  const available = maxBet(account)
  const stakes = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of placements) m[p.id] = (m[p.id] ?? 0) + p.amount
    return m
  }, [placements])
  const totalStaked = useMemo(() => placements.reduce((a, p) => a + p.amount, 0), [placements])
  const hasBets = placements.length > 0
  const overLimit = totalStaked > available
  // A roll is in flight (dice tumbling OR the suspense beat) — the table is locked.
  const busy = phase === 'rolling' || phase === 'settled'
  const canRoll = hasBets && !overLimit && !busy
  const showResult = phase === 'revealed' && round != null

  function clearRollTimers() {
    clearInterval(tumble.current)
    timers.current.forEach((id) => clearTimeout(id))
    timers.current = []
  }
  useEffect(() => () => clearRollTimers(), [])

  // The won/lost state of the spots currently on the table, keyed for highlights.
  const resultByKey = useMemo(() => {
    const m = new Map<string, { won: boolean; multiplier: number }>()
    if (round && phase === 'revealed') {
      for (const r of round.results)
        m.set(keyOf(r.type, r.param, r.param2), { won: r.won, multiplier: r.multiplier })
    }
    return m
  }, [round, phase])

  // Every spot the roll satisfied (whether staked or not), once the dice settle.
  const hits = useMemo(() => (showResult ? hitKeys(round!.dice) : null), [showResult, round])

  /** Clear the previous round's result so the table is fresh for a new bet. */
  function resetResult() {
    setRound(null)
    setPhase('idle')
  }

  /** Drop one chip on a spot, unless it would overrun what's available. */
  function dropChip(id: string) {
    if (busy) return
    if (totalStaked + chip > available) {
      setError(`Not enough to add that chip (you can wager ${formatMoney(available)}).`)
      return
    }
    setError(null)
    resetResult() // a new bet clears the previous result's highlight
    setPlacements((p) => [...p, { id, amount: chip }])
    play('select')
  }

  /** Clear every chip on a single spot (right-click). */
  function clearSpot(id: string) {
    if (busy) return
    setError(null)
    resetResult()
    setPlacements((p) => p.filter((x) => x.id !== id))
  }

  /** Take back the most recently placed chip. */
  function undo() {
    if (busy || !hasBets) return
    setError(null)
    resetResult()
    setPlacements((p) => p.slice(0, -1))
    play('select')
  }

  /** Double every chip on the table, if it still fits what's left to wager. */
  function double() {
    if (busy || !hasBets) return
    if (totalStaked * 2 > available) {
      setError(`Doubling would exceed what you can wager (${formatMoney(available)}).`)
      return
    }
    setError(null)
    resetResult()
    setPlacements((p) => [...p, ...p])
    play('select')
  }

  function clearBoard() {
    if (busy || !hasBets) return
    setError(null)
    resetResult()
    setPlacements([])
  }

  // The server seed now comes from the platform fairness AUTHORITY (commit hash before play →
  // reveal after), not a browser randomServerSeed(). The dice math and the cosmetic tumble are
  // unchanged. A re-entrancy guard skips a roll while a mint is already in flight.
  async function roll() {
    if (!canRoll) return
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const bets: SicBoBet[] = Object.entries(stakes).map(([id, stake]) => {
        const spec = SPEC_BY_ID.get(id)!
        return { type: spec.type, param: spec.param, param2: spec.param2, stake }
      })
      const r = playSicBo(account, {
        bets,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
      })
      // NB: core has already settled every bet (account.balance is updated), but we
      // deliberately reveal NOTHING yet — not the figure, not the highlights, not
      // the win/lose sound. The dice tumble, come to rest, pause for a beat, and
      // only THEN is the outcome shown (see the reveal timer below).
      clearRollTimers()
      play('diceroll', { durationMs: LAST_LAND_MS }) // a rolling-dice rattle until they settle
      setRound(r)
      setPhase('rolling')
      setLanded(0)
      landedRef.current = 0

      // smooth tumble: every still-rolling die flicks a new face; settled ones hold.
      tumble.current = window.setInterval(() => {
        setShownDice(
          (prev) => prev.map((_d, j) => (j < landedRef.current ? r.dice[j] : rndFace())) as Dice,
        )
      }, FLICKER_MS)

      // the dice come to rest one-by-one — a satisfying cascade, not a snap.
      for (let i = 0; i < 3; i++) {
        timers.current.push(
          window.setTimeout(
            () => {
              landedRef.current = i + 1
              setLanded(i + 1)
              setShownDice((prev) => prev.map((d, j) => (j <= i ? r.dice[j] : d)) as Dice)
            },
            FIRST_LAND_MS + i * LAND_STAGGER,
          ),
        )
      }

      // all dice are now at rest — enter the suspense beat: the total shows, but the
      // win/loss is still withheld for a moment.
      timers.current.push(
        window.setTimeout(() => {
          clearInterval(tumble.current)
          setShownDice(r.dice)
          setPhase('settled')
        }, LAST_LAND_MS),
      )

      // after that beat: reveal the outcome, move the figure, log it, sound it.
      timers.current.push(
        window.setTimeout(() => {
          setPhase('revealed')
          signalReveal(account.id) // the result is on screen now — release the ledger entry
          onBalanceChange() // refresh the figure in sync with the reveal
          const won = r.totalProfit > 0
          const triple = r.dice[0] === r.dice[1] && r.dice[1] === r.dice[2]
          const label = triple ? `${r.dice[0]}·${r.dice[1]}·${r.dice[2]}` : `${r.total}`
          setHistory((h) => [{ label, won }, ...h].slice(0, 18))
          play(won ? 'win' : 'lose')
        }, REVEAL_MS),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const netProfit = showResult ? round!.totalProfit : 0
  const popupMultiplier =
    showResult && round!.totalStake > 0 ? round!.totalReturn / round!.totalStake : 0

  return (
    <div className="sicbo">
      <span className="sr-only" role="status" aria-live="polite">
        {showResult
          ? `Rolled ${round!.dice.join(', ')}, total ${round!.total}. ${
              netProfit > 0 ? 'You won' : netProfit < 0 ? 'No win' : 'Even'
            }`
          : ''}
      </span>

      <div className="sicbo-top-zone">
        <section className="sicbo-stage">
          <div className="sicbo-historybar" aria-hidden="true">
            {history.length === 0 ? (
              <span className="sicbo-history-empty">Recent rolls appear here</span>
            ) : (
              history.map((h, i) => (
                <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
                  {h.label}
                </span>
              ))
            )}
          </div>

          <div className={`sicbo-dice ${busy ? 'is-rolling' : ''}`}>
            {shownDice.map((d, i) => (
              <Die
                key={i}
                value={d}
                state={busy ? (i < landed ? 'landing' : 'tumbling') : 'rest'}
              />
            ))}
          </div>

          <div className="sicbo-readout">
            {showResult ? (
              <>
                <span className="sicbo-readout-total">
                  Total <strong>{round!.total}</strong>
                </span>
                <span
                  className={`sicbo-readout-res ${
                    netProfit > 0 ? 'is-win' : netProfit < 0 ? 'is-loss' : ''
                  }`}
                >
                  {netProfit > 0
                    ? `Won ${formatMoney(netProfit)}`
                    : netProfit < 0
                      ? `Lost ${formatMoney(-netProfit)}`
                      : 'Even'}
                </span>
              </>
            ) : phase === 'settled' && round ? (
              // the dice are done — show what rolled, hold the win/loss a beat
              <span className="sicbo-readout-total sicbo-readout-settling">
                Total <strong>{round.total}</strong>
              </span>
            ) : phase === 'rolling' ? (
              <span className="sicbo-readout-idle">Rolling…</span>
            ) : (
              <span className="sicbo-readout-idle">Place your chips, then roll</span>
            )}
          </div>

          {showResult && netProfit > 0 && (
            <WinPopup
              key={round!.nonce}
              multiplier={popupMultiplier}
              stake={round!.totalStake}
              delayMs={200}
            />
          )}
        </section>

        <section className="sicbo-controls">
          <ChipField value={chip} disabled={busy} onChange={setChip} />

          <div className="sicbo-staked">
            <span className="field-label">Total staked</span>
            <span
              className={`sicbo-staked-value ${overLimit && phase === 'idle' ? 'is-over' : ''}`}
            >
              {formatMoney(totalStaked)}
            </span>
          </div>

          <button className="action action-bet sicbo-roll" onClick={roll} disabled={!canRoll}>
            Roll
          </button>

          <div className="sicbo-actions">
            <button className="chip" onClick={undo} disabled={busy || !hasBets}>
              Undo
            </button>
            <button className="chip" onClick={double} disabled={busy || !hasBets}>
              Double
            </button>
            <button className="chip" onClick={clearBoard} disabled={busy || !hasBets}>
              Clear
            </button>
          </div>

          {error && <p className="sicbo-error">{error}</p>}
          {/* Only flag over-limit while the player is actively building a bet (idle).
              Once rolled, those chips were already accepted — don't alarm them. */}
          {overLimit && !error && phase === 'idle' && (
            <p className="sicbo-error">
              Stakes ({formatMoney(totalStaked)}) exceed what you can wager (
              {formatMoney(available)}
              ).
            </p>
          )}
        </section>
      </div>

      <div className="sicbo-board-scroll">
        <Board
          stakes={stakes}
          resultByKey={resultByKey}
          hits={hits}
          disabled={busy}
          onDrop={dropChip}
          onClearSpot={clearSpot}
        />
      </div>

      <Rules points={SICBO_RULES} />

      <Fairness
        round={showResult ? round : null}
        clientSeed={clientSeed}
        nextNonce={nonceRef.current + (round ? 0 : 1)}
        editable={!busy}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

/* ------------------------------- the table ------------------------------- */

function Board({
  stakes,
  resultByKey,
  hits,
  disabled,
  onDrop,
  onClearSpot,
}: {
  stakes: Record<string, number>
  resultByKey: Map<string, { won: boolean; multiplier: number }>
  hits: Set<string> | null
  disabled: boolean
  onDrop: (id: string) => void
  onClearSpot: (id: string) => void
}) {
  // IMPORTANT: cells are rendered by a plain FUNCTION returning a host <button>,
  // never an inline <Component/>. An inline component gets a fresh identity each
  // render, so React unmounts+remounts every cell when the board re-renders — a
  // button that remounts between mousedown and mouseup never fires a click. Host
  // <button> elements reconcile in place, so every spot stays reliably clickable.
  function cell(id: string, ariaLabel: string, className: string, children: ReactNode) {
    const staked = stakes[id] ?? 0
    const res = resultByKey.get(id)
    const cls = ['sicbo-cell', className]
    if (staked > 0) cls.push('is-staked')
    if (res?.won) cls.push('is-won')
    else if (res && staked > 0) cls.push('is-lost')
    if (hits?.has(id) && !res?.won) cls.push('is-hit')
    return (
      <button
        type="button"
        key={id}
        className={cls.join(' ')}
        disabled={disabled}
        onClick={() => onDrop(id)}
        onContextMenu={(e) => {
          e.preventDefault()
          onClearSpot(id)
        }}
        aria-label={staked > 0 ? `${ariaLabel}, ${formatMoney(staked)} staked` : ariaLabel}
        title={staked > 0 ? 'Right-click to clear this spot' : undefined}
      >
        {children}
        {staked > 0 ? <SicBoChip key={staked} cents={staked} /> : null}
      </button>
    )
  }

  return (
    <section className="sicbo-board">
      <Group title="Even money" odds="1 : 1 · loses on a triple">
        <div className="sicbo-cells sicbo-evenmoney">
          {cell(
            keyOf('small'),
            'Small, total 4 to 10',
            'sicbo-money',
            <>
              <span className="sicbo-money-name">Small</span>
              <span className="sicbo-money-sub">4 – 10</span>
            </>,
          )}
          {cell(
            keyOf('odd'),
            'Odd total',
            'sicbo-money',
            <>
              <span className="sicbo-money-name">Odd</span>
              <span className="sicbo-money-sub">5·7·9…</span>
            </>,
          )}
          {cell(
            keyOf('even'),
            'Even total',
            'sicbo-money',
            <>
              <span className="sicbo-money-name">Even</span>
              <span className="sicbo-money-sub">4·6·8…</span>
            </>,
          )}
          {cell(
            keyOf('big'),
            'Big, total 11 to 17',
            'sicbo-money',
            <>
              <span className="sicbo-money-name">Big</span>
              <span className="sicbo-money-sub">11 – 17</span>
            </>,
          )}
        </div>
      </Group>

      <Group title="Single die" odds="1 · 2 · 3 : 1">
        <div className="sicbo-cells sicbo-singles">
          {FACES.map((f) =>
            cell(keyOf('single', f), `Single ${f}`, 'sicbo-single', <FaceDie value={f} />),
          )}
        </div>
      </Group>

      <Group title="Exact total" odds="4/17 → 60:1 … 6:1">
        <div className="sicbo-cells sicbo-totals">
          {TOTALS.map((t) =>
            cell(
              keyOf('total', t),
              `Total ${t}, pays ${totalOdds(t)} to 1`,
              'sicbo-total',
              <>
                <span className="sicbo-total-n">{t}</span>
                <span className="sicbo-total-odds">{totalOdds(t)}:1</span>
              </>,
            ),
          )}
        </div>
      </Group>

      <Group title="Combination" odds="5 : 1 · both faces appear">
        <div className="sicbo-cells sicbo-combos">
          {COMBOS.map(([a, b]) =>
            cell(
              keyOf('combo', a, b),
              `Combination ${a} and ${b}`,
              'sicbo-combo',
              <span className="sicbo-dicepair">
                <FaceDie value={a} mini />
                <FaceDie value={b} mini />
              </span>,
            ),
          )}
        </div>
      </Group>

      <Group title="Double" odds="10 : 1">
        <div className="sicbo-cells sicbo-doubles">
          {FACES.map((f) =>
            cell(
              keyOf('double', f),
              `Double ${f}s`,
              'sicbo-double',
              <span className="sicbo-dicepair">
                <FaceDie value={f} mini />
                <FaceDie value={f} mini />
              </span>,
            ),
          )}
        </div>
      </Group>

      <Group title="Triple" odds="specific 180 : 1 · any 30 : 1">
        <div className="sicbo-cells sicbo-anytriple">
          {cell(
            keyOf('anyTriple'),
            'Any triple',
            'sicbo-anytriple-cell',
            <>
              <span className="sicbo-anytriple-name">Any Triple</span>
              <span className="sicbo-anytriple-odds">30 : 1</span>
            </>,
          )}
        </div>
        <div className="sicbo-cells sicbo-triples">
          {FACES.map((f) =>
            cell(
              keyOf('triple', f),
              `Triple ${f}s`,
              'sicbo-triple',
              <span className="sicbo-dicetrio">
                <FaceDie value={f} mini />
                <FaceDie value={f} mini />
                <FaceDie value={f} mini />
              </span>,
            ),
          )}
        </div>
      </Group>
    </section>
  )
}

function Group({ title, odds, children }: { title: string; odds: string; children: ReactNode }) {
  return (
    <section className="sicbo-group">
      <header className="sicbo-group-head">
        <span className="sicbo-group-title">{title}</span>
        <span className="sicbo-group-odds">{odds}</span>
      </header>
      {children}
    </section>
  )
}

/* ------------------------------- the chips ------------------------------- */

/** A value that fits on a chip face: $11, $11.50, $1.3k, $250k. */
function chipFace(cents: number): string {
  const d = cents / 100
  if (d >= 100000) return `$${Math.round(d / 1000)}k`
  if (d >= 1000) return `$${(d / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

/** Casino chip colour by total value — the whole stake on a spot is one chip. */
function chipTone(cents: number): string {
  if (cents >= 10000) return 'black' // $100+
  if (cents >= 2500) return 'green' // $25+
  if (cents >= 1000) return 'blue' // $10+
  if (cents >= 500) return 'red' // $5+
  return 'white' // $1+
}

/** A poker chip sitting on a spot, showing the combined stake. Keyed by value
 *  upstream so it re-pops on each change. Pure aria-hidden decoration and
 *  pointer-events:none (CSS), fully inside its cell, so it never steals a click. */
function SicBoChip({ cents }: { cents: number }) {
  return (
    <span className={`sicbo-chip-token tone-${chipTone(cents)}`} aria-hidden="true">
      <span className="sicbo-chip-token-val">{chipFace(cents)}</span>
    </span>
  )
}

const CHIP_LABELS: Record<number, string> = {
  100: '$1',
  500: '$5',
  1000: '$10',
  2500: '$25',
  10000: '$100',
}

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
      <div className="sicbo-chip-row">
        {CHIP_SIZES.map((c) => (
          <button
            type="button"
            key={c}
            className={`sicbo-chipbtn tone-${chipTone(c)} ${value === c ? 'is-on' : ''}`}
            aria-pressed={value === c}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            <span className="sicbo-chipbtn-val">{CHIP_LABELS[c]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- the dice -------------------------------- */

const rndFace = () => 1 + Math.floor(Math.random() * 6)

/** Pip layout per face (positions on a 3×3 grid: rows top→bottom, cols left→right). */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
}

/** A 3×3 grid of pip slots; filled ones get a dot. Sizes via the parent class. */
function Pips({ value, size }: { value: number; size: 'lg' | 'md' | 'sm' }) {
  const filled = new Set((PIP_LAYOUT[value] ?? []).map(([r, c]) => r * 3 + c))
  return (
    <span className={`sicbo-pips is-${size}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`sicbo-pip ${filled.has(i) ? 'is-on' : ''}`} />
      ))}
    </span>
  )
}

/** A small white die face used inside board spots. */
function FaceDie({ value, mini }: { value: number; mini?: boolean }) {
  return (
    <span className={`sicbo-facedie ${mini ? 'is-mini' : ''}`} aria-hidden="true">
      <Pips value={value} size={mini ? 'sm' : 'md'} />
    </span>
  )
}

/** A full-size die in the stage: tumbling, settling (a one-shot land bounce), or
 *  at rest. The per-die state lets the three dice come to rest one after another. */
function Die({ value, state }: { value: number; state: 'tumbling' | 'landing' | 'rest' }) {
  const cls = state === 'tumbling' ? 'is-tumbling' : state === 'landing' ? 'is-landing' : ''
  return (
    <div className={`sicbo-die ${cls}`} aria-label={`die showing ${value}`}>
      <Pips value={value} size="lg" />
    </div>
  )
}

/* ----------------------------- provably fair ----------------------------- */

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: SicBoRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifyRoll(round.serverSeed, round.clientSeed, round.nonce, round.dice) : null),
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
          <code className="seed">{round ? round.serverSeedHash : 'committed when you roll'}</code>
        </Row>
        {round && (
          <>
            <Row label="Roll">
              <code className="seed">{round.dice.join(' · ')}</code>
            </Row>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ dice match the committed seed' : '✗ mismatch'}
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
