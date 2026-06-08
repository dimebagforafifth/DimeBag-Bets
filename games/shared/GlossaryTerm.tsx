/**
 * The one reusable glossary info-icon (CLAUDE.md §4 — honest by default). Drop a
 * small "i" next to any betting/casino term; hovering, focusing, or tapping it
 * shows the plain-language explanation from the single glossary file
 * (games/shared/glossary). Pure presentational + a touch of local open state for
 * tap targets. Used across the casino and the sportsbook.
 *
 *   <Term id="parlay">Parlay</Term>   // a label followed by the info dot
 *   <InfoDot id="vig" />              // just the dot, inline
 */

import { useId, useState, type ReactNode } from 'react'
import { glossaryEntry } from './glossary.js'
import './glossary.css'

/** The standalone "i" dot + its tooltip. Unknown ids render nothing. */
export function InfoDot({ id }: { id: string }) {
  const entry = glossaryEntry(id)
  const tipId = useId()
  const [open, setOpen] = useState(false)
  if (!entry) return null
  return (
    <span className="gloss">
      <button
        type="button"
        className="gloss-dot"
        aria-label={`What does ${entry.term} mean?`}
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      <span id={tipId} role="tooltip" className={`gloss-pop ${open ? 'is-open' : ''}`}>
        <span className="gloss-pop-term">{entry.term}</span>
        <span className="gloss-pop-text">{entry.short}</span>
      </span>
    </span>
  )
}

/** A term label with a trailing info dot. With no children it's just the dot. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  if (children == null) return <InfoDot id={id} />
  return (
    <span className="gloss-term">
      {children}
      <InfoDot id={id} />
    </span>
  )
}
