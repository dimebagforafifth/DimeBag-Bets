import { useSyncExternalStore } from 'react'
import { subscribeLedger, getLedger, clearLedger, type FeedEntry } from './ledger-store.js'
import { formatMoney } from '../games/shared/money.js'
import './ledger.css'

/**
 * The ledger: resolved bets with a running summary, newest first. Reads the
 * shared ledger store (fed by core's resolution event). When a `gameKey` is
 * given it shows only that game's bets, so each casino game keeps its own
 * separate ledger; with no key it's the casino-wide log (the lobby). An
 * `accountId` scopes it to the player currently being played as — so switching
 * players shows that player's history, not everyone's mixed together.
 */
export function Ledger({
  gameKey,
  gameName,
  accountId,
}: {
  gameKey?: string
  gameName?: string
  accountId?: string
}) {
  const all = useSyncExternalStore(subscribeLedger, getLedger, getLedger)
  const entries = all.filter(
    (e) => (!gameKey || e.gameKey === gameKey) && (!accountId || e.accountId === accountId),
  )
  const scope = gameName ?? 'Casino'

  const wagered = entries.reduce((s, e) => s + e.stake, 0)
  const net = entries.reduce((s, e) => s + e.profit, 0)
  const wins = entries.filter((e) => e.profit > 0).length
  const decided = entries.filter((e) => e.outcome !== 'push' && e.outcome !== 'void').length
  const winRate = decided ? Math.round((wins / decided) * 100) : 0

  return (
    <section className="ledger">
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{gameKey ? `${scope} ledger` : 'Casino ledger'}</h2>
          <p className="ledger-sub">
            {gameKey
              ? `Your ${scope} bets this session.`
              : 'Every bet you’ve placed this session, across all games.'}
          </p>
        </div>
        {entries.length > 0 && (
          <button className="ledger-clear" onClick={clearLedger}>
            Clear
          </button>
        )}
      </div>

      <div className="ledger-summary">
        <Summary label="Bets" value={String(entries.length)} />
        <Summary label="Wagered" value={formatMoney(wagered)} />
        <Summary
          label="Net profit"
          value={`${net > 0 ? '+' : ''}${formatMoney(net)}`}
          tone={net > 0 ? 'win' : net < 0 ? 'loss' : undefined}
        />
        <Summary label="Win rate" value={`${winRate}%`} />
      </div>

      {entries.length === 0 ? (
        <p className="ledger-empty">
          {gameKey
            ? `No ${scope} bets yet — play a round and they’ll show up here.`
            : 'No bets yet — play a game and they’ll show up here.'}
        </p>
      ) : (
        <div className={`ledger-table ${gameKey ? 'is-scoped' : ''}`}>
          <div className="ledger-row ledger-row-head">
            {!gameKey && <span>Game</span>}
            <span className="ledger-num">Bet</span>
            <span className="ledger-num">Multiplier</span>
            <span className="ledger-num">Payout</span>
            <span className="ledger-num">Profit</span>
            <span className="ledger-result">Result</span>
          </div>
          {entries.map((e) => (
            <LedgerRow key={e.id} e={e} showGame={!gameKey} />
          ))}
        </div>
      )}
    </section>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'win' | 'loss' }) {
  return (
    <div className="ledger-stat">
      <span className="ledger-stat-label">{label}</span>
      <span className={`ledger-stat-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
    </div>
  )
}

const RESULT_LABEL: Record<FeedEntry['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  push: 'Push',
  void: 'Void',
}

function LedgerRow({ e, showGame }: { e: FeedEntry; showGame: boolean }) {
  const push = e.outcome === 'push' || e.outcome === 'void'
  const tone = push ? 'is-push' : e.profit > 0 ? 'is-win' : 'is-loss'
  const payout = e.stake + e.profit // total returned to the player
  return (
    <div className={`ledger-row ${tone}`}>
      {showGame && <span className="ledger-game">{e.game}</span>}
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
