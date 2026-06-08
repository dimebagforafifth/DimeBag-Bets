import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from '../book-store.js'
import {
  analyticsVersion,
  getAnalyticsRecords,
  perPlayerActivity,
  subscribeAnalytics,
} from '../../manager/reporting/index.js'
import { getPlayerVip, getVipConfig, getVipVersion, subscribeVip } from '../vip-store.js'
import { rankFor } from '../../vip/index.js'
import { classify, SEGMENT_LABEL, type Segment } from './segments.js'

const ORDER: Segment[] = ['new', 'casual', 'vip', 'dormant']

interface Row {
  id: string
  name: string
  segment: Segment
  turnover: number
  net: number
}

/**
 * Player segments — New / Casual / VIP / Dormant, derived from the reporting activity
 * feed + the VIP program (CLAUDE.md §4). Read-only: helps the operator see who to
 * nurture, reward, or win back. Moves no money.
 */
export function SegmentsPanel() {
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const vv = useSyncExternalStore(subscribeVip, getVipVersion)
  const [filter, setFilter] = useState<Segment | 'all'>('all')

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
      rows.push({ id: a.accountId, name: member.name, segment, turnover: a.turnover, net: a.net })
    }
    rows.sort((x, y) => y.turnover - x.turnover)
    return { rows, counts }
    // av/bv/vv are the change signals.
  }, [av, bv, vv])

  const shown = filter === 'all' ? rows : rows.filter((r) => r.segment === filter)

  return (
    <div className="con-seg">
      <header className="con-seg-head">
        <h1 className="con-h1">Player segments</h1>
        <p className="con-sub">Who to nurture, reward, or win back — from real activity.</p>
      </header>

      <section className="con-seg-cards" aria-label="Segment counts">
        <button
          className={`con-seg-card ${filter === 'all' ? 'is-on' : ''}`}
          onClick={() => setFilter('all')}
        >
          <strong>{rows.length}</strong>
          <span>All players</span>
        </button>
        {ORDER.map((s) => (
          <button
            key={s}
            className={`con-seg-card seg-${s} ${filter === s ? 'is-on' : ''}`}
            onClick={() => setFilter(s)}
          >
            <strong>{counts[s]}</strong>
            <span>{SEGMENT_LABEL[s]}</span>
          </button>
        ))}
      </section>

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
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <span className={`con-pill seg-${r.segment}`}>{SEGMENT_LABEL[r.segment]}</span>
                </td>
                <td className="num">{formatMoney(r.turnover)}</td>
                <td className={`num ${r.net < 0 ? 'neg' : ''}`}>{formatMoney(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
