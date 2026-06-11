/**
 * Money-desk React helpers — the small shared building blocks the four panels reuse
 * so they read as one family. PanelShell + the feat-* classes come from the shell's
 * operations theme (imported, not edited); this adds the desk-specific bits the shell
 * doesn't ship (filter chips, segmented tabs, sticky toolbar, signed figure, CSV
 * download). All money is shown read-only via formatMoney — dollars, never real money.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import './desk.css'

// One charcoal/gold chrome wrapper for every desk panel (Escape → onBack, no top
// bar). Re-exported so the coupling to the shell theme lives in exactly one place.
export { PanelShell } from '../operations/shared.js'

/** Live org snapshot, re-rendering on every figure move. */
export function useBook() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  return getBook()
}

/** A signed dollar figure with up/down tone and an explicit + on gains (formatMoney
 *  already renders the − on losses). */
export function Figure({ cents, plus = true }: { cents: number; plus?: boolean }) {
  const tone = cents > 0 ? 'feat-up' : cents < 0 ? 'feat-down' : ''
  return (
    <span className={`feat-num ${tone}`}>
      {plus && cents > 0 ? '+' : ''}
      {formatMoney(cents)}
    </span>
  )
}

/** A row of filter chips / segmented options bound to a single value. */
export function ChipBar<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="mdsk-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`mdsk-chip ${o.value === value ? 'is-on' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A compact segmented control (Grant/Deduct/Set, sort toggles). */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="mdsk-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`mdsk-tab ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A sticky search + filter toolbar wrapper. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mdsk-toolbar">{children}</div>
}

/** Trigger a client-side file download (CSV/JSON). Mirrors SettlementHistory's
 *  Blob + object-URL pattern. */
export function downloadFile(filename: string, text: string, type = 'text/csv'): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
