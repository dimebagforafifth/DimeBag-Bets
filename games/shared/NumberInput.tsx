/**
 * A numeric text field you can actually type in (CLAUDE.md §2).
 *
 * The naive `<input type="number" value={n} onChange={parse}>` pattern fights the
 * user: because the displayed value is re-derived from a number on every
 * keystroke, an in-progress entry like "12." or "" gets wiped, you can't clear
 * the box, and clamping mid-type snaps the value away (e.g. a Cashout-At target
 * jumping off "1" before you reach "1.5"). This keeps a free-text DRAFT while the
 * field is focused — type anything — and only parses, rounds, and clamps on blur.
 * Valid numbers still commit live as you type (so previews update), but the text
 * you see is never reformatted out from under you until you leave the field.
 *
 * Works in the field's own display unit (e.g. dollars); the caller converts.
 */

import { useState } from 'react'

interface NumberInputProps {
  /** Committed value in display units, or null for an empty field. */
  value: number | null
  /** Commit a parsed value (already clamped). Receives null when cleared. */
  onCommit: (n: number | null) => void
  min?: number
  max?: number
  /** Decimal places kept on commit / display. Default 2. */
  decimals?: number
  /** An empty field commits null instead of reverting (e.g. Crash's Cashout At). */
  allowEmpty?: boolean
  className?: string
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
}

function trimNum(n: number, decimals: number): string {
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals
  return String(r)
}

export function NumberInput({
  value,
  onCommit,
  min,
  max,
  decimals = 2,
  allowEmpty = false,
  className,
  disabled,
  placeholder,
  ariaLabel,
}: NumberInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const display = value == null ? '' : trimNum(value, decimals)
  const shown = focused ? draft : display

  const clamp = (n: number) => {
    let x = n
    if (min != null) x = Math.max(min, x)
    if (max != null) x = Math.min(max, x)
    return x
  }
  const round = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals

  function handleChange(raw: string) {
    // keep digits and a single decimal point — stray characters never stick
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
    setDraft(cleaned)
    const s = cleaned.trim()
    if (s === '' || s === '.') {
      if (allowEmpty) onCommit(null)
      return // let partial / empty entries stand; don't commit a garbage number
    }
    const n = Number(s)
    if (Number.isFinite(n)) onCommit(clamp(n)) // commit live, but never reformat the draft
  }

  function handleFocus() {
    setFocused(true)
    setDraft(display) // start editing from the current value
  }

  function handleBlur() {
    setFocused(false)
    const s = draft.trim()
    const n = Number(s)
    if (s === '' || s === '.' || !Number.isFinite(n)) {
      onCommit(allowEmpty && s === '' ? null : clamp(value ?? min ?? 0))
    } else {
      onCommit(clamp(round(n)))
    }
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  )
}
