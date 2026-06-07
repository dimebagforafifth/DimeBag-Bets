/**
 * Branding / white-label + presentation settings. One persisted per-book config
 * (name, logo, accent, domain, money display, timezone) that drives runtime theming
 * and the app-wide points symbol/format — without touching the org tree, core, or
 * the shell. Public surface.
 */

export {
  DEFAULT_BOOK_CONFIG,
  normalizeBookConfig,
  isValidTimezone,
  formatInZone,
  type BookConfig,
} from './config.js'
export { createBookConfigStore, bookConfigStore, type BookConfigStore } from './config-store.js'
export { applyBranding } from './theme.js'
export { BrandingPage } from './ui/BrandingPage.js'
