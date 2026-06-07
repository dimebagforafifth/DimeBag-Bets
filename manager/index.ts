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
 * Planned: communication/, branding/, settings/ (presentation), copilot/ — see
 *          README.md for the phased plan.
 */

export { ReportingPage } from './reporting/index.js'
export { PromotionsPage } from './promotions/index.js'
