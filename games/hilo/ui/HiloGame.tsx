import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet, resolveAtMultiplier } from '../../../core/index.js'
import {
  cardAt,
  cashOut,
  createHiloGame,
  currentCard,
  DEFAULT_HILO_CONFIG,
  guess,
  hashServerSeed,
  probHigher,
  probLower,
  randomServerSeed,
  skip,
  stepMultiplier,
  verifyHilo,
  type Card,
  type HiloGame as HiloGameState,
  type HiloGuess,
  type HiloHouseConfig,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import './hilo.css'

const HILO_RULES: ReactNode[] = [
  'Set your bet to deal the first card, then guess whether the next card is higher or lower.',
  'Cards run 2 (low) up to Ace (high); an equal rank counts as a win either way. Each correct guess multiplies your running payout.',
  'Guess wrong and the round ends — you lose your bet. Not sure? Skip to draw a fresh card without risking anything.',
  'Cash Out any time to bank your running multiplier.',
  <>
    <strong>Payout = bet × your running multiplier</strong> — riskier guesses grow it faster. The deck order is provably fair.
  </>,
]

interface HiloGameProps {
  account: Account
  houseConfig?: HiloHouseConfig
  onBalanceChange: () => void
}

// A brief beat so the cashed card + final multiplier register on the stage
// before the popup overlays them — just enough not to stomp the display, not a
// noticeable lag after the win sound.
const POPUP_DELAY_MS = 150

export function HiloGame({ account, houseConfig = DEFAULT_HILO_CONFIG, onBalanceChange }: HiloGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  // The server seed for the UPCOMING round, committed (hashed) before the bet and
  // fixed here so the card on the table IS the one the round actually starts from.
  // Rotated to a fresh seed after each bet (a new commitment per round).
  const [serverSeed, setServerSeed] = useState(() => randomServerSeed())
  const nonceRef = useRef(0)

  const [game, setGame] = useState<HiloGameState | null>(null)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [reveal, setReveal] = useState<{ card: Card; correct: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  const active = game?.status === 'active'
  const ended = game != null && game.status !== 'active'
  const idle = game == null || ended
  const available = maxBet(account)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available

  // If the player leaves mid-streak, cash out at the current multiplier so the
  // stake never strands in pending (no correct calls yet just refunds). Background.
  useSettleOnExit(() => {
    if (game?.status === 'active') {
      resolveAtMultiplier(account, game.wager, Math.max(1, game.multiplier))
    }
  })
  const resolving = useResolving(account.id)

  const cur = game ? currentCard(game) : null
  // Before a round, show the EXACT card the round will start from: derived from
  // the committed server seed + client seed + the nonce the next bet will use.
  // Because start() deals from this same seed/nonce, pressing Bet keeps this card
  // on the table instead of swapping it for a different one.
  const preview = useMemo(
    () => cardAt(serverSeed, clientSeed, nonceRef.current + 1, 0),
    [serverSeed, clientSeed],
  )
  const pendingHash = useMemo(() => hashServerSeed(serverSeed), [serverSeed])
  const hiMult = cur ? stepMultiplier(cur.rank, 'hi', houseConfig) : 1
  const loMult = cur ? stepMultiplier(cur.rank, 'lo', houseConfig) : 1
  const hiPct = cur ? probHigher(cur.rank) * 100 : 0
  const loPct = cur ? probLower(cur.rank) * 100 : 0
  // The card name on the buttons (Stake-style) so the win condition is explicit —
  // e.g. on an Ace, "Higher or same as A" makes clear only another A wins.
  const curLabel = cur ? RANK_LABELS[cur.rank] : ''

  function start() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createHiloGame(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed, // deal from the seed already shown on the table → same first card
        config: houseConfig,
      })
      setReveal(null)
      setGame(g)
      setServerSeed(randomServerSeed()) // commit a fresh seed for the next round
      onBalanceChange()
      play('bet')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function doGuess(dir: HiloGuess) {
    if (!game || game.status !== 'active') return
    const res = guess(account, game, dir)
    setReveal({ card: res.card, correct: res.correct })
    if (res.correct) {
      play('reveal', { step: game.cards.length })
    } else {
      play('lose')
      setHistory((h) => [{ multiplier: game.multiplier, won: false }, ...h].slice(0, 16))
    }
    redraw()
    onBalanceChange()
  }

  function doSkip() {
    if (!game || game.status !== 'active') return
    const card = skip(game)
    setReveal({ card, correct: true })
    play('draw')
    redraw()
  }

  function doCash() {
    if (!game || game.status !== 'active' || game.multiplier <= 1) return
    const m = game.multiplier
    cashOut(account, game)
    signalReveal(account.id) // win is on screen instantly → release its ledger entry now
    setHistory((h) => [{ multiplier: m, won: true }, ...h].slice(0, 16))
    play('win')
    redraw()
    onBalanceChange()
  }


  return (
    <div className="hilo">
      <section className="hilo-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={!idle}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button className="chip" disabled={!idle} onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}>
              ½
            </button>
            <button className="chip" disabled={!idle} onClick={() => setBet((b) => Math.min(available, b * 2))}>
              2×
            </button>
          </div>
        </label>
        {active && game!.multiplier > 1 && <ProfitReadout total={Math.round(bet * game!.multiplier)} multiplier={game!.multiplier} />}

        {active ? (
          <>
            <div className="hilo-guesses">
              <button className="hilo-guess is-hi" onClick={() => doGuess('hi')}>
                <span className="hilo-guess-main">Higher or same as {curLabel}</span>
                <span className="hilo-guess-odds">
                  <span className="hilo-guess-mult">{hiMult.toFixed(2)}×</span>
                  <span className="hilo-guess-pct">{Math.round(hiPct)}%</span>
                </span>
              </button>
              <button className="hilo-guess is-lo" onClick={() => doGuess('lo')}>
                <span className="hilo-guess-main">Lower or same as {curLabel}</span>
                <span className="hilo-guess-odds">
                  <span className="hilo-guess-mult">{loMult.toFixed(2)}×</span>
                  <span className="hilo-guess-pct">{Math.round(loPct)}%</span>
                </span>
              </button>
            </div>
            <button className="chip hilo-skip" onClick={doSkip}>
              Skip card
            </button>
            <button
              className="action action-cashout"
              onClick={doCash}
              disabled={game!.multiplier <= 1}
            >
              {game!.multiplier <= 1 ? 'Make a guess' : 'Cash Out'}
            </button>
          </>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="hilo-error">{error}</p>}
        {bet > available && !error && (
          <p className="hilo-error">Stake exceeds what you can wager ({formatMoney(available)}).</p>
        )}
      </section>

      <section className="hilo-stage">
        <div className="hilo-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className="hilo-cardwrap">
          <PlayingCard
            key={cur ? game!.cards.length : 'preview'}
            card={cur ?? preview}
            flash={cur ? reveal?.correct : undefined}
          />
          {active && (
            <div className="hilo-multiplier">
              {game!.multiplier.toFixed(2)}×
            </div>
          )}
        </div>

        <Rules points={HILO_RULES} />

        <Fairness
          game={game}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (idle ? 1 : 0)}
          pendingHash={pendingHash}
          editable={idle}
          onClientSeed={setClientSeed}
        />

        {game && game.status === 'cashed' && (
          <WinPopup key={game.wager.id} multiplier={game.multiplier} stake={game.wager.stake} delayMs={POPUP_DELAY_MS} />
        )}
      </section>
    </div>
  )
}

// Ace-high, like Stake: the lowest rank (1) is a 2 and the highest (13) is an Ace,
// so "higher/lower" and their multipliers line up with how players read the cards.
const RANK_LABELS = ['', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

function PlayingCard({ card, flash }: { card: Card | null; flash?: boolean }) {
  if (!card) {
    return (
      <div className="playing-card is-empty">
        <span className="card-back">?</span>
      </div>
    )
  }
  const red = card.suit === 1 || card.suit === 2
  return (
    <div className={`playing-card ${red ? 'is-red' : ''} ${flash ? 'is-flash' : ''}`}>
      <span className="card-rank">{RANK_LABELS[card.rank]}</span>
      <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}

function Fairness({
  game,
  clientSeed,
  nextNonce,
  pendingHash,
  editable,
  onClientSeed,
}: {
  game: HiloGameState | null
  clientSeed: string
  nextNonce: number
  /** Hash of the seed already committed for the next round (shown pre-bet). */
  pendingHash: string
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const ended = game != null && game.status !== 'active'
  const verified = useMemo(
    () => (ended && game ? verifyHilo(game.serverSeed, game.clientSeed, game.nonce, game.cards) : null),
    [ended, game],
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
          <code className="seed">{game ? game.serverSeedHash : pendingHash}</code>
        </Row>
        {ended && game && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{game.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ cards match the committed seed' : '✗ mismatch'}
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
