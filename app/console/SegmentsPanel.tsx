import { Fragment, useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { getBook, getBookVersion, mutateBook, subscribeBook } from '../book-store.js'
import {
  analyticsVersion,
  getAnalyticsRecords,
  perPlayerActivity,
  subscribeAnalytics,
} from '../../manager/reporting/index.js'
import { getPlayerVip, getVipConfig, getVipVersion, subscribeVip } from '../vip-store.js'
import {
  creditUtilization,
  setActive,
  setCreditLimit,
  setMaxWager,
  type Member,
} from '../../org/index.js'
import { adjustFigure } from '../manager-actions.js'
import { rankFor } from '../../vip/index.js'
import {
  classify,
  isChurnRisk,
  segmentMetrics,
  SEGMENT_LABEL,
  type Segment,
  type SegmentMetrics,
} from './segments.js'
import './segments-panel.css'

const ORDER: Segment[] = ['new', 'casual', 'vip', 'dormant']

interface Row {
  id: string
  name: string
  segment: Segment
  turnover: number
  net: number
  firstActive: number
  lastActive: number
}

/** A short relative-time label ("today", "3d ago") for a last/first-active stamp. */
function ago(then: number, now: number): string {
  const days = Math.floor((now - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

/**
 * Player segments — New / Casual / VIP / Dormant, derived from the reporting activity
 * feed + the VIP program (CLAUDE.md §4). An ACTIONABLE cohort console: see who to
 * nurture, reward, or win back, drill into one player for their figure + activity, and
 * fire per-player or whole-cohort levers. Every money move flows through the audited
 * `adjustFigure` (a figure grant with an actor + reason); every limit/lock change runs
 * through the org setters inside `mutateBook`. This view keeps no points of its own and
 * never touches `account` directly.
 */
export function SegmentsPanel() {
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const vv = useSyncExternalStore(subscribeVip, getVipVersion)
  const [filter, setFilter] = useState<Segment | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // The action inputs (per-open-player), as whole coins / strings the operator types.
  const [grantCoins, setGrantCoins] = useState('')
  const [maxWagerCoins, setMaxWagerCoins] = useState('')
  const [creditCoins, setCreditCoins] = useState('')

  const { rows, counts } = useMemo(() => {
    const now = Date.now()
    const org = getBook()
    const config = getVipConfig()
    const acts = perPlayerActivity(getAnalyticsRecords())
    const counts: Record<Segment, number> = { new: 0, casual: 0, vip: 0, dormant: 0 }
    const rows: Row[] = []
    for (const a of acts) {
      const member = org.members[a.accountId]
      if (!member || member.role !== 'player') continue
      const isVip = rankFor(getPlayerVip(a.accountId).wagered, config).id !== 'none'
      const segment = classify(a, now, isVip)
      counts[segment] += 1
      rows.push({
        id: a.accountId,
        name: member.name,
        segment,
        turnover: a.turnover,
        net: a.net,
        firstActive: a.firstActive,
        lastActive: a.lastActive,
      })
    }
    rows.sort((x, y) => y.turnover - x.turnover)
    return { rows, counts }
    // av/bv/vv are the change signals.
  }, [av, bv, vv])

  const shown = filter === 'all' ? rows : rows.filter((r) => r.segment === filter)
  const now = Date.now()

  // Cohort rollup for the metrics strip — only meaningful when a single segment is
  // selected (the helper the prior agent added in segments.ts). `shown` derives from
  // the same av/bv/vv signals the rows memo uses; `now` is read inside so it's fresh.
  const metrics: SegmentMetrics | null = useMemo(
    () => (filter === 'all' ? null : segmentMetrics(shown, Date.now())),
    [filter, av, bv, vv], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null
  const openMember: Member | null = open ? (getBook().members[open.id] ?? null) : null

  const flash = (text: string, ok: boolean) => setMsg({ text, ok })

  const toggleRow = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id))
    setMsg(null)
    setGrantCoins('')
    setMaxWagerCoins('')
    setCreditCoins('')
  }

  /* --------------------------- per-player actions ----------------------- */

  const doGrant = () => {
    if (!open) return
    const coins = Number(grantCoins)
    if (!Number.isFinite(coins) || coins <= 0) return flash('Enter a coin amount above 0.', false)
    const cents = toCents(coins)
    try {
      // The audited grant path: a figure move with an actor + reason for the trail.
      adjustFigure(open.id, cents, `Segment grant (${SEGMENT_LABEL[open.segment]})`)
      setGrantCoins('')
      flash(`Granted ${formatMoney(cents)} to ${open.name}.`, true)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Grant failed.', false)
    }
  }

  const doMaxWager = () => {
    if (!open) return
    const raw = maxWagerCoins.trim()
    // Empty clears the cap; otherwise whole coins → cents.
    const cap = raw === '' ? null : toCents(Number(raw))
    if (cap !== null && (!Number.isFinite(Number(raw)) || cap < 1)) {
      return flash('Max wager must be a positive coin amount (blank to clear).', false)
    }
    try {
      mutateBook((o) => setMaxWager(o, open.id, cap))
      flash(cap === null ? 'Max wager cleared.' : `Max wager set to ${formatMoney(cap)}.`, true)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not set max wager.', false)
    }
  }

  const doCredit = () => {
    if (!open) return
    const coins = Number(creditCoins)
    if (!Number.isFinite(coins) || coins < 0) return flash('Enter a credit limit ≥ 0.', false)
    const cents = toCents(coins)
    try {
      mutateBook((o) => setCreditLimit(o, open.id, cents))
      flash(`Credit limit set to ${formatMoney(cents)}.`, true)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not set credit limit.', false)
    }
  }

  const doToggleActive = () => {
    if (!open || !openMember) return
    const next = !openMember.active
    try {
      mutateBook((o) => setActive(o, open.id, next))
      flash(next ? `${open.name} reactivated.` : `${open.name} suspended.`, true)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not change status.', false)
    }
  }

  /* ------------------------------ bulk action --------------------------- */

  // Grant a welcome / re-engage bonus to every player in the *currently filtered*
  // cohort. Confirms first (with count + total), then loops the audited grant path.
  const bulkGrant = () => {
    if (filter === 'all' || shown.length === 0) return
    const perPlayer = toCents(25) // a fixed 25-coin cohort bonus
    const label = filter === 'new' ? 'Welcome bonus' : filter === 'dormant' ? 'Re-engage bonus' : 'Cohort bonus'
    const total = perPlayer * shown.length
    const ok = window.confirm(
      `${label}: grant ${formatMoney(perPlayer)} to all ${shown.length} ${SEGMENT_LABEL[filter]} ` +
        `players (${formatMoney(total)} total)?`,
    )
    if (!ok) return
    let done = 0
    for (const r of shown) {
      try {
        adjustFigure(r.id, perPlayer, `${label} (${SEGMENT_LABEL[filter]} cohort)`)
        done += 1
      } catch {
        // Skip a player the grant can't apply to; keep the run going.
      }
    }
    flash(`${label}: ${formatMoney(perPlayer)} to ${done} of ${shown.length} players.`, true)
  }

  const bulkLabel =
    filter === 'new' ? 'Welcome bonus to all New' : filter === 'dormant' ? 'Re-engage all Dormant' : 'Bonus to cohort'

  return (
    <div className="con-seg">
      <header className="con-seg-head">
        <h1 className="con-h1">Player segments</h1>
        <p className="con-sub">Who to nurture, reward, or win back — and act on it.</p>
      </header>

      <section className="con-seg-cards" aria-label="Segment counts">
        <button
          className={`con-seg-card ${filter === 'all' ? 'is-on' : ''}`}
          onClick={() => {
            setFilter('all')
            setOpenId(null)
          }}
        >
          <strong>{rows.length}</strong>
          <span>All players</span>
        </button>
        {ORDER.map((s) => (
          <button
            key={s}
            className={`con-seg-card seg-${s} ${filter === s ? 'is-on' : ''}`}
            onClick={() => {
              setFilter(s)
              setOpenId(null)
            }}
          >
            <strong>{counts[s]}</strong>
            <span>{SEGMENT_LABEL[s]}</span>
          </button>
        ))}
      </section>

      {/* Cohort rollup + bulk lever — only when a single segment is selected. */}
      {filter !== 'all' && metrics && metrics.size > 0 && (
        <>
          <section className="con-seg-metrics" aria-label={`${SEGMENT_LABEL[filter]} metrics`}>
            <div className="con-seg-metric">
              <span className="con-seg-metric-label">Players</span>
              <span className="con-seg-metric-value">{metrics.size}</span>
            </div>
            <div className="con-seg-metric">
              <span className="con-seg-metric-label">Total turnover</span>
              <span className="con-seg-metric-value">{formatMoney(metrics.totalTurnover)}</span>
            </div>
            <div className="con-seg-metric">
              <span className="con-seg-metric-label">Avg player value</span>
              <span
                className={`con-seg-metric-value ${
                  metrics.avgPlayerValue > 0 ? 'pos' : metrics.avgPlayerValue < 0 ? 'neg' : ''
                }`}
              >
                {formatMoney(metrics.avgPlayerValue)}
              </span>
            </div>
            <div className="con-seg-metric">
              <span className="con-seg-metric-label">Churn risk</span>
              <span className={`con-seg-metric-value ${metrics.churnRisk > 0 ? 'warn' : ''}`}>
                {metrics.churnRisk}
              </span>
            </div>
          </section>

          <div className="con-seg-bulk">
            <span className="con-seg-bulk-label">
              <strong>{bulkLabel}</strong> — {formatMoney(toCents(25))} free play each
            </span>
            <span className="con-seg-bulk-spend">
              <button className="con-btn con-btn-primary con-btn-sm" onClick={bulkGrant}>
                Grant to {shown.length}
              </button>
            </span>
          </div>
        </>
      )}

      {msg && (
        <p className={`con-seg-msg ${msg.ok ? 'is-ok' : 'is-err'}`} role="status">
          {msg.text}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="con-empty">No players with activity in this segment yet.</p>
      ) : (
        <table className="con-table" aria-label="Players">
          <thead>
            <tr>
              <th>Player</th>
              <th>Segment</th>
              <th className="num">Turnover</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const isOpen = r.id === openId
              const risk = isChurnRisk(r.lastActive, now)
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`con-seg-row ${isOpen ? 'is-open' : ''}`}
                    onClick={() => toggleRow(r.id)}
                    aria-expanded={isOpen}
                  >
                    <td>
                      <span className="con-seg-name">
                        {r.name}
                        {openMember && isOpen && !openMember.active && (
                          <span className="con-seg-susp">Suspended</span>
                        )}
                        {risk && <span className="con-seg-risk">at risk</span>}
                      </span>
                    </td>
                    <td>
                      <span className={`con-pill seg-${r.segment}`}>{SEGMENT_LABEL[r.segment]}</span>
                    </td>
                    <td className="num">{formatMoney(r.turnover)}</td>
                    <td className={`num ${r.net < 0 ? 'neg' : ''}`}>{formatMoney(r.net)}</td>
                  </tr>
                  {isOpen && open && openMember && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0, border: 'none' }}>
                        <PlayerDetail
                          row={open}
                          member={openMember}
                          now={now}
                          grantCoins={grantCoins}
                          setGrantCoins={setGrantCoins}
                          maxWagerCoins={maxWagerCoins}
                          setMaxWagerCoins={setMaxWagerCoins}
                          creditCoins={creditCoins}
                          setCreditCoins={setCreditCoins}
                          onGrant={doGrant}
                          onMaxWager={doMaxWager}
                          onCredit={doCredit}
                          onToggleActive={doToggleActive}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* -------------------------------- detail row ------------------------------ */

interface DetailProps {
  row: Row
  member: Member
  now: number
  grantCoins: string
  setGrantCoins: (v: string) => void
  maxWagerCoins: string
  setMaxWagerCoins: (v: string) => void
  creditCoins: string
  setCreditCoins: (v: string) => void
  onGrant: () => void
  onMaxWager: () => void
  onCredit: () => void
  onToggleActive: () => void
}

/** The drill-down for one player: identity + activity + risk, then the audited
 *  quick-action controls. Money still moves only through the parent's handlers. */
function PlayerDetail(p: DetailProps) {
  const { row, member, now } = p
  const util = creditUtilization(member)
  const utilPct = Math.round(util * 100)
  const utilClass = util >= 0.8 ? 'is-high' : util >= 0.5 ? 'is-warn' : ''
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div className="con-seg-detail" onClick={stop}>
      <div className="con-seg-detail-head">
        <h2>
          {member.name} <span className={`con-pill seg-${row.segment}`}>{SEGMENT_LABEL[row.segment]}</span>
        </h2>
      </div>

      <dl className="con-seg-stats">
        <div>
          <dt>Turnover</dt>
          <dd>{formatMoney(row.turnover)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={row.net < 0 ? 'neg' : row.net > 0 ? 'pos' : ''}>{formatMoney(row.net)}</dd>
        </div>
        <div>
          <dt>First active</dt>
          <dd>{ago(row.firstActive, now)}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>{ago(row.lastActive, now)}</dd>
        </div>
        <div>
          <dt>Credit used</dt>
          <dd>{utilPct}%</dd>
        </div>
      </dl>

      <div className={`con-seg-util ${utilClass}`} aria-hidden="true">
        <span style={{ width: `${utilPct}%` }} />
      </div>

      <div className="con-seg-actions">
        <div className="con-seg-action">
          <label htmlFor={`grant-${row.id}`}>Grant free play (coins)</label>
          <div className="con-seg-action-row">
            <input
              id={`grant-${row.id}`}
              className="con-seg-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="50"
              value={p.grantCoins}
              onChange={(e) => p.setGrantCoins(e.target.value)}
            />
            <button className="con-btn con-btn-primary con-btn-sm" onClick={p.onGrant}>
              Grant
            </button>
          </div>
        </div>

        <div className="con-seg-action">
          <label htmlFor={`maxw-${row.id}`}>Max wager (coins, blank = none)</label>
          <div className="con-seg-action-row">
            <input
              id={`maxw-${row.id}`}
              className="con-seg-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder={member.account.maxWager != null ? String(member.account.maxWager / 100) : '—'}
              value={p.maxWagerCoins}
              onChange={(e) => p.setMaxWagerCoins(e.target.value)}
            />
            <button className="con-btn con-btn-sm" onClick={p.onMaxWager}>
              Set
            </button>
          </div>
        </div>

        <div className="con-seg-action">
          <label htmlFor={`credit-${row.id}`}>Credit limit (coins)</label>
          <div className="con-seg-action-row">
            <input
              id={`credit-${row.id}`}
              className="con-seg-input"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder={String(member.account.creditLimit / 100)}
              value={p.creditCoins}
              onChange={(e) => p.setCreditCoins(e.target.value)}
            />
            <button className="con-btn con-btn-sm" onClick={p.onCredit}>
              Set
            </button>
          </div>
        </div>

        <div className="con-seg-action">
          <label>Status</label>
          <div className="con-seg-action-row">
            <button
              className={`con-btn con-btn-sm ${member.active ? '' : 'con-btn-primary'}`}
              onClick={p.onToggleActive}
            >
              {member.active ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
