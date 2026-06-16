/**
 * The SGO book module — the player-facing sportsbook + bet flow for the new odds
 * contract. The app shell mounts `<BookView>`; everything else is the data + betting
 * layer it stands on. Consumes lib/odds/contract.ts (read-only) via the cache hook;
 * places through `core`. Credit/balance only.
 */

export { BookView } from './BookView.js'
export {
  useBookOdds,
  useBookEvent,
  setSlate,
  resetBookOdds,
  connectOddsCache,
  isLiveOdds,
} from './odds-source.js'
export { mockSlate, MOCK_LEAGUES } from './mockBook.js'

export { placeBookBet, settleBookBet, accountFor, __resetPlacement } from './placement.js'

export {
  betsForViewer,
  getBets,
  openBets,
  atRiskCents,
  subscribeBets,
  getBetsVersion,
  __resetBets,
  type BookBet,
  type BookBetStatus,
} from './bets-store.js'

export {
  legFromSelection,
  slipQuote,
  parlayPrice,
  isSameGame,
  relatedConflicts,
  movedLegKeys,
  type SlipLeg,
  type SlipMode,
} from './slip.js'

export { placeSampleBets, settleOpenBets, type SimulateResult } from './simulate.js'
