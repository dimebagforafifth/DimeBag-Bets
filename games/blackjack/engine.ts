/**
 * Blackjack engine (CLAUDE.md §7) — a small state machine over a provably-fair
 * shoe, settling every hand through the shared core (§3). Holds no points itself.
 *
 * Rules (regular Vegas, player-friendly): blackjack pays 3:2, dealer stands on
 * all 17s (including soft 17), dealer peeks for blackjack, and the player may
 * Hit, Stand, Double Down (on the first two cards) or Split a matching pair.
 * A Double places a second equal wager and draws exactly one card. A Split turns
 * a pair into two hands, each with its own equal wager, played in turn; the
 * dealer plays once after every hand is finished, then each hand settles on its
 * own against the dealer.
 *
 * Money model: every wager (base, doubles, splits) is a real `core` wager.
 * Settlement resolves each at its hand's return multiplier:
 *   blackjack → 2.5×, win → 2×, push → 1× (returned), loss → 0×.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { availableToWager, placeWager, resolveAtMultiplier } from '../../core/index.js'
import { cardValue, handValue, isBlackjack, isBust, type Card } from './cards.js'
import { hashServerSeed, shuffleDeck } from './fair.js'

export type BlackjackStatus = 'player' | 'insurance' | 'settled'
export type BlackjackResult = 'blackjack' | 'win' | 'push' | 'loss'

/** Return multiplier paid for each result (applied to every wager on the hand). */
const PAYOUT: Record<BlackjackResult, number> = {
  blackjack: 2.5, // 3:2
  win: 2,
  push: 1,
  loss: 0,
}

/** Total hands a round can hold — up to 3 seats, each able to split a couple of times. */
const MAX_HANDS = 6

/** Seats the player can occupy (physical positions, left→right). */
export const SEATS = [0, 1, 2] as const // 0 = left, 1 = centre, 2 = right

/** One player hand. A round has one hand per occupied seat normally, more after a Split. */
export interface Hand {
  cards: Card[]
  /** Core wagers riding this hand: the base, plus the double if taken. */
  wagers: Wager[]
  doubled: boolean
  /** A natural two-card 21 on the original (unsplit) hand — pays 3:2. */
  blackjack: boolean
  /** True once the player has finished acting on this hand (stand/bust/21/double). */
  done: boolean
  /** The physical seat this hand belongs to (0 = left, 1 = centre, 2 = right). A
   *  split keeps the seat, so a seat can show two hands side by side. */
  seat: number
  result?: BlackjackResult
  /** The return multiplier this hand settled at (PAYOUT[result]). */
  payoutMultiplier?: number
}

export interface BlackjackGame {
  status: BlackjackStatus
  /** The full provably-fair deck; cards are dealt from the front via `cursor`. */
  shoe: Card[]
  cursor: number
  /** The player's hand(s) — one normally, more after a Split (left → right). */
  hands: Hand[]
  /** Index of the hand the player is currently acting on. */
  active: number
  dealer: Card[]
  /** Base stake (cents). Every wager (double / split) is this same size. */
  stake: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  /** The insurance side bet, if the player took it when the dealer showed an Ace. */
  insuranceWager?: Wager
  /** How insurance resolved, for display: 'won' = the dealer turned up blackjack. */
  insuranceResult?: 'won' | 'lost'
}

export interface CreateBlackjackOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  /** Physical seat ids to occupy (0=left, 1=centre, 2=right). One hand each, at the
   *  same stake. Defaults to the centre seat. */
  seats?: number[]
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Draw the next card off the shoe, advancing the cursor. */
function draw(game: BlackjackGame): Card {
  return game.shoe[game.cursor++]
}

/** The hand the player is currently acting on. */
function activeHand(game: BlackjackGame): Hand {
  return game.hands[game.active]
}

/** Dealer plays out: hit until 17 or more, standing on all 17s (incl. soft). */
function dealerPlay(game: BlackjackGame): void {
  while (handValue(game.dealer).total < 17) game.dealer.push(draw(game))
}

/** Compare the two final totals (neither side busted) into a result. */
function compare(playerTotal: number, dealerTotal: number): BlackjackResult {
  if (dealerTotal > 21 || playerTotal > dealerTotal) return 'win'
  if (playerTotal < dealerTotal) return 'loss'
  return 'push'
}

/** Resolve one hand at its result's multiplier (every wager on it). */
function settleHand(account: Account, hand: Hand, result: BlackjackResult): void {
  const m = PAYOUT[result]
  for (const w of hand.wagers) resolveAtMultiplier(account, w, m)
  hand.result = result
  hand.payoutMultiplier = m
  hand.done = true
}

/**
 * Move on after a hand finishes: hand the turn to the next unfinished hand, or —
 * if every hand is done — play the dealer out (once) and settle them all.
 */
function advance(account: Account, game: BlackjackGame): void {
  const next = game.hands.findIndex((h) => !h.done)
  if (next !== -1) {
    game.active = next
    return
  }
  // Every hand finished. The dealer only plays if a hand can still win (not all
  // busted), then each hand settles on its own merits.
  const showdown = game.hands.some((h) => !isBust(h.cards))
  if (showdown) dealerPlay(game)
  const dealerTotal = handValue(game.dealer).total
  for (const h of game.hands) {
    if (h.result) continue // a natural already settled at the deal
    const total = handValue(h.cards).total
    settleHand(account, h, total > 21 ? 'loss' : compare(total, dealerTotal))
  }
  game.status = 'settled'
}

/**
 * Start a round: hold the base stake, shuffle, deal two cards each, and handle
 * naturals (dealer peeks). Returns the game in `player` state unless a blackjack
 * ended it immediately.
 */
export function createBlackjackGame(account: Account, opts: CreateBlackjackOptions): BlackjackGame {
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  // One hand per occupied seat. Deal + play run RIGHT→LEFT, so order the hands by
  // seat id DESCENDING (rightmost first); default to the centre seat.
  const seatIds = (opts.seats && opts.seats.length ? [...opts.seats] : [1]).sort((a, b) => b - a)
  if (opts.stake * seatIds.length > availableToWager(account)) {
    throw new Error(
      `total stake ${opts.stake * seatIds.length} exceeds availableToWager ${availableToWager(account)}`,
    )
  }

  const game: BlackjackGame = {
    status: 'player',
    shoe: shuffleDeck(serverSeed, opts.clientSeed, opts.nonce),
    cursor: 0,
    hands: [],
    active: 0,
    dealer: [],
    stake: opts.stake,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }

  // a hand per seat, in right→left order (hands[0] = rightmost = first dealt + played)
  game.hands = seatIds.map((seat) => ({
    cards: [],
    wagers: [placeWager(account, opts.stake)], // total funds already validated above
    doubled: false,
    blackjack: false,
    done: false,
    seat,
  }))

  // Deal two passes — each pass right→left across the seats, then the dealer (its
  // first card face up, its second the hole).
  for (let pass = 0; pass < 2; pass++) {
    for (const h of game.hands) h.cards.push(draw(game))
    game.dealer.push(draw(game))
  }
  for (const h of game.hands) h.blackjack = isBlackjack(h.cards)

  // Dealer showing an Ace → offer insurance BEFORE peeking for blackjack.
  if (game.dealer[0].rank === 'A') {
    game.status = 'insurance'
    return game
  }
  peekAndSettleAll(account, game) // otherwise peek now and settle any naturals
  return game
}

/** Peek the dealer for blackjack and settle naturals across every seat: a dealer
 *  natural loses all (a player natural pushes); otherwise player naturals pay 3:2
 *  now and the remaining seats play on. Leaves the game in 'player' if any seat
 *  still has to act, else 'settled'. */
function peekAndSettleAll(account: Account, game: BlackjackGame): void {
  const dealerBJ = isBlackjack(game.dealer)
  if (dealerBJ) {
    for (const h of game.hands) settleHand(account, h, h.blackjack ? 'push' : 'loss')
    game.status = 'settled'
    return
  }
  for (const h of game.hands) if (h.blackjack) settleHand(account, h, 'blackjack')
  const next = game.hands.findIndex((h) => !h.done)
  if (next === -1) {
    game.status = 'settled' // every seat had a natural — no dealer turn needed
  } else {
    game.active = next
    game.status = 'player'
  }
}

/* -------------------------------- insurance ------------------------------ */

/** Whether insurance is on offer right now — the dealer's up card is an Ace and the
 *  player hasn't yet decided. */
export function offersInsurance(game: BlackjackGame): boolean {
  return game.status === 'insurance'
}

/** The insurance side bet on offer: half the base stake (the standard maximum). */
export function insuranceBet(game: BlackjackGame): number {
  return Math.floor(game.stake / 2)
}

/**
 * Take insurance: a side bet of half the stake that the dealer has blackjack. It
 * pays the canonical 2:1 — and since the dealer's hole is a ten only ~30% of the
 * time on a fair deck, that 2:1 carries the standard ~7.5% house edge by
 * construction (no target tuning, like the Three Card Poker paytables — §4). The
 * bet resolves at once, then the dealer is peeked and the round proceeds.
 */
export function takeInsurance(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'insurance') throw new Error('insurance is not on offer')
  game.insuranceWager = placeWager(account, insuranceBet(game)) // validates funds
  resolveInsuranceAndProceed(account, game)
  return game
}

/** Decline insurance: peek the dealer and proceed with no side bet. */
export function declineInsurance(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'insurance') throw new Error('insurance is not on offer')
  resolveInsuranceAndProceed(account, game)
  return game
}

/** Settle the insurance bet (if any) at 2:1, then peek for dealer blackjack and
 *  either end the round on a natural or hand play to the player. */
function resolveInsuranceAndProceed(account: Account, game: BlackjackGame): void {
  const dealerBJ = isBlackjack(game.dealer)
  if (game.insuranceWager) {
    resolveAtMultiplier(account, game.insuranceWager, dealerBJ ? 3 : 0) // 2:1 → return 3×, else lose
    game.insuranceResult = dealerBJ ? 'won' : 'lost'
  }
  peekAndSettleAll(account, game)
}

/** Hit the active hand. Busting or reaching 21 finishes it (the turn moves on). */
export function hit(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'player') throw new Error('the round is not awaiting the player')
  const hand = activeHand(game)
  hand.cards.push(draw(game))
  if (handValue(hand.cards).total >= 21) {
    hand.done = true
    advance(account, game)
  }
  return game
}

/** Stand on the active hand: finish it and pass the turn on. */
export function stand(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'player') throw new Error('the round is not awaiting the player')
  activeHand(game).done = true
  advance(account, game)
  return game
}

/**
 * Double Down on the active hand: only on its opening two cards. Places a second
 * equal wager (funds validated through core), draws exactly one card, and finishes
 * the hand — the turn then moves on.
 */
export function double(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'player') throw new Error('the round is not awaiting the player')
  const hand = activeHand(game)
  if (hand.cards.length !== 2) throw new Error('can only double on the first two cards')

  hand.wagers.push(placeWager(account, game.stake)) // throws if funds fall short
  hand.doubled = true
  hand.cards.push(draw(game))
  hand.done = true
  advance(account, game)
  return game
}

/**
 * Split the active hand's matching pair into two hands: each keeps one of the
 * pair, gets a fresh card and its own equal wager (funds validated through core).
 * Split aces get one card each and stand (Vegas rule); otherwise both hands play
 * out normally, the first one first.
 */
export function split(account: Account, game: BlackjackGame): BlackjackGame {
  if (game.status !== 'player') throw new Error('the round is not awaiting the player')
  if (game.hands.length >= MAX_HANDS) throw new Error('no more splits available')
  const hand = activeHand(game)
  if (hand.cards.length !== 2 || cardValue(hand.cards[0].rank) !== cardValue(hand.cards[1].rank)) {
    throw new Error('can only split a matching pair')
  }

  const [a, b] = hand.cards
  const splitWager = placeWager(account, game.stake) // validates funds before we deal
  hand.cards = [a, draw(game)]
  const second: Hand = {
    cards: [b, draw(game)],
    wagers: [splitWager],
    doubled: false,
    blackjack: false, // a 21 after a split is a regular 21, not a 3:2 blackjack
    done: false,
    seat: hand.seat, // the split stays at the same seat (shows two hands there)
  }
  game.hands.splice(game.active + 1, 0, second)

  // Split aces: one card each, then both stand (and the round may finish).
  if (a.rank === 'A') {
    hand.done = true
    second.done = true
    advance(account, game)
  }
  return game
}

/** Whether doubling is allowed right now (active hand on its opening two cards). */
export function canDouble(game: BlackjackGame): boolean {
  return game.status === 'player' && activeHand(game)?.cards.length === 2
}

/** Whether the active hand can be split (a matching pair, under the hand cap). */
export function canSplit(game: BlackjackGame): boolean {
  if (game.status !== 'player' || game.hands.length >= MAX_HANDS) return false
  const hand = activeHand(game)
  return (
    hand != null &&
    hand.cards.length === 2 &&
    cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank)
  )
}

/** Total points wagered this round across every hand + the insurance bet (cents). */
export function totalWagered(game: BlackjackGame): number {
  const hands = game.hands.reduce((sum, h) => sum + game.stake * h.wagers.length, 0)
  return hands + (game.insuranceWager?.stake ?? 0)
}

/** Total points returned to the player this round across every hand + insurance
 *  (0 until settled). */
export function totalReturned(game: BlackjackGame): number {
  let total = 0
  for (const h of game.hands) {
    if (h.payoutMultiplier == null) continue
    total += Math.round(game.stake * h.wagers.length * h.payoutMultiplier)
  }
  const ins = game.insuranceWager
  if (ins && ins.payoutMultiplier != null) total += Math.round(ins.stake * ins.payoutMultiplier)
  return total
}
