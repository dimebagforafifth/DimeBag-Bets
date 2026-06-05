import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
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
import './keno.css'

interface KenoGameProps {
  account: Account
  houseConfig?: KenoHouseConfig
  onBalanceChange: () => void
}

const ALL_TILES = Array.from({ length: GRID_SIZE }, (_, i) => i + 1)
const REVEAL_MS = 130 // gap between each drawn number popping in

export function KenoGame({
  account,
  houseConfig = DEFAULT_KENO_CONFIG,
  onBalanceChange,
}: KenoGameProps) {
  const [bet, setBet] = useState(10)
  const [risk, setRisk] = useState<KenoRisk>('classic')
  const [picks, setPicks] = useState<number[]>([])
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [round, setRound] = useState<KenoRound | null>(null)
  const [shown, setShown] = useState(0) // how many drawn numbers have popped in
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef(0)

  const available = availableToWager(account)
  const table = useMemo(
    () => (picks.length ? buildPaytable(picks.length, risk, houseConfig) : null),
    [picks.length, risk, houseConfig],
  )
  const maxMult = table ? Math.max(...table) : 0
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
      // Pop the drawn numbers in one at a time; land the result + balance last.
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
          onBalanceChange()
          playSound(r.won ? 'win' : 'lose')
        }
      }
      timerRef.current = window.setTimeout(() => step(1), REVEAL_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const drawnVisible = round ? round.drawn.slice(0, shown) : []
  const hitsVisible = round ? round.picks.filter((n) => drawnVisible.includes(n)).length : 0

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
            <input
              className="field-input"
              type="number"
              min={1}
              value={bet}
              onChange={(e) => setBet(Math.floor(Number(e.target.value)) || 0)}
            />
            <button className="chip" onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}>
              ½
            </button>
            <button className="chip" onClick={() => setBet((b) => Math.min(available, b * 2))}>
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

        <button className="action action-bet" onClick={play} disabled={betInvalid}>
          Bet
        </button>

        <p className="keno-hint">
          {round
            ? done
              ? round.won
                ? `${round.hits}/${round.picks.length} hits · ${round.multiplier.toFixed(2)}× — won ${formatPoints(Math.round(bet * (round.multiplier - 1)))}`
                : `${round.hits}/${round.picks.length} hits — lost ${formatPoints(bet)}`
              : `Drawing… ${hitsVisible} hit${hitsVisible === 1 ? '' : 's'}`
            : picks.length
              ? `${picks.length} picked · up to ${maxMult.toFixed(2)}× (${formatPoints(Math.round(bet * (maxMult - 1)))})`
              : 'Pick 1–10 numbers'}
        </p>
        {error && <p className="keno-error">{error}</p>}
        {bet > available && !error && (
          <p className="keno-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <section className="keno-stage">
        <div className="keno-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>

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

        {table && <Paytable table={table} hits={done ? round?.hits ?? null : null} />}

        <Fairness
          round={done ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          onClientSeed={setClientSeed}
        />

        {done && round?.won && (
          <WinPopup multiplier={round.multiplier} amount={Math.round(bet * (round.multiplier - 1))} />
        )}
      </section>
    </div>
  )
}

/** A faceted green gem, sharing the one standard --gem palette (app/theme.css). */
function Gem() {
  return (
    <svg className="keno-gem" viewBox="0 0 32 32" aria-hidden="true">
      <polygon className="gem-crown" points="9,7 23,7 27,13 16,27 5,13" />
      <polygon className="gem-table" points="9,7 23,7 24.5,13 7.5,13" />
      <polygon className="gem-p1" points="7.5,13 16,27 5,13" />
      <polygon className="gem-p4" points="24.5,13 16,27 27,13" />
      <polygon className="gem-gloss" points="11,8.4 21,8.4 20,11 12,11" opacity="0.4" />
      <polyline className="gem-girdle" points="7.5,13 24.5,13" fill="none" strokeWidth="0.6" opacity="0.5" />
      <line className="gem-girdle" x1="16" y1="13" x2="16" y2="27" strokeWidth="0.5" opacity="0.4" />
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
          <span className="pay-mult">{m.toFixed(2)}×</span>
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
          <code className="seed">{round ? round.serverSeedHash : 'committed when you bet'}</code>
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

function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
