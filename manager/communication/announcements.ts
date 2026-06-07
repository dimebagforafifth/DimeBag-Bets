/**
 * Communication — book-wide announcements (pure model). The operator authors a
 * message; the player shell renders the ACTIVE ones as a banner (a shell binding —
 * see README), and they can also be pushed to Discord/Telegram (webhooks.ts). This
 * file holds the types + pure selection; the store persists, the dispatcher sends.
 */

export type Severity = 'info' | 'success' | 'warning'

export interface Announcement {
  id: number
  /** Epoch ms authored. */
  time: number
  title: string
  body: string
  severity: Severity
  /** Operator can switch a message off without deleting it. */
  active: boolean
  /** Epoch ms; 0 = never expires. */
  expiresAt: number
}

export interface AnnouncementDraft {
  title: string
  body: string
  severity: Severity
  /** Lifetime in ms from publish (0 = no expiry). */
  ttlMs: number
}

/** The announcements a player should currently see: active and not past expiry.
 *  Pure — `now` is injected. */
export function activeAnnouncements(list: Announcement[], now: number): Announcement[] {
  return list.filter((a) => a.active && (a.expiresAt === 0 || a.expiresAt > now))
}
