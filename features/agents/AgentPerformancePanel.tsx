import { useMemo, useSyncExternalStore } from 'react'
import { allAgents, agentPerformance, type AgentPerformance } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell } from '../_desk/shared.js'
import './agents.css'

const ROLE_LABEL: Record<string, string> = { subagent: 'Master', agent: 'Agent' }

/** Sign convention for the book: a roster that's net DOWN (players owe) is a WIN for the
 *  book, so Book W/L = −playerNet (positive = the book is ahead off this agent's roster). */
function bookWL(p: AgentPerformance): number {
  return -p.playerNet
}

/**
 * Agent Performance — every agent / master agent ranked by how their roster is doing for
 * the book this period: roster size, sub-agents, the book's win/loss off them, live
 * exposure, and the commission they've earned. Read-only; pure rollups from the org tree.
 */
export function AgentPerformancePanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)

  const rows = useMemo(() => {
    const org = getBook()
    return allAgents(org)
      .map((a) => agentPerformance(org, a.id))
      .sort((x, y) => bookWL(y) - bookWL(x)) // book's biggest winners first
    // bv is the change signal
  }, [bv])

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0)
  const totalWL = rows.reduce((s, r) => s + bookWL(r), 0)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Every agent ranked by the book&rsquo;s win/loss off their roster this period, with
          roster size, live exposure, and commission earned.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="feat-empty">No agents yet — onboard one from Add Customer.</p>
      ) : (
        <div className="agtbl-wrap">
          <table className="agtbl">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Type</th>
                <th className="num">Roster</th>
                <th className="num">Sub-agents</th>
                <th className="num">Book W/L</th>
                <th className="num">Exposure</th>
                <th className="num">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wl = bookWL(r)
                return (
                  <tr key={r.agentId} className={r.active ? '' : 'is-suspended'}>
                    <td className="agtbl-name">{r.name}</td>
                    <td>
                      <span className={`agt-badge is-${r.role}`}>{ROLE_LABEL[r.role]}</span>
                    </td>
                    <td className="num">{r.roster}</td>
                    <td className="num">{r.subAgents || '—'}</td>
                    <td className={`num ${wl > 0 ? 'is-up' : wl < 0 ? 'is-down' : ''}`}>
                      {wl > 0 ? '+' : ''}
                      {formatMoney(wl)}
                    </td>
                    <td className="num">{formatMoney(r.exposure)}</td>
                    <td className="num agtbl-comm">
                      {r.commission > 0 ? formatMoney(r.commission) : '—'}
                      {r.commissionPct > 0 && <span className="agtbl-commpct"> @{r.commissionPct}%</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="agtbl-foot">
                <td colSpan={4}>Book total</td>
                <td className={`num ${totalWL > 0 ? 'is-up' : totalWL < 0 ? 'is-down' : ''}`}>
                  {totalWL > 0 ? '+' : ''}
                  {formatMoney(totalWL)}
                </td>
                <td className="num">—</td>
                <td className="num">{formatMoney(totalCommission)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
