/**
 * Delayed tooltips for the management console. A tooltip opens after a short
 * hover-intent DELAY (so it doesn't flash up the instant the pointer crosses it),
 * opens immediately on keyboard focus (deliberate), and dismisses on leave / blur /
 * Escape. `InfoDot` and `Term` pull their copy from the operator glossary so the
 * hover text and the Operator Manual never drift apart.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GLOSSARY, type GlossaryId } from './glossary.js'

const SHOW_DELAY = 450 // ms — the "slight delay" so tips don't pop instantly
const HIDE_DELAY = 90

export function Tooltip({
  tip,
  children,
  delay = SHOW_DELAY,
}: {
  tip: ReactNode
  children: ReactNode
  delay?: number
}) {
  const [open, setOpen] = useState(false)
  const show = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => {
    if (show.current) clearTimeout(show.current)
    if (hide.current) clearTimeout(hide.current)
    show.current = hide.current = null
  }
  useEffect(() => clear, [])

  const openSoon = () => {
    clear()
    show.current = setTimeout(() => setOpen(true), delay) // intent delay
  }
  const openNow = () => {
    clear()
    setOpen(true) // keyboard focus is deliberate — no delay
  }
  const closeSoon = () => {
    clear()
    hide.current = setTimeout(() => setOpen(false), HIDE_DELAY)
  }

  return (
    <span
      className="mdsk-tip-wrap"
      onPointerEnter={openSoon}
      onPointerLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          clear()
          setOpen(false)
        }
      }}
    >
      {children}
      {open && (
        <span role="tooltip" className="mdsk-tip">
          {tip}
        </span>
      )}
    </span>
  )
}

const tipBody = (id: GlossaryId): ReactNode => {
  const e = GLOSSARY[id]
  return (
    <>
      <strong>{e.label}</strong> — {e.short}
    </>
  )
}

/** A small "i" info badge that reveals a glossary explanation on hover/focus. */
export function InfoDot({ id, label }: { id: GlossaryId; label?: string }) {
  return (
    <Tooltip tip={tipBody(id)}>
      <button
        type="button"
        className="mdsk-info"
        aria-label={`What is ${label ?? GLOSSARY[id].label}?`}
      >
        i
      </button>
    </Tooltip>
  )
}

/** A dotted-underlined term whose definition appears on hover/focus. */
export function Term({ id, children }: { id: GlossaryId; children?: ReactNode }) {
  return (
    <Tooltip tip={tipBody(id)}>
      <button type="button" className="mdsk-term">
        {children ?? GLOSSARY[id].label}
      </button>
    </Tooltip>
  )
}
