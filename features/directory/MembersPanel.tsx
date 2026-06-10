/**
 * Members — a flat directory of everyone on the book (super-agents, agents,
 * players) with their name + role. Search, filter by role, and click a name to
 * open a rich read-only profile: where they sit in the tree, their standing, and —
 * for players — a betting summary + recent activity; for agents, their downline.
 *
 * Read-only: this panel never moves money (edits live in the Agents tile). All coins
 * are integer cents shown via formatMoney.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  directReports,
  bookFigure,
  playerCount,
  availableCredit,
  type Member,
  type Org,
  type Role,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { getBookLedger, subscribeBookLedger, getBookLedgerVersion } from '../../app/book-ledger.js'
import { toBetRows, summarize } from '../../app/ledger-stats.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell, Figure, ChipBar } from '../_desk/shared.js'
import { InfoDot } from '../_desk/Tooltip.js'
import './directory.css'

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Super-Agent',
  agent: 'Agent',
  player: 'Player',
}

type RoleFilter = 'all' | 'subagent' | 'agent' | 'player'
const ROLE_FILTERS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'subagent', label: 'Super-Agents' },
  { value: 'agent', label: 'Agents' },
  { value: 'player', label: 'Players' },
]

export function MembersPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const lv = useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion)
  const book = getBook()
  const ledger = getBookLedger()

  const [query, setQuery] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Everyone except the book root, newest-tier first then by name.
  const members = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(book.members)
      .filter((m) => m.role !== 'manager')
      .filter((m) => (role === 'all' ? true : m.role === role))
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, bv, query, role])

  const selected = selectedId ? book.members[selectedId] : null

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Everyone on the book. Search or filter by role, then click a name to open their profile.
        </p>
      </header>

      <div className="mdsk-toolbar">
        <div className="mdsk-search">
          <input
            className="mdsk-search-input"
            type="search"
            placeholder="Search members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ChipBar value={role} options={ROLE_FILTERS} onChange={setRole} label="Filter by role" />
      </div>

      <div className="dir-layout">
        <div className="dir-list feat-card" role="list" aria-label="Members">
          {members.length === 0 ? (
            <p className="feat-empty">No members match.</p>
          ) : (
            members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="listitem"
                className={`dir-row ${m.id === selectedId ? 'is-sel' : ''}`}
                aria-pressed={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              >
                <span className={`dir-badge is-${m.role}`}>{ROLE_LABEL[m.role]}</span>
                <span className="dir-name">
                  {m.name}
                  {!m.active && <span className="dir-tag">inactive</span>}
                </span>
                <span className="dir-fig">
                  <Figure cents={m.account.balance} />
                </span>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <MemberProfile key={selected.id + ':' + lv} member={selected} org={book} ledger={ledger} />
        ) : (
          <p className="feat-empty dir-empty">Select a member to see their profile.</p>
        )}
      </div>
    </PanelShell>
  )
}

function MemberProfile({
  member,
  org,
  ledger,
}: {
  member: Member
  org: Org
  ledger: ReturnType<typeof getBookLedger>
}) {
  const isPlayer = member.role === 'player'
  const acct = member.account
  const available = acct.creditLimit + acct.balance - acct.pending

  // Upline chain (top-down), e.g. Your Book › North Region › East Desk.
  const upline: Member[] = []
  let cur: Member | undefined = member
  while (cur?.parentId) {
    cur = org.members[cur.parentId]
    if (cur) upline.unshift(cur)
  }

  const recent = ledger.filter((e) => e.accountId === member.id).slice(0, 8)
  const stats = isPlayer ? summarize(toBetRows(ledger, member.id)) : null
  const reports = isPlayer ? [] : directReports(org, member.id)

  return (
    <div className="dir-profile feat-card">
      <div className="feat-head">
        <h3 className="feat-h2">{member.name}</h3>
        <span className={`dir-badge is-${member.role}`}>{ROLE_LABEL[member.role]}</span>
        {!member.active && <span className="dir-tag">inactive</span>}
        {acct.bettingLocked && <span className="dir-tag is-lock">locked</span>}
      </div>

      {upline.length > 0 && (
        <p className="dir-upline">
          {upline.map((u, i) => (
            <span key={u.id}>
              {i > 0 && <span className="dir-sep"> › </span>}
              {u.name}
            </span>
          ))}
          <span className="dir-sep"> › </span>
          <strong>{member.name}</strong>
        </p>
      )}

      <section className="feat-kpis" aria-label="Standing">
        <div className="feat-kpi">
          <span className="feat-label">
            Balance <InfoDot id="figure" />
          </span>
          <strong className={acct.balance < 0 ? 'feat-down' : 'feat-up'}>
            <Figure cents={acct.balance} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">
            Exposure <InfoDot id="exposure" />
          </span>
          <strong>{formatMoney(acct.pending)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">
            Credit limit <InfoDot id="credit-limit" />
          </span>
          <strong>{formatMoney(acct.creditLimit)}</strong>
        </div>
        {isPlayer ? (
          <div className="feat-kpi">
            <span className="feat-label">
              Available <InfoDot id="available" />
            </span>
            <strong>{formatMoney(available)}</strong>
          </div>
        ) : (
          <>
            <div className="feat-kpi">
              <span className="feat-label">Downline net</span>
              <strong>{formatMoney(bookFigure(org, member.id))}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Players under</span>
              <strong>{playerCount(org, member.id)}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Credit to grant</span>
              <strong>{formatMoney(availableCredit(org, member.id))}</strong>
            </div>
          </>
        )}
      </section>

      {isPlayer && stats && (
        <section className="feat-card dir-sub" aria-label="Betting">
          <h4 className="feat-h2">Betting</h4>
          <div className="feat-kpis">
            <div className="feat-kpi">
              <span className="feat-label">Bets</span>
              <strong>{stats.bets}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Turnover</span>
              <strong>{formatMoney(stats.wagered)}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Net (player)</span>
              <strong className={stats.net < 0 ? 'feat-down' : 'feat-up'}>
                <Figure cents={stats.net} />
              </strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Win rate</span>
              <strong>{stats.winRate}%</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Biggest win</span>
              <strong>{formatMoney(stats.biggestWin)}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Best multi</span>
              <strong>{stats.bestMult ? `${stats.bestMult.toFixed(2)}×` : '—'}</strong>
            </div>
          </div>
        </section>
      )}

      {!isPlayer && reports.length > 0 && (
        <section className="feat-card dir-sub" aria-label="Direct reports">
          <h4 className="feat-h2">Direct reports ({reports.length})</h4>
          <ul className="feat-list">
            {reports.map((r) => (
              <li key={r.id}>
                <span>
                  <span className={`dir-badge is-${r.role}`}>{ROLE_LABEL[r.role]}</span> {r.name}
                </span>
                <Figure cents={r.account.balance} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="feat-card dir-sub" aria-label="Recent activity">
        <h4 className="feat-h2">Recent activity</h4>
        {recent.length === 0 ? (
          <p className="feat-empty">No ledger activity yet.</p>
        ) : (
          <table className="feat-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Detail</th>
                <th className="num">Δ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.seq}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>
                    <span className={`mdsk-pill is-${e.kind}`}>{e.kind}</span>
                  </td>
                  <td className="mdsk-meta">
                    {e.kind === 'resolve'
                      ? `${(e.meta?.gameName as string) ?? (e.meta?.game as string) ?? 'bet'}${e.outcome ? ` · ${e.outcome}` : ''}`
                      : (e.reason ?? '—')}
                  </td>
                  <td className="num">
                    <Figure cents={e.balanceDelta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
