/**
 * PlayStadium brand components — the molecule layer of the "Chip Gold & Carbon"
 * design system, ported from the Claude Design system to typed TSX. They hang off
 * the global brand tokens in app/theme.css and compose the primitives in
 * components/ui (e.g. BetSlip uses the real <Button />). Import these in screens;
 * never re-implement a primitive.
 */
export { Wordmark, ChipLogo } from './Wordmark'
export type { WordmarkProps, ChipLogoProps } from './Wordmark'

export { BrandBadge } from './Badge'
export type { BrandBadgeProps, BrandBadgeVariant } from './Badge'

export { BrandChip } from './Chip'
export type { BrandChipProps } from './Chip'

export { Stat } from './Stat'
export type { StatProps } from './Stat'

export { WalletPill } from './WalletPill'
export type { WalletPillProps } from './WalletPill'

export { GameCard } from './GameCard'
export type { GameCardProps } from './GameCard'

export { OddsButton } from './OddsButton'
export type { OddsButtonProps } from './OddsButton'

export { EventRow } from './EventRow'
export type { EventRowProps, Market, OddsOption, Competitor } from './EventRow'

export { BetSlip } from './BetSlip'
export type { BetSlipProps, BetSelection } from './BetSlip'
