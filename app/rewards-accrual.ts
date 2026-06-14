/**
 * Wire rewards to REAL play. Every wager placed anywhere (casino, sportsbook, futures,
 * ticket writer) flows through core's `placeWager`, which emits `onWagerPlaced`. We tap that
 * one seam so rakeback accrues, lifetime `wagered` (rank) grows, and the warm-up bonus
 * advances from actual betting — and any warm-up that crosses its threshold unlocks to the
 * player's balance. Imported for its side effect from app/App.tsx (like book-ledger).
 */
import { onWagerPlaced, onWagerResolved } from '../core/index.js'
import { settleWager, applyProfitBoost } from '../rewards/players.js'
import { rewardsNow } from '../rewards/clock.js'

// On placement: accrue rakeback + advance rank/warm-up from the real stake.
onWagerPlaced((e) => {
  settleWager(e.accountId, e.stake, rewardsNow())
})

// On a winning resolution: apply the active profit-boost promo (+X% of profit, up to $cap).
onWagerResolved((e) => {
  if (e.outcome === 'win' && e.profit > 0) {
    applyProfitBoost(e.accountId, e.stake, e.profit, rewardsNow())
  }
})
