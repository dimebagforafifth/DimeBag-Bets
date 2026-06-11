import { useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronDown } from 'lucide-react'
import './console.css' // con-* page styles (the console shell doesn't load these)
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

const ORDER: Segment[] = ['vip', 'new', 'casual', 'dormant']

/** The operator's play for each segment — what the block is FOR. */
const SEGMENT_HINT: Record<Segment, string> = {
  vip: 'Reward & retain',
  new: 'Nurture & onboard',
  casual: 'Keep engaged',
  dormant: 'Win back',
}

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
 * nurture, reward, or win back. Moves no money. Each segment is a block that pulls
 * down to reveal the players in it.
 */
export function SegmentsPanel() {
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const vv = useSyncExternalStore(subscribeVip, getVipVersion)
  const [open, setOpen] = useState<Set<Segment>>(new Set())

  const bySegment = useMemo(() => {
    const now = Date.now()
    const org = getBook()
    const config = getVipConfig()
    const acts = perPlayerActivity(getAnalyticsRecords())
    const groups: Record<Segment, Row[]> = { vip: [], new: [], casual: [], dormant: [] }
    for (const a of acts) {
      const member = org.members[a.accountId]
      if (!member || member.role !== 'player') continue
      const isVip = rankFor(getPlayerVip(a.accountId).wagered, config).id !== 'none'
      const segment = classify(a, now, isVip)
      groups[segment].push({ id: a.accountId, name: member.name, segment, turnover: a.turnover, net: a.net })
    }
    for (const s of ORDER) groups[s].sort((x, y) => y.turnover - x.turnover)
    return groups
    // av/bv/vv are the useSyncExternalStore version signals that drive the recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [av, bv, vv])

  const total = ORDER.reduce((n, s) => n + bySegment[s].length, 0)
  const toggle = (s: Segment) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  return (
    <div className="con-seg">
      <header className="con-seg-head">
        <h1 className="con-h1">Player segments</h1>
        <p className="con-sub">Who to nurture, reward, or win back — from real activity. Pull down a segment to see its players.</p>
      </header>

      {total === 0 ? (
        <p className="con-empty">No players with activity yet — segments fill in as people play.</p>
      ) : (
        <div className="con-seg-list">
          {ORDER.map((s) => {
            const players = bySegment[s]
            const isOpen = open.has(s)
            const turnover = players.reduce((a, r) => a + r.turnover, 0)
            return (
              <section key={s} className={`con-seg-block ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="con-seg-bhead"
                  aria-expanded={isOpen}
                  onClick={() => toggle(s)}
                >
                  <span className="con-seg-bleft">
                    <span className={`con-seg-dot seg-${s}`} aria-hidden="true" />
                    <span className="con-seg-label">{SEGMENT_LABEL[s]}</span>
                    <span className="con-seg-hint">{SEGMENT_HINT[s]}</span>
                  </span>
                  <span className="con-seg-bright">
                    <span className="con-seg-turn">{formatMoney(turnover)} wagered</span>
                    <span className="con-seg-count">{players.length}</span>
                    <ChevronDown className="con-seg-chev" size={16} aria-hidden="true" />
                  </span>
                </button>

                {isOpen && (
                  <div className="con-seg-body">
                    {players.length === 0 ? (
                      <p className="con-seg-none">No players in this segment right now.</p>
                    ) : (
                      <ul className="con-seg-players">
                        {players.map((r) => (
                          <li key={r.id} className="con-seg-prow">
                            <span className="con-seg-pname">{r.name}</span>
                            <span className="con-seg-pnums">
                              <span className="con-seg-pturn">{formatMoney(r.turnover)}</span>
                              <span className={`con-seg-pnet ${r.net < 0 ? 'neg' : 'pos'}`}>
                                {r.net >= 0 ? '+' : ''}
                                {formatMoney(r.net)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
