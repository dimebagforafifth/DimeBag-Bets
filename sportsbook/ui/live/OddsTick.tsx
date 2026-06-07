/**
 * A price that flashes when it moves (CLAUDE.md §2) — the "steam" indicator a
 * live board needs. Render it with the current odds; whenever the value changes
 * it briefly shows a ▲/▼ and a colour so the bettor sees the line move. Pure
 * presentational; the parent just feeds it fresh odds from the live feed.
 */

import { useEffect, useRef, useState } from 'react'
import './live.css'

interface OddsTickProps {
  /** The current price (decimal or american — whatever `format` expects). */
  value: number
  /** Render the number; defaults to 2-dp decimal. */
  format?: (v: number) => string
  /** How long the move highlight lingers, ms. */
  flashMs?: number
}

export function OddsTick({ value, format = (v) => v.toFixed(2), flashMs = 1200 }: OddsTickProps) {
  const prev = useRef(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const previous = prev.current
    prev.current = value
    if (value === previous) return // first render / no change
    setDir(value > previous ? 'up' : 'down')
    const t = setTimeout(() => setDir(null), flashMs)
    return () => clearTimeout(t)
  }, [value, flashMs])

  return (
    <span className={`odds-tick ${dir ? `tick-${dir}` : ''}`}>
      {format(value)}
      {dir && <span className="tick-arrow" aria-hidden="true">{dir === 'up' ? '▲' : '▼'}</span>}
    </span>
  )
}
