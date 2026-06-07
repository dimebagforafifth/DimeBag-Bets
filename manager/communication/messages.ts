/**
 * Player messages — operator → player in-app messaging (pure model). One message is
 * addressed to a single player (a direct message) or to '*' (a broadcast in-app
 * notification). The player shell renders each player's inbox via `inboxFor` (a
 * binding — see README); read/unread state is player-side. The manager side only
 * composes + lists what it sent. No money, no off-platform delivery (that needs a
 * contact field on org `Member`).
 */

/** Recipient sentinel for "every player". */
export const ALL_PLAYERS = '*'

export interface PlayerMessage {
  id: number
  time: number
  /** A player id, or ALL_PLAYERS for a broadcast. */
  recipientId: string
  recipientName: string
  title: string
  body: string
}

/** The messages a given player should see: their own DMs plus broadcasts. Pure. */
export function inboxFor(messages: PlayerMessage[], playerId: string): PlayerMessage[] {
  return messages.filter((m) => m.recipientId === playerId || m.recipientId === ALL_PLAYERS)
}
