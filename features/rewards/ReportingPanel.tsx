/**
 * Rewards Reporting — balance issued by program, the running total, and recent comps. Read-
 * only. Manager only. Every figure is balance (no cash anywhere).
 */
import { useMemo, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import {
  issuedByProgram,
  totalIssued,
  subscribeIssuance,
  getIssuanceVersion,
} from './comp.js'
import {
  allPlayerRewards,
  subscribeRewardsPlayers,
  getRewardsPlayersVersion,
  type CompRecord,
} from './players.js'
import { fmt } from './data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const PROGRAM_LABEL: Record<string, string> = {
  comp: 'Manual comps',
  cashback: 'Cashback',
  daily: 'Daily & streak',
  mission: 'Missions',
  promo: 'Promotions',
  contest: 'Contests',
}

export function ReportingPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeIssuance, getIssuanceVersion)
  useSyncExternalStore(subscribeRewardsPlayers, getRewardsPlayersVersion)
  useSyncExternalStore(subscribeBook, getBookVersion)
  const book = getBook()
  const byProgram = issuedByProgram()
  const total = totalIssued()
  const rows = Object.entries(byProgram).sort((a, b) => b[1] - a[1])

  const recentComps = useMemo(() => {
    const all: Array<CompRecord & { player: string }> = []
    for (const [pid, st] of Object.entries(allPlayerRewards())) {
      for (const c of st.compHistory) all.push({ ...c, player: book.members[pid]?.name ?? pid })
    }
    return all.sort((a, b) => b.at - a.at).slice(0, 12)
    // book version drives the re-render
  }, [book])

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          What the rewards program has handed out — balance issued by program, and recent comps.
          All balance; nothing here is cash.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Issuance">
        <div className="feat-kpi">
          <span className="feat-label">Total issued</span>
          <strong>{fmt(total)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Programs running</span>
          <strong>{rows.length}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Balance issued by program</h3>
        <div className="rwa-bars">
          {rows.map(([k, v]) => (
            <div className="rwa-bar-row" key={k}>
              <span className="rwa-bar-label">{PROGRAM_LABEL[k] ?? k}</span>
              <div className="rwa-bar">
                <div className="rwa-bar-fill" style={{ width: `${total > 0 ? (v / total) * 100 : 0}%` }} />
              </div>
              <span className="rwa-bar-val">{fmt(v)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Recent comps</h3>
        {recentComps.length === 0 ? (
          <p className="feat-empty">No comps issued yet.</p>
        ) : (
          <table className="rwa-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>By</th>
                <th>Reward</th>
                <th className="num">Amount</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentComps.map((c) => (
                <tr key={c.id}>
                  <td>{c.player}</td>
                  <td>{c.byName}</td>
                  <td>{c.kind}</td>
                  <td className="num">{c.amount > 0 ? fmt(c.amount) : '—'}</td>
                  <td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PanelShell>
  )
}
