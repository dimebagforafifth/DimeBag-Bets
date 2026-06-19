/**
 * Player Import — the operator console surface for moving a whole book onto us.
 *
 * Flow: pick/upload a CSV → confirm the auto-detected column mapping → Validate (a dry run that
 * previews exactly what will happen) → Commit (creates the players, reconstructs the agent tree,
 * and seeds each opening figure through the audited core path). The list view shows every batch
 * and its status; the detail view is the map → preview → commit wizard.
 *
 * Presentation only — all logic + money live in the import/ module; this never writes a balance.
 * Consumes the global tokens via the shared `.feat-*` classes (PanelShell remaps them).
 */

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, FileUp, Trash2, UploadCloud } from 'lucide-react'
import { PanelShell } from '../operations/shared.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  applyTemplate,
  commit,
  createBatchFromCsv,
  deleteBatch,
  getBatch,
  getRows,
  getTemplates,
  importVersion,
  listBatches,
  saveTemplate,
  subscribeImport,
  updateMapping,
  validate,
  type CanonicalField,
  type ImportBatch,
  type ImportRow,
} from '../../import/index.js'
import './import.css'

const ACTOR = 'operator'
const PREVIEW_CAP = 200

const FIELDS: { field: CanonicalField; label: string; required?: boolean }[] = [
  { field: 'name', label: 'Player name', required: true },
  { field: 'agent', label: 'Agent / sub-agent' },
  { field: 'creditLimit', label: 'Credit limit' },
  { field: 'startingBalance', label: 'Opening figure' },
  { field: 'nickname', label: 'Nickname' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'externalId', label: 'Source ID' },
  { field: 'notes', label: 'Notes' },
]

const STATUS_LABEL: Record<ImportBatch['status'], string> = {
  draft: 'Draft',
  validated: 'Validated',
  committed: 'Committed',
  failed: 'Needs attention',
}

export function ImportPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeImport, importVersion)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const batch = selectedId ? getBatch(selectedId) : undefined

  return (
    <PanelShell onBack={onBack}>
      {batch ? (
        <BatchWizard batch={batch} onClose={() => setSelectedId(null)} />
      ) : (
        <BatchList onOpen={setSelectedId} />
      )}
    </PanelShell>
  )
}

/* ------------------------------- list view ------------------------------- */

function BatchList({ onOpen }: { onOpen: (id: string) => void }) {
  const batches = listBatches()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <header className="feat-head">
        <div>
          <h1 className="feat-h1">Player Import</h1>
          <p className="feat-sub">
            Move a book onto us: upload your player list, map the columns once, preview, then
            commit. We create the players, rebuild the agent tree, and seed each opening figure.
          </p>
        </div>
        {!adding && (
          <button className="feat-btn feat-btn-primary" onClick={() => setAdding(true)}>
            <UploadCloud size={15} /> New import
          </button>
        )}
      </header>

      {adding && <NewImport onCreated={onOpen} onCancel={() => setAdding(false)} />}

      {batches.length === 0 ? (
        <div className="feat-empty">No imports yet. Upload a CSV to get started.</div>
      ) : (
        <table className="feat-table imp-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th className="num">Rows</th>
              <th className="num">Created</th>
              <th className="num">Skipped</th>
              <th className="num">Errors</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="imp-row" onClick={() => onOpen(b.id)}>
                <td className="imp-source">{b.sourceLabel}</td>
                <td>
                  <span className={`imp-badge imp-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                </td>
                <td className="num">{b.rowCount}</td>
                <td className="num">{b.createdCount || '—'}</td>
                <td className="num">{b.skippedCount || '—'}</td>
                <td className="num">{b.errorCount || '—'}</td>
                <td className="num">
                  <button
                    className="imp-icon-btn"
                    title="Delete import record"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteBatch(b.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function NewImport({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState('')
  const [label, setLabel] = useState('')

  const fromText = (csv: string, sourceLabel: string) => {
    if (!csv.trim()) return
    const b = createBatchFromCsv({ sourceLabel, csv, createdBy: ACTOR, now: Date.now() })
    onCreated(b.id)
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => fromText(String(reader.result ?? ''), file.name)
    reader.readAsText(file)
  }

  return (
    <section className="feat-card imp-new">
      <h2 className="feat-h2">New import</h2>
      <div className="imp-new-row">
        <button className="feat-btn" onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> Choose CSV file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="imp-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        <span className="feat-sub">or paste rows below</span>
      </div>
      <textarea
        className="feat-input imp-paste"
        placeholder={'Player Name,Agent,Credit Limit,Balance\nMarco,North / East,2000,-450'}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={5}
      />
      <div className="imp-new-row">
        <input
          className="feat-input"
          placeholder="Source label (e.g. Acme export)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          className="feat-btn feat-btn-primary"
          disabled={!paste.trim()}
          onClick={() => fromText(paste, label.trim() || 'Pasted rows')}
        >
          Create draft
        </button>
        <button className="feat-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

/* ------------------------------ batch wizard ----------------------------- */

function BatchWizard({ batch, onClose }: { batch: ImportBatch; onClose: () => void }) {
  const rows = getRows(batch.id)
  const templates = getTemplates()
  const committed = batch.status === 'committed'

  const setField = (field: CanonicalField, header: string) => {
    const columnMap = { ...batch.columnMap }
    if (header) columnMap[field] = header
    else delete columnMap[field]
    updateMapping(batch.id, columnMap, batch.options)
  }

  const onValidate = () => validate(batch.id)

  const onCommit = () => {
    // SEAM (interlock with Lane A): wrap opening-figure import in <ModeGate> so figures are only
    // seeded in an economy mode that allows carrying a starting balance; the wiring pass injects
    // useEconomyMode()/<ModeGate>. Until then the commit applies figures (off-by-default safe —
    // it still moves money only through the audited core path).
    const ok = window.confirm(
      `Create ${batch.createdCount} player(s)` +
        ` from “${batch.sourceLabel}” and seed their opening figures?\n\n` +
        `This moves credits through your book via the audited core path. Already-imported ` +
        `players are skipped, so it is safe to re-run.`,
    )
    if (!ok) return
    commit(batch.id, { actor: ACTOR, now: Date.now() })
  }

  return (
    <>
      <header className="feat-head">
        <div>
          <button className="imp-crumb" onClick={onClose}>
            <ArrowLeft size={14} /> All imports
          </button>
          <h1 className="feat-h1">{batch.sourceLabel}</h1>
          <p className="feat-sub">
            <span className={`imp-badge imp-${batch.status}`}>{STATUS_LABEL[batch.status]}</span>{' '}
            {batch.rowCount} rows · {batch.headers.length} columns
          </p>
        </div>
      </header>

      {!committed && (
        <MappingEditor
          batch={batch}
          templates={templates}
          onField={setField}
          onOption={(options) => updateMapping(batch.id, batch.columnMap, options)}
          onApplyTemplate={(id) => applyTemplate(batch.id, id)}
          onSaveTemplate={(name) => saveTemplate(name, batch.columnMap, batch.options)}
        />
      )}

      {(batch.status === 'validated' || committed || batch.status === 'failed') && (
        <Summary batch={batch} />
      )}

      <PreviewTable rows={rows} />

      <div className="imp-actions">
        {!committed && (
          <button className="feat-btn" onClick={onValidate}>
            {batch.status === 'draft' ? 'Validate' : 'Re-validate'}
          </button>
        )}
        {!committed && (
          <button
            className="feat-btn feat-btn-primary"
            disabled={batch.status !== 'validated' || batch.createdCount === 0}
            onClick={onCommit}
            title={
              batch.status !== 'validated'
                ? 'Validate first'
                : batch.createdCount === 0
                  ? 'Nothing to create'
                  : 'Create the players and seed figures'
            }
          >
            Commit import
          </button>
        )}
        {committed && (
          <button className="feat-btn feat-btn-primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </>
  )
}

function Summary({ batch }: { batch: ImportBatch }) {
  const willOrDid = batch.status === 'committed' ? '' : 'will '
  return (
    <section className="feat-kpis imp-kpis">
      <div className="feat-kpi">
        <span className="feat-label">
          {batch.status === 'committed' ? 'Created' : `${willOrDid}create`}
        </span>
        <strong className="imp-num-create">{batch.createdCount}</strong>
      </div>
      <div className="feat-kpi">
        <span className="feat-label">Skipped</span>
        <strong>{batch.skippedCount}</strong>
      </div>
      <div className="feat-kpi">
        <span className="feat-label">Errors</span>
        <strong className={batch.errorCount ? 'imp-num-error' : ''}>{batch.errorCount}</strong>
      </div>
    </section>
  )
}

function MappingEditor({
  batch,
  templates,
  onField,
  onOption,
  onApplyTemplate,
  onSaveTemplate,
}: {
  batch: ImportBatch
  templates: { id: string; name: string }[]
  onField: (f: CanonicalField, header: string) => void
  onOption: (options: ImportBatch['options']) => void
  onApplyTemplate: (id: string) => void
  onSaveTemplate: (name: string) => void
}) {
  return (
    <section className="feat-card imp-map">
      <div className="imp-map-head">
        <h2 className="feat-h2">Column mapping</h2>
        <div className="imp-map-tools">
          {templates.length > 0 && (
            <select
              className="feat-input imp-select"
              value=""
              onChange={(e) => e.target.value && onApplyTemplate(e.target.value)}
            >
              <option value="">Apply template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="feat-btn"
            onClick={() => {
              const name = window.prompt('Save this mapping as a template named:')
              if (name?.trim()) onSaveTemplate(name.trim())
            }}
          >
            Save as template
          </button>
        </div>
      </div>

      <div className="imp-map-grid">
        {FIELDS.map(({ field, label, required }) => (
          <label key={field} className="imp-map-field">
            <span className="feat-label">
              {label}
              {required && <span className="imp-req"> *</span>}
            </span>
            <select
              className="feat-input"
              value={batch.columnMap[field] ?? ''}
              onChange={(e) => onField(field, e.target.value)}
            >
              <option value="">— not imported —</option>
              {batch.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="imp-options">
        <label className="feat-check">
          <input
            type="checkbox"
            checked={batch.options.amountsInDollars}
            onChange={(e) => onOption({ ...batch.options, amountsInDollars: e.target.checked })}
          />
          Amounts are in dollars (uncheck if the file is already in cents)
        </label>
        <label className="imp-delim">
          <span className="feat-label">Agent path separator</span>
          <input
            className="feat-input"
            value={batch.options.agentDelimiter}
            maxLength={3}
            onChange={(e) => onOption({ ...batch.options, agentDelimiter: e.target.value || '/' })}
          />
        </label>
      </div>
    </section>
  )
}

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  const shown = useMemo(() => rows.slice(0, PREVIEW_CAP), [rows])
  if (rows.length === 0) return <div className="feat-empty">This file has no rows.</div>

  return (
    <section className="imp-preview">
      {rows.length > PREVIEW_CAP && (
        <p className="feat-sub">
          Showing the first {PREVIEW_CAP} of {rows.length} rows.
        </p>
      )}
      <table className="feat-table imp-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Agent path</th>
            <th className="num">Credit</th>
            <th className="num">Opening figure</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>{r.mapped?.name || <span className="imp-muted">(no name)</span>}</td>
              <td className="imp-path">
                {r.mapped && r.mapped.agentPath.length > 0 ? (
                  r.mapped.agentPath.join(' › ')
                ) : (
                  <span className="imp-muted">house-direct</span>
                )}
              </td>
              <td className="num">{r.mapped ? formatMoney(r.mapped.creditLimitCents) : '—'}</td>
              <td className="num">
                {r.mapped && r.mapped.startingBalanceCents !== 0
                  ? formatMoney(r.mapped.startingBalanceCents)
                  : '—'}
              </td>
              <td>
                <span className={`imp-badge imp-res-${r.result}`}>{r.result}</span>
                {r.errorReason && <span className="imp-reason">{r.errorReason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
