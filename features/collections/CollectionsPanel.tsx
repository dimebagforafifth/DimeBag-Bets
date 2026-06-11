/**
 * Collections — the agent-by-agent COLLECT / PAY worklist (CLAUDE.md §3/§4). Where the
 * Weekly Sheet shows per-player by-day figures and Settlement Run closes the whole book,
 * Collections answers the operator's weekly question: for each agent, how much is there
 * to collect from losing players, how much to pay winning ones, what the agent keeps as
 * commission, and what nets up to the level above.
 *
 * Players are bucketed by their NEAREST agent (the same grouping the Weekly Sheet uses,
 * so a player is counted once), plus a "direct under manager" bucket. All figures derive
 * from each player's core balance; commission is the bucket agent's split on the bucket's
 * net loss (matching org.agentCommission). Pure read — money moves only via Settle.
 */
import { useMemo, useState } from 'react'
import {
  agentOf,
  membersByRole,
  type Member,
  type Org,
} from '../../org/index.js'
import { getBookVersion } from '../../app/book-store.js'
import { PanelShell, useBook, Figure } from '../_desk/shared.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'

const ROLE_LABEL: Record<string, string> = { subagent: 'Master', agent: 'Agent' }
const DIRECT = '__direct'

interface CollRow {
  key: string
  label: string
  /** The bucket's agent (null for the manager-direct bucket). */
  agent: Member | null
  roster: number
  toCollect: number // Σ owed-by-players (losing players), shown positive
  toPay: number // Σ owed-to-players (winning players)
  commission: number // the agent's split on this bucket's net loss
}

/** netBook > 0 ⇒ players net LOST ⇒ the agent collects & remits up. */
const netBook = (r: CollRow) => r.toCollect - r.toPay
/** What the agent settles up to the level above, after keeping commission. */
const remitUp = (r: CollRow) => netBook(r) - r.commission

const direction = (n: number): string => (n > 0 ? 'Collect' : n < 0 ? 'Pay' : 'Even')

function buckets(org: Org): CollRow[] {
  const byKey = new Map<string, CollRow>()
  for (const p of membersByRole(org, 'player')) {
    const agent = agentOf(org, p.id)
    const key = agent?.id ?? DIRECT
    let r = byKey.get(key)
    if (!r) {
      r = {
        key,
        label: agent ? agent.name : 'Direct (under manager)',
        agent,
        roster: 0,
        toCollect: 0,
        toPay: 0,
        commission: 0,
      }
      byKey.set(key, r)
    }
    r.roster += 1
    const bal = p.account.balance
    if (bal < 0) r.toCollect += -bal
    else if (bal > 0) r.toPay += bal
  }
  // Commission: the bucket agent's split on the bucket's net loss (max(0, netBook)).
  for (const r of byKey.values()) {
    const pct = r.agent?.commissionPct ?? 0
    if (pct) r.commission = Math.round((pct / 100) * Math.max(0, netBook(r)))
  }
  // Agents first (alpha), the manager-direct bucket last.
  return [...byKey.values()].sort((a, b) =>
    a.key === DIRECT ? 1 : b.key === DIRECT ? -1 : a.label.localeCompare(b.label),
  )
}

export function CollectionsPanel({ onBack }: { onBack: () => void }) {
  const book = useBook()
  const [scope, setScope] = useState(ALL_SCOPE)

  const rows = useMemo(() => buckets(book), [book, getBookVersion()])

  // When scoped to one agent, drop to that bucket's individual players.
  const players = useMemo(
    () => (scope === ALL_SCOPE ? [] : scopedPlayers(book, scope)),
    [book, scope, getBookVersion()],
  )

  const totals = useMemo(() => {
    const src = rows
    return {
      toCollect: src.reduce((s, r) => s + r.toCollect, 0),
      toPay: src.reduce((s, r) => s + r.toPay, 0),
      commission: src.reduce((s, r) => s + r.commission, 0),
      net: src.reduce((s, r) => s + netBook(r), 0),
    }
  }, [rows])

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Each agent&apos;s weekly collect / pay position: what losing players owe in, what
          winning players are owed, the agent&apos;s commission on the losses, and what nets up to
          the level above. Players are bucketed under their nearest agent. Money moves only when
          you settle.
        </p>
      </header>

      <ScopeBar org={book} value={scope} onChange={setScope} />

      <section className="feat-kpis" aria-label="Collections summary">
        <div className="feat-kpi">
          <span className="feat-label">To collect</span>
          <strong className="feat-up">
            <Figure cents={totals.toCollect} plus={false} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">To pay</span>
          <strong className="feat-down">
            <Figure cents={totals.toPay} plus={false} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Commission</span>
          <strong>
            <Figure cents={totals.commission} plus={false} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Net book</span>
          <strong className={totals.net < 0 ? 'feat-down' : 'feat-up'}>
            <Figure cents={totals.net} />
          </strong>
        </div>
      </section>

      {scope === ALL_SCOPE ? (
        <div className="mdsk-scroll">
          <table className="feat-table" aria-label="Collections by agent">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Roster</th>
                <th className="num">To collect</th>
                <th className="num">To pay</th>
                <th className="num">Net</th>
                <th className="num">Commission</th>
                <th className="num">Remit up</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const net = netBook(r)
                const remit = remitUp(r)
                return (
                  <tr key={r.key}>
                    <td>
                      {r.label}
                      {r.agent && (
                        <span className="feat-label"> · {ROLE_LABEL[r.agent.role] ?? r.agent.role}</span>
                      )}
                    </td>
                    <td className="num">{r.roster}</td>
                    <td className="num">
                      {r.toCollect === 0 ? '—' : <Figure cents={r.toCollect} plus={false} />}
                    </td>
                    <td className="num">
                      {r.toPay === 0 ? '—' : <Figure cents={r.toPay} plus={false} />}
                    </td>
                    <td className={`num ${net < 0 ? 'feat-down' : net > 0 ? 'feat-up' : ''}`}>
                      <Figure cents={net} />
                    </td>
                    <td className="num">
                      {r.commission === 0 ? '—' : <Figure cents={r.commission} plus={false} />}
                    </td>
                    <td className={`num ${remit < 0 ? 'feat-down' : remit > 0 ? 'feat-up' : ''}`}>
                      <Figure cents={remit} />
                    </td>
                    <td className="feat-label">{direction(net)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mdsk-scroll">
          <table className="feat-table" aria-label="Collections for agent">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Figure</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td colSpan={3} className="feat-empty">
                    No players under this agent.
                  </td>
                </tr>
              ) : (
                [...players]
                  .sort((a, b) => a.account.balance - b.account.balance)
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td
                        className={`num ${p.account.balance < 0 ? 'feat-down' : p.account.balance > 0 ? 'feat-up' : ''}`}
                      >
                        <Figure cents={p.account.balance} />
                      </td>
                      {/* A player owes when their figure is negative → collect from them. */}
                      <td className="feat-label">{direction(-p.account.balance)}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
