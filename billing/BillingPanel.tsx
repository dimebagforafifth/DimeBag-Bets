/**
 * Billing & Invoices — the operator console surface for per-head software billing.
 *
 * Shows the current week's running ACTIVE head count + projected fee, the invoice history,
 * and the rate / tier / add-on config; an invoice opens to a per-head breakdown that exports
 * to CSV / JSON. Operator (manager) only — the console gates the tile to staff and config
 * edits are manager-gated in the store.
 *
 * FIAT (real US dollars), NOT player points: amounts render through `usd()` (locked to '$'),
 * never the white-label points formatter, and NOTHING here touches the credit core. Presentation
 * only — all logic + the (fiat) money live in the billing/ module.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowLeft, Braces, Download, Pause, Receipt } from 'lucide-react'
import { PanelShell } from '../features/operations/shared.js'
import { getViewer } from '../app/viewer.js'
import { getBookVersion, subscribeBook } from '../app/book-store.js'
import { getBookLedgerVersion, subscribeBookLedger } from '../app/book-ledger.js'
import { toCents, toDollars } from '../games/shared/money.js'
import { usd } from './format.js'
import { invoiceCsv, invoiceJson } from './export.js'
import {
  generatePeriod,
  getBillingConfig,
  getBillingVersion,
  getPeriod,
  issuePeriod,
  listPeriods,
  markPeriodPaid,
  previewPeriod,
  subscribeBilling,
  updateBillingConfig,
  waivePeriod,
} from './store.js'
import type { BillingConfig, BillingPeriod, BillingStatus } from './types.js'
import './billing.css'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

/** Monday 00:00 UTC of the week containing `now`. */
function startOfWeekUTC(now: number): number {
  const d = new Date(now)
  const sinceMonday = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - sinceMonday * DAY
}
function currentWeek(now: number): { weekStart: number; weekEnd: number } {
  const weekStart = startOfWeekUTC(now)
  return { weekStart, weekEnd: weekStart + WEEK }
}
const fmtDay = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const weekLabel = (p: { weekStart: number; weekEnd: number }): string =>
  `${fmtDay(p.weekStart)} – ${fmtDay(p.weekEnd - DAY)}`

const STATUS_LABEL: Record<BillingStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  waived: 'Waived',
}
function StatusPill({ status }: { status: BillingStatus }) {
  return <span className={`bil-pill is-${status}`}>{STATUS_LABEL[status]}</span>
}

/** Shown when the activity source couldn't be guaranteed to cover the whole week — so the head
 *  count (and the bill) may be understated. The production server reader removes this limit. */
function CoverageNote() {
  return (
    <p className="bil-coverage">
      <AlertTriangle size={13} /> Activity read may be incomplete (capped local ledger) — the active
      head count could be understated. A server transactions feed removes this limit.
    </p>
  )
}

function download(name: string, content: string, type: string): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function BillingPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeBilling, getBillingVersion)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? getPeriod(openId) : undefined

  return (
    <PanelShell onBack={onBack}>
      {open ? (
        <InvoiceDetail period={open} onClose={() => setOpenId(null)} />
      ) : (
        <BillingHome onOpen={setOpenId} />
      )}
    </PanelShell>
  )
}

/* --------------------------------- home ---------------------------------- */

function BillingHome({ onOpen }: { onOpen: (id: string) => void }) {
  const config = getBillingConfig()
  const periods = listPeriods()
  const canEdit = getViewer().role === 'manager'

  // Re-run the projection when the billing config, the book, or the activity ledger changes.
  const billingV = getBillingVersion()
  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)
  const ledgerV = useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion)

  const now = Date.now()
  const week = currentWeek(now)
  // Projection of the current week (re-runs the head-count job; persists nothing).
  const preview = useMemo(
    () => previewPeriod({ ...week, now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [week.weekStart, billingV, bookV, ledgerV],
  )

  const onGenerate = (): void => {
    generatePeriod({ ...currentWeek(Date.now()), now: Date.now() })
  }

  return (
    <>
      <header className="feat-head">
        <div>
          <h1 className="feat-h1">
            Billing &amp; Invoices <span className="feat-flag">Fiat</span>
          </h1>
          <p className="feat-sub">
            What the platform charges this book — {usd(config.baseRateCentsPerHead)} per active
            player per week. Real dollars, billed to the operator; separate from player credits.
          </p>
        </div>
      </header>

      {/* ---- this week ---- */}
      <section className="feat-card">
        <div className="bil-week-head">
          <div>
            <h2 className="feat-h2">This week</h2>
            <p className="bil-week-range">{weekLabel(week)}</p>
          </div>
          <button
            type="button"
            className="feat-btn feat-btn-primary"
            onClick={onGenerate}
            disabled={!canEdit}
            title={canEdit ? 'Generate this week’s invoice' : 'Manager only'}
          >
            Generate invoice
          </button>
        </div>
        <div className="feat-kpis bil-kpis">
          <div className="feat-kpi">
            <span className="feat-label">Active heads</span>
            <strong>{preview.activeHeadCount}</strong>
            <span className="bil-kpi-sub">of {preview.snapshots.length} players</span>
          </div>
          <div className="feat-kpi">
            <span className="feat-label">Projected fee</span>
            <strong className="bil-amount">{usd(preview.totalCents)}</strong>
            <span className="bil-kpi-sub">
              {preview.status === 'waived' ? 'waived this week' : `${usd(preview.baseCents)} base`}
            </span>
          </div>
          <div className="feat-kpi">
            <span className="feat-label">Add-ons</span>
            <strong className="bil-amount">{usd(preview.addonCents)}</strong>
            <span className="bil-kpi-sub">
              {config.addons.filter((a) => a.enabled).length} enabled
            </span>
          </div>
          <div className="feat-kpi">
            <span className="feat-label">Discount</span>
            <strong className="bil-amount bil-neg">
              {preview.discountCents > 0 ? `−${usd(preview.discountCents)}` : usd(0)}
            </strong>
            <span className="bil-kpi-sub">
              {(config.cryptoDiscountBps / 100).toFixed(2)}% crypto
            </span>
          </div>
        </div>
        {!preview.coverageComplete && <CoverageNote />}
      </section>

      {/* ---- invoices ---- */}
      <section className="feat-card">
        <h2 className="feat-h2">Invoices</h2>
        {periods.length === 0 ? (
          <p className="feat-empty">No invoices yet — generate this week’s to get started.</p>
        ) : (
          <table className="feat-table">
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">Active heads</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th className="bil-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button type="button" className="bil-link" onClick={() => onOpen(p.id)}>
                      {weekLabel(p)}
                    </button>
                  </td>
                  <td className="num">{p.activeHeadCount}</td>
                  <td className="num bil-amount">{usd(p.totalCents)}</td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td className="bil-row-actions">
                    {canEdit && p.status === 'draft' && (
                      <button
                        type="button"
                        className="feat-btn bil-mini"
                        onClick={() => issuePeriod(p.id, Date.now())}
                      >
                        Issue
                      </button>
                    )}
                    {canEdit && p.status === 'issued' && (
                      <button
                        type="button"
                        className="feat-btn bil-mini"
                        onClick={() => markPeriodPaid(p.id, Date.now())}
                      >
                        Mark paid
                      </button>
                    )}
                    {canEdit && p.status !== 'paid' && p.status !== 'waived' && (
                      <button
                        type="button"
                        className="feat-btn bil-mini"
                        onClick={() => waivePeriod(p.id, Date.now())}
                      >
                        Waive
                      </button>
                    )}
                    <button
                      type="button"
                      className="feat-btn bil-mini"
                      onClick={() => onOpen(p.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <RateConfig config={config} canEdit={canEdit} />
    </>
  )
}

/* ------------------------------ rate config ------------------------------- */

function RateConfig({ config, canEdit }: { config: BillingConfig; canEdit: boolean }) {
  const [rate, setRate] = useState(String(toDollars(config.baseRateCentsPerHead)))
  const [freeWeeks, setFreeWeeks] = useState(String(config.freeWeeks))
  const [discountPct, setDiscountPct] = useState((config.cryptoDiscountBps / 100).toFixed(2))
  const [minWagers, setMinWagers] = useState(String(config.activeDefinition.minSettledWagers))
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = (): void => {
    try {
      updateBillingConfig({
        baseRateCentsPerHead: toCents(Number(rate)),
        freeWeeks: Math.trunc(Number(freeWeeks)),
        cryptoDiscountBps: Math.round(Number(discountPct) * 100),
        activeDefinition: {
          kind: 'settled-wager',
          minSettledWagers: Math.trunc(Number(minWagers)),
        },
      })
      setErr(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const toggleAddon = (key: string, enabled: boolean): void => {
    updateBillingConfig({
      addons: config.addons.map((a) => (a.key === key ? { ...a, enabled } : a)),
    })
  }
  const togglePause = (seasonalPause: boolean): void => {
    updateBillingConfig({ seasonalPause })
  }

  return (
    <section className="feat-card">
      <h2 className="feat-h2">Rate &amp; add-ons</h2>
      <div className="feat-grid">
        <label className="feat-field">
          <span className="feat-label">Base rate ($ / head / week)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            step="0.5"
            value={rate}
            disabled={!canEdit}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Active = settled wagers ≥</span>
          <input
            className="feat-input"
            type="number"
            min="1"
            step="1"
            value={minWagers}
            disabled={!canEdit}
            onChange={(e) => setMinWagers(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Free weeks</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            step="1"
            value={freeWeeks}
            disabled={!canEdit}
            onChange={(e) => setFreeWeeks(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Crypto discount (%)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={discountPct}
            disabled={!canEdit}
            onChange={(e) => setDiscountPct(e.target.value)}
          />
        </label>
      </div>

      <div className="bil-addons">
        {config.addons.map((a) => (
          <label key={a.key} className="feat-check bil-addon">
            <input
              type="checkbox"
              checked={a.enabled}
              disabled={!canEdit}
              onChange={(e) => toggleAddon(a.key, e.target.checked)}
            />
            <span>
              {a.label}{' '}
              <span className="bil-addon-price">
                {a.perHeadCents > 0 ? `${usd(a.perHeadCents)}/head` : ''}
                {a.perHeadCents > 0 && a.flatCents > 0 ? ' + ' : ''}
                {a.flatCents > 0 ? `${usd(a.flatCents)}/wk` : ''}
              </span>
            </span>
          </label>
        ))}
        <label className="feat-check bil-addon">
          <input
            type="checkbox"
            checked={config.seasonalPause}
            disabled={!canEdit}
            onChange={(e) => togglePause(e.target.checked)}
          />
          <span>
            <Pause size={13} /> Seasonal pause (waive every week)
          </span>
        </label>
      </div>

      {config.tiers.length > 0 && (
        <p className="bil-tiers">
          Volume schedule:{' '}
          {config.tiers
            .slice()
            .sort((a, b) => a.minHeads - b.minHeads)
            .map((t) => `${t.minHeads}+ → ${usd(t.rateCentsPerHead)}/head`)
            .join('  ·  ')}
        </p>
      )}

      {canEdit && (
        <div className="feat-actions bil-save">
          <button type="button" className="feat-btn feat-btn-primary" onClick={save}>
            Save rate
          </button>
          {saved && <span className="feat-saved">Saved</span>}
          {err && <span className="bil-err">{err}</span>}
        </div>
      )}
    </section>
  )
}

/* ----------------------------- invoice detail ----------------------------- */

function InvoiceDetail({ period, onClose }: { period: BillingPeriod; onClose: () => void }) {
  const heads = period.snapshots
  return (
    <>
      <header className="feat-head">
        <div>
          <button type="button" className="bil-back" onClick={onClose}>
            <ArrowLeft size={15} /> All invoices
          </button>
          <h1 className="feat-h1">
            <Receipt size={20} /> {weekLabel(period)}
          </h1>
          <p className="feat-sub">
            Invoice {period.id} · <StatusPill status={period.status} />
          </p>
        </div>
        <div className="feat-actions">
          <button
            type="button"
            className="feat-btn"
            onClick={() => download(`${period.id}.csv`, invoiceCsv(period), 'text/csv')}
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            className="feat-btn"
            onClick={() => download(`${period.id}.json`, invoiceJson(period), 'application/json')}
          >
            <Braces size={14} /> JSON
          </button>
        </div>
      </header>

      {!period.coverageComplete && <CoverageNote />}

      <section className="feat-card">
        <dl className="feat-defs bil-defs">
          <dt>Active heads</dt>
          <dd>{period.activeHeadCount}</dd>
          <dt>Billed heads</dt>
          <dd>{period.billedHeadCount}</dd>
          <dt>Base</dt>
          <dd>{usd(period.baseCents)}</dd>
          <dt>Add-ons</dt>
          <dd>{usd(period.addonCents)}</dd>
          <dt>Discount</dt>
          <dd>{period.discountCents > 0 ? `−${usd(period.discountCents)}` : usd(0)}</dd>
          <dt className="bil-total-dt">Total</dt>
          <dd className="bil-total-dd">{usd(period.totalCents)}</dd>
        </dl>
      </section>

      <section className="feat-card">
        <h2 className="feat-h2">Heads ({heads.length})</h2>
        {heads.length === 0 ? (
          <p className="feat-empty">
            No per-head breakdown stored for this invoice (seeded history).
          </p>
        ) : (
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Agent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <tr key={h.playerId}>
                  <td>{h.playerName}</td>
                  <td>{h.agentName ?? h.agentId ?? '—'}</td>
                  <td className={h.active ? 'bil-active' : 'bil-inactive'}>
                    {h.active ? 'Billable' : h.reason === 'inactive' ? 'Suspended' : 'No action'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
