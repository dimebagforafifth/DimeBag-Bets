/**
 * Runtime theming — applies the book's branding to the live document WITHOUT
 * editing any shared CSS or the shell. It overrides the theme's accent token
 * (`--gem`) on :root and sets the page title; everything else (buttons, links,
 * highlights) already reads `--gem`, so the operator's colour flows app-wide.
 * No-op outside a browser (SSR / node tests).
 */

import type { BookConfig } from './config.js'

export function applyBranding(cfg: BookConfig): void {
  if (typeof document === 'undefined' || !document.documentElement) return
  const root = document.documentElement
  if (cfg.accent) root.style.setProperty('--gem', cfg.accent)
  else root.style.removeProperty('--gem') // fall back to theme.css default
  document.title = cfg.name || 'DimeBag-Bets'
}
