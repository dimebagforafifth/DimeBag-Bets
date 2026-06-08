/**
 * A small "?" help dot for the manager console (CLAUDE.md §4 — honest by default).
 * Drop it next to a section or tool to explain, in plain language, what that feature
 * does. It mirrors the player-facing glossary info-dot (games/shared/GlossaryTerm) for a
 * consistent feel, but takes its text directly — operator-feature help isn't player
 * glossary. Reveals on hover, keyboard focus, or tap.
 */

import { useId, useState } from 'react'
import './help.css'

export function HelpDot({ title, text }: { title?: string; text: string }) {
  const tipId = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="help">
      <button
        type="button"
        className="help-dot"
        aria-label={title ? `What is “${title}”?` : 'What is this?'}
        aria-describedby={tipId}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation() // don't trigger the section/tool tab it sits beside
          setOpen((o) => !o)
        }}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      <span id={tipId} role="tooltip" className={`help-pop ${open ? 'is-open' : ''}`}>
        {title && <span className="help-pop-term">{title}</span>}
        <span className="help-pop-text">{text}</span>
      </span>
    </span>
  )
}
