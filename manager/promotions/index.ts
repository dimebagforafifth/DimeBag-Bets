/**
 * Promotions — free-play / point bonuses (single → bulk via the org downline).
 * Money moves only through `core.grant`; this module drafts, validates, applies,
 * and logs. Public surface.
 */

export { targetPlayers, planBonus, type BonusDraft, type BonusType, type BonusPlan } from './promotions.js'
export { sendBonus, type SendResult } from './send.js'
export {
  promoStore,
  createPromoStore,
  type PromoStore,
  type PromoCampaign,
  type PromoLogDoc,
} from './promo-store.js'
export { PromotionsPage } from './ui/PromotionsPage.js'
