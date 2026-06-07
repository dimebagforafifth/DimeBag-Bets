/**
 * The manager-side growth, configuration & insight layer.
 *
 * Self-contained pages the app shell mounts under Management (see README.md). Each
 * feature lives in its own subfolder; all of them READ the shared models
 * (core / org / ledger / persistence / vip) and never redefine them. Money moves
 * only through core. This is the public surface the shell imports.
 *
 * Built:   reporting/   — read-only analytics (turnover, hold, engagement, export).
 *          promotions/  — free-play / point bonuses via core.grant (single + bulk).
 *          branding/    — white-label + presentation (name/logo/accent/domain,
 *                         points symbol/format, timezone) with runtime theming.
 *          communication/ — book-wide announcements + Discord/Telegram webhooks.
 *          loyalty/     — rank-ladder / progression config over the VIP program.
 *          copilot/     — advisory insights over a read-only book snapshot.
 *
 * All six manager feature areas are built. See README.md for the per-area status
 * and the shell bindings still to wire.
 */

export { ReportingPage } from './reporting/index.js'
export { PromotionsPage } from './promotions/index.js'
export { BrandingPage } from './branding/index.js'
export { CommunicationPage } from './communication/index.js'
export { LoyaltyPage } from './loyalty/index.js'
export { CopilotPage } from './copilot/index.js'
