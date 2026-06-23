/**
 * Challenges Desk — the OPERATOR console surface for grading peer-to-peer challenges. An
 * accepted challenge holds both stakes in core `pending`; the operator settles it to the real
 * winner (pot → winner via core, nets zero) or voids an abandoned one (both stakes refunded).
 *
 * Settlement is RESULT/operator-driven — NEVER a participant picking their own winner; the
 * player section only proposes/accepts/declines. The console is inherently operator-gated
 * (players can't reach it), so this tile needs no extra role check. Money moves only through the
 * store's core escrow path; the desk just drives it.
 *
 * // SEAM (wiring pass): the automated path is the console results/Scores overlay that grades
 * book fixtures — when a fixture is graded, call challenges.settle(id, winner); when abandoned,
 * challenges.voidChallenge(id). This manual desk is the operator's direct control until then.
 */
import { useState, useSyncExternalStore } from 'react'
import { PanelShell } from '../_desk/shared.js'
import { formatMoney } from '../../games/shared/money.js'
import { challenges } from './store.js'
import { potCents } from './odds.js'
import type { Challenge, ChallengeWinner } from './types.js'
import './challenges-desk.css'

export function ChallengesDeskPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(challenges.subscribe, challenges.version, challenges.version)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const all = challenges.all()
  const inflight = all.filter((c) => c.status === 'accepted')
  const recent = all
    .filter((c) => c.status === 'settled' || c.status === 'voided')
    .sort((a, b) => (b.settledAt ?? b.createdAt) - (a.settledAt ?? a.createdAt))
    .slice(0, 8)

  const settle = (c: Challenge, winner: ChallengeWinner): void => {
    try {
      challenges.settle(c.id, winner)
      setErr(null)
      const name =
        winner === 'proposer' ? c.proposer.playerName : (c.accepter?.playerName ?? 'Accepter')
      setMsg(`Settled “${c.title}” — ${name} takes ${formatMoney(potCents(c))}.`)
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }
  const voidCh = (c: Challenge): void => {
    try {
      challenges.voidChallenge(c.id)
      setErr(null)
      setMsg(`Voided “${c.title}” — both stakes refunded.`)
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Grade accepted head-to-head challenges from the real result, or void an abandoned one. The
          pot pays through core — settle nets zero, void refunds both. Players never settle their
          own.
        </p>
      </header>

      {err && (
        <p className="feat-empty feat-down" role="alert">
          {err}
        </p>
      )}
      {msg && (
        <p className="feat-saved" role="status">
          {msg}
        </p>
      )}

      <section className="feat-card" aria-label="In flight">
        <h3 className="feat-h2">In flight ({inflight.length})</h3>
        {inflight.length === 0 ? (
          <p className="feat-sub">No accepted challenges awaiting a result.</p>
        ) : (
          <ul className="feat-list">
            {inflight.map((c) => (
              <li key={c.id} className="cdsk-row">
                <div className="cdsk-info">
                  <strong>{c.title}</strong>
                  <div className="feat-sub">
                    {c.proposer.playerName} · {c.proposerPick} ({formatMoney(c.proposerStakeCents)}){' '}
                    <span className="cdsk-vs">vs</span> {c.accepter?.playerName ?? 'Accepter'} ·{' '}
                    {c.accepterPick} ({formatMoney(c.accepterStakeCents)})
                  </div>
                  <div className="cdsk-pot">Pot {formatMoney(potCents(c))} · no vig</div>
                </div>
                <div className="feat-actions cdsk-actions">
                  <button type="button" className="feat-btn" onClick={() => settle(c, 'proposer')}>
                    {c.proposer.playerName} won
                  </button>
                  <button type="button" className="feat-btn" onClick={() => settle(c, 'accepter')}>
                    {c.accepter?.playerName ?? 'Accepter'} won
                  </button>
                  <button type="button" className="feat-btn" onClick={() => voidCh(c)}>
                    Void
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="feat-card" aria-label="Recently graded">
        <h3 className="feat-h2">Recently graded</h3>
        {recent.length === 0 ? (
          <p className="feat-sub">Nothing graded yet.</p>
        ) : (
          <ul className="feat-list">
            {recent.map((c) => (
              <li key={c.id} className="cdsk-row cdsk-done">
                <div className="cdsk-info">
                  <strong>{c.title}</strong>
                  <div className="feat-sub">
                    {c.status === 'voided'
                      ? 'Voided · both stakes refunded'
                      : `${c.winner === 'proposer' ? c.proposer.playerName : (c.accepter?.playerName ?? 'Accepter')} took ${formatMoney(potCents(c))}`}
                  </div>
                </div>
                <span className={`cdsk-tag ${c.status === 'voided' ? 'is-void' : 'is-settled'}`}>
                  {c.status === 'voided' ? 'Void' : 'Settled'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelShell>
  )
}
