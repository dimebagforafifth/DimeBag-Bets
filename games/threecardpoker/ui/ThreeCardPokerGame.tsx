import { useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager, maxBet } from '../../../core/index.js'
import {
  ANTE_BONUS_ROWS,
  PAIR_PLUS_ROWS,
  RANK_LABELS,
  createGame,
  deal3,
  fold,
  play,
  randomServerSeed,
  totalProfit,
  totalReturned,
  totalStaked,
  verify,
  type Card,
  type ThreeCardGame as ThreeCardState,
} from '../index.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { play as playSound } from '../../../sound/index.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './threecardpoker.css'

const TCP_RULES: ReactNode[] = [
  'Set your Ante (and an optional Pair Plus side bet), then deal. You and the dealer each get three cards — yours face up, the dealer’s hidden.',
  'Look at your hand, then Play (match your ante) or Fold (forfeit the ante). Three-card ranking: Straight Flush > Three of a Kind > Straight > Flush > Pair > High Card — a straight beats a flush.',
  'The dealer needs Queen-high or better to qualify. If they don’t, your Ante wins 1:1 and the Play bet pushes. If they do, the better hand wins both bets even money; a tie pushes.',
  'The Ante Bonus pays on a Straight (1:1), Three of a Kind (4:1) or Straight Flush (5:1) — regardless of the dealer, when you Play. Pair Plus pays on your three cards alone (Pair 1:1 up to Straight Flush 40:1), win or fold.',
  <>
    <strong>Payouts use the standard Three Card Poker odds</strong> (Ante bonus 1-4-5, Pair Plus
    1-3-6-30-40). The deal is provably
    fair; your Play/Fold choice never changes the cards.
  </>,
]

interface ThreeCardPokerGameProps {
  account: Account
  onBalanceChange: () => void
}

// Deal slide-in stagger between cards, and the dealer flip-reveal duration — both
// mirror threecardpoker.css. The flip IS the reveal, so the result lines / popup /
// win-loss sound all wait FLIP_MS for it to land.
const DEAL_STEP_MS = 70
// The dealer turns his three cards over one at a time, left → right: FLIP_STEP_MS
// between cards, each flip taking FLIP_DUR_MS — quick, but slow enough to read as
// a deliberate reveal. FLIP_DUR_MS must mirror the .threecardpoker-flip transition.
const FLIP_STEP_MS = 200
const FLIP_DUR_MS = 360
const DEALER_CARDS = 3
// When the last card has finished turning — the outcome reveals here.
const REVEAL_DONE_MS = (DEALER_CARDS - 1) * FLIP_STEP_MS + FLIP_DUR_MS
// A short beat after the reveal before the win popup appears.
const POPUP_DELAY_MS = 80

// Chip denominations in the tray (cents), with their classic clay colours.
const TRAY_CHIPS: { cents: number; cls: string }[] = [
  { cents: 100, cls: 'd1' }, // $1 — white
  { cents: 500, cls: 'd5' }, // $5 — red
  { cents: 2500, cls: 'd25' }, // $25 — green
  { cents: 10000, cls: 'd100' }, // $100 — black
  { cents: 50000, cls: 'd500' }, // $500 — purple
]

export function ThreeCardPokerGame({ account, onBalanceChange }: ThreeCardPokerGameProps) {
  const [ante, setAnte] = useState(1000) // cents ($10.00)
  const [pairPlus, setPairPlus] = useState(0)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)

  const [game, setGame] = useState<ThreeCardState | null>(null)
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  // false until the dealer's cards have finished flipping over — gates the result
  // lines, win popup, win/lose sound and history so the flip can't be spoiled.
  const [revealed, setRevealed] = useState(false)
  // how many of the dealer's three cards have been turned over (0..3) — ramps up one
  // at a time on decide so he reveals left → right.
  const [dealerShown, setDealerShown] = useState(0)
  // which betting circle a clicked tray chip lands on (drag-drop overrides this).
  const [activeSpot, setActiveSpot] = useState<'ante' | 'pairplus'>('ante')
  // stack of chips placed this betting session, so Undo can peel them back off.
  const [placements, setPlacements] = useState<{ spot: 'ante' | 'pairplus'; amount: number }[]>([])

  const deciding = game?.status === 'decide'
  const done = game?.status === 'done'
  const idle = game == null || done
  const locked = deciding // bets locked once dealt
  const available = maxBet(account)
  const resolving = useResolving(account.id)

  // If the player leaves while a dealt hand awaits a decision, fold it (forfeit the
  // ante, settle the Pair Plus) so the stake never strands in pending. Folding is
  // the no-action default — leaving can't dodge a bad hand. Settles in background.
  useSettleOnExit(() => {
    if (game?.status === 'decide') fold(account, game)
  })

  const totalBet = ante + pairPlus
  const betInvalid =
    !Number.isInteger(ante) || ante < 1 || totalBet > available || locked
  // Playing needs the play wager (= ante) to also fit after the deal already held the bets.
  const cannotAffordPlay = deciding && game != null && availableToWager(account) < game.ante

  // Before a round, show a stable face-up preview hand derived from the client
  // seed — purely decorative; the real deal starts when you press Deal.
  const preview = useMemo(() => deal3(clientSeed, clientSeed, 0), [clientSeed])
  const playerCards = game ? game.player : preview.player
  const dealerCards = game ? game.dealer : preview.dealer
  const showdown = done // dealer revealed only after the round ends

  const profit = done && game ? totalProfit(game) : 0
  const won = profit > 0
  const popMultiplier = useMemo(() => {
    if (!done || !game) return 0
    const staked = totalStaked(game)
    return staked > 0 ? totalReturned(game) / staked : 0
  }, [done, game])

  function deal() {
    setError(null)
    try {
      nonceRef.current += 1
      const g = createGame(account, {
        ante,
        pairPlus: pairPlus > 0 ? pairPlus : undefined,
        clientSeed,
        nonce: nonceRef.current,
      })
      setGame(g)
      setRevealed(false)
      setDealerShown(0)
      setPlacements([]) // bets are committed; next session's Undo starts fresh
      onBalanceChange()
      // staggered card "pitches" under the slide-in deal animation
      playSound('deal')
      window.setTimeout(() => playSound('deal'), 2 * DEAL_STEP_MS)
      window.setTimeout(() => playSound('deal'), 4 * DEAL_STEP_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function decide(kind: 'play' | 'fold') {
    if (!game || game.status !== 'decide') return
    try {
      if (kind === 'play') play(account, game)
      else fold(account, game)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    playSound(kind === 'play' ? 'reveal' : 'select') // the play/fold action click
    setRevealed(false)
    redraw() // status → 'done'
    onBalanceChange()
    // turn the dealer's cards over one at a time, left → right
    for (let i = 0; i < DEALER_CARDS; i++) {
      window.setTimeout(() => {
        setDealerShown(i + 1)
        playSound('deal') // a soft card turn per reveal
      }, i * FLIP_STEP_MS)
    }
    // hold the outcome (result lines, popup, win/lose cue, history) until the last
    // card has finished turning — the flips ARE the reveal, so nothing spoils it.
    const p = totalProfit(game)
    const mult = popMult(game)
    window.setTimeout(() => {
      setRevealed(true)
      setHistory((h) => [{ multiplier: mult, won: p > 0 }, ...h].slice(0, 16))
      playSound(p > 0 ? 'win' : p < 0 ? 'lose' : 'select')
    }, REVEAL_DONE_MS)
  }

  const playerRankLabel = game ? RANK_LABELS[game.playerValue.rank] : null
  const dealerRankLabel = showdown && game ? RANK_LABELS[game.dealerValue.rank] : null

  // One stable layout the whole round: the betting circles AND the chip tray are
  // always on screen — the tray just dims while a hand plays out. You can only
  // place/edit bets between rounds (canBet). The circles always show the current
  // stakes; Play fills when you Play and clears on the next deal.
  const canBet = !deciding && !resolving
  const anteChips = ante
  const pairChips = pairPlus
  const playChips = game && game.decision === 'play' ? game.ante : 0

  // Drop a chip of `denom` cents onto a spot — adds to that bet, capped so the
  // ante + pair-plus total never exceeds what the player can wager. Records the
  // amount actually added so Undo can peel exactly that back off.
  function addChip(spot: 'ante' | 'pairplus', denom: number) {
    if (!canBet) return
    const room = spot === 'ante' ? available - pairPlus - ante : available - ante - pairPlus
    const amount = Math.min(denom, Math.max(0, room))
    if (amount <= 0) return
    if (spot === 'ante') setAnte((a) => a + amount)
    else setPairPlus((p) => p + amount)
    setPlacements((h) => [...h, { spot, amount }])
    playSound('select')
  }
  function undoBet() {
    if (!canBet || placements.length === 0) return
    const last = placements[placements.length - 1]
    if (last.spot === 'ante') setAnte((a) => Math.max(0, a - last.amount))
    else setPairPlus((p) => Math.max(0, p - last.amount))
    setPlacements((h) => h.slice(0, -1))
    playSound('select')
  }
  function clearBets() {
    if (!canBet) return
    setAnte(0)
    setPairPlus(0)
    setPlacements([])
    playSound('select')
  }

  return (
    <div className="threecardpoker">
      <section className="threecardpoker-panel">
        <label className="field">
          <span className="field-label">Ante</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={ante / 100}
              min={0.01}
              disabled={locked}
              onCommit={(d) => setAnte(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={locked}
              onClick={() => setAnte((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={locked}
              onClick={() => setAnte((b) => Math.min(Math.max(1, available - pairPlus), b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Pair Plus (side bet)</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={pairPlus / 100}
              min={0}
              disabled={locked}
              onCommit={(d) => setPairPlus(Math.max(0, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={locked}
              onClick={() => setPairPlus(0)}
            >
              0
            </button>
            <button
              className="chip"
              disabled={locked}
              onClick={() => setPairPlus((b) => Math.min(Math.max(0, available - ante), b * 2 || ante))}
            >
              2×
            </button>
          </div>
        </label>

        {deciding ? (
          <div className="threecardpoker-decide">
            <button
              className="action action-bet"
              onClick={() => decide('play')}
              disabled={cannotAffordPlay}
            >
              Play
            </button>
            <button className="action action-cashout" onClick={() => decide('fold')}>
              Fold
            </button>
          </div>
        ) : (
          <button className="action action-bet" onClick={deal} disabled={betInvalid || resolving}>
            Deal
          </button>
        )}

        {cannotAffordPlay && (
          <p className="threecardpoker-error">
            Not enough to match the ante for Play — Fold or settle up first.
          </p>
        )}
        {error && <p className="threecardpoker-error">{error}</p>}
        {totalBet > available && !error && !locked && (
          <p className="threecardpoker-error">
            Ante + Pair Plus exceeds what you can wager ({formatMoney(available)}).
          </p>
        )}
      </section>

      <section className="threecardpoker-stage">
        <div className="threecardpoker-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.won ? `${h.multiplier.toFixed(2)}×` : '—'}
            </span>
          ))}
        </div>

        <div className={`threecardpoker-felt ${showdown && won && revealed ? 'is-win' : ''}`}>
          {/* the payout schedules, printed straight into the felt */}
          <div className="threecardpoker-feltpays">
            <div className="threecardpoker-feltpay">
              <div className="threecardpoker-feltpay-title">Ante Bonus</div>
              <div className="threecardpoker-feltpay-rows">
                {ANTE_BONUS_ROWS.map((row) => (
                  <div
                    key={row.rank}
                    className={`threecardpoker-feltpay-row ${
                      done && revealed && game && game.decision === 'play' && game.playerValue.rank === row.rank
                        ? 'is-hit'
                        : ''
                    }`}
                  >
                    <span className="threecardpoker-feltpay-name">{row.label}</span>
                    <span className="threecardpoker-feltpay-odds">{row.odds}:1</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="threecardpoker-feltpay">
              <div className="threecardpoker-feltpay-title">Pair Plus</div>
              <div className="threecardpoker-feltpay-rows">
                {PAIR_PLUS_ROWS.map((row) => (
                  <div
                    key={row.rank}
                    className={`threecardpoker-feltpay-row ${
                      done && revealed && game && game.pairPlusWager && game.playerValue.rank === row.rank
                        ? 'is-hit'
                        : ''
                    }`}
                  >
                    <span className="threecardpoker-feltpay-name">{row.label}</span>
                    <span className="threecardpoker-feltpay-odds">{row.multiplier}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="threecardpoker-row is-dealer">
            <div className="threecardpoker-cards">
              {dealerCards.map((card, i) => (
                <PlayingCard
                  key={`d-${game ? game.anteWager.id : 'preview'}-${i}`}
                  card={card}
                  faceDown={i >= dealerShown}
                  dealDelayMs={i * 2 * DEAL_STEP_MS + DEAL_STEP_MS}
                />
              ))}
            </div>
            {/* always rendered (reserves its height) so the row never changes size */}
            <div className="threecardpoker-caption">
              {showdown && revealed && game && dealerRankLabel && (
                <>
                  {dealerRankLabel}
                  {game.dealerQualified != null && (
                    <span className="threecardpoker-caption-sub">
                      {game.dealerQualified ? ' · qualifies' : ' · no qualify'}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="threecardpoker-row is-player">
            <div className="threecardpoker-cards">
              {playerCards.map((card, i) => (
                <PlayingCard
                  key={`p-${game ? game.anteWager.id : 'preview'}-${i}`}
                  card={card}
                  faceDown={game == null}
                  dealDelayMs={i * 2 * DEAL_STEP_MS}
                />
              ))}
            </div>
            <div className="threecardpoker-caption is-you">
              {game && playerRankLabel ? playerRankLabel : ''}
            </div>
          </div>

          {/* the betting layout — each bet has its own shape; chips match the tray.
              The tray is ALWAYS present (it just dims mid-hand) so the table never
              changes shape between betting and play. */}
          <div className="threecardpoker-betarea">
            <div className="threecardpoker-betspots">
              <BetSpot
                shape="triangle"
                label="Pair+"
                cents={pairChips}
                active={canBet && activeSpot === 'pairplus'}
                interactive={canBet}
                onSelect={() => setActiveSpot('pairplus')}
                onDropChip={(d) => addChip('pairplus', d)}
              />
              <BetSpot
                shape="circle"
                label="Ante"
                cents={anteChips}
                active={canBet && activeSpot === 'ante'}
                interactive={canBet}
                onSelect={() => setActiveSpot('ante')}
                onDropChip={(d) => addChip('ante', d)}
              />
              <BetSpot shape="rhombus" label="Play" cents={playChips} interactive={false} />
            </div>

            <div className={`threecardpoker-chiptray ${canBet ? '' : 'is-locked'}`}>
              {TRAY_CHIPS.map((c) => (
                <button
                  key={c.cents}
                  className={`threecardpoker-clay is-${c.cls}`}
                  draggable={canBet}
                  disabled={!canBet}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(c.cents))}
                  onClick={() => addChip(activeSpot, c.cents)}
                  title={`Add ${chipLabel(c.cents)} to ${activeSpot === 'ante' ? 'Ante' : 'Pair+'}`}
                >
                  {chipLabel(c.cents)}
                </button>
              ))}
              <div className="threecardpoker-tray-actions">
                <button
                  className="threecardpoker-traybtn"
                  onClick={undoBet}
                  disabled={!canBet || placements.length === 0}
                  title="Undo the last chip"
                >
                  ↶ Undo
                </button>
                <button
                  className="threecardpoker-traybtn"
                  onClick={clearBets}
                  disabled={!canBet || (ante === 0 && pairPlus === 0)}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* always rendered with a reserved height so the page never grows/shrinks
            when results appear — the layout stays one fixed size the whole round */}
        <div className="threecardpoker-results">
          {done && game && revealed && (
            <>
              {game.ante_result && (
                <ResultLine label="Ante" detail={game.ante_result.detail} profit={game.ante_result.profit} />
              )}
              {game.play_result && (
                <ResultLine label="Play" detail={game.play_result.detail} profit={game.play_result.profit} />
              )}
              {game.pairPlus_result && (
                <ResultLine
                  label="Pair Plus"
                  detail={game.pairPlus_result.detail}
                  profit={game.pairPlus_result.profit}
                />
              )}
            </>
          )}
        </div>

        {done && won && game && revealed && (
          <WinPopup
            key={game.anteWager.id}
            multiplier={popMultiplier}
            stake={totalStaked(game)}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>

      {/* info sits to the RIGHT of the game, not underneath it */}
      <aside className="threecardpoker-aside">
        <Rules points={TCP_RULES} />
        <Fairness
          game={done ? game : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (idle ? 1 : 0)}
          editable={idle}
          onClientSeed={setClientSeed}
        />
      </aside>
    </div>
  )
}

/** Round-level "multiplier" for the history pill / popup: total returned ÷ staked. */
function popMult(game: ThreeCardState): number {
  const staked = totalStaked(game)
  return staked > 0 ? totalReturned(game) / staked : 0
}

/** A compact chip label: whole dollars drop the cents ($10), else two places ($12.50). */
function chipLabel(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/** Colour a placed chip by its total, using the same denomination palette as the
 *  tray, so a stake on the felt looks exactly like a chip from the sideline. */
function chipColorClass(cents: number): string {
  if (cents >= 50000) return 'd500'
  if (cents >= 10000) return 'd100'
  if (cents >= 2500) return 'd25'
  if (cents >= 500) return 'd5'
  return 'd1'
}

/** A labelled betting spot with its own shape (circle / rhombus / triangle). When the
 *  bet is > 0 a clay chip sits in it showing the amount. Interactive spots can be
 *  clicked to become the active target and accept dragged chips. */
function BetSpot({
  shape,
  label,
  cents,
  active = false,
  interactive = false,
  onSelect,
  onDropChip,
}: {
  shape: 'circle' | 'rhombus' | 'triangle'
  label: string
  cents: number
  active?: boolean
  interactive?: boolean
  onSelect?: () => void
  onDropChip?: (denom: number) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`threecardpoker-betspot is-${shape} ${active ? 'is-active' : ''} ${
        interactive ? 'is-interactive' : ''
      } ${over ? 'is-over' : ''}`}
      onClick={interactive ? onSelect : undefined}
      onDragOver={
        interactive
          ? (e) => {
              e.preventDefault()
              setOver(true)
            }
          : undefined
      }
      onDragLeave={interactive ? () => setOver(false) : undefined}
      onDrop={
        interactive
          ? (e) => {
              e.preventDefault()
              setOver(false)
              const d = Number(e.dataTransfer.getData('text/plain'))
              if (d > 0) onDropChip?.(d)
            }
          : undefined
      }
    >
      <div className="threecardpoker-betspot-marker">
        <svg viewBox="0 0 72 72" className="threecardpoker-betspot-shape" aria-hidden="true">
          {shape === 'circle' && <circle cx="36" cy="36" r="32" />}
          {shape === 'rhombus' && <polygon points="36,4 68,36 36,68 4,36" />}
          {shape === 'triangle' && <polygon points="36,7 66,63 6,63" />}
        </svg>
        {cents > 0 && (
          <div key={cents} className={`threecardpoker-clay is-placed is-${chipColorClass(cents)}`}>
            {chipLabel(cents)}
          </div>
        )}
      </div>
      <span className="threecardpoker-betspot-label">{label}</span>
    </div>
  )
}

function ResultLine({ label, detail, profit }: { label: string; detail: string; profit: number }) {
  const cls = profit > 0 ? 'is-win' : profit < 0 ? 'is-loss' : 'is-push'
  return (
    <div className={`threecardpoker-resultline ${cls}`}>
      <span className="threecardpoker-resultlabel">{label}</span>
      <span className="threecardpoker-resultdetail">{detail}</span>
      <span className="threecardpoker-resultamt">
        {profit > 0 ? `+${formatMoney(profit)}` : profit < 0 ? formatMoney(profit) : 'push'}
      </span>
    </div>
  )
}

const RANK_LABELS_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

/** A card that slides in on the deal and can flip between its back and face. The
 *  flip is driven purely by `faceDown` (a CSS transition on the container), so the
 *  dealer's hidden cards flip over to reveal when `faceDown` goes false. */
function PlayingCard({
  card,
  faceDown,
  dealDelayMs,
}: {
  card: Card
  faceDown: boolean
  dealDelayMs: number
}) {
  const red = card.suit === 1 || card.suit === 2
  return (
    <div className="threecardpoker-slot" style={{ animationDelay: `${dealDelayMs}ms` }}>
      <div className={`threecardpoker-flip ${faceDown ? 'is-down' : ''}`}>
        <div className={`threecardpoker-face is-front ${red ? 'is-red' : ''}`}>
          <span className="tcp-idx tcp-idx-tl">
            <span className="tcp-idx-rank">{RANK_LABELS_SHORT[card.rank]}</span>
            <span className="tcp-idx-suit">{SUIT_SYMBOLS[card.suit]}</span>
          </span>
          <span className="tcp-pip" aria-hidden="true">
            {SUIT_SYMBOLS[card.suit]}
          </span>
          <span className="tcp-idx tcp-idx-br" aria-hidden="true">
            <span className="tcp-idx-rank">{RANK_LABELS_SHORT[card.rank]}</span>
            <span className="tcp-idx-suit">{SUIT_SYMBOLS[card.suit]}</span>
          </span>
        </div>
        <div className="threecardpoker-face is-back">
          <span className="threecardpoker-cardback" />
        </div>
      </div>
    </div>
  )
}

function Fairness({
  game,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  game: ThreeCardState | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      game
        ? verify(game.serverSeed, game.clientSeed, game.nonce, {
            player: game.player,
            dealer: game.dealer,
          })
        : null,
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
                {verified ? '✓ hands match the committed seed' : '✗ mismatch'}
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
