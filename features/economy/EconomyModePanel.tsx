/**
 * Economy Mode — the manager-only control to switch the whole book between the credit (PPH)
 * and balance (wallet) economies (CLAUDE.md §3). The manager sets it; agents see it read-only
 * and inherit it. Flipping shows a confirmation that PREVIEWS the mid-season migration (what
 * each figure becomes, the book total before/after) before anything moves. Money moves only
 * through the audited migration in economy-config. Balance/credits, never cash.
 */
import { useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { getViewer, subscribeViewer, getViewerVersion } from '../../app/viewer.js'
import {
  getEconomyConfig,
  getEconomyConfigVersion,
  subscribeEconomyConfig,
  setEconomyMode,
  updateEconomyConfig,
  previewMigration,
  type SeedRule,
} from '../../app/economy-config.js'
import type { EconomyMode } from '../../core/index.js'
import { PanelShell } from '../_desk/shared.js'
import './economy.css'

const COPY: Record<EconomyMode, { title: string; blurb: string; points: string[] }> = {
  credit: {
    title: 'Credit (PPH)',
    blurb: 'A credit line and a weekly figure. Players run up or down to their limit; the book squares up and resets every week.',
    points: ['Credit limit per player', 'Weekly figure can go negative', 'Weekly settle: collect / pay, then reset'],
  },
  balance: {
    title: 'Balance (wallet)',
    blurb: 'A non-negative wallet wagered down — still no cash, no cash-out. No credit line, no weekly collect; balances carry forward continuously.',
    points: ['No credit line — wallet can’t go below the floor', 'No weekly collect — P&L snapshot + commission only', 'Balances persist week to week'],
  },
}

export function EconomyModePanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeEconomyConfig, getEconomyConfigVersion, getEconomyConfigVersion)
  useSyncExternalStore(subscribeViewer, getViewerVersion, getViewerVersion)

  const cfg = getEconomyConfig()
  const isManager = getViewer().role === 'manager'
  const mode = cfg.economyMode
  const other: EconomyMode = mode === 'credit' ? 'balance' : 'credit'

  const [confirming, setConfirming] = useState(false)
  const [seedKind, setSeedKind] = useState<'preserve' | 'flat'>('preserve')
  const [flatDollars, setFlatDollars] = useState('100')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const seed: SeedRule = seedKind === 'flat' ? { kind: 'flat', cents: toCents(Number(flatDollars) || 0) } : { kind: 'preserve' }
  // Cheap pure read (only while the confirm card is open) — no memo needed.
  const preview = confirming ? previewMigration(other, seed) : null

  function flip() {
    setError(null)
    try {
      const { report } = setEconomyMode(other, { seed })
      setConfirming(false)
      setDone(`Switched to ${COPY[report.to].title} — ${report.lines.length} account${report.lines.length === 1 ? '' : 's'} migrated.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the economy mode.')
    }
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <h2 className="feat-h">Economy mode</h2>
        <p className="feat-sub">
          The money model for the whole book. The manager sets it; agents inherit it. Switching
          mid-season migrates every account through the audited money path — previewed before it runs.
        </p>
      </header>

      <section className="eco-modes" aria-label="Economy modes">
        {(['credit', 'balance'] as EconomyMode[]).map((m) => (
          <div key={m} className={`eco-card ${m === mode ? 'is-active' : ''}`}>
            <div className="eco-card-top">
              <strong>{COPY[m].title}</strong>
              {m === mode && <span className="eco-pill">Active</span>}
            </div>
            <p className="eco-blurb">{COPY[m].blurb}</p>
            <ul className="eco-points">
              {COPY[m].points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!isManager ? (
        <p className="feat-empty">The economy mode is set by the manager. Agents inherit the book’s mode.</p>
      ) : !confirming ? (
        <div className="feat-actions">
          <button className="feat-btn feat-btn-primary" onClick={() => { setDone(null); setError(null); setConfirming(true) }}>
            Switch to {COPY[other].title}…
          </button>
          {done && <p className="feat-saved">{done}</p>}
          {error && <p className="feat-empty feat-down">{error}</p>}
        </div>
      ) : (
        <section className="feat-card eco-confirm">
          <h3 className="feat-h">Confirm: {COPY[mode].title} → {COPY[other].title}</h3>

          {other === 'balance' && (
            <div className="eco-seed">
              <p className="feat-sub">
                Every figure closes out to zero (a final credit settle), then each player’s wallet opens:
              </p>
              <label className="feat-check">
                <input type="radio" name="seed" checked={seedKind === 'preserve'} onChange={() => setSeedKind('preserve')} />
                Preserve each balance (open at the current figure, floored at {formatMoney(cfg.balanceFloorCents)})
              </label>
              <label className="feat-check">
                <input type="radio" name="seed" checked={seedKind === 'flat'} onChange={() => setSeedKind('flat')} />
                Flat opening balance
                <input
                  className="feat-input eco-flat"
                  type="number"
                  value={flatDollars}
                  aria-label="flat opening balance (dollars)"
                  onChange={(e) => setFlatDollars(e.target.value)}
                  disabled={seedKind !== 'flat'}
                />
              </label>
            </div>
          )}
          {other === 'credit' && (
            <p className="feat-sub">
              Figures are preserved as the opening figure and every player is assigned the default credit
              line of {formatMoney(cfg.creditDefaultLimitCents)}. No balances move.
            </p>
          )}

          {preview && (
            <dl className="feat-defs eco-preview">
              <dt>Accounts migrated</dt>
              <dd>{preview.lines.length}</dd>
              <dt>Book total before</dt>
              <dd>{formatMoney(preview.totalBeforeCents)}</dd>
              <dt>Book total after</dt>
              <dd>{formatMoney(preview.totalAfterCents)}</dd>
              <dt>Net credit moved</dt>
              <dd className={preview.ledgerDeltaCents < 0 ? 'feat-down' : ''}>{formatMoney(preview.ledgerDeltaCents)}</dd>
            </dl>
          )}

          <div className="feat-actions">
            <button className="feat-btn feat-btn-primary" onClick={flip}>Yes, switch &amp; migrate</button>
            <button className="feat-btn" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
          {error && <p className="feat-empty feat-down">{error}</p>}
        </section>
      )}

      {isManager && (
        <section className="feat-card">
          <h3 className="feat-h">Settings</h3>
          <div className="eco-settings">
            <label className="feat-field">
              <span className="feat-label">Balance floor ($) — balance mode</span>
              <input
                className="feat-input"
                type="number"
                defaultValue={cfg.balanceFloorCents / 100}
                aria-label="balance floor (dollars)"
                onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) updateEconomyConfig({ balanceFloorCents: toCents(n) }) }}
              />
            </label>
            <label className="feat-field">
              <span className="feat-label">Default credit line ($) — credit mode</span>
              <input
                className="feat-input"
                type="number"
                defaultValue={cfg.creditDefaultLimitCents / 100}
                aria-label="default credit line (dollars)"
                onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) updateEconomyConfig({ creditDefaultLimitCents: toCents(n) }) }}
              />
            </label>
          </div>
        </section>
      )}
    </PanelShell>
  )
}
