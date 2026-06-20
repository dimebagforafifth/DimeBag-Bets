/**
 * The SGO book module — the player-facing sportsbook + bet flow for the new odds
 * contract. The app shell mounts `<BookView>`; everything else is the data + betting
 * layer it stands on. Consumes lib/odds/contract.ts (read-only) via the cache hook;
 * places through `core`. Credit/balance only.
 */

export { BookView } from './BookView.js'
export { BetBuilder } from './BetBuilder.js'
export {
  useBookOdds,
  useBookEvent,
  setSlate,
  resetBookOdds,
  connectOddsCache,
  connectSnapshot,
  hydrateFromCache,
  assembleEvents,
  createRestOddsCacheReader,
  isLiveOdds,
  type OddsCacheReader,
  type ConnectOddsCacheOptions,
} from './odds-source.js'
export { mockSlate, MOCK_LEAGUES } from './mockBook.js'

export {
  placeBookBet,
  settleBookBet,
  cashOutBookBet,
  liveCashOutOffer,
  accountFor,
  __resetPlacement,
  type CashOutResult,
} from './placement.js'

export {
  builderGroups,
  builderQuote,
  selectionAvailability,
  toggleBuilderLeg,
  legsOffBoard,
  type BuilderGroup,
  type BuilderQuote,
  type LegAvailability,
} from './builder.js'

export {
  cashOutQuote,
  cashOutMath,
  liveWinProbability,
  liveLegWinProbability,
  DEFAULT_CASHOUT_MARGIN,
  type CashOutQuote,
  type CashOutMath,
} from './cashout.js'

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
  sgpPrice,
  combinedDecimal,
  isSameGame,
  relatedConflicts,
  contradictoryLegs,
  movedLegKeys,
  type SlipLeg,
  type SlipMode,
} from './slip.js'

export { placeSampleBets, settleOpenBets, type SimulateResult } from './simulate.js'
