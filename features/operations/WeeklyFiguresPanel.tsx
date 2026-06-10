/**
 * Weekly Figures — the operator's weekly win/loss + settle-review view. Read-only:
 * it moves NO money (the actual whole-book settle lives in the Settle panel). Built
 * entirely from existing read-only data:
 *  - each member's running figure is their core `account.balance` (coins won/lost
 *    this period); the book figure is the inverse sum;
 *  - clicking a player row drills into their account (credit limit, balance, pending,
 *    available-to-wager, credit utilization + an at-risk badge, settle obligation);
 *  - a SETTLEMENT PREVIEW (org.settlementStatement) lists who-owes-whom across the
 *    whole tree and the book net, so the operator can review before running settle;
 *  - book-level KPIs roll up what the book owes vs. what's owed to the book, plus the
 *    realized hold from the durable ledger when there's graded action.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { availableToWager, type Account } from '../../core/index.js'
import {
  creditUtilization,
  membersByRole,
  settlementStatement,
  type Member,
  type Role,
  type Settlement,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import {
  getBookLedger,
  getBookLedgerVersion,
  subscribeBookLedger,
} from '../../app/book-ledger.js'
import { toBetRows } from '../../app/ledger-stats.js'
import { bookHold } from '../../app/risk.js'
import { getRiskThresholds, subscribeSettings, getSettingsVersion } from '../../app/settings-store.js'
import { PanelShell } from './shared.js'
import './weekly-figures.css'

/** Settle obligation implied by a figure's sign — a label only (no money moves here). */
function obligation(figure: number): { text: string; tone: 'up' | 'down' | '' } {
  if (figure > 0) return { text: 'Pay player', tone: 'up' }
  if (figure < 0) return { text: 'Collect', tone: 'down' }
  return { text: 'Even', tone: '' }
}

/** Settlement line direction from the member's perspective (positive = owed up to them). */
function settleLine(amount: number): { text: string; tone: 'up' | 'down' | '' } {
  if (amount > 0) return { text: 'Owed', tone: 'up' }
  if (amount < 0) return { text: 'Owes', tone: 'down' }
  return { text: 'Even', tone: '' }
}

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Sub-agent',
  agent: 'Agent',
  player: 'Player',
}

const pct = (frac: number): string => `${Math.round(frac * 100)}%`

/** The operator's configured at-risk credit-utilization line (default 0.8 per the brief). */
function atRiskThreshold(): number {
  const t = getRiskThresholds().creditUtil
  return Number.isFinite(t) && t > 0 && t <= 1 ? t : 0.8
}

export function WeeklyFiguresPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const lv = useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion)
  // Re-render when the at-risk credit-util threshold changes (set from the Risk panel)
  // so the at-risk count, the "≥ X%" label, and the per-player badges stay current.
  const sv = useSyncExternalStore(subscribeSettings, getSettingsVersion)
  const [openId, setOpenId] = useState<string | null>(null)

  const view = useMemo(() => {
    const org = getBook()
    const riskAt = atRiskThreshold()
    const players = membersByRole(org, 'player')
      .map((p: Member) => ({ member: p, figure: p.account.balance }))
      .sort((a, b) => b.figure - a.figure)

    // A positive player figure means the book owes them (they're up) → the book is
    // down by that much. Book figure = the inverse sum.
    const bookFigure = players.reduce((s, p) => s - p.figure, 0)
    // What the book owes (players up) vs. what's owed to the book (players down).
    const bookOwes = players.reduce((s, p) => s + (p.figure > 0 ? p.figure : 0), 0)
    const owedToBook = players.reduce((s, p) => s + (p.figure < 0 ? -p.figure : 0), 0)
    const atRisk = players.filter((p) => creditUtilization(p.member) >= riskAt).length

    // Settlement preview across the whole tree (players + their agents up to the
    // manager): exactly what each member would square with the level above.
    const statement = settlementStatement(org)
      .slice()
      .sort((a, b) => b.amount - a.amount)
    // The book net = the manager's whole-operation figure (their settlement line).
    const manager = statement.find((s) => s.role === 'manager')
    const bookNet = manager ? manager.amount : bookFigure

    // Realized hold from the durable ledger — context only, when there's graded action.
    const hold = bookHold(toBetRows(getBookLedger()))

    return {
      players,
      bookFigure,
      bookOwes,
      owedToBook,
      atRisk,
      riskAt,
      up: players.filter((p) => p.figure > 0).length,
      down: players.filter((p) => p.figure < 0).length,
      statement,
      bookNet,
      hold,
    }
  }, [bv, lv, sv])

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        {/* No title here — the shell's WorkspaceContainer already shows the feature name. */}
        <p className="feat-sub">
          Each player&apos;s coins won/lost this period, the book&apos;s figure, and a
          settle preview. Read-only — running the settle lives in the Settle tile.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Figures summary">
        <div className="feat-kpi">
          <span className="feat-label">Book figure</span>
          <strong className={view.bookFigure < 0 ? 'feat-down' : 'feat-up'}>
            {formatMoney(view.bookFigure)}
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Book owes (players up)</span>
          <strong className={view.bookOwes > 0 ? 'feat-down' : ''}>
            {formatMoney(view.bookOwes)}
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Owed to book (players down)</span>
          <strong className={view.owedToBook > 0 ? 'feat-up' : ''}>
            {formatMoney(view.owedToBook)}
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players up</span>
          <strong>{view.up}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players down</span>
          <strong>{view.down}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">At credit risk (≥ {pct(view.riskAt)})</span>
          <strong className={view.atRisk > 0 ? 'feat-down' : ''}>{view.atRisk}</strong>
        </div>
        {view.hold.bets > 0 && (
          <div className="feat-kpi">
            <span className="feat-label">Realized hold</span>
            <strong className={view.hold.bookNet < 0 ? 'feat-down' : 'feat-up'}>
              {pct(view.hold.hold)}
            </strong>
          </div>
        )}
      </section>

      {view.players.length === 0 ? (
        <p className="feat-empty">No players on the book yet.</p>
      ) : (
        <table className="feat-table" aria-label="Player figures">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Figure</th>
              <th>Settle</th>
            </tr>
          </thead>
          <tbody>
            {view.players.map((p) => {
              const id = p.member.id
              const open = openId === id
              return (
                <PlayerRows
                  key={id}
                  member={p.member}
                  figure={p.figure}
                  open={open}
                  onToggle={() => setOpenId(open ? null : id)}
                  riskAt={view.riskAt}
                />
              )
            })}
          </tbody>
        </table>
      )}

      <section className="wf-section" aria-label="Settlement preview">
        <div className="wf-section-h">
          <h3 className="wf-section-title">Settlement preview</h3>
          <span
            className={`feat-num ${view.bookNet < 0 ? 'feat-down' : view.bookNet > 0 ? 'feat-up' : ''}`}
          >
            Settlement net {formatMoney(view.bookNet)}
          </span>
        </div>
        <table className="feat-table" aria-label="Settlement statement">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th className="num">Amount</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>
            {view.statement.map((s: Settlement) => {
              const line = settleLine(s.amount)
              return (
                <tr key={s.memberId}>
                  <td>{s.name}</td>
                  <td className="wf-role">{ROLE_LABEL[s.role]}</td>
                  <td className={`num ${line.tone ? `feat-${line.tone}` : ''}`}>
                    {formatMoney(s.amount)}
                  </td>
                  <td className={`wf-obligation ${line.tone ? `feat-${line.tone}` : ''}`}>
                    {line.text}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="wf-note">
          Preview only — the actual settle squares the <strong>whole book</strong> and
          resets figures. Run it from the Settle tile.
        </p>
      </section>
    </PanelShell>
  )
}

/** A player's main row plus, when open, its expanded account detail. */
function PlayerRows({
  member,
  figure,
  open,
  onToggle,
  riskAt,
}: {
  member: Member
  figure: number
  open: boolean
  onToggle: () => void
  riskAt: number
}) {
  const ob = obligation(figure)
  return (
    <>
      <tr
        className={`wf-row ${open ? 'is-open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <td>
          <span className="wf-caret" aria-hidden="true">
            ▸
          </span>{' '}
          {member.name}
        </td>
        <td className={`num ${figure < 0 ? 'feat-down' : figure > 0 ? 'feat-up' : ''}`}>
          {formatMoney(figure)}
        </td>
        <td className={`feat-label ${ob.tone ? `feat-${ob.tone}` : ''}`}>{ob.text}</td>
      </tr>
      {open && (
        <tr className="wf-detail">
          <td colSpan={3}>
            <AccountDetail account={member.account} member={member} riskAt={riskAt} />
          </td>
        </tr>
      )}
    </>
  )
}

/** The expanded per-player account breakdown — read-only analysis, no money moves. */
function AccountDetail({
  account,
  member,
  riskAt,
}: {
  account: Account
  member: Member
  riskAt: number
}) {
  const util = creditUtilization(member)
  const atRisk = util >= riskAt
  const ob = obligation(account.balance)
  return (
    <div className="wf-detail-grid">
      <div className="wf-stat">
        <span className="feat-label">Credit limit</span>
        <span className="wf-stat-val">{formatMoney(account.creditLimit)}</span>
      </div>
      <div className="wf-stat">
        <span className="feat-label">Balance (figure)</span>
        <span
          className={`wf-stat-val ${account.balance < 0 ? 'feat-down' : account.balance > 0 ? 'feat-up' : ''}`}
        >
          {formatMoney(account.balance)}
        </span>
      </div>
      <div className="wf-stat">
        <span className="feat-label">Pending (at risk)</span>
        <span className="wf-stat-val">{formatMoney(account.pending)}</span>
      </div>
      <div className="wf-stat">
        <span className="feat-label">Available to wager</span>
        <span className="wf-stat-val">{formatMoney(availableToWager(account))}</span>
      </div>
      <div className="wf-stat">
        <span className="feat-label">Credit utilization</span>
        <span className={`wf-badge ${atRisk ? 'is-risk' : ''}`}>
          {pct(util)}
          {atRisk ? ' · At risk' : ''}
        </span>
      </div>
      <div className="wf-stat">
        <span className="feat-label">Settle obligation</span>
        <span className={`wf-obligation ${ob.tone ? `feat-${ob.tone}` : ''}`}>
          {ob.text}
        </span>
      </div>
    </div>
  )
}
