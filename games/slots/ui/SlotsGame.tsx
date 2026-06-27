import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  buildPaytable,
  DEFAULT_SLOTS_CONFIG,
  playSlots,
  randomServerSeed,
  REELS,
  SYMBOLS,
  twoCherryMultiplier,
  verifySpin,
  type SlotsHouseConfig,
  type SlotsRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { assetUrl } from '../../shared/assetUrl.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './slots.css'

const SLOTS_RULES: ReactNode[] = [
  'Set your bet and pull the lever — three reels spin and stop one by one.',
  'Land three matching symbols on the line to win that symbol’s multiplier; rarer symbols pay more.',
  <>
    Two cherries also pay a small consolation. <strong>Payout = bet × the multiplier</strong>; any
    other combination loses the bet.
  </>,
  <>The reels are weighted, and every spin is provably fair.</>,
]

/** Base-aware src for a slot symbol's premium 3D art (public/game-tiles/slots/<key>.png). */
const symbolSrc = (i: number) => assetUrl(`/game-tiles/slots/${SYMBOLS[i].key}.png`)

/** A slot symbol rendered as its 3D image (replaces the old emoji glyph). */
function SymbolIcon({ i }: { i: number }) {
  return (
    <img className="slots-symbol-img" src={symbolSrc(i)} alt={SYMBOLS[i].key} draggable={false} />
  )
}

interface SlotsGameProps {
  account: Account
  houseConfig?: SlotsHouseConfig
  onBalanceChange: () => void
}

const STOP_BASE_MS = 700 // when the first reel locks
const STOP_STAGGER_MS = 150 // each later reel locks this much after the previous
const SETTLE_MS = STOP_BASE_MS + STOP_STAGGER_MS * (REELS - 1) + 60 // win/loss resolves here

export function SlotsGame({
  account,
  houseConfig = DEFAULT_SLOTS_CONFIG,
  onBalanceChange,
}: SlotsGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<SlotsRound | null>(null)
  const [spinning, setSpinning] = useState(false)
  /** Per-reel: whether it has stopped on its result symbol yet. */
  const [stopped, setStopped] = useState<boolean[]>(() => new Array(REELS).fill(true))
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<number[]>([])

  const available = maxBet(account)
  const table = useMemo(() => buildPaytable(houseConfig), [houseConfig])
  const twoCherry = useMemo(() => twoCherryMultiplier(houseConfig), [houseConfig])
  // The paytable, ranked best-prize-first (like a real machine). Keep each symbol's
  // original reel index so the winning-line "is-hit" highlight still matches.
  const rankedPays = useMemo(
    () => SYMBOLS.map((s, i) => ({ s, i, mult: table[i] })).sort((a, b) => b.mult - a.mult),
    [table],
  )
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || spinning
  const resolving = useResolving(account.id)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // The server seed now comes from the platform fairness AUTHORITY (commit hash before play →
  // reveal), not a browser randomServerSeed(). The reel math is unchanged.
  async function spin() {
    if (inFlightRef.current || spinning) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playSlots(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      play('roll')
      setRound(r)
      setSpinning(true)
      setStopped(new Array(REELS).fill(false))

      timers.current.forEach(clearTimeout)
      timers.current = []
      // stagger the three reel stops left → right
      for (let i = 0; i < REELS; i++) {
        timers.current.push(
          window.setTimeout(
            () => {
              setStopped((s) => {
                const next = [...s]
                next[i] = true
                return next
              })
              play('tick')
            },
            STOP_BASE_MS + STOP_STAGGER_MS * i,
          ),
        )
      }
      // settle the round once every reel has locked
      timers.current.push(
        window.setTimeout(() => {
          setSpinning(false)
          setHistory((h) =>
            [{ multiplier: r.multiplier, won: r.multiplier > 1 }, ...h].slice(0, 16),
          )
          signalReveal(account.id) // the reels have stopped — release the held ledger entry now
          onBalanceChange() // move the figure in sync with the result landing on screen
          play(r.multiplier > 1 ? 'win' : 'lose')
        }, SETTLE_MS),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const showResult = round != null && !spinning
  const won = showResult && round!.multiplier > 1

  return (
    <div className="slots">
      <section className="slots-panel">
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

        <button className="action action-bet" onClick={spin} disabled={betInvalid || resolving}>
          Spin
        </button>

        {error && <p className="slots-error">{error}</p>}
        {bet > available && !error && (
          <p className="slots-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}

        <div className="slots-paytable">
          <span className="field-label">Paytable</span>
          {rankedPays.map(({ s, i, mult }) => (
            <div
              key={s.key}
              className={`slots-pay-row ${
                showResult && round!.reels.every((r) => r === i) ? 'is-hit' : ''
              }`}
            >
              <span className="slots-pay-symbols">
                <SymbolIcon i={i} />
                <SymbolIcon i={i} />
                <SymbolIcon i={i} />
              </span>
              <span className="slots-pay-mult">{mult.toFixed(2)}×</span>
            </div>
          ))}
          <div className="slots-pay-row slots-pay-row--note">
            <span className="slots-pay-symbols">
              <SymbolIcon i={0} />
              <SymbolIcon i={0} />
            </span>
            <span className="slots-pay-mult">{twoCherry.toFixed(2)}×</span>
          </div>
        </div>
      </section>

      <section className="slots-stage">
        <div className="slots-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier}×
            </span>
          ))}
        </div>

        <div className={`slots-machine ${won ? 'is-win' : ''}`}>
          {Array.from({ length: REELS }, (_, r) => (
            <Reel
              key={r}
              target={round ? round.reels[r] : 0}
              spinning={spinning && !stopped[r]}
              dim={spinning}
            />
          ))}
          <span className={`slots-winline ${won ? 'is-win' : ''}`} />
        </div>

        <Rules points={SLOTS_RULES} />

        <Fairness
          round={showResult ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          editable={!spinning}
          onClientSeed={setClientSeed}
        />

        {won && (
          <WinPopup key={round!.nonce} multiplier={round!.multiplier} stake={bet} delayMs={200} />
        )}
      </section>
    </div>
  )
}

/**
 * One reel window. While `spinning` it scrolls a column of symbols vertically;
 * when it stops it shows the seed-derived `target` symbol on the line (the
 * animation is purely cosmetic — it never decides the result, CLAUDE.md §3).
 */
function Reel({ target, spinning, dim }: { target: number; spinning: boolean; dim: boolean }) {
  return (
    <div className={`slots-reel ${dim ? 'is-active' : ''}`}>
      <div className={`slots-strip ${spinning ? 'is-spinning' : ''}`}>
        {spinning ? (
          // a long looping strip of symbols that scrolls past the window
          SCROLL_STRIP.map((s, i) => (
            <span key={i} className="slots-cell">
              <SymbolIcon i={s} />
            </span>
          ))
        ) : (
          <span className="slots-cell slots-cell--result">
            <SymbolIcon i={target} />
          </span>
        )}
      </div>
    </div>
  )
}

/** A repeated column of every symbol, looped, for the scrolling blur. */
const SCROLL_STRIP: number[] = (() => {
  const order = SYMBOLS.map((_s, i) => i)
  const out: number[] = []
  for (let rep = 0; rep < 6; rep++) out.push(...order)
  return out
})()

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: SlotsRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifySpin(round.serverSeed, round.clientSeed, round.nonce, round.reels) : null),
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
                {verified ? '✓ reels match the committed seed' : '✗ mismatch'}
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
