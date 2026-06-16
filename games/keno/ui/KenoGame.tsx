import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  buildPaytable,
  DEFAULT_KENO_CONFIG,
  GRID_SIZE,
  MAX_PICKS,
  playKeno,
  randomServerSeed,
  RISKS,
  verifyDraw,
  type KenoHouseConfig,
  type KenoRisk,
  type KenoRound,
} from '../index.js'
import { play as playSound } from '../../../sound/index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './keno.css'

const KENO_RULES: ReactNode[] = [
  'Pick up to 10 numbers on the 40-number grid, choose a risk level, then hit Bet.',
  '10 numbers are drawn at random. Your payout depends on how many of your picks are hit.',
  'Picking more numbers and raising the risk shifts the table toward rarer, bigger multipliers.',
  <>
    <strong>Payout = bet × the multiplier for your hit count</strong> (shown in the paytable). The
    draw is provably fair.
  </>,
]

interface KenoGameProps {
  account: Account
  houseConfig?: KenoHouseConfig
  onBalanceChange: () => void
}

const ALL_TILES = Array.from({ length: GRID_SIZE }, (_, i) => i + 1)
const REVEAL_MS = 85 // gap between each drawn number popping in (snappy, so the result lands fast)
/** The popup is gated on `done` (after all numbers reveal). A short beat after the
 *  win lands so it registers before the payout card pops up. */
const POPUP_DELAY_MS = 300

export function KenoGame({
  account,
  houseConfig = DEFAULT_KENO_CONFIG,
  onBalanceChange,
}: KenoGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [risk, setRisk] = useState<KenoRisk>('classic')
  const [picks, setPicks] = useState<number[]>([])
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<KenoRound | null>(null)
  const [shown, setShown] = useState(0) // how many drawn numbers have popped in
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef(0)

  const available = maxBet(account)
  const resolving = useResolving(account.id)
  const table = useMemo(
    () => (picks.length ? buildPaytable(picks.length, risk, houseConfig) : null),
    [picks.length, risk, houseConfig],
  )
  const revealing = round != null && shown < round.drawn.length
  const done = round != null && shown >= round.drawn.length
  const betInvalid =
    !Number.isInteger(bet) || bet < 1 || bet > available || picks.length < 1 || revealing

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function reset() {
    clearTimeout(timerRef.current)
    setRound(null)
    setShown(0)
  }

  function toggle(n: number) {
    reset()
    setPicks((p) =>
      p.includes(n) ? p.filter((x) => x !== n) : p.length < MAX_PICKS ? [...p, n] : p,
    )
    playSound('select')
  }

  function autoPick() {
    reset()
    const pool = [...ALL_TILES]
    const out: number[] = []
    while (out.length < MAX_PICKS) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    setPicks(out.sort((a, b) => a - b))
    playSound('select')
  }

  function play() {
    setError(null)
    try {
      nonceRef.current += 1
      const r = playKeno(account, {
        stake: bet,
        picks,
        risk,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      clearTimeout(timerRef.current)
      setRound(r)
      setShown(0)
      playSound('bet')
      // The figure already moved inside playKeno; refresh now so `available`
      // stays honest during the reveal animation (a second bet is blocked by
      // `revealing` anyway). The result chime + history land when the draw ends.
      onBalanceChange()
      // Pop the drawn numbers in one at a time; land the result last.
      let hitsSounded = 0
      const step = (i: number) => {
        setShown(i)
        const num = r.drawn[i - 1]
        if (num != null) {
          // a hit (a number you picked) rings up the ascending ladder; a miss is a flat blip.
          if (r.picks.includes(num)) playSound('reveal', { step: ++hitsSounded })
          else playSound('draw', { step: i })
        }
        if (i < r.drawn.length) {
          timerRef.current = window.setTimeout(() => step(i + 1), REVEAL_MS)
        } else {
          setHistory((h) => [{ multiplier: r.multiplier, won: r.won }, ...h].slice(0, 16))
          playSound(r.won ? 'win' : 'lose')
          signalReveal(account.id) // all numbers are in — free the bet button now
        }
      }
      timerRef.current = window.setTimeout(() => step(1), REVEAL_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const drawnVisible = round ? round.drawn.slice(0, shown) : []

  function tileKind(n: number): string {
    if (!round) return picks.includes(n) ? 'picked' : 'idle'
    const isPicked = round.picks.includes(n)
    const isDrawn = drawnVisible.includes(n)
    if (isPicked && isDrawn) return 'hit'
    if (isDrawn) return 'drawn'
    if (isPicked) return done ? 'miss' : 'picked'
    return 'idle'
  }

  return (
    <div className="keno">
      <section className="keno-panel">
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
            <button
              className="chip"
              onClick={() => setBet((b) => Math.max(1, Math.min(available, b * 2)))}
            >
              2×
            </button>
          </div>
        </label>

        <div className="field">
          <span className="field-label">Risk</span>
          <div className="keno-risks">
            {RISKS.map((r) => (
              <button
                key={r}
                className={`chip ${risk === r ? 'is-on' : ''}`}
                onClick={() => {
                  setRisk(r)
                  reset()
                }}
              >
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="keno-actions">
          <button className="chip" onClick={autoPick}>
            Auto pick
          </button>
          <button
            className="chip"
            onClick={() => {
              reset()
              setPicks([])
            }}
          >
            Clear
          </button>
        </div>

        <button className="action action-bet" onClick={play} disabled={betInvalid || resolving}>
          Play
        </button>

        {error && <p className="keno-error">{error}</p>}
        {bet > available && !error && (
          <p className="keno-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <section className="keno-stage">
        <div className="keno-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {fmtMult(h.multiplier)}
            </span>
          ))}
        </div>

        <div className="keno-grid-wrap">
          <div className="keno-grid">
            {ALL_TILES.map((n) => {
              const kind = tileKind(n)
              // The gem is the game's reward: it only appears once the draw hits
              // one of your picks. Your picks themselves wear a flat purple cover.
              const gem = kind === 'hit'
              return (
                <button
                  key={n}
                  className={`keno-tile is-${kind}`}
                  onClick={() => toggle(n)}
                  disabled={revealing}
                >
                  {gem && <Gem />}
                  <span className="keno-num">{n}</span>
                </button>
              )
            })}
          </div>

          {/* the win card centers over the grid — the visual middle of the play area */}
          {done && round?.won && (
            <WinPopup key={round.nonce} multiplier={round.multiplier} stake={bet} delayMs={POPUP_DELAY_MS} />
          )}
        </div>

        {table && <Paytable table={table} hits={done ? round?.hits ?? null : null} />}

        <Rules points={KENO_RULES} />

        <Fairness
          round={done ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + 1}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
  )
}

/** A big, bright square-cut green gem that fills the tile bar the rounded corners
 *  — a near-square with only small corners cut off, beveled facets running in to a
 *  flat table. Shares the one standard --gem palette (app/theme.css); the eight
 *  ring facets are shaded for light from the top-left, the way a cut stone reads. */
function Gem() {
  return (
    <svg className="keno-gem" viewBox="0 0 32 32" aria-hidden="true">
      {/* ring facets, clockwise from the top — each runs from an outer (near-edge)
          octagon edge in to the table edge; light (top/left) → dark (right/bottom) */}
      <polygon className="gem-cl" points="6,1 26,1 20,9 12,9" /> {/* top — light */}
      <polygon className="gem-p1" points="26,1 31,6 23,12 20,9" /> {/* top-right cut */}
      <polygon className="gem-cr" points="31,6 31,26 23,20 23,12" /> {/* right — dark */}
      <polygon className="gem-p3" points="31,26 26,31 20,23 23,20" /> {/* bottom-right cut — darkest */}
      <polygon className="gem-p3" points="26,31 6,31 12,23 20,23" /> {/* bottom — darkest */}
      <polygon className="gem-p1" points="6,31 1,26 9,20 12,23" /> {/* bottom-left cut */}
      <polygon className="gem-p2" points="1,26 1,6 9,12 9,20" /> {/* left — base */}
      <polygon className="gem-table" points="1,6 6,1 12,9 9,12" /> {/* top-left cut — highlight */}
      {/* the flat octagonal table */}
      <polygon className="gem-table" points="12,9 20,9 23,12 23,20 20,23 12,23 9,20 9,12" />
      {/* a concentric step line, for the stepped cut look */}
      <polygon
        className="gem-girdle"
        points="8,4 24,4 28,8 28,24 24,28 8,28 4,24 4,8"
        fill="none"
        strokeWidth="0.7"
        opacity="0.38"
      />
      {/* gloss + a bright four-point sparkle on the table */}
      <polygon className="gem-gloss" points="11.4,10.6 17.8,10.6 15.4,13.2 11.4,13.2" opacity="0.4" />
      <path
        className="gem-spark"
        d="M14.2 13 l0.9 2.1 2.1 0.9 -2.1 0.9 -0.9 2.1 -0.9 -2.1 -2.1 -0.9 2.1 -0.9 Z"
        opacity="0.9"
      />
      {/* girdle outline around the whole octagon */}
      <polygon
        className="gem-girdle"
        points="6,1 26,1 31,6 31,26 26,31 6,31 1,26 1,6"
        fill="none"
        strokeWidth="0.8"
        opacity="0.55"
      />
    </svg>
  )
}

function Paytable({ table, hits }: { table: number[]; hits: number | null }) {
  // Every tier 0..picks is shown (Stake-style), including the non-paying 0.00×
  // ones, so the player sees the full shape. The live hit-count lights up green.
  return (
    <div className="keno-paytable">
      {table.map((m, h) => (
        <div
          key={h}
          className={`pay-tier ${hits === h ? 'is-current' : ''} ${m > 0 ? '' : 'is-zero'}`}
        >
          <span className="pay-mult">{fmtMult(m)}</span>
          <span className="pay-hits">{h} hit{h === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  )
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  onClientSeed,
}: {
  round: KenoRound | null
  clientSeed: string
  nextNonce: number
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifyDraw(round.serverSeed, round.clientSeed, round.nonce, round.drawn) : null),
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
          <code className="seed">{round ? round.serverSeedHash : 'generated when you bet'}</code>
        </Row>
        {round && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ draw matches the committed seed' : '✗ mismatch'}
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

function formatPoints(cents: number): string {
  return formatMoney(cents)
}

/** Compact multiplier label for the paytable + history. Small payouts stay
 *  precise (2dp), but the big high-risk ones are abbreviated (350×, 3.5k×) so the
 *  number never overflows its paytable cell. */
function fmtMult(m: number): string {
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(1)}M×`
  if (m >= 10_000) return `${Math.round(m / 1000)}k×`
  if (m >= 1000) return `${(m / 1000).toFixed(1)}k×`
  if (m >= 100) return `${Math.round(m)}×`
  if (m >= 10) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}
