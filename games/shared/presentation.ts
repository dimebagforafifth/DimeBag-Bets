/**
 * Presentation config for money display — the one knob `formatMoney` reads so the
 * operator can white-label how points render (symbol, position, locale, decimals)
 * WITHOUT forking a second formatter (CLAUDE.md §2). A module singleton, defaulting
 * to the historical "$1,234.56" so nothing changes until a manager sets it. The
 * manager Branding/Presentation store hydrates + updates this; games just read it.
 *
 * This lives in games/shared (a leaf) so money.ts can read it with no dependency on
 * the manager layer. Points remain integer cents; only the *display* shifts.
 */

export interface MoneyDisplay {
  /** The unit mark, e.g. "$" or "₵" or "pts". */
  symbol: string
  /** Whether the symbol sits before the number ("$10") or after ("10 pts"). */
  symbolPosition: 'before' | 'after'
  /** Intl locale for grouping/decimal style, e.g. "en-US". */
  locale: string
  /** Fraction digits shown (0–2). Points are still integer cents underneath. */
  decimals: number
}

export const DEFAULT_MONEY_DISPLAY: MoneyDisplay = {
  symbol: '$',
  symbolPosition: 'before',
  locale: 'en-US',
  decimals: 2,
}

let current: MoneyDisplay = { ...DEFAULT_MONEY_DISPLAY }
const listeners = new Set<() => void>()

/** The live money-display config (read by formatMoney). */
export function moneyDisplay(): MoneyDisplay {
  return current
}

/** Apply a (partial) display config and notify readers. */
export function setMoneyDisplay(patch: Partial<MoneyDisplay>): void {
  current = { ...current, ...patch }
  for (const l of listeners) l()
}

/** Restore the historical "$/en-US/2dp" defaults (used by tests + a config reset). */
export function resetMoneyDisplay(): void {
  current = { ...DEFAULT_MONEY_DISPLAY }
  for (const l of listeners) l()
}

/** Subscribe to display changes (so a live preview / header re-renders). */
export function subscribeMoneyDisplay(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Clamp/normalize any incoming config to safe bounds. */
export function normalizeMoneyDisplay(d: Partial<MoneyDisplay>): MoneyDisplay {
  const symbol = (d.symbol ?? DEFAULT_MONEY_DISPLAY.symbol).slice(0, 4) || '$'
  const decimals = Math.max(0, Math.min(2, Math.round(d.decimals ?? DEFAULT_MONEY_DISPLAY.decimals)))
  return {
    symbol,
    symbolPosition: d.symbolPosition === 'after' ? 'after' : 'before',
    locale: d.locale || DEFAULT_MONEY_DISPLAY.locale,
    decimals,
  }
}
