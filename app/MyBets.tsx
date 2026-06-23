import { useMemo, useState, useSyncExternalStore } from 'react'
import { availableToWager, type Account } from '../core/index.js'
import type { Member } from '../features/org/index.js'
import { subscribeBookLedger, getBookLedger } from './book-ledger.js'
import { summarize, byGame, isSportsbook, toBetRows, SIDE_LABEL, type BetRow, type Side } from './ledger-stats.js'
import { formatMoney } from '../games/shared/money.js'
import { useIsBalanceMode } from './economy-mode.js'
import './ledger.css'
import './mybets.css'

/**
 * The player's own dashboard — the "My Bets" view every book has. It pulls the
 * DURABLE book ledger (app/book-ledger, fed by core's resolution event and
 * persisted, so it survives a reload) and shows just THIS player's action: their
 * figure, their lifetime stats, a per-game breakdown, and the full feed across
 * every casino game AND the sportsbook on one balance.
 *
 * Distinct from the per-game ledger (which lives inside a single game page) and
 * from Management (the operator's view of the whole book): this is the one place
 * a player sees everything they've done, the way a real account page does.
 */
export function MyBets({ account, player }: { account: Account; player: Member }) {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const entries = useMemo(() => toBetRows(log, account.id), [log, account.id])

  // Split the player's action by side of the house so each side's win/loss is
  // clear: everything resolved under the sportsbook is tagged 'sportsbook'; every
  // other gameKey is a casino game.
  const casino = entries.filter((e) => !isSportsbook(e))
  const sportsbook = entries.filter((e) => isSportsbook(e))

  // A side filter scopes the stats, breakdown and feed below the side summary.
  const [side, setSide] = useState<Side>('all')
  const shown = side === 'casino' ? casino : side === 'sportsbook' ? sportsbook : entries

  const stats = summarize(shown)
  const games = byGame(shown)
  // In balance (wallet) mode there's no credit line and no weekly reset, so the wallet reads
  // differently: "Available balance" instead of credit-backed "Balance", a standing that carries
  // forward instead of a weekly figure, and no credit row.
  const balanceMode = useIsBalanceMode()

  return (
    <div className="mybets">
      <div className="mybets-head">
        <h1 className="mybets-title">My Bets</h1>
        <p className="mybets-sub">
          {player.name}’s figure and every bet — casino and sportsbook, one balance.
        </p>
      </div>

      {/* Lead with what you can bet now; the standing, and what's at risk back it up. In credit
          mode the weekly figure + the credit line also show (CLAUDE.md §3); in balance mode the
          wallet carries forward and there's no credit line. */}
      <div className="mybets-figure">
        <Figure
          label={balanceMode ? 'Available balance' : 'Balance'}
          value={formatMoney(availableToWager(account))}
          hint={balanceMode ? 'Credits you can wager' : 'What you can bet right now'}
        />
        <Figure
          label={balanceMode ? 'Wallet' : 'This week'}
          value={formatMoney(account.balance)}
          tone={account.balance > 0 ? 'win' : account.balance < 0 ? 'loss' : undefined}
          hint={
            balanceMode
              ? 'Your standing — carries forward'
              : account.balance < 0
                ? 'Down — you owe the book'
                : account.balance > 0
                  ? 'Up — the book owes you'
                  : 'Even this week'
          }
        />
        <Figure label="At risk" value={formatMoney(account.pending)} hint="Stakes on open bets" />
        {!balanceMode && (
          <Figure label="Credit" value={formatMoney(account.creditLimit)} hint="How far you can run down" />
        )}
      </div>

      {/* by side of the house — at a glance, is the casino or the sportsbook up? */}
      <h2 className="mybets-section">By side</h2>
      <div className="mybets-sides">
        <SideCard label="Casino" hint="Every game on the floor" entries={casino} />
        <SideCard label="Sportsbook" hint="Singles, parlays & live" entries={sportsbook} />
      </div>

      {/* filter the detail below to one side of the house */}
      <div className="mybets-filter" role="group" aria-label="Filter bets by side">
        {(['all', 'casino', 'sportsbook'] as Side[]).map((s) => (
          <button
            key={s}
            className={`chip ${side === s ? 'is-on' : ''}`}
            onClick={() => setSide(s)}
          >
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>

      {/* lifetime statistics (durable — persists across reloads) */}
      <h2 className="mybets-section">Statistics</h2>
      <div className="ledger-summary mybets-stats">
        <Stat label="Bets" value={String(stats.bets)} />
        <Stat label="Wagered" value={formatMoney(stats.wagered)} />
        <Stat
          label="Net profit"
          value={`${stats.net > 0 ? '+' : ''}${formatMoney(stats.net)}`}
          tone={stats.net > 0 ? 'win' : stats.net < 0 ? 'loss' : undefined}
        />
        <Stat label="Win rate" value={`${stats.winRate}%`} />
        <Stat
          label="Biggest win"
          value={stats.biggestWin > 0 ? `+${formatMoney(stats.biggestWin)}` : '—'}
          tone={stats.biggestWin > 0 ? 'win' : undefined}
        />
        <Stat label="Best multiplier" value={stats.bestMult > 1 ? `${stats.bestMult.toFixed(2)}×` : '—'} />
        <Stat label="Record" value={`${stats.wins}–${stats.losses}`} />
        <Stat label="Games played" value={String(games.length)} />
      </div>

      {/* per-game breakdown */}
      {games.length > 0 && (
        <>
          <h2 className="mybets-section">By game</h2>
          <div className="mybets-games">
            <div className="mybets-game-row is-head">
              <span>Game</span>
              <span className="ledger-num">Bets</span>
              <span className="ledger-num">Wagered</span>
              <span className="ledger-num">Net</span>
            </div>
            {games.map((g) => (
              <div key={g.key} className="mybets-game-row">
                <span className="mybets-game-name">{g.name}</span>
                <span className="ledger-num">{g.bets}</span>
                <span className="ledger-num">{formatMoney(g.wagered)}</span>
                <span className={`ledger-num mybets-net ${g.net > 0 ? 'is-win' : g.net < 0 ? 'is-loss' : ''}`}>
                  {g.net > 0 ? '+' : ''}
                  {formatMoney(g.net)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* the full feed (scoped to the chosen side) */}
      <h2 className="mybets-section">Bet history{side !== 'all' && ` — ${SIDE_LABEL[side]}`}</h2>
      {shown.length === 0 ? (
        <p className="ledger-empty">
          {side === 'sportsbook'
            ? 'No sportsbook bets yet — place one and it’ll show up here.'
            : side === 'casino'
              ? 'No casino bets yet — play a game and it’ll show up here.'
              : 'No bets yet — play a game or place a sportsbook bet and they’ll show up here.'}
        </p>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row-head">
            <span>Game</span>
            <span className="ledger-num">Bet</span>
            <span className="ledger-num">Multiplier</span>
            <span className="ledger-num">Payout</span>
            <span className="ledger-num">Profit</span>
            <span className="ledger-result">Result</span>
          </div>
          {shown.map((e) => (
            <FeedRow key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A side-of-the-house summary card: at a glance, did the casino (or the
 *  sportsbook) win? Shows that side's net figure (green up / red down), its
 *  win–loss record, and how much was wagered. */
function SideCard({ label, hint, entries }: { label: string; hint: string; entries: BetRow[] }) {
  const s = summarize(entries)
  const empty = entries.length === 0
  const tone = empty ? '' : s.net > 0 ? 'is-win' : s.net < 0 ? 'is-loss' : ''
  return (
    <div className="mybets-side">
      <div className="mybets-side-head">
        <span className="mybets-side-name">{label}</span>
        <span className="mybets-side-count">
          {entries.length} {entries.length === 1 ? 'bet' : 'bets'}
        </span>
      </div>
      <span className={`mybets-side-net ${tone}`}>
        {empty ? '—' : `${s.net > 0 ? '+' : ''}${formatMoney(s.net)}`}
      </span>
      <span className="mybets-side-meta">
        {empty ? hint : `${s.wins}–${s.losses} record · ${formatMoney(s.wagered)} wagered`}
      </span>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'win' | 'loss'
}) {
  return (
    <div className="mybets-fig">
      <span className="mybets-fig-label">{label}</span>
      <span className={`mybets-fig-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      <span className="mybets-fig-hint">{hint}</span>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'win' | 'loss' }) {
  return (
    <div className="ledger-stat">
      <span className="ledger-stat-label">{label}</span>
      <span className={`ledger-stat-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
    </div>
  )
}

const RESULT_LABEL: Record<BetRow['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  push: 'Push',
  void: 'Void',
}

function FeedRow({ e }: { e: BetRow }) {
  const push = e.outcome === 'push' || e.outcome === 'void'
  const tone = push ? 'is-push' : e.profit > 0 ? 'is-win' : 'is-loss'
  const payout = e.stake + e.profit // total returned to the player
  return (
    <div className={`ledger-row ${tone}`}>
      <span className="ledger-game">{e.game}</span>
      <span className="ledger-num">{formatMoney(e.stake)}</span>
      <span className="ledger-num">{e.multiplier > 0 ? `${e.multiplier.toFixed(2)}×` : '—'}</span>
      <span className="ledger-num">{formatMoney(payout)}</span>
      <span className={`ledger-num ledger-profit ${tone}`}>
        {push ? '—' : `${e.profit > 0 ? '+' : ''}${formatMoney(e.profit)}`}
      </span>
      <span className={`ledger-result ${tone}`}>{RESULT_LABEL[e.outcome]}</span>
    </div>
  )
}

// summarize() / byGame() / isSportsbook() / Side / SIDE_LABEL now live in
// ./ledger-stats.js, shared with the manager's player lookup.
