/**
 * Pools & Leagues — operator console oversight: allow/deny player-created pools, set format +
 * entry caps and the optional rake, and manage pool lifecycle (lock / settle / void). Manager-
 * gated; moves no money itself — lifecycle actions route through the store → core. Presentation
 * via the shared .feat-* classes + PanelShell.
 */

import { useState, useSyncExternalStore } from 'react'
import { PanelShell } from '../../features/operations/shared.js'
import { formatMoney, toCents, toDollars } from '../../games/shared/money.js'
import { FORMAT_KINDS } from '../formats/index.js'
import {
  canSetPoolsPolicy,
  getPoolsPolicy,
  getPoolsPolicyVersion,
  subscribePoolsPolicy,
  updatePoolsPolicy,
} from '../policy.js'
import {
  entriesForPool,
  getPools,
  lockPool,
  poolsVersion,
  settlePool,
  subscribePools,
  voidPool,
} from '../store.js'
import type { PoolKind } from '../types.js'

export function PoolsConsolePanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribePools, poolsVersion)
  useSyncExternalStore(subscribePoolsPolicy, getPoolsPolicyVersion)
  const canEdit = canSetPoolsPolicy()

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h1 className="feat-h1">Pools &amp; Leagues</h1>
          <p className="feat-sub">
            Player-run pools, leagues, and squares — set what players may create, the caps, and the
            rake, and manage each pool’s lifecycle. Entries + prizes move only through the audited
            core.
          </p>
        </div>
      </header>

      <PolicyCard canEdit={canEdit} />
      <PoolsTable canEdit={canEdit} />
    </PanelShell>
  )
}

function PolicyCard({ canEdit }: { canEdit: boolean }) {
  const policy = getPoolsPolicy()
  const [maxEntry, setMaxEntry] = useState(String(toDollars(policy.maxEntryCents)))
  const [rake, setRake] = useState((policy.rakeBps / 100).toFixed(1))
  const [maxRake, setMaxRake] = useState((policy.maxRakeBps / 100).toFixed(1))
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggleAllow = (allowPlayerPools: boolean): void => {
    try {
      updatePoolsPolicy({ allowPlayerPools })
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    }
  }
  const toggleFormat = (kind: PoolKind, on: boolean): void => {
    const next = on
      ? [...policy.allowedFormats, kind]
      : policy.allowedFormats.filter((k) => k !== kind)
    try {
      updatePoolsPolicy({ allowedFormats: next })
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    }
  }
  const save = (): void => {
    try {
      updatePoolsPolicy({
        maxEntryCents: toCents(Number(maxEntry)),
        rakeBps: Math.round(Number(rake) * 100),
        maxRakeBps: Math.round(Number(maxRake) * 100),
      })
      setErr(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    }
  }

  return (
    <section className="feat-card">
      <h2 className="feat-h2">Player pools policy</h2>
      <label className="feat-check">
        <input
          type="checkbox"
          checked={policy.allowPlayerPools}
          disabled={!canEdit}
          onChange={(e) => toggleAllow(e.target.checked)}
        />
        <span>Allow players to create pools</span>
      </label>

      <div className="feat-grid">
        <label className="feat-field">
          <span className="feat-label">Max entry ($, 0 = no cap)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            step="1"
            value={maxEntry}
            disabled={!canEdit}
            onChange={(e) => setMaxEntry(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Default rake (%)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={rake}
            disabled={!canEdit}
            onChange={(e) => setRake(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Max rake (%)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={maxRake}
            disabled={!canEdit}
            onChange={(e) => setMaxRake(e.target.value)}
          />
        </label>
      </div>

      <p className="feat-label" style={{ marginTop: 12 }}>
        Allowed formats
      </p>
      <div className="feat-actions">
        {FORMAT_KINDS.map((k) => (
          <label key={k} className="feat-check" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={policy.allowedFormats.includes(k)}
              disabled={!canEdit}
              onChange={(e) => toggleFormat(k, e.target.checked)}
            />
            <span>{k}</span>
          </label>
        ))}
      </div>

      {canEdit && (
        <div className="feat-actions" style={{ marginTop: 12 }}>
          <button type="button" className="feat-btn feat-btn-primary" onClick={save}>
            Save caps
          </button>
          {saved && <span className="feat-saved">Saved</span>}
          {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
        </div>
      )}
    </section>
  )
}

function PoolsTable({ canEdit }: { canEdit: boolean }) {
  const pools = getPools().filter((p) => !p.demo)
  const [err, setErr] = useState<string | null>(null)
  const act = (fn: () => void): void => {
    try {
      fn()
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    }
  }

  return (
    <section className="feat-card">
      <h2 className="feat-h2">Pools</h2>
      {err && <p style={{ color: 'var(--red)', fontSize: 12 }}>{err}</p>}
      {pools.length === 0 ? (
        <p className="feat-empty">No live pools yet.</p>
      ) : (
        <table className="feat-table">
          <thead>
            <tr>
              <th>Pool</th>
              <th>Format</th>
              <th>Status</th>
              <th className="num">Entrants</th>
              <th className="num">Pot</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => {
              const n = entriesForPool(p.id).length
              const pot = p.prizePoolCents ?? p.guaranteedCents + p.entryCents * n
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.kind}</td>
                  <td>{p.lifecycle}</td>
                  <td className="num">{n}</td>
                  <td className="num">{formatMoney(pot)}</td>
                  <td>
                    {canEdit && p.lifecycle === 'open' && (
                      <button
                        type="button"
                        className="feat-btn"
                        onClick={() => act(() => lockPool(p.id, Date.now()))}
                      >
                        Lock
                      </button>
                    )}
                    {canEdit && p.lifecycle === 'scoring' && (
                      <button
                        type="button"
                        className="feat-btn"
                        onClick={() => act(() => settlePool(p.id, Date.now()))}
                      >
                        Settle
                      </button>
                    )}
                    {canEdit &&
                      (p.lifecycle === 'open' ||
                        p.lifecycle === 'locked' ||
                        p.lifecycle === 'scoring') && (
                        <button
                          type="button"
                          className="feat-btn"
                          onClick={() =>
                            act(() => voidPool(p.id, 'operator-cancelled', Date.now()))
                          }
                        >
                          Void
                        </button>
                      )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
