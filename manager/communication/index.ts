/**
 * Communication — book-wide announcements + Discord/Telegram webhooks. Operator →
 * player messaging; no money involved. Per-player off-platform DMs await a contact
 * field on org `Member` (that workstream's to add) — see README. Public surface.
 */

export { activeAnnouncements, type Announcement, type AnnouncementDraft, type Severity } from './announcements.js'
export {
  dispatch,
  configuredChannels,
  announcementText,
  EMPTY_WEBHOOKS,
  type WebhookConfig,
  type DispatchResult,
  type Channel,
} from './webhooks.js'
export { commsStore, createCommsStore, type CommsStore, type CommsDoc } from './comms-store.js'
export { CommunicationPage } from './ui/CommunicationPage.js'
