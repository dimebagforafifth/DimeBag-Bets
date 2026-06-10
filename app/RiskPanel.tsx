import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  availableCredit,
  membersByRole,
  setActive,
  setBettingLocked,
  setBookBettingLocked,
  setCreditLimit,
  bookPending,
  type Member,
  type Org,
} from '../org/index.js'
import { formatMoney, toCents, toSignedCents } from '../games/shared/money.js'
import { getBook, getBookVersion, listPlayers, subscribeBook } from './book-store.js'
import { getBookLedger, subscribeBookLedger } from './book-ledger.js'
import { getExposureByGame, subscribeExposure } from './exposure.js'
import { toBetRows } from './ledger-stats.js'
import { bookHold, holdByGame, winnersLosers, checkAlerts, type Standing } from './risk.js'
import { adjustFigure, auditedMutate } from './manager-actions.js'
import {
  getRiskThresholds,
  getSettingsVersion,
  setRiskCreditUtil,
  setRiskExposureCap,
  subscribeSettings,
} from './settings-store.js'
import './risk-panel.css'
import './risk-actions.css'

/**
 * Risk & exposure dashboard (CLAUDE.md §4) — the operator's read on the book: live
 * exposure (book-wide + per game), realized hold (book-wide + per game), the biggest
 * winners/losers, and configurable threshold alerts. Reads the durable ledger + the org
 * + the live exposure store; the read side moves no money.
 *
 * The "Actions" area is the write side: per-player credit/suspend/lock quick levers, a
 * book-wide freeze, and an audited manual figure adjustment. EVERY write routes through
 * the audited/org path (`auditedMutate` for org setters, `adjustFigure` for money) —
 * never a direct balance assignment.
 */
export function RiskPanel() {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const exposureByGame = useSyncExternalStore(subscribeExposure, getExposureByGame, getExposureByGame)
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeSettings, getSettingsVersion)

  const rows = useMemo(() => toBetRows(log), [log])
  const org = getBook()
  const hold = bookHold(rows)
  const games = holdByGame(rows)
  const { winners, losers } = winnersLosers(org)
  const exposure = bookPending(org, org.managerId)
  const t = getRiskThresholds()
  const alerts = checkAlerts(org, t, formatMoney, exposure)

  return (
    <section className="risk">
      <div className="risk-head">
        <h2 className="risk-title">Risk &amp; exposure</h2>
        <p className="risk-sub">
          Live exposure, realized hold, winners/losers, and alerts. Hold/handle reflect the most
          recent settled bets.
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="risk-alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`risk-alert is-${a.severity}`}>
              ⚠ {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="risk-stats">
        <Stat label="Live exposure" value={formatMoney(exposure)} hint="At risk in open bets" />
        <Stat label="Handle" value={formatMoney(hold.handle)} hint={`${hold.bets} settled bets`} />
        <Stat
          label="Book net"
          value={`${hold.bookNet > 0 ? '+' : ''}${formatMoney(hold.bookNet)}`}
          tone={hold.bookNet > 0 ? 'up' : hold.bookNet < 0 ? 'down' : undefined}
        />
        <Stat
          label="Hold"
          value={`${(hold.hold * 100).toFixed(1)}%`}
          tone={hold.hold > 0 ? 'up' : hold.hold < 0 ? 'down' : undefined}
          hint="Book P&L ÷ handle"
        />
      </div>

      {exposureByGame.length > 0 && (
        <>
          <h3 className="risk-section">Live exposure by game</h3>
          <div className="risk-exp">
            <div className="risk-exrow is-head">
              <span>Game</span>
              <span className="risk-num">Open</span>
            </div>
            {exposureByGame.map((g) => (
              <div key={g.key} className="risk-exrow">
                <span className="risk-game-name">{g.name}</span>
                <span className="risk-num">{formatMoney(g.open)}</span>
              </div>
            ))}
            <div className="risk-exrow is-total">
              <span>Total open</span>
              <span className="risk-num">
                {formatMoney(exposureByGame.reduce((sum, g) => sum + g.open, 0))}
              </span>
            </div>
          </div>
        </>
      )}

      {games.length > 0 && (
        <>
          <h3 className="risk-section">By game (realized hold)</h3>
          <div className="risk-games">
            <div className="risk-grow is-head">
              <span>Game</span>
              <span className="risk-num">Bets</span>
              <span className="risk-num">Handle</span>
              <span className="risk-num">Book net</span>
              <span className="risk-num">Hold</span>
            </div>
            {games.map((g) => (
              <div key={g.key} className="risk-grow">
                <span className="risk-game-name">{g.name}</span>
                <span className="risk-num">{g.bets}</span>
                <span className="risk-num">{formatMoney(g.handle)}</span>
                <span className={`risk-num ${g.bookNet > 0 ? 'is-up' : g.bookNet < 0 ? 'is-down' : ''}`}>
                  {g.bookNet > 0 ? '+' : ''}
                  {formatMoney(g.bookNet)}
                </span>
                <span className={`risk-num ${g.hold > 0 ? 'is-up' : g.hold < 0 ? 'is-down' : ''}`}>
                  {(g.hold * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="risk-cols">
        <Leaderboard title="Top winners" rows={winners} tone="up" empty="No players up." />
        <Leaderboard title="Top losers" rows={losers} tone="down" empty="No players down." />
      </div>

      <h3 className="risk-section">Alert thresholds</h3>
      <Thresholds creditUtil={t.creditUtil} exposureCap={t.exposureCap} />

      <Actions org={org} winners={winners} losers={losers} />
    </section>
  )
}

/* ------------------------------- actions ------------------------------- */

/**
 * Operator risk ACTIONS — the write side of the read-only dashboard. Every lever here
 * routes through the audited/org path (never a direct balance write): per-player credit
 * / suspend / lock via org setters inside `auditedMutate`, a book-wide freeze via
 * `setBookBettingLocked`, and a manual figure adjustment via the audited `adjustFigure`.
 */
function Actions({ org, winners, losers }: { org: Org; winners: Standing[]; losers: Standing[] }) {
  // Surface the biggest winners + losers as quick-action rows (deduped, order preserved).
  const ids = new Set<string>()
  const focus: Member[] = []
  for (const s of [...losers, ...winners]) {
    if (ids.has(s.id)) continue
    ids.add(s.id)
    const m = org.members[s.id]
    if (m) focus.push(m)
  }

  return (
    <div className="risk-actions">
      <h3 className="risk-section">Actions</h3>
      <p className="risk-act-note">
        Operator levers — every change is audited. Credit, suspend, and lock take effect on the
        next bet; a figure adjustment posts to the book ledger.
      </p>

      <FreezeBook org={org} />

      {focus.length > 0 && (
        <>
          <h3 className="risk-section">Quick actions</h3>
          <div className="risk-people">
            {focus.map((m) => (
              <PlayerRow key={m.id} org={org} member={m} />
            ))}
          </div>
        </>
      )}

      <h3 className="risk-section">Manual adjustment</h3>
      <AdjustWidget />
    </div>
  )
}

/** Book-wide freeze: lock/unlock betting on every player beneath the manager, showing
 *  the live locked count. Routes through `setBookBettingLocked` inside `auditedMutate`. */
function FreezeBook({ org }: { org: Org }) {
  const players = membersByRole(org, 'player')
  const locked = players.filter((p) => p.account.bettingLocked).length
  const total = players.length
  const allLocked = total > 0 && locked === total
  const [err, setErr] = useState('')

  function freeze(lock: boolean) {
    setErr('')
    try {
      auditedMutate((o) => setBookBettingLocked(o, o.managerId, lock), 'risk')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not change the book lock')
    }
  }

  return (
    <div className="risk-freeze">
      <div className="risk-freeze-info">
        <span className="risk-freeze-label">Freeze book</span>
        <span className={`risk-freeze-count ${locked > 0 ? 'is-locked' : ''}`}>
          {locked} of {total} players locked
        </span>
        {err && <span className="risk-feedback is-err">{err}</span>}
      </div>
      <button
        type="button"
        className="risk-btn is-warn"
        onClick={() => freeze(true)}
        disabled={allLocked}
      >
        Freeze all
      </button>
      <button
        type="button"
        className="risk-btn"
        onClick={() => freeze(false)}
        disabled={locked === 0}
      >
        Unfreeze all
      </button>
    </div>
  )
}

/** One winner/loser row with inline quick actions: suspend/activate, lock/unlock, and an
 *  expandable credit-limit editor. All through org setters inside `auditedMutate`. */
function PlayerRow({ org, member }: { org: Org; member: Member }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const acct = member.account
  const figure = acct.balance
  const isLocked = !!acct.bettingLocked

  function run(fn: (o: Org) => void) {
    setErr('')
    try {
      auditedMutate(fn, 'risk')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'action failed')
    }
  }

  return (
    <div className="risk-prow">
      <div className="risk-prow-main">
        <span className="risk-pname">{member.name}</span>
        <span className="risk-ptags">
          {!member.active && <span className="risk-tag is-suspended">Suspended</span>}
          {isLocked && <span className="risk-tag is-locked">Locked</span>}
        </span>
        <span className={`risk-pfigure ${figure > 0 ? 'is-up' : figure < 0 ? 'is-down' : ''}`}>
          {figure > 0 ? '+' : ''}
          {formatMoney(figure)}
        </span>
        <span className="risk-pbtns">
          <button
            type="button"
            className="risk-btn"
            onClick={() => run((o) => setBettingLocked(o, member.id, !isLocked))}
          >
            {isLocked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            className={`risk-btn ${member.active ? 'is-warn' : ''}`}
            onClick={() => run((o) => setActive(o, member.id, !member.active))}
          >
            {member.active ? 'Suspend' : 'Activate'}
          </button>
          <button type="button" className="risk-btn" onClick={() => setOpen((v) => !v)}>
            Credit
          </button>
        </span>
      </div>
      {open && (
        <CreditEdit
          org={org}
          member={member}
          onApply={(cents) => run((o) => setCreditLimit(o, member.id, cents))}
        />
      )}
      {err && <span className="risk-feedback is-err">{err}</span>}
    </div>
  )
}

/** Inline credit-limit editor (coins, no "$" in the meta so it reads as points). The
 *  apply itself runs through `setCreditLimit` via the parent's audited `onApply`. */
function CreditEdit({
  org,
  member,
  onApply,
}: {
  org: Org
  member: Member
  onApply: (cents: number) => void
}) {
  const [val, setVal] = useState(String(member.account.creditLimit / 100))
  const headroom = availableCredit(org, member.id) // what's still grantable on this node
  function commit() {
    const n = Number(val)
    if (Number.isFinite(n) && n >= 0) onApply(toCents(n))
  }
  return (
    <div className="risk-pedit">
      <span className="risk-pedit-label">Credit limit</span>
      <input
        className="risk-input is-amt"
        type="number"
        min="0"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button type="button" className="risk-btn is-primary" onClick={commit}>
        Set
      </button>
      <span className="risk-pedit-meta">
        now {formatMoney(member.account.creditLimit)} · {formatMoney(headroom)} grantable here
      </span>
    </div>
  )
}

/** Audited manual figure adjustment: pick a player, enter SIGNED coins (a debit is
 *  negative) + a reason → `adjustFigure(id, cents, reason, 'risk')`. Shows the ledger
 *  result. Uses `toSignedCents` so a debit is NOT clamped to zero (the documented bug). */
function AdjustWidget() {
  const players = listPlayers()
  const [id, setId] = useState('')
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const [ok, setOk] = useState('')
  const [err, setErr] = useState('')

  const coins = Number(amt)
  const ready = !!id && reason.trim() !== '' && Number.isFinite(coins) && coins !== 0

  function apply() {
    setOk('')
    setErr('')
    try {
      const entry = adjustFigure(id, toSignedCents(coins), reason.trim(), 'risk')
      const sign = entry.balanceDelta > 0 ? '+' : ''
      setOk(`${sign}${formatMoney(entry.balanceDelta)} → figure now ${formatMoney(entry.balanceAfter)}`)
      setAmt('')
      setReason('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'adjustment failed')
    }
  }

  return (
    <div className="risk-adjust">
      <div className="risk-adjust-row">
        <select
          className="risk-select"
          value={id}
          onChange={(e) => {
            setId(e.target.value)
            setOk('')
            setErr('')
          }}
        >
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="risk-input is-amt"
          type="number"
          placeholder="± coins"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
        />
        <input
          className="risk-input is-reason"
          type="text"
          placeholder="Reason (audited)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="button" className="risk-btn is-primary" onClick={apply} disabled={!ready}>
          Apply
        </button>
      </div>
      {ok && <span className="risk-feedback is-ok">{ok}</span>}
      {err && <span className="risk-feedback is-err">{err}</span>}
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="risk-stat">
      <span className="risk-stat-label">{label}</span>
      <span className={`risk-stat-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      {hint && <span className="risk-stat-hint">{hint}</span>}
    </div>
  )
}

function Leaderboard({ title, rows, tone, empty }: { title: string; rows: Standing[]; tone: 'up' | 'down'; empty: string }) {
  return (
    <div className="risk-board">
      <h3 className="risk-section">{title}</h3>
      {rows.length === 0 ? (
        <p className="risk-empty">{empty}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="risk-brow">
            <span className="risk-bname">{r.name}</span>
            <span className={`risk-num is-${tone}`}>
              {r.figure > 0 ? '+' : ''}
              {formatMoney(r.figure)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function Thresholds({ creditUtil, exposureCap }: { creditUtil: number; exposureCap: number | null }) {
  const [pct, setPct] = useState(String(Math.round(creditUtil * 100)))
  const [cap, setCap] = useState(exposureCap == null ? '' : String(exposureCap / 100))
  function commitPct() {
    const n = Number(pct)
    if (Number.isFinite(n) && n > 0 && n <= 100) setRiskCreditUtil(n / 100)
    else setPct(String(Math.round(getRiskThresholds().creditUtil * 100)))
  }
  function commitCap() {
    if (cap.trim() === '') return setRiskExposureCap(null)
    const n = Number(cap)
    if (Number.isFinite(n) && n >= 0) setRiskExposureCap(toCents(n))
    else {
      const live = getRiskThresholds().exposureCap
      setCap(live == null ? '' : String(live / 100))
    }
  }
  return (
    <div className="risk-thresholds">
      <label className="risk-th">
        <span>Credit-used alert at</span>
        <input
          className="risk-th-input"
          type="number"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          onBlur={commitPct}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span>%</span>
      </label>
      <label className="risk-th">
        <span>Book exposure cap $</span>
        <input
          className="risk-th-input"
          type="number"
          placeholder="off"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          onBlur={commitCap}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
    </div>
  )
}
