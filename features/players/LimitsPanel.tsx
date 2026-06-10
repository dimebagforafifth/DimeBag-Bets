import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import {
  setMaxWager,
  setMinWager,
  setCreditLimit,
  setMaxPayout,
  setBettingLocked,
  availableCredit,
  creditUtilization,
} from '../../org/index.js'
import { availableToWager, maxBet } from '../../core/index.js'
import type { Member } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import './players.css'
import './limits.css'

/**
 * Limits — the per-player control desk. Search a player, then pull every risk
 * lever the operator has on that head, all routed through `mutateBook` + the org
 * setters (the core enforces them on placement / settlement):
 *   - credit limit (the primary lever — how far they may go down)
 *   - max / min single bet, max payout cap
 *   - a betting lock (no new action)
 * A read-only CURRENT LIMITS card shows the live figure and where they sit
 * against their line. Coins/points language only.
 */
export function LimitsPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [id, setId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const member = id ? org.members[id] : null
  const guard = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="feat">
      <PlayerSearch org={org} onSelect={setId} />
      {member && member.role === 'player' ? (
        <>
          {error && <p className="feat-err">{error}</p>}
          <div className="feat-card">
            <h3 className="feat-h">{member.name} · wager caps</h3>
            {/* The max-bet input MUST stay first with a "Set" button (panels.test). */}
            <CapField
              label="Max bet (coins)"
              value={member.account.maxWager}
              onSet={(c) => guard(() => mutateBook(() => setMaxWager(org, member.id, c)))}
            />
            <CapField
              label="Min bet (coins)"
              value={member.account.minWager}
              onSet={(c) => guard(() => mutateBook(() => setMinWager(org, member.id, c)))}
            />
            <CapField
              label="Max payout (coins)"
              value={member.account.maxPayout}
              onSet={(c) => guard(() => mutateBook(() => setMaxPayout(org, member.id, c)))}
            />
          </div>

          <div className="feat-card">
            <h3 className="feat-h">Credit line</h3>
            <CreditField
              value={member.account.creditLimit}
              headroom={availableCredit(org, member.parentId ?? org.managerId)}
              onSet={(c) => guard(() => mutateBook(() => setCreditLimit(org, member.id, c)))}
            />
            <LockRow
              locked={!!member.account.bettingLocked}
              onToggle={(locked) =>
                guard(() => mutateBook(() => setBettingLocked(org, member.id, locked)))
              }
            />
          </div>

          <CurrentLimits member={member} />
        </>
      ) : (
        <p className="feat-empty">Search a player to set their limits.</p>
      )}
    </div>
  )
}

/**
 * Read-only snapshot of where the player stands against every lever — the
 * operator's at-a-glance risk read for the selected head.
 */
function CurrentLimits({ member }: { member: Member }) {
  const a = member.account
  const util = creditUtilization(member)
  const atRisk = util >= 0.8
  return (
    <div className="feat-card">
      <h3 className="feat-h">Current limits</h3>
      <dl className="lim-grid">
        <Stat label="Credit limit" value={formatMoney(a.creditLimit)} />
        <Stat label="Balance" value={formatMoney(a.balance)} signed={a.balance} />
        <Stat label="Pending" value={formatMoney(a.pending)} />
        <Stat label="Available to wager" value={formatMoney(availableToWager(a))} />
        <Stat label="Max single bet" value={formatMoney(maxBet(a))} />
        <Stat label="Max bet cap" value={a.maxWager != null ? formatMoney(a.maxWager) : 'none'} />
        <Stat label="Min bet" value={a.minWager != null ? formatMoney(a.minWager) : 'none'} />
        <Stat label="Max payout" value={a.maxPayout != null ? formatMoney(a.maxPayout) : 'uncapped'} />
        <Stat
          label="Betting"
          value={a.bettingLocked ? 'locked' : 'open'}
          tone={a.bettingLocked ? 'down' : 'up'}
        />
        <div className="lim-stat">
          <dt className="lim-label">Credit used</dt>
          <dd className={`lim-value lim-num${atRisk ? ' is-risk' : ''}`}>
            {Math.round(util * 100)}%{atRisk ? ' · at risk' : ''}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Stat({
  label,
  value,
  signed,
  tone,
}: {
  label: string
  value: string
  /** When given, colours the number red (<0) / green (>0) — for the figure only. */
  signed?: number
  tone?: 'up' | 'down'
}) {
  const cls =
    tone === 'down'
      ? ' is-down'
      : tone === 'up'
        ? ' is-up'
        : signed != null && signed < 0
          ? ' is-down'
          : signed != null && signed > 0
            ? ' is-up'
            : ''
  return (
    <div className="lim-stat">
      <dt className="lim-label">{label}</dt>
      <dd className={`lim-value lim-num${cls}`}>{value}</dd>
    </div>
  )
}

/** Credit-limit editor — the primary risk lever, showing the player's parent's grant
 *  headroom (what setCreditLimit actually validates the new limit against). */
function CreditField({
  value,
  headroom,
  onSet,
}: {
  value: number
  headroom: number
  onSet: (cents: number) => void
}) {
  const [draft, setDraft] = useState(String(value / 100))
  return (
    <div className="feat-cap">
      <label className="feat-field">
        <span>Credit limit (coins)</span>
        <input
          className="feat-input"
          inputMode="decimal"
          placeholder="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">
        now {formatMoney(value)} · {formatMoney(headroom)} to grant
      </span>
      <button
        className="feat-btn is-primary"
        type="button"
        onClick={() => onSet(toCents(Number(draft) || 0))}
      >
        Set credit
      </button>
    </div>
  )
}

/** Betting lock — the operator's "no new action" switch. */
function LockRow({
  locked,
  onToggle,
}: {
  locked: boolean
  onToggle: (locked: boolean) => void
}) {
  return (
    <div className="lim-lock">
      <div className="lim-lock-state">
        <span className="lim-label">Betting</span>
        <span className={`lim-pill${locked ? ' is-locked' : ' is-open'}`}>
          {locked ? 'Locked' : 'Open'}
        </span>
      </div>
      <button
        className={`feat-btn${locked ? ' is-primary' : ''}`}
        type="button"
        onClick={() => onToggle(!locked)}
      >
        {locked ? 'Unlock' : 'Lock'}
      </button>
    </div>
  )
}

function CapField({
  label,
  value,
  onSet,
}: {
  label: string
  value: number | null | undefined
  onSet: (cents: number | null) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value / 100) : '')
  return (
    <div className="feat-cap">
      <label className="feat-field">
        <span>{label}</span>
        <input
          className="feat-input"
          inputMode="decimal"
          placeholder="none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">{value != null ? `now ${formatMoney(value)}` : 'no cap'}</span>
      <button
        className="feat-btn is-primary"
        type="button"
        onClick={() => onSet(draft.trim() === '' ? null : toCents(Number(draft) || 0))}
      >
        Set
      </button>
      <button
        className="feat-btn"
        type="button"
        onClick={() => {
          setDraft('')
          onSet(null)
        }}
      >
        Clear
      </button>
    </div>
  )
}
