import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager, maxBet } from '../../../core/index.js'
import {
  canDouble,
  canSplit,
  createBlackjackGame,
  declineInsurance,
  double,
  handValue,
  hit,
  insuranceBet,
  isBust,
  randomServerSeed,
  split,
  stand,
  takeInsurance,
  totalReturned,
  totalWagered,
  verifyShoe,
  type BlackjackGame as BJGame,
  type BlackjackResult,
  type Card,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { play } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import './blackjack.css'

interface BlackjackGameProps {
  account: Account
  onBalanceChange: () => void
}

/** Card-deal timing (ms). Slowed down so each card clearly lands one at a time. */
const DEAL_FIRST_MS = 210 // the very first card of the opening deal
const DEAL_STEP_MS = 340 // each subsequent opening-deal card
const DEALER_REVEAL_MS = 380 // each card the dealer draws on its turn
const DEALER_SETTLE_MS = 440 // a beat after the dealer's LAST card before the result
const SPLIT_APART_MS = 470 // the pair separates into two hands before either is dealt to
const SPLIT_STEP_MS = 340 // each split hand's fresh card, dealt one then the other
const SPLIT_SETTLE_MS = 300 // a beat after both are dealt before the round continues
const REVEAL_HOLD_MS = 700 // after the player's last card (a bust or a double) lands, hold a beat before the dealer turns over
/** A short extra beat before the win card pops over the settled hand. */
const POPUP_DELAY_MS = 200

/** Seat labels, left → right (ids 0, 1, 2). */
const SEAT_NAME = ['Left', 'Centre', 'Right'] as const

const BLACKJACK_RULES: ReactNode[] = [
  'Set your bet and hit Deal. You and the dealer each get two cards; one of the dealer’s stays face down.',
  'Get closer to 21 than the dealer without going over. Number cards count their face value, face cards 10, and an ace is 1 or 11 — whichever helps.',
  'Hit to take another card, Stand to hold. Go over 21 and you bust instantly. Double Down doubles your bet for exactly one more card.',
  'When you stand, the dealer reveals and draws to 17 (standing on all 17s). Closest to 21 wins; an equal total is a push (bet back).',
  'If the dealer’s up card is an Ace, you’re offered insurance — a side bet of half your stake that pays 2:1 if the dealer has blackjack.',
  <>
    <strong>
      Blackjack (an ace + a ten on your first two cards) pays 3:2; a regular win pays even money.
    </strong>{' '}
    The deck is provably-fair — shuffled from a seed committed before the deal.
  </>,
]

export function BlackjackGame({ account, onBalanceChange }: BlackjackGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00) — per seat
  const [seats, setSeats] = useState<number[]>([1]) // occupied seat ids; centre by default
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [game, setGame] = useState<BJGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  // If the player leaves with a hand in play, stand every remaining (incl. split)
  // hand so the round settles against the dealer and no stake strands in pending.
  // Standing is the no-action default — leaving can't dodge a bad hand. Background.
  useSettleOnExit(() => {
    let guard = 0
    while (game?.status === 'player' && guard++ < 12) stand(account, game)
  })

  // The opening deal plays out one card at a time: the player's two cards first,
  // then the dealer's. `dealtCount` is how many of those four have landed so far;
  // `dealing` gates actions + the result until the stagger finishes.
  const [dealing, setDealing] = useState(false)
  const [dealtCount, setDealtCount] = useState(4)

  // When the player stands, the dealer reveals the hole then draws its cards one
  // at a time — a bit quicker than the opening deal. `standing` gates the result
  // until that reveal finishes; `dealerStep` is how many dealer cards show.
  const [standing, setStanding] = useState(false)
  const [dealerStep, setDealerStep] = useState(0)

  // A split plays out too: the pair separates into two hands, then each is dealt a
  // fresh card one at a time. `splitting` gates actions until it finishes; `splitStep`
  // runs 0 (just separated) → 1 (first hand dealt) → 2 (both dealt).
  const [splitting, setSplitting] = useState(false)
  const [splitStep, setSplitStep] = useState(0)

  // When the player's last card ends the round — busting on a hit, or doubling —
  // hold a beat on that card before the dealer turns over. `revealHold` keeps the
  // dealer's hole down and the outcome hidden during that pause.
  const [revealHold, setRevealHold] = useState(false)

  const playing = game?.status === 'player'
  const settled = game?.status === 'settled'
  const insurancePhase = game?.status === 'insurance'
  const revealing = dealing || standing || splitting || revealHold
  const idle = (game == null || settled) && !revealing
  const available = availableToWager(account)
  const maxStake = maxBet(account)
  const insBet = game ? insuranceBet(game) : 0
  const insuranceAffordable = available >= insBet

  // The opening deal runs RIGHT→LEFT across the seats, then the dealer, twice. With
  // N seats: hand i's first card lands at step i+1, its second at step N+2+i; the
  // dealer's up card at step N+1, the hole at the very end (2N+2). `handDealShown`
  // is how many of hand i's cards have landed so far (used to stagger them in).
  const seatN = game ? game.hands.length : 0
  const dealEnd = 2 * seatN + 2
  const handDealShown = (i: number) =>
    (dealtCount >= i + 1 ? 1 : 0) + (dealtCount >= seatN + 2 + i ? 1 : 0)
  // How many dealer cards to show: the opening stagger, then the stand reveal.
  // During the bust/double HOLD the dealer must still show only its first two (hole
  // down). The reveal animation (standing) draws the rest: flip the hole, then hit.
  const dealerShown = dealing
    ? (dealtCount >= seatN + 1 ? 1 : 0) + (dealtCount >= dealEnd ? 1 : 0)
    : standing
      ? dealerStep
      : revealHold
        ? 2
        : undefined

  // Drive the opening stagger: one card (with a pitch sound) every ~250ms until
  // all four are out, then unlock the round and announce any instant result.
  useEffect(() => {
    if (!dealing) return
    if (dealtCount >= dealEnd) {
      setDealing(false)
      if (game && game.status === 'settled') announce(game)
      return
    }
    const id = window.setTimeout(
      () => {
        play('deal')
        setDealtCount((c) => c + 1)
      },
      dealtCount === 0 ? DEAL_FIRST_MS : DEAL_STEP_MS,
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealing, dealtCount, dealEnd])

  // Drive the dealer's reveal after a stand (or a player 21/bust that ends the
  // round): flip the hole, then pitch out each draw one at a time. Only once the
  // dealer's LAST card has landed — plus a short beat — do we settle and announce
  // the payout, so the result never appears before the dealer finishes drawing.
  useEffect(() => {
    if (!standing) return
    const total = game?.dealer.length ?? 0
    if (dealerStep >= total) {
      const id = window.setTimeout(() => {
        setStanding(false)
        if (game) announce(game)
      }, DEALER_SETTLE_MS)
      return () => clearTimeout(id)
    }
    const id = window.setTimeout(() => {
      play('deal')
      setDealerStep((c) => c + 1)
    }, DEALER_REVEAL_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standing, dealerStep])

  // Drive the split animation: the pair separates (step 0), then each hand is dealt
  // its own fresh card one at a time (steps 1, 2). Only once both have landed does
  // the round continue — a non-ace split hands the turn to the first hand; split
  // aces go straight to the dealer. (The cards are already in `game` from split();
  // the per-hand `max` just reveals them on this cadence.)
  useEffect(() => {
    if (!splitting) return
    if (splitStep >= 2) {
      const id = window.setTimeout(() => {
        setSplitting(false)
        settleOrContinue()
      }, SPLIT_SETTLE_MS)
      return () => clearTimeout(id)
    }
    const id = window.setTimeout(
      () => {
        play('deal')
        setSplitStep((s) => s + 1)
      },
      splitStep === 0 ? SPLIT_APART_MS : SPLIT_STEP_MS,
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitting, splitStep])

  // After the player's last card lands (a bust, or a double), hold a short beat so
  // it registers on its own, THEN turn the dealer over / settle.
  useEffect(() => {
    if (!revealHold) return
    const id = window.setTimeout(() => {
      setRevealHold(false)
      settleOrContinue()
    }, REVEAL_HOLD_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealHold])

  function toggleSeat(id: number) {
    setSeats((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((s) => s !== id)
          : prev // keep at least one seat
        : [...prev, id].sort((a, b) => a - b),
    )
  }

  // The shoe's server seed now comes from the platform fairness AUTHORITY (commit hash
  // before play → reveal after), not a browser randomServerSeed(). The shuffle is unchanged.
  async function deal() {
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const g = createBlackjackGame(account, {
        stake: bet,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
        seats,
      })
      setGame(g)
      onBalanceChange()
      play('bet')
      setDealtCount(0) // start the cards-out animation; result waits for it to finish
      setDealing(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  /** Sound + balance ping when a round's reveal finishes. Also tells the ledger
   *  the result is now on screen (after the deal/dealer stagger or an instant
   *  bust/blackjack), so this bet's entry releases right then. */
  function announce(g: BJGame) {
    onBalanceChange()
    // Release one ledger entry per wager that resolved this round (a split, a double,
    // or an insurance side bet adds more), so every entry clears — and the lock with it.
    const wagerCount = g.hands.reduce((n, h) => n + h.wagers.length, 0) + (g.insuranceWager ? 1 : 0)
    for (let i = 0; i < wagerCount; i++) signalReveal(account.id)
    const net = totalReturned(g) - totalWagered(g)
    play(net > 0 ? 'win' : net < 0 ? 'boom' : 'lose')
  }

  function onHit() {
    if (!game || game.status !== 'player' || revealing) return
    hit(account, game)
    play('deal') // the card pitched out
    afterCard()
  }

  /** After the player takes a card (hit/double): if it ended the round — a bust, or
   *  a double on the last hand — let that card land and hold a beat before the dealer
   *  turns over. Otherwise the turn just carries on (still playing / next split hand). */
  function afterCard() {
    if (game && game.status === 'settled') {
      redraw() // show the card that just landed (the bust, or the doubled hand)
      setRevealHold(true) // the hold effect reveals the dealer after the beat
    } else {
      settleOrContinue()
    }
  }

  /** After a player action: if the whole round is over, reveal the dealer (or, if
   *  every hand busted, just announce — the dealer never draws). Otherwise the turn
   *  has only moved on (e.g. to the next split hand), so just redraw. */
  function settleOrContinue() {
    if (!game) return
    if (game.status !== 'settled') {
      redraw()
      return
    }
    const showdown = game.hands.some((h) => !isBust(h.cards))
    if (showdown)
      revealDealer() // flip the hole + draw, then announce
    else {
      announce(game) // everyone busted — no dealer reveal
      redraw()
    }
  }

  /** Reveal the dealer's hand: flip the hole, then deal its draws one at a time
   *  (the standing effect drives it), then settle. */
  function revealDealer() {
    setDealerStep(2) // show the two dealt cards (the hole flips in now)
    setStanding(true)
    play('deal') // the hole turning over
    redraw()
  }

  function onStand() {
    if (!game || game.status !== 'player' || revealing) return
    stand(account, game) // finish this hand; the round may end (dealer plays)
    settleOrContinue()
  }

  function onDouble() {
    if (!game || revealing || !canDouble(game)) return
    try {
      double(account, game) // this hand's one card, then the turn moves on
      play('chipclack') // the second wager's chips clacked down
      play('deal') // the single double-down card
      afterCard() // let the double card land, then hold before the dealer reveals
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onSplit() {
    if (!game || revealing || !canSplit(game)) return
    try {
      split(account, game) // a second equal wager; each card starts its own hand + draws one
      onBalanceChange() // the split wager is now held
      setSplitStep(0)
      setSplitting(true) // play the separate→deal animation; the round continues when it ends
      play('chips') // the split wager's chips stacked down
      play('deal') // the pair separating
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onInsure() {
    if (!game || game.status !== 'insurance' || revealing) return
    try {
      takeInsurance(account, game) // half-stake side bet; resolves at once, then peeks
      play('chips') // insurance chips down
      afterInsurance()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onDeclineInsurance() {
    if (!game || game.status !== 'insurance' || revealing) return
    declineInsurance(account, game)
    afterInsurance()
  }

  /** After the insurance decision: the round has either ended on a dealer/player
   *  natural (reveal the dealer + announce) or moved to the player's turn. */
  function afterInsurance() {
    onBalanceChange()
    settleOrContinue()
  }

  const totalStake = bet * seats.length // one bet per occupied seat
  const stakeTooHigh = bet > maxStake || totalStake > available
  const betInvalid = !Number.isInteger(bet) || bet < 1 || stakeTooHigh
  const resolving = useResolving(account.id)
  const doubleAffordable = game != null && bet <= available // room for the second wager
  const splitAffordable = game != null && bet <= available // room for the split's wager
  // What's actually on the felt: the live wager(s) once dealt, otherwise the total
  // bet being set across the chosen seats. Rendered as a real stack of chips.
  const wagered = game ? totalWagered(game) : totalStake

  return (
    <div className="bj">
      <section className="bj-panel">
        <BetField value={bet} disabled={!idle} max={maxStake} onChange={setBet} />

        <div className="field">
          <span className="field-label">Seats</span>
          <div className="bj-seat-chips">
            {[0, 1, 2].map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${seats.includes(id) ? 'is-on' : ''}`}
                disabled={!idle}
                aria-pressed={seats.includes(id)}
                onClick={() => toggleSeat(id)}
              >
                {SEAT_NAME[id]}
              </button>
            ))}
          </div>
          {seats.length > 1 && (
            <span className="bj-seat-total">
              {seats.length} seats · {formatMoney(totalStake)} total
            </span>
          )}
        </div>

        {/* one fixed-height slot so the HUD never jumps when Deal (one button)
            swaps to the Hit/Stand/Double/Split grid (two rows) */}
        <div className="bj-action-slot">
          {idle ? (
            <button className="action action-bet" onClick={deal} disabled={betInvalid || resolving}>
              Deal
            </button>
          ) : insurancePhase ? (
            <div className="bj-await-insurance">Dealer shows an Ace — insurance?</div>
          ) : (
            <div className="bj-actions">
              <button className="action bj-act" onClick={onHit} disabled={revealing}>
                <HitIcon />
                Hit
              </button>
              <button className="action bj-act" onClick={onStand} disabled={revealing}>
                <StandIcon />
                Stand
              </button>
              <button
                className="action bj-act"
                onClick={onDouble}
                disabled={revealing || !canDouble(game!) || !doubleAffordable}
              >
                <DoubleIcon />
                Double
              </button>
              <button
                className="action bj-act"
                onClick={onSplit}
                disabled={revealing || !game || !canSplit(game) || !splitAffordable}
              >
                <SplitIcon />
                Split
              </button>
            </div>
          )}
        </div>

        {error && <p className="bj-error">{error}</p>}
        {stakeTooHigh && idle && !error && (
          <p className="bj-error">
            {bet > maxStake
              ? `Max bet per seat is ${formatMoney(maxStake)}.`
              : `Total stake exceeds what you can wager (${formatMoney(available)}).`}
          </p>
        )}

        <Readout game={game} bet={bet} revealing={revealing} />

        {game?.insuranceResult && (
          <p className={`bj-insurance-result is-${game.insuranceResult}`}>
            {game.insuranceResult === 'won'
              ? `Insurance won +${formatMoney(game.insuranceWager!.stake * 2)}`
              : `Insurance lost −${formatMoney(game.insuranceWager!.stake)}`}
          </p>
        )}
      </section>

      <section className="bj-table">
        <Side
          cards={game?.dealer ?? []}
          hideHole={playing || revealHold || insurancePhase}
          max={dealerShown}
        />

        <div className="bj-divider">
          {settled && !revealing && game!.hands.length === 1 ? (
            <span className={`bj-outcome is-${outcomeTone(game!)}`}>{outcomeText(game!)}</span>
          ) : insurancePhase ? (
            <span className="bj-felt-legend is-insurance">Insurance pays 2 : 1</span>
          ) : (
            <span className="bj-felt-legend" aria-hidden="true">
              Blackjack pays 3 : 2 · Dealer hits on 16, stands on 17
            </span>
          )}
        </div>

        <PlayerArea
          game={game}
          seats={seats}
          bet={bet}
          dealing={dealing}
          handDealShown={handDealShown}
          splitting={splitting}
          splitStep={splitStep}
          showResults={settled && !revealing}
        />

        <ChipStack cents={wagered} />

        {settled && !revealing && totalReturned(game!) > totalWagered(game!) && (
          <WinPopup
            key={game!.nonce}
            multiplier={totalReturned(game!) / totalWagered(game!)}
            stake={totalWagered(game!)}
            delayMs={POPUP_DELAY_MS}
          />
        )}

        {/* insurance offer — a simple Yes/No that pops up when the dealer shows an Ace */}
        {insurancePhase && !revealing && (
          <div className="bj-insurance-pop">
            <div className="bj-insurance-card">
              <span className="bj-insurance-title">Insurance?</span>
              <div className="bj-insurance-buttons">
                <button
                  className="action bj-insure-yes"
                  onClick={onInsure}
                  disabled={!insuranceAffordable}
                >
                  Yes
                </button>
                <button className="action bj-insure-no" onClick={onDeclineInsurance}>
                  No
                </button>
              </div>
              {!insuranceAffordable && (
                <span className="bj-insurance-warn">Not enough to insure.</span>
              )}
            </div>
          </div>
        )}
      </section>

      <Rules points={BLACKJACK_RULES} />

      <Fairness
        game={settled ? game : null}
        clientSeed={clientSeed}
        nextNonce={nonceRef.current + (idle ? 1 : 0)}
        editable={idle}
        onClientSeed={setClientSeed}
      />
    </div>
  )
}

/* --------------------------------- table -------------------------------- */

/** A hand's total for display. A SOFT hand (an ace that can count as 11 without
 *  busting) shows BOTH values it can play as — e.g. an ace + a five reads
 *  "6/16". A hard hand shows the single total. */
function formatTotal(cards: Card[]): string {
  const { total, soft } = handValue(cards)
  return soft ? `${total - 10}/${total}` : String(total)
}

function Side({
  cards,
  hideHole = false,
  max,
  player = false,
}: {
  cards: Card[]
  hideHole?: boolean
  /** During the opening deal, only the first `max` cards have landed. */
  max?: number
  /** The player's side — its cards/total wear the red accent (Stake-style). */
  player?: boolean
}) {
  const shown = max == null ? cards : cards.slice(0, max)
  // The total reflects only what's face-up: skip the hole card, and during the
  // deal only count cards that have actually landed.
  const faceUp = hideHole ? shown.filter((_, i) => i !== 1) : shown
  const shownTotal = faceUp.length ? formatTotal(faceUp) : null
  return (
    <div className={`bj-side ${player ? 'is-player' : ''}`}>
      {/* head slot is ALWAYS rendered (reserved height) so the felt doesn't shift
          up/down when the total pill appears as cards land */}
      <div className="bj-side-head">
        {shownTotal != null && <span className="bj-total">{shownTotal}</span>}
      </div>
      {/* Empty until Deal: cards only appear as they're dealt — no placeholder. */}
      <div className="bj-hand">
        {shown.map((c, i) =>
          hideHole && i === 1 ? <CardBack key={i} /> : <PlayingCard key={i} card={c} />,
        )}
      </div>
    </div>
  )
}

const SUIT_GLYPH: Record<Card['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
}

function PlayingCard({ card }: { card: Card }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <div className={`card ${red ? 'card-red' : 'card-black'}`}>
      {/* top-left index — the part that peeks out when cards overlap */}
      <span className="card-corner card-corner-tl">
        <b>{card.rank}</b>
        <i>{SUIT_GLYPH[card.suit]}</i>
      </span>
      {/* a big centre suit (Stake-style), only fully seen on the top card */}
      <span className="card-pip">{SUIT_GLYPH[card.suit]}</span>
    </div>
  )
}

function CardBack() {
  return <div className="card card-back" aria-hidden="true" />
}

/* The four moves share one neutral button; a coloured icon tells them apart:
   Hit = green plus (take a card), Stand = red stop-hand (hold), Split = blue cards
   diverging (two hands), Double = gold chips stacking (a second bet). */
function HitIcon() {
  return (
    <svg className="bj-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M12 4.5v15M4.5 12h15" stroke="#2fd472" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function StandIcon() {
  // a raised open palm — the universal "stop"
  return (
    <svg
      className="bj-ico"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="#ff5b6e"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}

function SplitIcon() {
  // two cards leaning apart — the hand splitting in two
  return (
    <svg
      className="bj-ico"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="#4ea6ff"
      strokeWidth="1.7"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="6.5" width="8" height="11.5" rx="1.4" transform="rotate(-14 6.5 12.25)" />
      <rect x="13.5" y="6.5" width="8" height="11.5" rx="1.4" transform="rotate(14 17.5 12.25)" />
    </svg>
  )
}

function DoubleIcon() {
  // two overlapping chips — a second bet stacked alongside the first
  return (
    <svg
      className="bj-ico"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="#f5c43a"
      strokeWidth="1.8"
    >
      <circle cx="8.5" cy="12" r="5.5" />
      <circle cx="15.5" cy="12" r="5.5" />
    </svg>
  )
}

const RESULT_TONE: Record<BlackjackResult, string> = {
  blackjack: 'win',
  win: 'win',
  push: 'push',
  loss: 'loss',
}
const RESULT_LABEL: Record<BlackjackResult, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  push: 'Push',
  loss: 'Lost',
}

/** The seats. Before a round it shows the three seat positions and which the player
 *  is sitting in. During a round it renders every occupied seat's hand(s) left→right
 *  (a seat's split hands stay together), the active one highlighted, each showing its
 *  own total and (once settled) its own result. During the opening deal the cards
 *  stagger in right→left via `handDealShown`. */
function PlayerArea({
  game,
  seats,
  bet,
  dealing,
  handDealShown,
  splitting,
  splitStep,
  showResults,
}: {
  game: BJGame | null
  seats: number[]
  bet: number
  dealing: boolean
  handDealShown: (engineIndex: number) => number
  splitting: boolean
  splitStep: number
  showResults: boolean
}) {
  // before a round: show the three seats so the player can see their selection
  if (!game) {
    return (
      <div className="bj-seatpick">
        {[0, 1, 2].map((id) => {
          const on = seats.includes(id)
          return (
            <div key={id} className={`bj-seatpick-slot ${on ? 'is-on' : ''}`}>
              <span className="bj-seatpick-name">{SEAT_NAME[id]}</span>
              <span className="bj-seatpick-state">
                {on ? `You · ${formatMoney(bet)}` : 'Empty'}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  // a round is on: every occupied seat's hand(s), left→right. Array.sort is stable,
  // so a seat's split hands stay adjacent and in order. Cards shrink as hands grow.
  const ordered = [...game.hands].sort((a, b) => a.seat - b.seat)
  const count = game.hands.length
  const size = count >= 4 ? 'is-many' : count === 3 ? 'is-3' : count === 2 ? 'is-2' : ''
  return (
    <div className={`bj-hands ${size} ${splitting && count === 2 ? 'is-splitting' : ''}`}>
      {ordered.map((hand) => {
        const i = game.hands.indexOf(hand)
        const splitPair = splitting && (i === game.active || i === game.active + 1)
        const max = dealing
          ? handDealShown(i)
          : splitPair
            ? 1 + (splitStep > i - game.active ? 1 : 0)
            : undefined
        return (
          <PlayerHand
            key={i}
            cards={hand.cards}
            max={max}
            active={game.status === 'player' && count > 1 && i === game.active}
            result={showResults ? hand.result : undefined}
          />
        )
      })}
    </div>
  )
}

function PlayerHand({
  cards,
  max,
  active,
  result,
}: {
  cards: Card[]
  max?: number
  active?: boolean
  result?: BlackjackResult
}) {
  const shown = max == null ? cards : cards.slice(0, max)
  const total = shown.length ? formatTotal(shown) : null
  const tone = result ? RESULT_TONE[result] : null
  const label = result ? (result === 'loss' && isBust(cards) ? 'Bust' : RESULT_LABEL[result]) : null
  return (
    <div className={`bj-side is-player ${active ? 'is-active' : ''} ${tone ? `is-${tone}` : ''}`}>
      {/* head + result slots are ALWAYS rendered (reserved height) so the hand's
          box height never changes — no felt shift on hit/stand/settle */}
      <div className="bj-side-head">
        {total != null && <span className="bj-total">{total}</span>}
      </div>
      <div className="bj-hand">
        {shown.map((c, i) => (
          <PlayingCard key={i} card={c} />
        ))}
      </div>
      <span className={`bj-hand-result ${tone ? `is-${tone}` : ''}`}>{label}</span>
    </div>
  )
}

/* --------------------------------- chips -------------------------------- */

/** Standard casino denominations (in cents) with their classic chip colours,
 *  high → low. A greedy break-down turns any bet into real stacks of these. */
const CHIP_DENOMS = [
  { v: 100000, label: '1K', body: '#f4c430', edge: '#fff4cc', face: '#3a2f05' }, // gold
  { v: 50000, label: '500', body: '#7b4fb5', edge: '#d9c7f0', face: '#ffffff' }, // purple
  { v: 10000, label: '100', body: '#23272e', edge: '#7b828b', face: '#ffffff' }, // black
  { v: 2500, label: '25', body: '#1f9d57', edge: '#bdeccf', face: '#ffffff' }, // green
  { v: 500, label: '5', body: '#d23b3b', edge: '#f4c3c3', face: '#ffffff' }, // red
  { v: 100, label: '1', body: '#eef2f6', edge: '#aeb8c2', face: '#1a1d22' }, // white
  { v: 25, label: '25¢', body: '#3f7cc0', edge: '#c3d8ef', face: '#ffffff' }, // blue
  { v: 5, label: '5¢', body: '#e89b3c', edge: '#f6dcb8', face: '#3a2705' }, // orange
  { v: 1, label: '1¢', body: '#b7bec6', edge: '#e3e8ec', face: '#1a1d22' }, // grey
] as const

/** Break a cent amount into stacks of chips, largest denomination first. */
function breakIntoChips(cents: number) {
  const stacks: { denom: (typeof CHIP_DENOMS)[number]; count: number }[] = []
  let rem = Math.max(0, Math.floor(cents))
  for (const denom of CHIP_DENOMS) {
    const count = Math.floor(rem / denom.v)
    if (count > 0) {
      stacks.push({ denom, count })
      rem -= count * denom.v
    }
  }
  return stacks
}

/** The bet drawn as real chips: one stack per denomination, the chips physically
 *  piled on their own colour. The value still reads on the top chip's face. */
function ChipStack({ cents }: { cents: number }) {
  const stacks = breakIntoChips(cents)
  const empty = stacks.length === 0
  return (
    <div className="bj-betspot">
      {/* the felt betting circle — marks where chips are placed; the chips stack
          inside it, or it shows a "Bet" hint when nothing's down yet */}
      <div className={`bj-betcircle ${empty ? 'is-empty' : ''}`}>
        {empty ? (
          <span className="bj-betcircle-hint">Bet</span>
        ) : (
          <div className="bj-chips">
            {stacks.map(({ denom, count }) => {
              const shown = Math.min(count, 8) // tall stacks read fine capped at 8
              return (
                <div className="chip-stack" key={denom.v}>
                  <div className="chip-pile" style={{ height: `${46 + (shown - 1) * 7}px` }}>
                    {Array.from({ length: shown }, (_, i) => (
                      <span
                        key={i}
                        className="bj-chip"
                        style={{
                          ['--body' as string]: denom.body,
                          ['--edge' as string]: denom.edge,
                          ['--face' as string]: denom.face,
                          bottom: `${i * 7}px`,
                          zIndex: i,
                        }}
                      >
                        {i === shown - 1 && <span className="bj-chip-label">{denom.label}</span>}
                      </span>
                    ))}
                  </div>
                  <span className="chip-count">×{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <span className="bj-betspot-total">{formatMoney(cents)}</span>
    </div>
  )
}

function Readout({
  game,
  bet,
  revealing,
}: {
  game: BJGame | null
  bet: number
  revealing: boolean
}) {
  if (!game) {
    return (
      <dl className="readout">
        <Stat label="Blackjack pays" value="3 : 2" />
        <Stat label="Bet" value={formatMoney(bet)} />
      </dl>
    )
  }
  // Hold the in-progress readout while the dealer is still revealing, so the
  // result isn't spoiled before the cards finish landing.
  if (game.status === 'settled' && !revealing) {
    const net = totalReturned(game) - totalWagered(game)
    return (
      <p className={`readout-result ${net > 0 ? 'is-win' : net < 0 ? 'is-loss' : ''}`}>
        {net > 0
          ? `Won ${formatMoney(net)}`
          : net < 0
            ? `Lost ${formatMoney(-net)}`
            : 'Push — bet returned'}
      </p>
    )
  }
  const split = game.hands.length > 1
  const activeTotal = formatTotal(game.hands[game.active].cards)
  return (
    <dl className="readout">
      <Stat
        label={split ? `Hand ${game.active + 1} of ${game.hands.length}` : 'Your total'}
        value={activeTotal}
        highlight
      />
      <Stat label="At risk" value={formatMoney(totalWagered(game))} />
    </dl>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="stat">
      <dt className="stat-label">{label}</dt>
      <dd className={`stat-value ${highlight ? 'is-hot' : ''}`}>{value}</dd>
    </div>
  )
}

function outcomeText(g: BJGame): string {
  const h = g.hands[0]
  switch (h.result) {
    case 'blackjack':
      return 'Blackjack!'
    case 'win':
      return 'You win'
    case 'push':
      return 'Push'
    default:
      return handValue(h.cards).total > 21 ? 'Bust' : 'Dealer wins'
  }
}

function outcomeTone(g: BJGame): string {
  const r = g.hands[0].result
  if (r === 'blackjack' || r === 'win') return 'win'
  if (r === 'push') return 'push'
  return 'loss'
}

/* -------------------------------- controls ------------------------------ */

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
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(n)))
  return (
    <label className="field">
      <span className="field-label">Bet amount</span>
      <div className="field-bet">
        <span className="field-prefix">$</span>
        <NumberInput
          className="field-input"
          value={value / 100}
          min={0.01}
          disabled={disabled}
          onCommit={(d) => onChange(toCents(d ?? 0))}
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

function Fairness({
  game,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  game: BJGame | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () => (game ? verifyShoe(game.serverSeed, game.clientSeed, game.nonce, game.shoe) : null),
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
