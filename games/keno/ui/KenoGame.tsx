import { useMemo, useRef, useState, type ReactNode } from 'react'
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
import './keno.css'

interface KenoGameProps {
  account: Account
  houseConfig?: KenoHouseConfig
  onBalanceChange: () => void
}

const ALL_TILES = Array.from({ length: GRID_SIZE }, (_, i) => i + 1)

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
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)

  const available = availableToWager(account)
  const table = useMemo(
    () => (picks.length ? buildPaytable(picks.length, risk, houseConfig) : null),
    [picks.length, risk, houseConfig],
  )
  const maxMult = table ? Math.max(...table) : 0
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || picks.length < 1

  function toggle(n: number) {
    setRound(null)
    setPicks((p) =>
      p.includes(n) ? p.filter((x) => x !== n) : p.length < MAX_PICKS ? [...p, n] : p,
    )
  }

  function autoPick() {
    setRound(null)
    const pool = [...ALL_TILES]
    const out: number[] = []
    while (out.length < MAX_PICKS) {
      const i = Math.floor(Math.random() * pool.length)
      out.push(pool.splice(i, 1)[0])
    }
    setPicks(out.sort((a, b) => a - b))
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
      setRound(r)
      setHistory((h) => [{ multiplier: r.multiplier, won: r.won }, ...h].slice(0, 16))
      onBalanceChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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
                  setRound(null)
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
              setPicks([])
              setRound(null)
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
            ? round.won
              ? `${round.hits}/${round.picks.length} hits · ${round.multiplier.toFixed(2)}× — won ${formatPoints(Math.round(bet * (round.multiplier - 1)))}`
              : `${round.hits}/${round.picks.length} hits — lost ${formatPoints(bet)}`
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
            const picked = picks.includes(n)
            const drawn = round?.drawn.includes(n) ?? false
            let kind = 'idle'
            if (round) {
              if (picked && drawn) kind = 'hit'
              else if (picked) kind = 'miss'
              else if (drawn) kind = 'drawn'
            } else if (picked) kind = 'picked'
            return (
              <button key={n} className={`keno-tile is-${kind}`} onClick={() => toggle(n)}>
                {n}
              </button>
            )
          })}
        </div>

        {table && <Paytable table={table} hits={round?.hits ?? null} />}

        <Fairness
          round={round}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + 1}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
  )
}

function Paytable({ table, hits }: { table: number[]; hits: number | null }) {
  const tiers = table.map((m, h) => ({ h, m })).filter((t) => t.m > 0)
  if (tiers.length === 0) return null
  return (
    <div className="keno-paytable">
      {tiers.map((t) => (
        <div key={t.h} className={`pay-tier ${hits === t.h ? 'is-current' : ''}`}>
          <span className="pay-hits">{t.h}×</span>
          <span className="pay-mult">{t.m.toFixed(2)}×</span>
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
