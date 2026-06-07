import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  createVideoPoker,
  dealtDeck,
  draw,
  PAYTABLE_ROWS,
  randomServerSeed,
  verifyDeck,
  type Card,
  type HandRank,
  type VideoPokerGame as VideoPokerState,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './videopoker.css'

const VIDEOPOKER_RULES: ReactNode[] = [
  'Set your bet and press Deal for five cards. Click any card (or its Hold button) to keep it.',
  'Press Draw to replace the cards you didn’t hold. The final five-card hand is scored on the Jacks or Better paytable.',
  'You only win at a pair of Jacks or better — a pair of Tens or lower pays nothing.',
  <>
    <strong>Payout = bet × the paytable multiplier</strong> for your hand (a non-paying hand loses
    the bet). This is the standard 9/6 schedule, and it’s a skill game — your holds decide your
    payout. The whole deck is provably fair.
  </>,
]

interface VideoPokerGameProps {
  account: Account
  onBalanceChange: () => void
}

// A brief beat so the final hand registers on the table before the popup overlays it.
const POPUP_DELAY_MS = 200

// Stable empty set so the winners memo has a constant fallback reference.
const NO_WINNERS: ReadonlySet<number> = new Set<number>()

// Slot-reel roll-in timing — must mirror videopoker.css (.videopoker-card animation
// duration and the per-slot animation-delay stagger). Used to hold the win/lose sound
// until the cards have actually landed, so the outcome isn't audible before it's visible.
const CARD_DELAYS_MS = [0, 70, 140, 210, 280]
const CARD_ROLL_MS = 360

// How long until the last replaced card has finished rolling in. Only the cards the
// player didn't hold animate, so the wait depends on which slots were redrawn.
function rollInRevealMs(holds: boolean[]): number {
  const delays = holds.map((held, i) => (held ? -1 : CARD_DELAYS_MS[i])).filter((d) => d >= 0)
  return (delays.length ? Math.max(...delays) : 0) + CARD_ROLL_MS
}

// Which of the five final cards actually make the winning hand, so the UI can light
// them up and the player sees HOW they won. Straights/flushes/full house use all
// five; the made-set hands use just their matching cards. Ace counts high (14),
// mirroring the evaluator in payouts.ts.
function winningIndices(cards: Card[], rank: HandRank): Set<number> {
  if (
    rank === 'royal-flush' ||
    rank === 'straight-flush' ||
    rank === 'flush' ||
    rank === 'straight' ||
    rank === 'full-house'
  ) {
    return new Set([0, 1, 2, 3, 4])
  }
  const high = cards.map((c) => (c.rank === 1 ? 14 : c.rank))
  const counts = new Map<number, number>()
  for (const r of high) counts.set(r, (counts.get(r) ?? 0) + 1)
  const pick = (pred: (rank: number) => boolean) =>
    new Set(cards.map((_, i) => i).filter((i) => pred(high[i])))
  switch (rank) {
    case 'four-of-a-kind':
      return pick((r) => counts.get(r) === 4)
    case 'three-of-a-kind':
      return pick((r) => counts.get(r) === 3)
    case 'two-pair':
      return pick((r) => counts.get(r) === 2)
    case 'jacks-or-better':
      return pick((r) => counts.get(r) === 2 && r >= 11) // J/Q/K/A (ace = 14)
    default:
      return new Set()
  }
}

export function VideoPokerGame({ account, onBalanceChange }: VideoPokerGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<VideoPokerState | null>(null)
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false])
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  // Per-card "generation": bumping a slot re-keys it, which remounts the card and
  // replays the slot-reel roll-in for just that slot. Deal bumps all five; Draw
  // bumps only the slots you didn't hold, so held cards stay put while the
  // replaced ones roll in.
  const [cardGen, setCardGen] = useState<number[]>([0, 0, 0, 0, 0])
  // true once the draw's outcome is on screen (the cards have landed). Gates the
  // winning-card highlight so it lights up WITH the result, not during the roll-in.
  const [resultShown, setResultShown] = useState(false)

  const dealt = game?.status === 'dealt'
  const done = game?.status === 'done'
  const idle = game == null || done
  const available = maxBet(account)
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > available
  const resolving = useResolving(account.id)

  // If the player leaves with a hand dealt but not drawn, settle the dealt hand as
  // it stands (hold all, draw none) so the stake never strands in pending. It's the
  // no-action default — leaving can't dodge a bad deal. Settles in the background.
  useSettleOnExit(() => {
    if (game?.status === 'dealt') draw(account, game, [true, true, true, true, true])
  })

  // Before a round, show a stable face-up preview hand derived from the client
  // seed — purely decorative; the real deal starts when you press Deal.
  const preview = useMemo(() => dealtDeck(clientSeed, clientSeed, 0).slice(0, 5), [clientSeed])
  const shownHand = game ? game.hand : preview
  const result = done ? game!.result! : null
  // the cards that actually make the winning hand (empty for a non-paying hand)
  const winners = useMemo(
    () => (result && result.multiplier > 1 ? winningIndices(game!.hand, result.rank) : NO_WINNERS),
    [result, game],
  )

  function deal() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createVideoPoker(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
      })
      setGame(g)
      setHolds([false, false, false, false, false])
      setCardGen((gen) => gen.map((n) => n + 1)) // fresh deal: every card rolls in
      setResultShown(false)
      onBalanceChange()
      play('deal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function toggleHold(i: number) {
    if (!dealt) return
    play('select')
    setHolds((h) => h.map((v, k) => (k === i ? !v : v)))
  }

  function doDraw() {
    if (!game || game.status !== 'dealt') return
    const res = draw(account, game, holds)
    play('draw')
    setHistory((h) => [{ multiplier: res.multiplier, won: res.multiplier > 1 }, ...h].slice(0, 16))
    // only the cards you didn't hold roll in on the draw; held cards stay put
    setCardGen((gen) => gen.map((n, i) => (holds[i] ? n : n + 1)))
    redraw()
    onBalanceChange()
    // Gate everything that reveals the outcome until the cards have landed, so
    // nothing spoils it early:
    //  - sound + winning-card highlight fire the moment the cards settle
    //  - the ledger entry (signalReveal) and win popup land a beat later, together
    const reveal = rollInRevealMs(holds)
    const won = res.multiplier > 1
    window.setTimeout(() => {
      play(won ? 'win' : 'lose')
      setResultShown(true)
    }, reveal)
    window.setTimeout(() => signalReveal(account.id), won ? reveal + POPUP_DELAY_MS : reveal)
  }

  return (
    <div className="videopoker">
      <section className="videopoker-panel">
        <label className="field">
          <span className="field-label">Bet amount</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={dealt}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={dealt}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={dealt}
              onClick={() => setBet((b) => Math.min(available, b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        {dealt ? (
          <button className="action action-cashout" onClick={doDraw}>
            Draw
          </button>
        ) : (
          <button className="action action-bet" onClick={deal} disabled={betInvalid || resolving}>
            Deal
          </button>
        )}

        <div className="videopoker-paytable">
          {PAYTABLE_ROWS.map((row) => (
            <div
              key={row.rank}
              className={`videopoker-payrow ${result && result.rank === row.rank ? 'is-hit' : ''}`}
            >
              <span className="videopoker-payname">{row.label}</span>
              <span className="videopoker-paymult">{row.multiplier}×</span>
            </div>
          ))}
        </div>

        {error && <p className="videopoker-error">{error}</p>}
        {bet > available && !error && (
          <p className="videopoker-error">
            Stake exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}
      </section>

      <section className="videopoker-stage">
        <div className="videopoker-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier}×
            </span>
          ))}
        </div>

        <div className="videopoker-hand">
          {shownHand.map((card, i) => (
            <div className="videopoker-slot" key={`${cardGen[i]}-${i}`}>
              <PlayingCard
                card={card}
                held={dealt && holds[i]}
                faceDown={!game}
                win={resultShown && winners.has(i)}
                onClick={() => toggleHold(i)}
              />
              <button
                className={`chip videopoker-holdbtn ${dealt && holds[i] ? 'is-on' : ''}`}
                disabled={!dealt}
                onClick={() => toggleHold(i)}
              >
                {dealt && holds[i] ? 'Held' : 'Hold'}
              </button>
            </div>
          ))}
        </div>

        {result && result.multiplier > 1 && (
          <WinPopup
            key={game!.wager.id}
            multiplier={result.multiplier}
            stake={game!.wager.stake}
            delayMs={rollInRevealMs(holds) + POPUP_DELAY_MS}
          />
        )}
      </section>

      {/* how-to-play + provably-fair sit full-width BELOW the game, above the ledger */}
      <Rules points={VIDEOPOKER_RULES} />

      <Fairness
        game={done ? game : null}
        clientSeed={clientSeed}
        nextNonce={nonceRef.current + (idle ? 1 : 0)}
        editable={idle}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

const RANK_LABELS_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

function PlayingCard({
  card,
  held,
  faceDown,
  win,
  onClick,
}: {
  card: Card
  held: boolean
  faceDown: boolean
  win: boolean
  onClick: () => void
}) {
  const red = card.suit === 1 || card.suit === 2
  if (faceDown) {
    // before the deal: a plain red card back, nothing to read or click
    return <span className="videopoker-card is-back" aria-hidden="true" />
  }
  return (
    <button
      type="button"
      className={`videopoker-card ${red ? 'is-red' : ''} ${held ? 'is-held' : ''} ${win ? 'is-win' : ''}`}
      onClick={onClick}
    >
      <span className="videopoker-card-rank">{RANK_LABELS_SHORT[card.rank]}</span>
      <span className="videopoker-card-suit">{SUIT_SYMBOLS[card.suit]}</span>
      {held && <span className="videopoker-held-tag">HELD</span>}
    </button>
  )
}

function Fairness({
  game,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  game: VideoPokerState | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (game ? verifyDeck(game.serverSeed, game.clientSeed, game.nonce, game.deck) : null),
    [game],
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
        <Row label="Nonce">{game ? game.nonce : nextNonce}</Row>
        <Row label="Server seed (hashed)">
          <code className="seed">{game ? game.serverSeedHash : 'committed when you deal'}</code>
        </Row>
        {game && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{game.serverSeed}</code>
            </Row>
            <Row label="Verification">
              <span className={verified ? 'verify-ok' : 'verify-bad'}>
                {verified ? '✓ deck matches the committed seed' : '✗ mismatch'}
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
