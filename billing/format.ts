/**
 * FIAT money formatting for billing.
 *
 * Billing is REAL US dollars, so it must NOT use the shared `formatMoney`, which renders the
 * player POINTS unit and follows the operator's white-label display knob (which can switch the
 * symbol to '₵'/'pts', change the locale, etc.). `usd()` is locked to '$X,XXX.XX' regardless.
 * Amounts are integer cents, as everywhere in the repo.
 */

import { formatMoneyWith } from '../games/shared/money.js'
import type { MoneyDisplay } from '../games/shared/presentation.js'

const USD: MoneyDisplay = { symbol: '$', symbolPosition: 'before', locale: 'en-US', decimals: 2 }

/** Integer cents → fixed US-dollar string: `$1,234.56` / `−$9.23`. */
export function usd(cents: number): string {
  return formatMoneyWith(cents, USD)
}
