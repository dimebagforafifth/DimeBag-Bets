import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager } from '../../../core/index.js'
import {
  cashOut,
  crashRound,
  createCrashGame,
  DEFAULT_CRASH_CONFIG,
  multiplierAt,
  randomServerSeed,
  revealProof,
  verifyCrashPoint,
  type CrashGame as CrashGameState,
  type CrashHouseConfig,
} from '../index.js'
import './crash.css'

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

/**
 * The Crash vertical slice (CLAUDE.md §7). A single rising-multiplier view with
 * one primary action (Bet → Cash Out). All money flows through `core` via the
 * engine; this component holds no points. The house edge lives only in the
 * crash-point math, so the curve here looks identical at any vig.
 */
export function CrashGame({
  account,
  houseConfig = DEFAULT_CRASH_CONFIG,
  onBalanceChange,
}: CrashGameProps) {
  const [bet, setBet] = useState(10)
  const [autoCashout, setAutoCashout] = useState('')
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<CrashGameState | null>(null)
  const [live, setLive] = useState(1)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const gameRef = useRef<CrashGameState | null>(null)
  const startRef = useRef(0)
  const rafRef = useRef(0)

  const running = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = availableToWager(account)
  const autoTarget = parseAuto(autoCashout)

  // Cancel any in-flight animation frame when the component unmounts.
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function finish(g: CrashGameState) {
    setGame({ ...g })
    setHistory((h) => [{ crashPoint: g.crashPoint, won: g.status === 'cashed' }, ...h].slice(0, 14))
    onBalanceChange()
  }

  function tick(now: number) {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    const m = multiplierAt(now - startRef.current)

    if (m >= g.crashPoint) {
      crashRound(account, g) // reached the crash point with no cash-out
      setLive(g.crashPoint)
      finish(g)
      return
    }
    if (autoTarget && autoTarget < g.crashPoint && m >= autoTarget) {
      cashOut(account, g, autoTarget) // auto cash-out hit
      setLive(autoTarget)
      finish(g)
      return
    }
    setLive(m)
    rafRef.current = requestAnimationFrame(tick)
  }

  function start() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createCrashGame(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        config: houseConfig,
      })
      gameRef.current = g
      setGame(g)
      setLive(1)
      onBalanceChange()
      startRef.current = performance.now()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function manualCash() {
    const g = gameRef.current
    if (!g || g.status !== 'active') return
    const m = multiplierAt(performance.now() - startRef.current)
    if (m <= 1 || m >= g.crashPoint) return // too early / already gone
    cancelAnimationFrame(rafRef.current)
    cashOut(account, g, m)
    setLive(m)
    finish(g)
  }

  const stakeTooHigh = bet > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh

  return (
    <div className="crash">
      <section className="crash-panel">
        <BetField value={bet} disabled={!idle} max={available} onChange={setBet} />

        <label className="field">
          <span className="field-label">Auto cash out</span>
          <div className="field-bet">
            <input
              className="field-input"
              type="number"
              min={1.01}
              step={0.01}
              placeholder="off"
              value={autoCashout}
              disabled={running}
              onChange={(e) => setAutoCashout(e.target.value)}
            />
            <span className="field-suffix">×</span>
          </div>
        </label>

        {running ? (
          <button
            className="action action-cashout"
            onClick={manualCash}
            disabled={live <= 1}
          >
            {live <= 1 ? (
              'Cash Out'
            ) : (
              <>
                Cash Out {live.toFixed(2)}× ·{' '}
                <strong>{formatPoints(Math.round(bet * (live - 1)))}</strong>
              </>
            )}
          </button>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid}>
            Bet
          </button>
        )}

        {error && <p className="crash-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="crash-error">Stake exceeds what you can wager ({formatPoints(available)}).</p>
        )}
      </section>

      <section className="crash-stage-wrap">
        <History entries={history} />
        <div className={`crash-stage ${stageMod(game, live)}`}>
          <div className="crash-multiplier">{live.toFixed(2)}×</div>
          <div className="crash-caption">{caption(game, bet)}</div>
        </div>
      </section>

      <Fairness
        game={game}
        ended={ended}
        clientSeed={clientSeed}
        editable={idle}
        nextNonce={nonceRef.current + (idle ? 1 : 0)}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

function stageMod(game: CrashGameState | null, live: number): string {
  if (game?.status === 'busted') return 'is-busted'
  if (game?.status === 'cashed') return 'is-cashed'
  if (game?.status === 'active' && live > 1) return 'is-running'
  return ''
}

function caption(game: CrashGameState | null, bet: number): string {
  if (!game) return 'Place a bet to start the round'
  if (game.status === 'busted') return `Crashed @ ${game.crashPoint.toFixed(2)}× — lost ${formatPoints(bet)}`
  if (game.status === 'cashed') {
    const m = game.cashOutMultiplier ?? 1
    return `Cashed @ ${m.toFixed(2)}× — won ${formatPoints(Math.round(bet * (m - 1)))}`
  }
  return 'Cash out before it crashes'
}

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
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.floor(n)))
  return (
    <label className="field">
      <span className="field-label">Bet amount</span>
      <div className="field-bet">
        <span className="field-prefix">$</span>
        <input
          className="field-input"
          type="number"
          min={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.floor(Number(e.target.value)) || 0)}
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

function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <div className="crash-history" />
  return (
    <div className="crash-history">
      {entries.map((e, i) => (
        <span key={i} className={`pill ${e.won ? 'pill-win' : 'pill-loss'}`}>
          {e.crashPoint.toFixed(2)}×
        </span>
      ))}
    </div>
  )
}

function Fairness({
  game,
  ended,
  clientSeed,
  editable,
  nextNonce,
  onClientSeed,
}: {
  game: CrashGameState | null
  ended: boolean
  clientSeed: string
  editable: boolean
  nextNonce: number
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
          <code className="seed">{game ? game.serverSeedHash : 'committed when you bet'}</code>
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

/** Parse the auto-cashout field; valid only above 1.00×. */
function parseAuto(raw: string): number | null {
  const n = Number(raw)
  return raw.trim() !== '' && Number.isFinite(n) && n > 1 ? Math.floor(n * 100) / 100 : null
}

/** Points displayed with "$" but no monetary value (§1). */
function formatPoints(points: number): string {
  const sign = points < 0 ? '−' : ''
  return `${sign}$${Math.abs(points).toLocaleString('en-US')}`
}
