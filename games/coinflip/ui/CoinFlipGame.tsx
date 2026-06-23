import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account } from '../../../core/index.js'
import { availableToWager, maxBet, resolveAtMultiplier } from '../../../core/index.js'
import {
  cashOut,
  COIN_WIN_PROB,
  createCoinFlip,
  DEFAULT_COINFLIP_CONFIG,
  flip,
  randomServerSeed,
  stepMultiplier,
  verifyCoinFlips,
  type CoinFace,
  type CoinFlipGame as CoinFlipGameState,
  type CoinFlipHouseConfig,
} from '../index.js'
import { fairnessClient } from '../../shared/fair.js'
import { WinPopup } from '../../shared/WinPopup.js'
import { Rules } from '../../shared/Rules.js'
import { useResolving } from '../../shared/useResolving.js'
import { useSettleOnExit } from '../../shared/useSettleOnExit.js'
import { ProfitReadout } from '../../shared/ProfitReadout.js'
import { play } from '../../../features/sound/index.js'
import { signalReveal } from '../../shared/reveal-bus.js'
import { NumberInput } from '../../shared/NumberInput.js'
import { formatMoney, toCents } from '../../shared/money.js'
import './coinflip.css'

const COINFLIP_RULES: ReactNode[] = [
  'Set your bet and how many coins to play (up to 10), then hit Play and call Heads or Tails before each toss — a fair 50/50.',
  'Every coin is its own bet. One call flips all the coins still in; the ones that match ride on, the ones that miss bust and lose that coin’s stake.',
  'Cash Out any time to bank every surviving coin at the running multiplier.',
  'The track under the coins fills a slot for each surviving flip, so you can see how far the streak has run.',
  <>
    <strong>Each coin wins its stake × the running multiplier</strong>, which grows 1.96× per
    correct call. Every flip is provably fair.
  </>,
]

interface CoinFlipGameProps {
  account: Account
  houseConfig?: CoinFlipHouseConfig
  onBalanceChange: () => void
}

const MAX_COINS = 10 // up to ten independent coins per bet
const STREAK_SLOTS = 20 // the track under the coins fills one slot per surviving flip
const FLIP_REVEAL_MS = 800 // a fresh slot fills only after the coins have visibly landed (no spoiler)
const POPUP_DELAY_MS = 150

/** A concrete random side for the Random call — a fresh 50/50. */
function randomFace(): CoinFace {
  return Math.random() < 0.5 ? 'heads' : 'tails'
}

export function CoinFlipGame({
  account,
  houseConfig = DEFAULT_COINFLIP_CONFIG,
  onBalanceChange,
}: CoinFlipGameProps) {
  const [bet, setBet] = useState(1000) // cents ($10.00) — PER COIN
  const [coins, setCoins] = useState(1) // how many coins this bet plays (1..10)
  const [clientSeed, setClientSeed] = useState(() => randomServerSeed().slice(0, 16))
  const nonceRef = useRef(0)
  const inFlightRef = useRef(false) // a round is awaiting its authority-minted seed

  // Every coin in the current round is its own independent CoinFlip wager/streak.
  // The array is mutated in place + redraw. One call flips all the still-active coins.
  const gamesRef = useRef<CoinFlipGameState[]>([])
  const [history, setHistory] = useState<{ multiplier: number; won: boolean }[]>([])
  const [cashWin, setCashWin] = useState<{ stake: number; multiplier: number; key: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  // The side the most recent flip actually called — shown so a 'random' pick is never hidden.
  const [lastCall, setLastCall] = useState<CoinFace | null>(null)
  // How many flips have visually landed. Lags the real flip count so a result never
  // shows before the coins' toss animation has finished (no spoiler).
  const [revealed, setRevealed] = useState(0)
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  const games = gamesRef.current
  // All live coins flip together, so the round depth is the most flips any coin has
  // taken (coins that busted earlier stopped accumulating results).
  const flipsDone = games.length ? Math.max(...games.map((g) => g.results.length)) : 0

  // If the player leaves with coins still in the air, cash each at its current
  // multiplier so no stake strands in pending (a coin with no wins yet just refunds).
  useSettleOnExit(() => {
    for (const g of gamesRef.current) {
      if (g.status === 'active') {
        resolveAtMultiplier(account, g.wager, Math.max(1, g.multiplier))
      }
    }
  })

  const step = stepMultiplier(houseConfig)

  // --- the SHOWN view: what the player has actually seen land ---------------
  // Core settles a flip the instant it's called, but the coins keep tumbling for
  // ~0.8s. Everything outcome-revealing below is gated on `revealed` so nothing
  // gives the result away before the coins land. The game LOGIC uses the real state.
  const fullyRevealed = revealed >= flipsDone
  const anyActive = games.some((g) => g.status === 'active')
  const shownEnded = games.length > 0 && !anyActive && fullyRevealed
  const shownLive = games.length > 0 && !shownEnded // still playing, or mid-reveal of the deciding flip

  // The multiplier the surviving coins share after `revealed` won flips — iterated to
  // match the engine's per-step rounding exactly.
  let shownMultiplier = 1
  for (let i = 0; i < revealed; i++)
    shownMultiplier = Math.round(shownMultiplier * step * 100) / 100

  // A coin's SHOWN state — a bust only counts once its flip has actually landed.
  function coinShown(g: CoinFlipGameState): 'alive' | 'busted' | 'cashed' {
    if (g.status === 'busted' && revealed >= g.results.length) return 'busted'
    if (g.status === 'cashed') return 'cashed'
    return 'alive' // active, or a bust still mid-tumble
  }
  const aliveShown = games.filter((g) => coinShown(g) === 'alive').length
  // The deepest streak depth shown — drives the multi-coin track.
  const deepestWins = games.reduce((mx, g) => {
    const w =
      g.status === 'busted' && revealed >= g.results.length
        ? g.results.length - 1
        : Math.min(g.results.length, revealed)
    return Math.max(mx, w)
  }, 0)

  const locked = shownLive // bet/coins can't change mid-round (incl. while coins land)

  const maxOne = maxBet(account) // per-wager cap — each coin must fit it
  const wagerable = availableToWager(account)
  const totalStake = bet * coins // the combined stake across all coins
  const betInvalid = !Number.isInteger(bet) || bet < 1 || bet > maxOne || totalStake > wagerable
  const resolving = useResolving(account.id)

  // The profit box shows what you'd bank cashing now: every surviving coin × the
  // multiplier you've SEEN.
  const totalReturn = Math.round(aliveShown * bet * (shownLive ? shownMultiplier : 1))

  // Each coin's server seed now comes from the platform fairness AUTHORITY (commit hash before
  // play → reveal after), not a browser randomServerSeed(). Every coin is its own independent
  // round (own nonce + own seed), so each is minted in turn; the coin math is unchanged.
  async function start() {
    if (inFlightRef.current) return // a mint is already in flight
    inFlightRef.current = true
    setError(null)
    if (totalStake > wagerable) {
      setError(`Not enough — needs ${formatMoney(totalStake)}.`)
      inFlightRef.current = false
      return
    }
    try {
      // Mint every coin's server seed FIRST (the only awaited step). Only once all seeds are in
      // hand do we place the wagers — the createCoinFlip calls below are synchronous and
      // all-or-nothing, so a mid-mint failure can never strand a partial set of stakes in
      // `pending` (those coins would be untracked by gamesRef and useSettleOnExit).
      const seeds: string[] = []
      for (let i = 0; i < coins; i++) seeds.push((await fairnessClient.mintRound()).serverSeed)
      const next = seeds.map((serverSeed) => {
        nonceRef.current += 1
        return createCoinFlip(account, {
          stake: bet,
          clientSeed,
          nonce: nonceRef.current,
          serverSeed,
          config: houseConfig,
        })
      })
      gamesRef.current = next
      setCashWin(null)
      setLastCall(null) // fresh round — no call made yet
      onBalanceChange()
      play('bet')
      redraw()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  function doFlip(call: CoinFace) {
    const active = gamesRef.current.filter((g) => g.status === 'active')
    if (!active.length) return
    setLastCall(call) // reveal which side this flip is going for (esp. for 'random')
    for (const g of active) flip(account, g, call)
    // The flick is heard the instant you toss; the win/loss cue is held back until
    // the coins actually land (see the reveal effect), so audio never spoils it.
    play('coin')
    redraw()
    onBalanceChange()
  }

  function doCash() {
    const active = gamesRef.current.filter((g) => g.status === 'active')
    if (!active.length || active[0].multiplier <= 1) return
    const m = active[0].multiplier // all surviving coins share the same multiplier
    let stakeSum = 0
    for (const g of active) {
      stakeSum += g.wager.stake
      cashOut(account, g)
    }
    setHistory((h) => [...active.map(() => ({ multiplier: m, won: true })), ...h].slice(0, 18))
    setCashWin({ stake: stakeSum, multiplier: m, key: nonceRef.current })
    play('win')
    // The coins are already settled on their winning faces, so the result is on
    // screen: release each ledger entry and unlock Play right away.
    for (let i = 0; i < active.length; i++) signalReveal(account.id)
    redraw()
    onBalanceChange()
  }

  // Drive the flip's delayed reveal: the coins toss for ~0.8s, then the slot fills,
  // busts grey out, the streak climbs, and the result cue plays. In manual play the
  // buttons stay locked until a flip lands, so `revealed` never lags by more than one.
  useEffect(() => {
    if (flipsDone < revealed) {
      setRevealed(flipsDone)
      return
    }
    if (flipsDone <= revealed) return
    const justRevealed = revealed + 1 // the flip about to land
    const t = setTimeout(() => {
      setRevealed((r) => Math.min(flipsDone, r + 1))
      // coins that bust exactly on this flip — record + release their ledger entries
      const bustedNow = gamesRef.current.filter(
        (g) => g.status === 'busted' && g.results.length === justRevealed,
      )
      if (bustedNow.length) {
        setHistory((h) =>
          [...bustedNow.map((g) => ({ multiplier: g.multiplier, won: false })), ...h].slice(0, 18),
        )
        for (let i = 0; i < bustedNow.length; i++) signalReveal(account.id)
      }
      const stillActive = gamesRef.current.some((g) => g.status === 'active')
      // a climbing chime while a streak survives; the gentle "miss" blip when the
      // last coin busts out the round.
      play(stillActive ? 'reveal' : 'lose', { step: justRevealed })
    }, FLIP_REVEAL_MS)
    return () => clearTimeout(t)
  }, [flipsDone, revealed, account.id])

  const sizeClass = coins <= 1 ? 'is-lg' : coins <= 4 ? 'is-md' : 'is-sm'

  return (
    <div className="coinflip">
      <section className="coinflip-panel">
        <label className="field">
          <span className="field-label">Bet per coin</span>
          <div className="field-bet">
            <span className="field-prefix">$</span>
            <NumberInput
              className="field-input"
              value={bet / 100}
              min={0.01}
              disabled={locked}
              onCommit={(d) => setBet(Math.max(1, toCents(d ?? 0)))}
            />
            <button
              className="chip"
              disabled={locked}
              onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}
            >
              ½
            </button>
            <button
              className="chip"
              disabled={locked}
              onClick={() => setBet((b) => Math.min(maxOne, b * 2))}
            >
              2×
            </button>
          </div>
        </label>

        <div className="field">
          <span className="field-label">Coins</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              disabled={locked || coins <= 1}
              onClick={() => setCoins((c) => Math.max(1, c - 1))}
            >
              −
            </button>
            <div className="stepper-value">
              <NumberInput
                className="field-input"
                value={coins}
                min={1}
                max={MAX_COINS}
                decimals={0}
                disabled={locked}
                onCommit={(d) => setCoins(Math.min(MAX_COINS, Math.max(1, Math.round(d ?? 1))))}
              />
            </div>
            <button
              className="stepper-btn"
              disabled={locked || coins >= MAX_COINS}
              onClick={() => setCoins((c) => Math.min(MAX_COINS, c + 1))}
            >
              +
            </button>
          </div>
        </div>

        {/* total bet = bet per coin × number of coins; scales as you add coins */}
        <div className="field">
          <span className="field-label">Total bet</span>
          <div className="field-bet">
            <span className="field-static">{formatMoney(totalStake)}</span>
          </div>
        </div>

        {/* the odds at a glance — every toss is a fair 50/50, the edge lives in the step */}
        <div className="coinflip-stats">
          <div className="coinflip-stat">
            <span className="coinflip-stat-label">Win chance</span>
            <span className="coinflip-stat-value">{(COIN_WIN_PROB * 100).toFixed(0)}%</span>
          </div>
          <div className="coinflip-stat">
            <span className="coinflip-stat-label">Per flip</span>
            <span className="coinflip-stat-value">{step.toFixed(2)}×</span>
          </div>
        </div>

        {shownLive && aliveShown > 0 && shownMultiplier > 1 && (
          <ProfitReadout total={totalReturn} multiplier={shownMultiplier} />
        )}

        {shownLive ? (
          <>
            {/* locked while coins are in the air (uniformly, win or lose, so the
                disabled state never tips the result) — re-enabled when they land. */}
            <div className="coinflip-calls">
              <button
                className="coinflip-call is-heads"
                disabled={!fullyRevealed}
                onClick={() => doFlip('heads')}
              >
                <span className="coinflip-call-main">Heads</span>
                <span className="coinflip-call-mult">{step.toFixed(2)}×</span>
              </button>
              <button
                className="coinflip-call is-tails"
                disabled={!fullyRevealed}
                onClick={() => doFlip('tails')}
              >
                <span className="coinflip-call-main">Tails</span>
                <span className="coinflip-call-mult">{step.toFixed(2)}×</span>
              </button>
              <button
                className="coinflip-call is-random"
                disabled={!fullyRevealed}
                onClick={() => doFlip(randomFace())}
              >
                <span className="coinflip-call-main">Random</span>
                <span className="coinflip-call-mult">{step.toFixed(2)}×</span>
              </button>
            </div>
            <button
              className="action action-cashout"
              onClick={doCash}
              disabled={!fullyRevealed || shownMultiplier <= 1 || aliveShown === 0}
            >
              {shownMultiplier <= 1
                ? 'Call the coins'
                : `Cash Out${aliveShown > 1 ? ` ${aliveShown} coins` : ''}`}
            </button>
          </>
        ) : (
          <button className="action action-bet" onClick={start} disabled={betInvalid || resolving}>
            Play
          </button>
        )}

        {error && <p className="coinflip-error">{error}</p>}
        {totalStake > wagerable && !error && (
          <p className="coinflip-error">
            Stake exceeds what you can wager ({formatMoney(wagerable)}).
          </p>
        )}
      </section>

      <section className="coinflip-stage">
        <div className="coinflip-historybar">
          {history.map((h, i) => (
            <span key={i} className={`pill ${h.won ? 'pill-win' : 'pill-loss'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className="coinflip-coinwrap">
          {/* reserve a fixed row for the "Called" badge so it never reflows the
              stage — and the ledger below it — when it pops in mid-round */}
          <div className="coinflip-callslot">
            {shownLive && lastCall && (
              <div className={`coinflip-called is-${lastCall}`}>
                <span className="coinflip-called-label">Called</span>
                <strong>{lastCall === 'heads' ? 'Heads' : 'Tails'}</strong>
              </div>
            )}
          </div>

          {/* The coins toss to their real landed faces (that IS the reveal), but the
              grey-out / multiplier reflect only what's been SHOWN — so the outcome
              never reads before they settle. */}
          <div className="coinflip-coins">
            {games.length === 0
              ? Array.from({ length: coins }).map((_, i) => (
                  <div key={i} className="coinflip-coin-cell is-idle">
                    <Coin face="heads" spins={0} sizeClass={sizeClass} />
                    <span className="coinflip-coin-mult">—</span>
                  </div>
                ))
              : games.map((g, i) => {
                  const s = coinShown(g)
                  const face: CoinFace = g.results.length
                    ? g.results[g.results.length - 1]
                    : 'heads'
                  return (
                    <div key={i} className={`coinflip-coin-cell is-${s === 'alive' ? 'live' : s}`}>
                      <Coin face={face} spins={g.results.length} sizeClass={sizeClass} />
                      <span className="coinflip-coin-mult">
                        {s === 'busted'
                          ? 'Bust'
                          : s === 'cashed'
                            ? `${(g.payoutMultiplier ?? shownMultiplier).toFixed(2)}×`
                            : `${shownMultiplier.toFixed(2)}×`}
                      </span>
                    </div>
                  )
                })}
          </div>

          {/* the streak track: one long row of slots, filling as the streak survives
              flips. With one coin each slot is the coin you landed; with several it
              shows the shared streak depth (the busts read on the coins themselves). */}
          <div className="coinflip-streak" aria-label="streak">
            {coins === 1
              ? Array.from({ length: STREAK_SLOTS }).map((_, i) => {
                  const g = games[0]
                  if (!g || i >= revealed)
                    return <span key={i} className="coinflip-slot is-empty" />
                  const face = g.results[i]
                  const won = g.calls[i] === face
                  return (
                    <span
                      key={i}
                      className={`coinflip-slot is-${face} ${won ? 'is-won' : 'is-lost'}`}
                      title={`Flip ${i + 1}: ${face === 'heads' ? 'Heads' : 'Tails'}${won ? '' : ' (missed)'}`}
                    />
                  )
                })
              : Array.from({ length: STREAK_SLOTS }).map((_, i) =>
                  i < deepestWins ? (
                    <span key={i} className="coinflip-slot is-heads is-won" />
                  ) : (
                    <span key={i} className="coinflip-slot is-empty" />
                  ),
                )}
          </div>
        </div>

        <Rules points={COINFLIP_RULES} />

        <Fairness
          games={games}
          clientSeed={clientSeed}
          nextNonce={nonceRef.current + 1}
          editable={!locked}
          onClientSeed={setClientSeed}
        />

        {cashWin && (
          <WinPopup
            key={cashWin.key}
            multiplier={cashWin.multiplier}
            stake={cashWin.stake}
            delayMs={POPUP_DELAY_MS}
          />
        )}
      </section>
    </div>
  )
}

/** A gold (heads) / silver (tails) coin. Each toss (`spins` increments) replays a
 *  gamey arc — it leaps up, tumbles, and lands on the dealt `face` with a little
 *  bounce. Re-keying on `spins` restarts the toss animation; it holds the landed
 *  face afterwards (animation-fill-mode: forwards). At rest it shows heads. */
function Coin({ face, spins, sizeClass }: { face: CoinFace; spins: number; sizeClass: string }) {
  const toss = spins > 0 ? (face === 'tails' ? 'is-toss-tails' : 'is-toss-heads') : ''
  return (
    <div key={spins} className={`coinflip-coin ${sizeClass} ${toss}`}>
      <div className="coinflip-face is-heads">
        <span className="coinflip-emblem">♛</span>
      </div>
      <div className="coinflip-face is-tails">
        <span className="coinflip-emblem">★</span>
      </div>
    </div>
  )
}

function Fairness({
  games,
  clientSeed,
  nextNonce,
  editable,
  onClientSeed,
}: {
  games: CoinFlipGameState[]
  clientSeed: string
  nextNonce: number
  editable: boolean
  onClientSeed: (s: string) => void
}) {
  const ended = games.length > 0 && games.every((g) => g.status !== 'active')
  const rows = useMemo(
    () =>
      games.map((g) => ({
        nonce: g.nonce,
        serverSeed: g.serverSeed,
        ok: verifyCoinFlips(g.serverSeed, g.clientSeed, g.nonce, g.calls, g.results),
      })),
    [games],
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
        <Row label="Next nonce">
          {games.length ? `${rows[0].nonce}–${rows[rows.length - 1].nonce}` : nextNonce}
        </Row>
        {ended &&
          rows.map((r, i) => (
            <Row key={i} label={`Coin ${i + 1} (nonce ${r.nonce})`}>
              <span className={r.ok ? 'verify-ok' : 'verify-bad'}>{r.ok ? '✓' : '✗'}</span>{' '}
              <code className="seed">{r.serverSeed.slice(0, 16)}…</code>
            </Row>
          ))}
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
