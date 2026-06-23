import { useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { availableToWager } from '../../../core/index.js'
import { creditUtilization, getMember, setBettingLocked, type Member, type Org } from '../index.js'
import { subscribeBookLedger, getBookLedger } from '../../../app/book-ledger.js'
import { summarize, byGame, isSportsbook, toBetRows, type BetRow } from '../../../app/ledger-stats.js'
import { formatMoney } from '../../../games/shared/money.js'
import './player-lookup.css'

/**
 * Player lookup for the manager (CLAUDE.md §2). A search to pull up any player,
 * then a profile that combines their ACCOUNT standing (figure, credit, limits,
 * status) with their PLAY history from the durable book ledger (total profit, win
 * rate, what they've been playing, recent bets) — the "who is this player and how
 * are they doing" view a bookie reaches for. Read-mostly, with the two quick
 * levers a manager wants on hand: Play as and Lock betting.
 */

const RESULT_LABEL: Record<BetRow['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  push: 'Push',
  void: 'Void',
}

/* -------------------------------- search --------------------------------- */

/** Type-ahead over the book's players; selecting one opens their profile. An
 *  ARIA combobox: arrow keys move the highlight, Enter selects, Escape clears.
 *  `restrictTo`, if given, limits matches to those player ids (agent scoping). */
export function PlayerSearch({
  org,
  onSelect,
  restrictTo,
}: {
  org: Org
  onSelect: (id: string) => void
  restrictTo?: (playerId: string) => boolean
}) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0) // highlighted suggestion index
  const query = q.trim().toLowerCase()
  // Computed inline (not memoised): the book is mutated IN PLACE, so a memo keyed
  // on the stable `org` ref could serve stale matches across an add/remove/rename.
  // Progressive type-ahead matched by the START of the name only: type the first
  // letter and just the names that BEGIN with it show, narrowing as you type more.
  const matches = query
    ? Object.values(org.members)
        .filter(
          (m) =>
            m.role === 'player' &&
            m.name.toLowerCase().startsWith(query) &&
            (!restrictTo || restrictTo(m.id)),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8)
    : []
  const active = matches.length ? Math.min(hi, matches.length - 1) : 0
  const open = query.length > 0

  function choose(id: string) {
    onSelect(id)
    setQ('')
    setHi(0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQ('')
      return
    }
    if (!matches.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => (Math.min(h, matches.length - 1) + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => (Math.min(h, matches.length - 1) - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(matches[active].id)
    }
  }

  return (
    <div className="pl-search">
      <input
        className="pl-search-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="pl-suggest-list"
        aria-autocomplete="list"
        aria-activedescendant={matches.length ? `pl-opt-${matches[active].id}` : undefined}
        aria-label="Find a player"
        placeholder="Find a player…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setHi(0)
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="pl-suggest" id="pl-suggest-list" role="listbox" aria-label="Player results">
          {matches.length === 0 ? (
            <li className="pl-suggest-empty">No players match “{q.trim()}”.</li>
          ) : (
            matches.map((p, i) => (
              <li
                key={p.id}
                id={`pl-opt-${p.id}`}
                role="option"
                aria-selected={i === active}
                className={`pl-suggest-item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus on the input through the click
                  choose(p.id)
                }}
              >
                <span className="pl-suggest-name">{p.name}</span>
                <span className="pl-suggest-meta">
                  {p.parentId ? getMember(org, p.parentId).name : 'direct'}
                  {!p.active ? ' · suspended' : p.account.bettingLocked ? ' · locked' : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {open
          ? matches.length === 0
            ? 'No players match'
            : `${matches.length} ${matches.length === 1 ? 'player matches' : 'players match'}`
          : ''}
      </span>
    </div>
  )
}

/* -------------------------------- profile -------------------------------- */

export function PlayerProfile({
  org,
  member,
  currentPlayerId,
  run,
  onPlayAs,
}: {
  org: Org
  member: Member
  currentPlayerId: string | null
  run: (fn: () => void) => void
  onPlayAs?: (playerId: string) => void
}) {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const entries = useMemo(() => toBetRows(log, member.id), [log, member.id])
  const stats = useMemo(() => summarize(entries), [entries])
  const casino = useMemo(() => entries.filter((e) => !isSportsbook(e)), [entries])
  const sportsbook = useMemo(() => entries.filter((e) => isSportsbook(e)), [entries])
  const games = useMemo(() => byGame(entries), [entries])
  const recent = entries.slice(0, 12)

  const acct = member.account
  const locked = !!acct.bettingLocked
  const util = creditUtilization(member)
  const parent = member.parentId ? getMember(org, member.parentId) : null
  const isCurrent = member.id === currentPlayerId
  const status = !member.active ? 'suspended' : locked ? 'locked' : 'active'
  const top = games[0]

  return (
    <div className="pl-profile">
      <header className="pl-head">
        <div className="pl-head-id">
          <span className="org-badge is-player">Player</span>
          <h2 className="pl-name">{member.name}</h2>
          <span className={`pl-statuspill is-${status}`}>{status}</span>
        </div>
        <div className="pl-head-actions">
          {onPlayAs && member.active && !isCurrent && (
            <button className="org-toggle is-play" onClick={() => onPlayAs(member.id)}>
              Play as
            </button>
          )}
          <button
            className={`org-toggle ${locked ? 'is-locked' : ''}`}
            onClick={() => run(() => setBettingLocked(org, member.id, !locked))}
          >
            {locked ? 'Unlock betting' : 'Lock betting'}
          </button>
        </div>
      </header>
      <p className="pl-sub">
        {parent ? `Reports to ${parent.name}` : 'Direct under the manager'} ·{' '}
        {entries.length} {entries.length === 1 ? 'bet' : 'bets'} on record
      </p>

      <h3 className="pl-section">Account</h3>
      <div className="pl-figs">
        <Fig
          label="Figure"
          value={formatMoney(acct.balance)}
          tone={acct.balance > 0 ? 'win' : acct.balance < 0 ? 'loss' : undefined}
          hint={acct.balance < 0 ? 'Owes the book' : acct.balance > 0 ? 'Book owes them' : 'Even'}
        />
        <Fig label="To wager" value={formatMoney(availableToWager(acct))} />
        <Fig label="At risk" value={formatMoney(acct.pending)} hint="On open bets" />
        <Fig label="Credit limit" value={formatMoney(acct.creditLimit)} />
        <Fig label="Max bet" value={acct.maxWager != null ? formatMoney(acct.maxWager) : '∞'} />
        <Fig
          label="Credit used"
          value={acct.creditLimit > 0 ? `${Math.round(util * 100)}%` : '—'}
          tone={util >= 0.8 ? 'loss' : undefined}
        />
      </div>

      <h3 className="pl-section">Play · on record</h3>
      {entries.length === 0 ? (
        <p className="pl-empty">No bets on record yet.</p>
      ) : (
        <>
          <div className="pl-figs">
            <Fig
              label="Net profit"
              value={`${stats.net > 0 ? '+' : ''}${formatMoney(stats.net)}`}
              tone={stats.net > 0 ? 'win' : stats.net < 0 ? 'loss' : undefined}
              big
            />
            <Fig label="Bets" value={String(stats.bets)} />
            <Fig label="Wagered" value={formatMoney(stats.wagered)} />
            <Fig label="Win rate" value={`${stats.winRate}%`} />
            <Fig label="Record" value={`${stats.wins}–${stats.losses}`} />
            <Fig
              label="Biggest win"
              value={stats.biggestWin > 0 ? `+${formatMoney(stats.biggestWin)}` : '—'}
              tone={stats.biggestWin > 0 ? 'win' : undefined}
            />
            <Fig label="Best multiplier" value={stats.bestMult > 1 ? `${stats.bestMult.toFixed(2)}×` : '—'} />
            <Fig label="Most played" value={top ? top.name : '—'} />
          </div>

          <div className="pl-sides">
            <SideStat label="Casino" entries={casino} />
            <SideStat label="Sportsbook" entries={sportsbook} />
          </div>

          {games.length > 0 && (
            <>
              <h3 className="pl-section">What they’ve been playing</h3>
              <div className="pl-table">
                <div className="pl-row is-head">
                  <span>Game</span>
                  <span className="pl-num">Bets</span>
                  <span className="pl-num">Wagered</span>
                  <span className="pl-num">Net</span>
                </div>
                {games.map((g) => (
                  <div key={g.key} className="pl-row">
                    <span className="pl-game-name">{g.name}</span>
                    <span className="pl-num">{g.bets}</span>
                    <span className="pl-num">{formatMoney(g.wagered)}</span>
                    <span className={`pl-num ${g.net > 0 ? 'is-win' : g.net < 0 ? 'is-loss' : ''}`}>
                      {g.net > 0 ? '+' : ''}
                      {formatMoney(g.net)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="pl-section">Recent bets</h3>
          <div className="pl-table">
            <div className="pl-row pl-feed-row is-head">
              <span>Game</span>
              <span className="pl-num">Bet</span>
              <span className="pl-num">Mult</span>
              <span className="pl-num">Profit</span>
              <span className="pl-result">Result</span>
            </div>
            {recent.map((e) => {
              const push = e.outcome === 'push' || e.outcome === 'void'
              const t = push ? 'is-push' : e.profit > 0 ? 'is-win' : 'is-loss'
              return (
                <div key={e.id} className={`pl-row pl-feed-row ${t}`}>
                  <span className="pl-game-name">{e.game}</span>
                  <span className="pl-num">{formatMoney(e.stake)}</span>
                  <span className="pl-num">{e.multiplier > 0 ? `${e.multiplier.toFixed(2)}×` : '—'}</span>
                  <span className={`pl-num ${t}`}>
                    {push ? '—' : `${e.profit > 0 ? '+' : ''}${formatMoney(e.profit)}`}
                  </span>
                  <span className={`pl-result ${t}`}>{RESULT_LABEL[e.outcome]}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* --------------------------------- bits ---------------------------------- */

function Fig({
  label,
  value,
  hint,
  tone,
  big,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'win' | 'loss'
  big?: boolean
}) {
  return (
    <div className={`pl-fig ${big ? 'is-big' : ''}`}>
      <span className="pl-fig-label">{label}</span>
      <span className={`pl-fig-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      {hint && <span className="pl-fig-hint">{hint}</span>}
    </div>
  )
}

/** Casino-vs-sportsbook net for the profile — did this side win for them? */
function SideStat({ label, entries }: { label: string; entries: BetRow[] }) {
  const s = summarize(entries)
  const empty = entries.length === 0
  const tone = empty ? '' : s.net > 0 ? 'is-win' : s.net < 0 ? 'is-loss' : ''
  return (
    <div className="pl-side">
      <span className="pl-side-name">{label}</span>
      <span className={`pl-side-net ${tone}`}>
        {empty ? '—' : `${s.net > 0 ? '+' : ''}${formatMoney(s.net)}`}
      </span>
      <span className="pl-side-meta">
        {empty ? 'No bets' : `${s.wins}–${s.losses} · ${formatMoney(s.wagered)} wagered`}
      </span>
    </div>
  )
}
