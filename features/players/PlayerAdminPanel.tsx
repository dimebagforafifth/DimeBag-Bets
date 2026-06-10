import { useState, useSyncExternalStore } from 'react'
import { availableToWager } from '../../core/index.js'
import {
  setActive,
  setBettingLocked,
  setCreditLimit,
  setMaxWager,
  setMinWager,
  setMemberProfile,
  type Member,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import {
  getBookLedger,
  subscribeBookLedger,
  getBookLedgerVersion,
} from '../../app/book-ledger.js'
import { toBetRows, summarize } from '../../app/ledger-stats.js'
import type { LedgerEntry } from '../../ledger/index.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  playerRows,
  effectiveSegment,
  getSegmentOverride,
  setSegmentOverride,
  subscribeSegments,
  getSegmentsVersion,
  SEGMENTS,
  type Segment,
} from './directory.js'
import { agoLabel, dateLabel, signed } from './format.js'
import './players.css'

/**
 * Player Admin — accounts, standing & segments (CLAUDE.md §2). Search-first roster →
 * a deep per-player profile with inline status / segment / limit editing and a
 * bets · ledger · notes (CRM) history. Player-centric: no agent tree, no "reports to"
 * line anywhere. Renders only the body and manages its own list↔profile navigation; the
 * shell still owns the top-level back (onBack), declared for the Panel contract.
 */
export function PlayerAdminPanel({ onBack: _onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeSegments, getSegmentsVersion)
  const [selected, setSelected] = useState<string | null>(null)
  const member = selected ? getBook().members[selected] : null

  if (member && member.role === 'player') {
    return <Profile member={member} onBackToList={() => setSelected(null)} />
  }
  return <Roster onOpen={setSelected} />
}

const SEG_PILL: Record<Segment, string> = {
  VIP: 'is-vip',
  New: 'is-new',
  Casual: 'is-casual',
  Dormant: 'is-dormant',
}

function SegmentPill({ seg }: { seg: Segment }) {
  return <span className={`feat-pill ${SEG_PILL[seg]}`}>{seg}</span>
}

function StatusPills({ member }: { member: Member }) {
  return (
    <>
      <span className={`feat-pill ${member.active ? 'is-active' : 'is-suspended'}`}>
        {member.active ? 'Active' : 'Suspended'}
      </span>
      {member.account.bettingLocked && <span className="feat-pill is-locked">Locked</span>}
    </>
  )
}

/* -------------------------------- roster -------------------------------- */

function Roster({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [seg, setSeg] = useState<Segment | 'all'>('all')
  const rows = playerRows(getBook(), query, seg)

  return (
    <div className="feat">
      <div className="feat-toolbar">
        <input
          className="feat-search"
          placeholder="Search players by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
        <div className="feat-chips">
          {(['all', ...SEGMENTS] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`feat-chip ${seg === s ? 'is-on' : ''}`}
              onClick={() => setSeg(s)}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="feat-empty">No players match.</p>
      ) : (
        <div className="feat-tablewrap">
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th className="feat-num">Balance</th>
                <th className="feat-num">Credit line</th>
                <th className="feat-num">Max bet</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="is-click" onClick={() => onOpen(r.id)}>
                  <td>
                    <span className="feat-rowname">{r.name}</span>{' '}
                    <SegmentPill seg={r.segment} />
                  </td>
                  <td>
                    <span className={`feat-pill ${r.active ? 'is-active' : 'is-suspended'}`}>
                      {r.active ? 'Active' : 'Suspended'}
                    </span>
                    {r.locked && <span className="feat-pill is-locked"> Locked</span>}
                  </td>
                  <td className={`feat-num ${r.balance >= 0 ? 'feat-up' : 'feat-down'}`}>
                    {signed(formatMoney(r.balance), r.balance)}
                  </td>
                  <td className="feat-num">{formatMoney(r.creditLimit)}</td>
                  <td className="feat-num">{r.maxWager != null ? formatMoney(r.maxWager) : '—'}</td>
                  <td>{agoLabel(r.lastActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* -------------------------------- profile ------------------------------- */

function Profile({ member, onBackToList }: { member: Member; onBackToList: () => void }) {
  useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion)
  const [tab, setTab] = useState<'bets' | 'ledger' | 'notes'>('bets')
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => void) => {
    setError(null)
    try {
      mutateBook(() => fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const acct = member.account
  const ledger = getBookLedger()
  const bets = toBetRows(ledger, acct.id)
  const stats = summarize(bets)

  return (
    <div className="feat">
      <div className="feat-profile-head">
        <button className="feat-linkback" type="button" onClick={onBackToList}>
          ‹ All players
        </button>
      </div>

      <div className="feat-profile-head">
        <h2 className="feat-h1">{member.name}</h2>
        <SegmentPill seg={effectiveSegment(member)} />
        <StatusPills member={member} />
      </div>

      <div className="feat-kpis">
        <div className="feat-kpi">
          <span className="feat-label">Balance</span>
          <strong className={acct.balance >= 0 ? 'feat-up' : 'feat-down'}>
            {signed(formatMoney(acct.balance), acct.balance)}
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Available</span>
          <strong>{formatMoney(availableToWager(acct))}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Credit line</span>
          <strong>{formatMoney(acct.creditLimit)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Lifetime net</span>
          <strong className={stats.net >= 0 ? 'feat-up' : 'feat-down'}>
            {signed(formatMoney(stats.net), stats.net)}
          </strong>
        </div>
      </div>

      <div className="feat-card">
        <h3 className="feat-h">Account controls</h3>
        <div className="feat-inline" style={{ marginBottom: 12 }}>
          <label className="feat-field" style={{ minWidth: 150 }}>
            <span>Segment</span>
            <select
              className="feat-select"
              value={getSegmentOverride(member.id) ?? ''}
              onChange={(e) =>
                run(() => setSegmentOverride(member.id, (e.target.value || null) as Segment | null))
              }
            >
              <option value="">Auto ({effectiveSegment(member)})</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            className="feat-btn"
            type="button"
            onClick={() => run(() => setActive(getBook(), member.id, !member.active))}
          >
            {member.active ? 'Suspend' : 'Reinstate'}
          </button>
          <button
            className="feat-btn"
            type="button"
            onClick={() =>
              run(() => setBettingLocked(getBook(), member.id, !member.account.bettingLocked))
            }
          >
            {member.account.bettingLocked ? 'Unlock betting' : 'Lock betting'}
          </button>
        </div>
        <div className="feat-inline">
          <CoinEdit
            label="Max bet"
            value={acct.maxWager ?? null}
            onSet={(c) => run(() => setMaxWager(getBook(), member.id, c))}
          />
          <CoinEdit
            label="Min bet"
            value={acct.minWager ?? null}
            onSet={(c) => run(() => setMinWager(getBook(), member.id, c))}
          />
          <CoinEdit
            label="Credit line"
            value={acct.creditLimit}
            allowClear={false}
            onSet={(c) => run(() => setCreditLimit(getBook(), member.id, c ?? 0))}
          />
        </div>
        {error && <p className="feat-err" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      <div className="feat-tabs">
        {(['bets', 'ledger', 'notes'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`feat-tab ${tab === t ? 'is-on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'bets' ? 'Bet history' : t === 'ledger' ? 'Ledger' : 'Notes'}
          </button>
        ))}
      </div>

      {tab === 'bets' && <BetsTab bets={bets} />}
      {tab === 'ledger' && <LedgerTab entries={ledger.filter((e) => e.accountId === acct.id)} />}
      {tab === 'notes' && <NotesTab member={member} run={run} />}
    </div>
  )
}

function CoinEdit({
  label,
  value,
  onSet,
  allowClear = true,
}: {
  label: string
  value: number | null
  onSet: (cents: number | null) => void
  allowClear?: boolean
}) {
  const [draft, setDraft] = useState(value != null ? String(value / 100) : '')
  return (
    <div className="feat-cap">
      <label className="feat-field">
        <span>{label} (coins)</span>
        <input
          className="feat-input"
          inputMode="decimal"
          placeholder={allowClear ? 'none' : '0'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">{value != null ? `now ${formatMoney(value)}` : 'no cap'}</span>
      <button
        className="feat-btn is-primary is-sm"
        type="button"
        onClick={() => onSet(draft.trim() === '' ? null : toCents(Number(draft) || 0))}
      >
        Set
      </button>
      {allowClear && (
        <button
          className="feat-btn is-sm"
          type="button"
          onClick={() => {
            setDraft('')
            onSet(null)
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

function BetsTab({ bets }: { bets: ReturnType<typeof toBetRows> }) {
  if (bets.length === 0) {
    return <p className="feat-empty">No graded bets yet. Settled wagers post here.</p>
  }
  return (
    <div className="feat-tablewrap">
      <table className="feat-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="feat-num">Stake</th>
            <th className="feat-num">Mult</th>
            <th className="feat-num">P&amp;L</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((b) => (
            <tr key={b.id}>
              <td>{b.game}</td>
              <td className="feat-num">{formatMoney(b.stake)}</td>
              <td className="feat-num">{b.multiplier ? `${b.multiplier.toFixed(2)}×` : '—'}</td>
              <td className={`feat-num ${b.profit >= 0 ? 'feat-up' : 'feat-down'}`}>
                {signed(formatMoney(b.profit), b.profit)}
              </td>
              <td>{agoLabel(b.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  resolve: 'Bet settled',
  settle: 'Weekly settle',
  adjust: 'Adjustment',
  grant: 'Bonus grant',
}

function LedgerTab({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return <p className="feat-empty">No ledger movements yet.</p>
  }
  return (
    <div className="feat-tablewrap">
      <table className="feat-table">
        <thead>
          <tr>
            <th>Movement</th>
            <th className="feat-num">Change</th>
            <th className="feat-num">Balance after</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.seq}>
              <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
              <td className={`feat-num ${e.balanceDelta >= 0 ? 'feat-up' : 'feat-down'}`}>
                {signed(formatMoney(e.balanceDelta), e.balanceDelta)}
              </td>
              <td className="feat-num">{formatMoney(e.balanceAfter)}</td>
              <td>{dateLabel(e.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NotesTab({ member, run }: { member: Member; run: (fn: () => void) => void }) {
  const p = member.profile
  const [notes, setNotes] = useState(p.notes ?? '')
  const [email, setEmail] = useState(p.email ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [saved, setSaved] = useState(false)
  return (
    <div className="feat-card">
      <h3 className="feat-h">Operator CRM</h3>
      <label className="feat-field" style={{ marginBottom: 10 }}>
        <span>Notes</span>
        <textarea
          className="feat-textarea"
          value={notes}
          placeholder="VIP flags, collection notes, preferences…"
          onChange={(e) => {
            setNotes(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <div className="feat-inline" style={{ marginBottom: 10 }}>
        <label className="feat-field" style={{ flex: 1 }}>
          <span>Email</span>
          <input
            className="feat-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <label className="feat-field" style={{ flex: 1 }}>
          <span>Phone</span>
          <input
            className="feat-input"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setSaved(false)
            }}
          />
        </label>
      </div>
      <div className="feat-actions">
        <button
          className="feat-btn is-primary"
          type="button"
          onClick={() => {
            run(() =>
              setMemberProfile(getBook(), member.id, {
                notes: notes.trim() || undefined,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
              }),
            )
            setSaved(true)
          }}
        >
          Save notes
        </button>
        {saved && <span className="feat-ok">Saved.</span>}
      </div>
    </div>
  )
}
