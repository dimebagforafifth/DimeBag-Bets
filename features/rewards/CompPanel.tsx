/**
 * Manual Comp — the VIP-host tool: hand a player discretionary balance / free plays / a
 * limit boost / a badge, with a reason and a record (CLAUDE.md §4). Gated by the SAME role
 * model:
 *  - MANAGER comps any player (within the economy's total issuance cap).
 *  - AGENT (only if the manager granted 'rewards-comp') comps ONLY their downline, within
 *    their weekly comp allowance. The player picker is auto-scoped to the agent's roster.
 * BALANCE & STATUS ONLY — funds credit the player's real balance; never cash.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { getViewer, subscribeViewer, getViewerVersion } from '../../app/viewer.js'
import { fmt } from './data.js'
import {
  issueComp,
  compAllowanceLeft,
  subscribeIssuance,
  getIssuanceVersion,
  type CompRequest,
} from './comp.js'
import {
  getPlayerRewards,
  subscribeRewardsPlayers,
  getRewardsPlayersVersion,
  type CompKind,
} from './players.js'
import { PanelShell } from '../_desk/shared.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'
import './rewards-admin.css'

const KINDS: { kind: CompKind; label: string; amount: boolean }[] = [
  { kind: 'balance', label: 'Bonus balance', amount: true },
  { kind: 'freeplay', label: 'Free plays', amount: true },
  { kind: 'limitboost', label: 'Limit boost', amount: false },
  { kind: 'badge', label: 'Badge', amount: false },
]

const NOW = 1_750_000_000_000

export function CompPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeViewer, getViewerVersion)
  useSyncExternalStore(subscribeRewardsPlayers, getRewardsPlayersVersion)
  useSyncExternalStore(subscribeIssuance, getIssuanceVersion)
  const book = getBook()
  const viewer = getViewer()

  const [scope, setScope] = useState(ALL_SCOPE)
  const players = useMemo(() => scopedPlayers(book, scope), [book, scope, bv])
  const [target, setTarget] = useState('')
  const sel = players.some((p) => p.id === target) ? target : (players[0]?.id ?? '')

  const [kind, setKind] = useState<CompKind>('balance')
  const [amount, setAmount] = useState('1000')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const allowance = compAllowanceLeft(viewer.memberId, viewer.role, NOW)
  const needsAmount = KINDS.find((k) => k.kind === kind)?.amount ?? false

  const submit = () => {
    setMsg(null)
    if (!sel) return
    const req: CompRequest = {
      actorMemberId: viewer.memberId,
      actorRole: viewer.role,
      targetPlayerId: sel,
      kind,
      amount: needsAmount ? Number(amount) || 0 : 0,
      reason,
      now: NOW,
    }
    const res = issueComp(req)
    if (res.ok) {
      const name = book.members[sel]?.name ?? sel
      setMsg({ ok: true, text: `Comped ${name} — ${needsAmount ? fmt(Number(amount) || 0) : kind}.` })
      setReason('')
    } else {
      setMsg({ ok: false, text: res.error ?? 'Could not issue that comp.' })
    }
  }

  const history = sel ? getPlayerRewards(sel).compHistory : []

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Hand a player a discretionary reward — balance, free plays, a limit boost, or a badge —
          with a reason that’s recorded. Funds land in the player’s balance.
          {viewer.role !== 'manager' && (
            <>
              {' '}
              You can comp your own players, up to{' '}
              <strong>{allowance === Infinity ? '∞' : fmt(allowance)}</strong> left this week.
            </>
          )}
        </p>
      </header>

      <ScopeBar org={book} value={scope} onChange={setScope} />

      <div className="rwa-comp-grid">
        <label className="feat-field">
          <span>Player</span>
          <select className="feat-input" value={sel} onChange={(e) => setTarget(e.target.value)}>
            {players.length === 0 && <option value="">— no players in scope —</option>}
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feat-field">
          <span>Reward</span>
          <select className="feat-input" value={kind} onChange={(e) => setKind(e.target.value as CompKind)}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {needsAmount && (
          <label className="feat-field">
            <span>{kind === 'freeplay' ? 'Free-play amount' : 'Amount'}</span>
            <input
              className="feat-input"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            />
          </label>
        )}
        <label className="feat-field rwa-comp-reason">
          <span>Reason (recorded)</span>
          <input className="feat-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. loyalty — rough week" />
        </label>
      </div>

      <div className="feat-actions">
        <button className="feat-btn feat-btn-primary" onClick={submit} disabled={!sel}>
          Issue comp
        </button>
      </div>
      {msg && <p className={msg.ok ? 'feat-saved' : 'feat-empty feat-down'}>{msg.text}</p>}

      {sel && (
        <section className="feat-card" aria-label="Comp history">
          <h3 className="feat-h2">Comp history · {book.members[sel]?.name}</h3>
          {history.length === 0 ? (
            <p className="feat-empty">No comps recorded for this player yet.</p>
          ) : (
            <table className="rwa-table">
              <thead>
                <tr>
                  <th>By</th>
                  <th>Reward</th>
                  <th className="num">Amount</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
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
      )}
    </PanelShell>
  )
}
