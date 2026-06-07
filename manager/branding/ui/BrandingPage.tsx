import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoneyWith } from '../../../games/shared/money.js'
import type { MoneyDisplay } from '../../../games/shared/presentation.js'
import { formatInZone, isValidTimezone, type BookConfig } from '../config.js'
import { bookConfigStore } from '../config-store.js'
import './branding.css'

const LOCALES: { id: string; label: string }[] = [
  { id: 'en-US', label: 'en-US · 1,234.56' },
  { id: 'en-GB', label: 'en-GB · 1,234.56' },
  { id: 'de-DE', label: 'de-DE · 1.234,56' },
  { id: 'fr-FR', label: 'fr-FR · 1 234,56' },
  { id: 'en-IN', label: 'en-IN · 1,23,456' },
]
const ZONES: string[] = [
  '',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
]

/**
 * Branding / white-label + presentation settings. Edits a draft, previews it live,
 * and on Save applies it through the book-config store (which themes the app +
 * hydrates the money-display singleton). Self-contained; the shell mounts it.
 */
export function BrandingPage() {
  const version = useSyncExternalStore(bookConfigStore.subscribe, bookConfigStore.version)
  const saved = useMemo(() => bookConfigStore.config(), [version])
  const [draft, setDraft] = useState<BookConfig>(saved)

  const set = (patch: Partial<BookConfig>) => setDraft((d) => ({ ...d, ...patch }))
  const setMoney = (patch: Partial<MoneyDisplay>) => setDraft((d) => ({ ...d, money: { ...d.money, ...patch } }))

  const tzOk = isValidTimezone(draft.timezone)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const save = () => {
    bookConfigStore.update(draft)
    setDraft(bookConfigStore.config()) // resync to the normalized, saved config
  }
  const resetAll = () => {
    bookConfigStore.reset()
    setDraft(bookConfigStore.config())
  }

  const sampleMoney = formatMoneyWith(123456, draft.money)
  const sampleNeg = formatMoneyWith(-923, draft.money)
  const sampleTime = formatInZone(Date.now(), draft.timezone)
  const accent = draft.accent || '#5b8cff'

  return (
    <div className="mgr-brand">
      <header className="mgr-brand-head">
        <h1 className="mgr-brand-title">Branding &amp; presentation</h1>
        <p className="mgr-brand-sub">White-label your book. Save to apply across the app.</p>
      </header>

      {/* live preview */}
      <section className="mgr-preview" aria-label="Preview" style={{ ['--accent' as string]: accent }}>
        <div className="mgr-preview-bar">
          {draft.logoUrl ? (
            <img className="mgr-preview-logo" src={draft.logoUrl} alt="" />
          ) : (
            <span className="mgr-preview-mark" aria-hidden="true">
              {(draft.name || 'D').slice(0, 1)}
            </span>
          )}
          <div className="mgr-preview-name">
            <strong>{draft.name || 'DimeBag-Bets'}</strong>
            <span>{draft.tagline}</span>
          </div>
          <button className="mgr-preview-cta" type="button">
            Play
          </button>
        </div>
        <div className="mgr-preview-figs">
          <span>
            Balance <strong>{sampleMoney}</strong>
          </span>
          <span>
            Figure <strong className="neg">{sampleNeg}</strong>
          </span>
          <span>
            Time <strong>{sampleTime}</strong>
          </span>
        </div>
      </section>

      <div className="mgr-brand-grid">
        <section className="mgr-brand-card" aria-label="Branding">
          <h2 className="mgr-h2">Branding</h2>
          <Field label="Book name">
            <input className="mgr-input" maxLength={40} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <input className="mgr-input" maxLength={80} value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} />
          </Field>
          <Field label="Logo URL">
            <input
              className="mgr-input"
              placeholder="https://… or data:image/…"
              value={draft.logoUrl}
              onChange={(e) => set({ logoUrl: e.target.value })}
            />
          </Field>
          <Field label="Accent colour">
            <div className="mgr-accent">
              <input type="color" value={accent} onChange={(e) => set({ accent: e.target.value })} />
              <code className="mgr-accent-hex">{draft.accent || 'theme default'}</code>
              {draft.accent && (
                <button className="mgr-mini" type="button" onClick={() => set({ accent: '' })}>
                  Use theme default
                </button>
              )}
            </div>
          </Field>
          <Field label="Custom domain">
            <input
              className="mgr-input"
              placeholder="play.yourbook.com"
              value={draft.domain}
              onChange={(e) => set({ domain: e.target.value })}
            />
            <span className="mgr-hint">Point this host at the deployment in Vercel; saved here for reference.</span>
          </Field>
        </section>

        <section className="mgr-brand-card" aria-label="Presentation">
          <h2 className="mgr-h2">Presentation</h2>
          <Field label="Points symbol">
            <input
              className="mgr-input mgr-input-short"
              maxLength={4}
              value={draft.money.symbol}
              onChange={(e) => setMoney({ symbol: e.target.value })}
            />
          </Field>
          <Field label="Symbol position">
            <div className="mgr-toggle">
              <button className={draft.money.symbolPosition === 'before' ? 'is-on' : ''} onClick={() => setMoney({ symbolPosition: 'before' })}>
                Before ({draft.money.symbol}10)
              </button>
              <button className={draft.money.symbolPosition === 'after' ? 'is-on' : ''} onClick={() => setMoney({ symbolPosition: 'after' })}>
                After (10 {draft.money.symbol})
              </button>
            </div>
          </Field>
          <Field label="Decimals">
            <select className="mgr-select" value={draft.money.decimals} onChange={(e) => setMoney({ decimals: Number(e.target.value) })}>
              <option value={0}>0 — 1,235</option>
              <option value={1}>1 — 1,234.6</option>
              <option value={2}>2 — 1,234.56</option>
            </select>
          </Field>
          <Field label="Number format">
            <select className="mgr-select" value={draft.money.locale} onChange={(e) => setMoney({ locale: e.target.value })}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timezone">
            <select className="mgr-select" value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z || 'Local (device)'}
                </option>
              ))}
            </select>
            {!tzOk && <span className="mgr-hint mgr-err">Unknown timezone.</span>}
          </Field>
        </section>
      </div>

      <div className="mgr-brand-foot">
        <button className="mgr-mini" type="button" onClick={resetAll}>
          Reset to defaults
        </button>
        <button className="mgr-send" type="button" onClick={save} disabled={!dirty || !tzOk}>
          {dirty ? 'Save & apply' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mgr-field">
      <span className="mgr-label">{label}</span>
      {children}
    </label>
  )
}
