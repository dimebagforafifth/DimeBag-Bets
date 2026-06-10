/** Small shared display helpers for the players lane (coins-only; no real-money terms). */

/** "3d ago" / "2h ago" / "just now" / "—" for a past epoch-ms (or null). */
export function agoLabel(at: number | null, now = Date.now()): string {
  if (at == null) return '—'
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/** A compact absolute date-time for a session row. */
export function dateLabel(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Signed coin delta with a leading + on positives (formatMoney already signs negatives). */
export function signed(formatted: string, cents: number): string {
  return cents > 0 ? `+${formatted}` : formatted
}
