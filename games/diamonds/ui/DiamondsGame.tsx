import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  buildPaytable,
  DEFAULT_DIAMONDS_CONFIG,
  GEMS,
  PATTERN_LABELS,
  PATTERNS,
  playDiamonds,
  randomServerSeed,
  verifyGems,
  type DiamondsHouseConfig,
  type DiamondsRound,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './diamonds.css'

const DIAMONDS_RULES: ReactNode[] = [
  'Set your bet and hit Bet — five gems are dealt, each a random colour out of eight.',
  'Your payout depends only on how the colours match: a pair, two pair, three/four/five of a kind, or a full house.',
  'Rarer matches pay far more — five of a kind is the jackpot. A hand with no matching colours pays nothing.',
  <>
    <strong>Payout = bet × the multiplier for your match</strong> (shown in the paytable). The deal
    is provably fair.
  </>,
]

interface DiamondsGameProps {
  account: Account
  houseConfig?: DiamondsHouseConfig
  onBalanceChange: () => void
}

/** A distinct colour per gem colour index (0..7). Spread evenly around the wheel
 *  and pushed apart on the easily-confused pairs (red vs pink, orange vs yellow,
 *  cyan vs blue) so you can tell at a glance whether two gems match. */
const GEM_COLORS = [
  '#ff3b30', // red
  '#ff8f1f', // orange
  '#ffd60a', // yellow
  '#2ecc40', // green
  '#00c2d6', // cyan
  '#3366ff', // blue
  '#a64dff', // purple
  '#ff4fd8', // magenta
]

const REVEAL_MS = 120 // stagger between each gem popping in — snappy, so the result lands fast
/** Hold a short beat after the last gem lands so the hand reads before the win card. */
const POPUP_DELAY_MS = 320

export function DiamondsGame({
  account,
  houseConfig = DEFAULT_DIAMONDS_CONFIG,
  onBalanceChange,
}: DiamondsGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<DiamondsRound | null>(null)
  const [shown, setShown] = useState(0) // how many gems have popped in
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef(0)

  const available = maxBet(account)
  const table = useMemo(() => buildPaytable(houseConfig), [houseConfig])
  const payingPatterns = useMemo(() => PATTERNS.filter((p) => table[p] > 0), [table])

  const revealing = round != null && shown < GEMS
  const done = round != null && shown >= GEMS
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available || revealing
  const resolving = useResolving(account.id)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // The deal's server seed now comes from the platform fairness AUTHORITY (commit hash before
  // play → reveal after), not a browser randomServerSeed(). The gem math is unchanged.
  async function deal() {
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const r = playDiamonds(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        config: houseConfig,
      })
      clearTimeout(timerRef.current)
      setRound(r)
      setShown(0)
      onBalanceChange()
      play('bet')

      // Pop the gems in one at a time; land the result + sound on the last.
      const step = (i: number) => {
        setShown(i)
        play('reveal', { step: i })
        if (i < GEMS) {
          timerRef.current = window.setTimeout(() => step(i + 1), REVEAL_MS)
        } else {
          setHistory((h) =>
            [{ multiplier: r.multiplier, won: r.multiplier > 1 }, ...h].slice(0, 16),
          )
          play(r.multiplier > 1 ? 'win' : 'lose')
        }
      }
      timerRef.current = window.setTimeout(() => step(1), REVEAL_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const result = done ? round : null

  return (
    <div className="diamonds">
      <section className="diamonds-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={revealing}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={revealing}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={revealing}
              onClick={() => setBet((b) => Math.min(available, b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        <button className="action action-bet" onClick={deal} disabled={betInvalid || resolving}>
          Play
        </button>

        {error && <p className="diamonds-error">{error}</p>}
        {bet > available && !error && (
          <p className="diamonds-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}
      </section>

      <section className="diamonds-stage">
        <div className="diamonds-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className="diamonds-gems-wrap">
          <div className="diamonds-gems">
            {Array.from({ length: GEMS }, (_, i) => {
              const revealed = round != null && i < shown
              const colour = round ? round.gems[i] : null
              return (
                <div
                  key={i}
                  className={`diamonds-slot ${revealed ? 'is-revealed' : ''}`}
                  style={
                    revealed && colour != null
                      ? ({ '--gem-color': GEM_COLORS[colour] } as CSSProperties)
                      : undefined
                  }
                >
                  {revealed && colour != null ? (
                    <Gem color={GEM_COLORS[colour]} />
                  ) : (
                    <span className="diamonds-slot-empty" />
                  )}
                </div>
              )
            })}
          </div>

          {done && result && result.multiplier > 1 && (
            <WinPopup
              key={result.nonce}
              multiplier={result.multiplier}
              stake={bet}
              delayMs={POPUP_DELAY_MS}
            />
          )}
        </div>

        <div className="diamonds-result">
          {result ? `${PATTERN_LABELS[result.pattern]} — ${result.multiplier.toFixed(2)}×` : ' '}
        </div>

        <div className="diamonds-paytable">
          {payingPatterns.map((p) => (
            <div
              key={p}
              className={`diamonds-tier ${result && result.pattern === p ? 'is-current' : ''}`}
            >
              <span className="diamonds-tier-name">{PATTERN_LABELS[p]}</span>
              <span className="diamonds-tier-mult">{table[p].toFixed(2)}×</span>
            </div>
          ))}
          <div
            className={`diamonds-tier is-zero ${
              result && table[result.pattern] === 0 ? 'is-current' : ''
            }`}
          >
            <span className="diamonds-tier-name">No match</span>
            <span className="diamonds-tier-mult">0.00×</span>
          </div>
        </div>

        <Rules points={DIAMONDS_RULES} />

        <Fairness
          round={result}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          editable={!revealing}
          onClientSeed={setClientSeed}
        />
      </section>
    </div>
  )
}

/** A faceted brilliant-cut gem, tinted to its colour. Cosmetic — the colour
 *  index decided by the seed is what counts, not the artwork. */
function Gem({ color }: { color: string }) {
  return (
    <svg className="diamonds-gem" viewBox="0 0 32 32" aria-hidden="true" style={{ color }}>
      {/* crown facets */}
      <polygon className="gem-light" points="6,11 16,4 26,11 21,13 11,13" />
      <polygon className="gem-mid" points="6,11 11,13 9,18 5,15" />
      <polygon className="gem-dark" points="26,11 27,15 23,18 21,13" />
      {/* table */}
      <polygon className="gem-table" points="11,13 21,13 23,18 9,18" />
      {/* pavilion to the culet */}
      <polygon className="gem-mid" points="9,18 23,18 16,29" />
      <polygon className="gem-dark" points="5,15 9,18 16,29" />
      <polygon className="gem-light" points="27,15 23,18 16,29" />
      {/* sparkle */}
      <path
        className="gem-spark"
        d="M14.4 9 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1 Z"
        opacity="0.85"
      />
    </svg>
  )
}

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: DiamondsRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (round ? verifyGems(round.serverSeed, round.clientSeed, round.nonce, round.gems) : null),
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
            <Row label="Gems (colours 0–7)">
              <code className="seed">{round.gems.join(', ')}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ deal matches the committed seed' : '✗ mismatch'}
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
