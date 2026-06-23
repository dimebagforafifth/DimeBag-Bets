import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { maxBet } from '../../../core/index.js'
import {
  ODDS_LABEL,
  playBaccarat,
  randomServerSeed,
  verifyBaccarat,
  type BaccaratBet,
  type BaccaratCard,
  type BaccaratRound,
  type BaccaratWinner,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { play } from '../../../features/sound/index.js'
import { formatMoney } from '../../shared/money.js'
import './baccarat.css'

const BACCARAT_RULES: ReactNode[] = [
  'Pick a chip, then click any spot — Player, Banker, Tie, or a Pair — to drop it. Stack as many spots as you like; they all settle together when you deal.',
  'Each hand gets two cards (a third is drawn automatically by the punto-banco tableau — you never decide). Card values: A = 1, 2-9 face, 10/J/Q/K = 0; the total is the sum mod 10. Closest to 9 wins.',
  <>
    <strong>Player pays 1:1, Banker 1:1 (−5% commission), Tie 8:1.</strong> On a tie, Player and
    Banker bets push (stake back).
  </>,
  <>
    <strong>Player Pair / Banker Pair pay 11:1</strong> when that hand's first two cards share a
    rank. Cards come off a real 8-deck shoe; every deal is reproducible from the seed revealed after
    the round — provably fair.
  </>,
]

const WINNER_LABEL: Record<BaccaratWinner, string> = {
  player: 'Player',
  banker: 'Banker',
  tie: 'Tie',
}

/** Chip denominations on the rack (cents). */
const CHIP_SIZES = [100, 500, 1000, 2500, 10000]

interface BaccaratGameProps {
  account: Account
  onBalanceChange: () => void
}

/** Card-by-card deal cadence (ms) + the beat before the result reads. */
const DEAL_STEP_MS = 300
const SETTLE_MS = 360
const POPUP_DELAY_MS = 220

export interface RoadEntry {
  winner: BaccaratWinner
  playerPair: boolean
  bankerPair: boolean
}

export function BaccaratGame({ account, onBalanceChange }: BaccaratGameProps) {
  const [chip, setChip] = useState(1000) // current chip size, cents ($10.00)
  // The felt is an ORDERED list of chip placements; per-spot totals are derived.
  // Keeping the order is what makes Undo exact.
  const [placements, setPlacements] = useState<{ spot: BaccaratBet; amount: number }[]>([])
  const [lastPlacements, setLastPlacements] = useState<{ spot: BaccaratBet; amount: number }[]>([])
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  const [round, setRound] = useState<BaccaratRound | null>(null)
  const [staked, setStaked] = useState(0)
  const [dealing, setDealing] = useState(false)
  const [dealStep, setDealStep] = useState(0) // cards revealed so far
  const [road, setRoad] = useState<RoadEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef(0)

  const available = maxBet(account)
  const resolving = useResolving(account.id)

  const stakes = useMemo(() => {
    const m = {} as Record<BaccaratBet, number>
    for (const p of placements) m[p.spot] = (m[p.spot] ?? 0) + p.amount
    return m
  }, [placements])
  const totalStaked = useMemo(() => placements.reduce((a, p) => a + p.amount, 0), [placements])
  const lastTotal = useMemo(
    () => lastPlacements.reduce((a, p) => a + p.amount, 0),
    [lastPlacements],
  )
  const hasBets = placements.length > 0
  const canRebet = !hasBets && lastPlacements.length > 0 && !dealing && !resolving

  useEffect(() => () => clearTimeout(timer.current), [])

  // The order cards reveal in: P1, B1, P2, B2, then any thirds (player's, banker's).
  const dealSeq = useMemo<('player' | 'banker')[]>(() => {
    if (!round) return []
    const s: ('player' | 'banker')[] = ['player', 'banker', 'player', 'banker']
    if (round.deal.player.length > 2) s.push('player')
    if (round.deal.banker.length > 2) s.push('banker')
    return s
  }, [round])

  const shownPlayer = dealing
    ? dealSeq.slice(0, dealStep).filter((s) => s === 'player').length
    : undefined
  const shownBanker = dealing
    ? dealSeq.slice(0, dealStep).filter((s) => s === 'banker').length
    : undefined
  const showResult = round != null && !dealing

  // Drive the card-by-card reveal: one card every DEAL_STEP_MS, then a settle beat
  // before the result reads + the ledger entry releases.
  useEffect(() => {
    if (!dealing || !round) return
    if (dealStep >= dealSeq.length) {
      const id = window.setTimeout(() => {
        setDealing(false)
        setRoad((r) => [
          ...r,
          {
            winner: round.deal.winner,
            playerPair: round.deal.playerPair,
            bankerPair: round.deal.bankerPair,
          },
        ])
        signalReveal(account.id) // result on the felt → release its ledger entry
        play(round.totalProfit > 0 ? 'win' : round.totalProfit < 0 ? 'lose' : 'draw')
      }, SETTLE_MS)
      return () => clearTimeout(id)
    }
    const id = window.setTimeout(() => {
      play('deal')
      setDealStep((s) => s + 1)
    }, DEAL_STEP_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealing, dealStep, dealSeq.length])

  /** Drop one chip on a spot, unless it would overrun what's available. */
  function placeChip(spot: BaccaratBet) {
    if (dealing) return
    setError(null)
    if (totalStaked + chip > available) {
      setError(`Not enough to add that chip (you can wager ${formatMoney(available)}).`)
      return
    }
    setRound(null) // a fresh bet clears the previous result
    setPlacements((p) => [...p, { spot, amount: chip }])
    play('select')
  }

  function undo() {
    if (dealing || !hasBets) return
    setError(null)
    setPlacements((p) => p.slice(0, -1))
    play('select')
  }

  function clearBets() {
    if (dealing || !hasBets) return
    setError(null)
    setPlacements([])
  }

  function rebet() {
    if (!canRebet) return
    if (lastTotal > available) {
      setError(`Not enough to repeat that bet (you can wager ${formatMoney(available)}).`)
      return
    }
    setError(null)
    setRound(null)
    setPlacements(lastPlacements)
    play('select')
  }

  // The deal's server seed now comes from the platform fairness AUTHORITY (commit hash before
  // play → reveal after), not a browser randomServerSeed(). The deal/settlement math is unchanged.
  async function deal() {
    if (dealing || !hasBets) return
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    if (totalStaked > available) {
      setError(`Stake exceeds what you can wager (${formatMoney(available)}).`)
      inFlightRef.current = false
      return
    }
    try {
      const minted = await fairnessClient.mintRound()
      nonceRef.current += 1
      const bets = {} as Record<BaccaratBet, number>
      for (const p of placements) bets[p.spot] = (bets[p.spot] ?? 0) + p.amount
      const r = playBaccarat(account, {
        bets,
        clientSeed,
        nonce: nonceRef.current,
        serverSeed: minted.serverSeed,
      })
      onBalanceChange()
      play('deal')
      setRound(r)
      setStaked(totalStaked)
      setLastPlacements(placements)
      setPlacements([]) // chips are committed to the round now
      setDealStep(0)
      setDealing(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  const resultByBet = useMemo(() => {
    const m = new Map<BaccaratBet, { outcome: string; profit: number }>()
    if (round) for (const r of round.results) m.set(r.bet, { outcome: r.outcome, profit: r.profit })
    return m
  }, [round])

  const resultText = useMemo(() => {
    if (!round || dealing) return ''
    const who = round.deal.winner === 'tie' ? 'Tie' : `${WINNER_LABEL[round.deal.winner]} wins`
    const net = round.totalProfit
    if (net > 0) return `${who} — you win ${formatMoney(net)}`
    if (net < 0) return `${who} — you lose ${formatMoney(-net)}`
    // net 0 is a real push only on a Tie; otherwise winning + losing spots offset.
    return round.deal.winner === 'tie' ? `${who} — push, stake returned` : `${who} — you break even`
  }, [round, dealing])

  return (
    <div className="baccarat">
      <section className="baccarat-panel">
        <ChipRack value={chip} disabled={dealing} onChange={setChip} />

        <div className="baccarat-staked">
          <span className="field-label">Total staked</span>
          <span className="baccarat-staked-value">{formatMoney(totalStaked)}</span>
        </div>

        {hasBets ? (
          <button className="action action-bet" onClick={deal} disabled={dealing || resolving}>
            Deal
          </button>
        ) : canRebet ? (
          <button className="action action-bet" onClick={rebet}>
            Deal
          </button>
        ) : (
          <button className="action action-bet" onClick={deal} disabled>
            Deal
          </button>
        )}

        <div className="baccarat-actions">
          <button className="chip" onClick={undo} disabled={dealing || !hasBets}>
            Undo
          </button>
          <button className="chip" onClick={clearBets} disabled={dealing || !hasBets}>
            Clear
          </button>
        </div>

        {error && <p className="baccarat-error">{error}</p>}
      </section>

      <section className="baccarat-stage">
        <Scoreboard road={road} />

        <div className="baccarat-table">
          <Hand
            side="player"
            label="Player"
            cards={round ? round.deal.player : []}
            shown={shownPlayer}
            total={showResult ? round!.deal.playerTotal : null}
            pair={showResult && round!.deal.playerPair}
            win={showResult && round!.deal.winner === 'player'}
          />
          <div className="baccarat-versus">
            {showResult ? (
              <span className={`baccarat-winner is-${round!.deal.winner}`}>
                {WINNER_LABEL[round!.deal.winner]}
              </span>
            ) : (
              <span className="baccarat-vs">{dealing ? '···' : 'vs'}</span>
            )}
          </div>
          <Hand
            side="banker"
            label="Banker"
            cards={round ? round.deal.banker : []}
            shown={shownBanker}
            total={showResult ? round!.deal.bankerTotal : null}
            pair={showResult && round!.deal.bankerPair}
            win={showResult && round!.deal.winner === 'banker'}
          />
        </div>

        <BetFelt
          stakes={stakes}
          chip={chip}
          disabled={dealing}
          winner={showResult ? round!.deal.winner : null}
          deal={showResult ? round!.deal : null}
          resultByBet={resultByBet}
          onPlace={placeChip}
        />

        <p
          className={`baccarat-result ${showResult && round!.totalProfit > 0 ? 'is-win' : ''} ${
            showResult && round!.deal.winner === 'tie' && round!.totalProfit === 0 ? 'is-push' : ''
          }`}
        >
          {showResult ? resultText : dealing ? 'Dealing…' : 'Place your chips, then deal'}
        </p>

        <Rules points={BACCARAT_RULES} />

        <Fairness
          round={showResult ? round : null}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + (round ? 0 : 1)}
          editable={!dealing}
          onClientSeed={setClientSeed}
        />

        {showResult && round!.totalProfit > 0 && (
          <WinPopup
            key={round!.nonce}
            multiplier={round!.totalReturn / round!.totalStake}
            stake={staked}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>
    </div>
  )
}

/* ------------------------------- the felt -------------------------------- */

const FELT_SPOTS: { spot: BaccaratBet; label: string }[] = [
  { spot: 'playerPair', label: 'Player Pair' },
  { spot: 'player', label: 'Player' },
  { spot: 'tie', label: 'Tie' },
  { spot: 'banker', label: 'Banker' },
  { spot: 'bankerPair', label: 'Banker Pair' },
]

function BetFelt({
  stakes,
  disabled,
  winner,
  deal,
  resultByBet,
  onPlace,
}: {
  stakes: Record<BaccaratBet, number>
  chip: number
  disabled: boolean
  winner: BaccaratWinner | null
  deal: { playerPair: boolean; bankerPair: boolean } | null
  resultByBet: Map<BaccaratBet, { outcome: string; profit: number }>
  onPlace: (spot: BaccaratBet) => void
}) {
  // a spot "hit" (won) once the result is in
  const hit = (spot: BaccaratBet): boolean => {
    if (!winner || !deal) return false
    if (spot === 'player') return winner === 'player'
    if (spot === 'banker') return winner === 'banker'
    if (spot === 'tie') return winner === 'tie'
    if (spot === 'playerPair') return deal.playerPair
    if (spot === 'bankerPair') return deal.bankerPair
    return false
  }
  return (
    <div className="baccarat-felt">
      {FELT_SPOTS.map(({ spot, label }) => {
        const staked = stakes[spot] ?? 0
        const res = resultByBet.get(spot)
        // Banker pays 1:1 but the house keeps a 5% commission on the win — shown on
        // the felt (and to screen readers), like a real table, never buried.
        const oddsText = spot === 'banker' ? '1:1 −5%' : ODDS_LABEL[spot]
        const ariaOdds = spot === 'banker' ? '1:1 minus 5% commission' : ODDS_LABEL[spot]
        return (
          <button
            key={spot}
            className={`baccarat-spot is-${spot} ${hit(spot) ? 'is-hit' : ''} ${
              res && res.outcome === 'loss' ? 'is-miss' : ''
            }`}
            disabled={disabled}
            onClick={() => onPlace(spot)}
            aria-label={`${label}, pays ${ariaOdds}`}
          >
            <span className="baccarat-spot-name">{label}</span>
            <span className="baccarat-spot-odds">{oddsText}</span>
            {staked > 0 && <BetChip cents={staked} />}
          </button>
        )
      })}
    </div>
  )
}

/** Casino-style chip colour by value, mirroring the rack. */
function chipTone(cents: number): string {
  if (cents >= 10000) return 'black'
  if (cents >= 2500) return 'green'
  if (cents >= 1000) return 'blue'
  if (cents >= 500) return 'red'
  return 'white'
}

function chipFace(cents: number): string {
  const d = cents / 100
  if (d >= 1000) return `$${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)}k`
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

/** A combined chip token sitting on a spot, showing the total staked there. */
function BetChip({ cents }: { cents: number }) {
  return (
    <span className={`baccarat-chiptoken tone-${chipTone(cents)}`} key={cents} aria-hidden="true">
      <span className="baccarat-chiptoken-val">{chipFace(cents)}</span>
    </span>
  )
}

function ChipRack({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <div className="field">
      <span className="field-label">Chip size</span>
      <div className="baccarat-chiprow">
        {CHIP_SIZES.map((c) => (
          <button
            type="button"
            key={c}
            className={`baccarat-chipbtn tone-${chipTone(c)} ${value === c ? 'is-on' : ''}`}
            aria-pressed={value === c}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            <span className="baccarat-chipbtn-val">{chipFace(c)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- the cards ------------------------------- */

const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

function Hand({
  side,
  label,
  cards,
  shown,
  total,
  pair,
  win,
}: {
  side: 'player' | 'banker'
  label: string
  cards: BaccaratCard[]
  /** During the deal, how many of this hand's cards have landed (undefined = all). */
  shown?: number
  total: number | null
  pair: boolean
  win: boolean
}) {
  const visible = shown == null ? cards : cards.slice(0, shown)
  const natural = cards.length === 2 && total != null && total >= 8
  return (
    <div className={`baccarat-hand is-${side} ${win ? 'is-win' : ''}`}>
      <div className="baccarat-hand-head">
        <span className="baccarat-hand-title">{label}</span>
        {pair && <span className="baccarat-pair-tag">Pair</span>}
      </div>
      <div className="baccarat-cards">
        {visible.length === 0 ? (
          <>
            <span className="baccarat-card is-back" aria-hidden="true" />
            <span className="baccarat-card is-back" aria-hidden="true" />
          </>
        ) : (
          visible.map((c, i) => <PlayingCard key={i} card={c} />)
        )}
      </div>
      <div className="baccarat-hand-foot">
        {natural && <span className="baccarat-natural">Natural</span>}
        <span className="baccarat-hand-total">{total != null ? total : '–'}</span>
      </div>
    </div>
  )
}

function PlayingCard({ card }: { card: BaccaratCard }) {
  const red = card.suit === 1 || card.suit === 2
  const rank = RANK_LABELS[card.rank]
  const suit = SUIT_SYMBOLS[card.suit]
  return (
    <div className={`baccarat-card ${red ? 'is-red' : ''}`}>
      <span className="baccarat-card-idx">
        {rank}
        <i>{suit}</i>
      </span>
      <span className="baccarat-card-pip">{suit}</span>
      <span className="baccarat-card-idx is-br">
        {rank}
        <i>{suit}</i>
      </span>
    </div>
  )
}

/* ----------------------------- the scoreboard ---------------------------- */

const BEAD_ROWS = 6
const ROAD_ROWS = 6
const ROAD_COLS = 22

/** Big-road grid: P/B streaks run DOWN a column; a different result starts a new
 *  column; a streak that hits the floor (or an occupied cell) bends RIGHT (the
 *  "dragon tail"); ties annotate the last cell. Standard casino algorithm. */
export function buildBigRoad(
  road: RoadEntry[],
): ({ winner: 'player' | 'banker'; ties: number } | null)[][] {
  const grid: ({ winner: 'player' | 'banker'; ties: number } | null)[][] = []
  const ensure = (col: number) => {
    while (grid.length <= col) grid.push(Array(ROAD_ROWS).fill(null))
  }
  const at = (col: number, row: number) =>
    row >= 0 && row < ROAD_ROWS ? (grid[col]?.[row] ?? null) : undefined

  // `startCol` = the column a run BEGAN in (its top row). A new run starts to the
  // right of the previous run's START, NOT the right of where the last marker
  // landed — otherwise a long run's dragon tail (which wanders rightward along the
  // bottom) would shove the next run too far right. `lastCol/lastRow` track the
  // last marker for the straight-down / bend-right logic.
  let startCol = -1
  let lastCol = -1
  let lastRow = -1
  let lastWinner: 'player' | 'banker' | null = null

  for (const e of road) {
    if (e.winner === 'tie') {
      if (lastCol >= 0 && grid[lastCol][lastRow]) grid[lastCol][lastRow]!.ties++
      continue // a leading tie (no P/B yet) is simply skipped on the big road
    }
    const w = e.winner
    if (lastWinner === null || w !== lastWinner) {
      // new run: one column right of the PREVIOUS run's start, skipping past any
      // cell a dragon tail already left in that column (so we never overwrite it).
      let col = startCol + 1
      ensure(col)
      while (at(col, 0) !== null) {
        col++
        ensure(col)
      }
      grid[col][0] = { winner: w, ties: 0 }
      startCol = col
      lastCol = col
      lastRow = 0
      lastWinner = w
    } else {
      // same streak: straight down if free, else bend right along this row
      let col = lastCol
      let row = lastRow + 1
      if (row >= ROAD_ROWS || at(col, row) !== null) {
        row = lastRow
        col = lastCol + 1
        ensure(col)
        while (at(col, row) !== null && at(col, row) !== undefined) {
          col++
          ensure(col)
        }
      }
      ensure(col)
      grid[col][row] = { winner: w, ties: 0 }
      lastCol = col
      lastRow = row
    }
  }
  return grid
}

function Scoreboard({ road }: { road: RoadEntry[] }) {
  // Bead plate: P/B/T filled top→bottom, then next column.
  const bead = useMemo(() => {
    const cols: RoadEntry[][] = []
    road.forEach((e, i) => {
      const col = Math.floor(i / BEAD_ROWS)
      if (!cols[col]) cols[col] = []
      cols[col].push(e)
    })
    return cols
  }, [road])
  const big = useMemo(() => buildBigRoad(road), [road])

  // counts for the little tally
  const counts = useMemo(() => {
    let p = 0,
      b = 0,
      t = 0
    for (const e of road) {
      if (e.winner === 'player') p++
      else if (e.winner === 'banker') b++
      else t++
    }
    return { p, b, t }
  }, [road])

  if (road.length === 0) {
    return (
      <div className="baccarat-scoreboard is-empty">
        <span className="baccarat-score-empty">
          The bead plate &amp; big road fill in as you play
        </span>
      </div>
    )
  }

  return (
    <div className="baccarat-scoreboard">
      <div className="baccarat-tally">
        <span className="baccarat-tally-pill is-player">P {counts.p}</span>
        <span className="baccarat-tally-pill is-banker">B {counts.b}</span>
        <span className="baccarat-tally-pill is-tie">T {counts.t}</span>
      </div>
      <div className="baccarat-roads">
        {/* bead plate */}
        <div className="baccarat-bead" aria-label="Bead plate">
          {Array.from({ length: BEAD_ROWS }, (_, row) => (
            <div className="baccarat-bead-row" key={row}>
              {bead.map((col, c) => {
                const e = col[row]
                return (
                  <span key={c} className={`baccarat-bead-cell ${e ? `is-${e.winner}` : ''}`}>
                    {e ? (e.winner === 'player' ? 'P' : e.winner === 'banker' ? 'B' : 'T') : ''}
                    {e?.playerPair && <i className="baccarat-bead-pp" />}
                    {e?.bankerPair && <i className="baccarat-bead-bp" />}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
        {/* big road */}
        <div className="baccarat-bigroad" aria-label="Big road">
          {Array.from({ length: ROAD_ROWS }, (_, row) => (
            <div className="baccarat-bigroad-row" key={row}>
              {Array.from({ length: Math.max(ROAD_COLS, big.length) }, (_, col) => {
                const cell = big[col]?.[row] ?? null
                return (
                  <span key={col} className="baccarat-bigroad-cell">
                    {cell && (
                      <span className={`baccarat-ring is-${cell.winner}`}>
                        {cell.ties > 0 && <i className="baccarat-tieslash" />}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- fairness -------------------------------- */

function Fairness({
  round,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  round: BaccaratRound | null
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const verified = useMemo(
    () =>
      round ? verifyBaccarat(round.serverSeed, round.clientSeed, round.nonce, round.deal) : null,
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
          <code className="seed">{round ? round.serverSeedHash : 'shown after the deal'}</code>
        </Row>
        {round && (
          <>
            <Row label="Server seed (revealed)">
              <code className="seed">{round.serverSeed}</code>
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
