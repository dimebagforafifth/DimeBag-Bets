/**
 * Operator glossary — plain-language explanations of the management console's most
 * confusing concepts. ONE source of truth used by both the hover tooltips
 * (features/_desk/Tooltip) and the Operator Manual (features/help). Coins only.
 */
export interface GlossaryEntry {
  label: string
  short: string
}

export const GLOSSARY = {
  figure: {
    label: 'Figure',
    short:
      "A player's running coin balance for the period — what they're up (positive: the book owes them) or down (negative: they owe the book). Resets to zero at settlement.",
  },
  'book-figure': {
    label: 'Book figure',
    short:
      'The book’s net across all players — the inverse of the sum of player figures. Positive means the book is up for the period.',
  },
  exposure: {
    label: 'Exposure',
    short:
      'Coins currently at risk on open (ungraded) bets — a player’s pending total. Not yet won or lost.',
  },
  pending: {
    label: 'Pending',
    short:
      'Stake locked on bets that are placed but not yet graded. It’s held aside until the bet resolves.',
  },
  available: {
    label: 'Available to wager',
    short: 'How much a player can still stake: credit limit + balance − pending.',
  },
  'credit-limit': {
    label: 'Credit limit',
    short:
      'The furthest a player may go down — the most they can owe before they have to settle.',
  },
  owes: {
    label: 'Owes',
    short: 'The player is down (negative figure): they owe the book. You “Collect”.',
  },
  owed: {
    label: 'Owed',
    short: 'The player is up (positive figure): the book owes them. You “Pay player”.',
  },
  grant: {
    label: 'Grant',
    short: 'Add coins to a player’s figure (a credit or comp). Routed through core with a logged reason.',
  },
  deduct: {
    label: 'Deduct',
    short: 'Remove coins from a player’s figure (a debit or correction). Audited like a grant.',
  },
  set: {
    label: 'Set',
    short:
      'Set a player’s figure to an exact amount. Applied as the signed difference from their current balance.',
  },
  'net-to-book': {
    label: 'Net to the book',
    short:
      'How much a queued batch of cashier actions moves the book — the inverse of the sum of the deltas.',
  },
  settle: {
    label: 'Settle',
    short:
      'Square up the period: record every figure to the archive, then reset balances to zero for the new period.',
  },
  carryover: {
    label: 'Carry forward (soft close)',
    short:
      'Record the settlement sheet but DON’T reset figures — they roll into the next period. (A hard close resets to zero.)',
  },
  'pending-guard': {
    label: 'Pending guard',
    short:
      'You can’t settle while any bet is still pending — grade or void every open bet first, or settlement is refused.',
  },
  push: {
    label: 'Push',
    short: 'A tie (e.g. an exact spread or total): the stake is returned, with no win or loss.',
  },
  void: {
    label: 'Void',
    short:
      'A cancelled bet (postponed game, non-starter, palpable error): the stake is returned, no win or loss.',
  },
  hold: {
    label: 'Hold',
    short: 'The book’s theoretical edge — the margin baked into the prices you offer.',
  },
} as const

export type GlossaryId = keyof typeof GLOSSARY

export const glossaryEntry = (id: GlossaryId): GlossaryEntry => GLOSSARY[id]
