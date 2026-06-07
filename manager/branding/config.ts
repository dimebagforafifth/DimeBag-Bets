/**
 * The per-book white-label config (branding + presentation). One persisted record
 * the operator owns — it does NOT touch the org tree or any core type; it sits
 * alongside them. Branding (name/logo/accent/domain) drives runtime theming; the
 * money-display block threads into games/shared/presentation so the points symbol /
 * format apply app-wide. Pure types + normalization here; the store applies it.
 */

import { DEFAULT_MONEY_DISPLAY, normalizeMoneyDisplay, type MoneyDisplay } from '../../games/shared/presentation.js'

export interface BookConfig {
  /** Brand/book name — drives the page title (and the shell header, once bound). */
  name: string
  /** Lobby subtitle / player-facing tagline. */
  tagline: string
  /** Logo image URL or data URI ('' = wordmark only). */
  logoUrl: string
  /** Accent colour (hex). '' = fall back to the theme default. */
  accent: string
  /** Custom domain (informational here; DNS/hosting is a Vercel step). */
  domain: string
  /** How points render (symbol/position/locale/decimals). */
  money: MoneyDisplay
  /** IANA timezone for absolute timestamps ('' = the viewer's local zone). */
  timezone: string
}

export const DEFAULT_BOOK_CONFIG: BookConfig = {
  name: 'DimeBag-Bets',
  tagline: 'Clean, fast, points-based play.',
  logoUrl: '',
  accent: '',
  domain: '',
  money: { ...DEFAULT_MONEY_DISPLAY },
  timezone: '',
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Clamp/validate any partial config into a safe, complete BookConfig. */
export function normalizeBookConfig(partial: Partial<BookConfig>): BookConfig {
  const accent = partial.accent && HEX.test(partial.accent) ? partial.accent : ''
  return {
    name: (partial.name ?? DEFAULT_BOOK_CONFIG.name).slice(0, 40) || DEFAULT_BOOK_CONFIG.name,
    tagline: (partial.tagline ?? DEFAULT_BOOK_CONFIG.tagline).slice(0, 80),
    logoUrl: (partial.logoUrl ?? '').slice(0, 2000),
    accent,
    domain: (partial.domain ?? '').trim().slice(0, 120),
    money: normalizeMoneyDisplay(partial.money ?? {}),
    timezone: (partial.timezone ?? '').slice(0, 60),
  }
}

/** Whether a timezone string is one the runtime can format with (so the UI can
 *  reject a typo before it's saved). Empty = local, always valid. */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Format an epoch ms in a book timezone (or local if ''). */
export function formatInZone(epoch: number, timezone: string, locale = 'en-US'): string {
  return new Date(epoch).toLocaleString(locale, {
    timeZone: timezone || undefined,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
