import { CommunicationPage } from '../../manager/communication/ui/CommunicationPage.js'
import './players.css'

/**
 * Messaging — broadcast & DM players. Adapts the existing manager Communication page
 * (announcements, direct messages, webhooks) as-is; it's already a self-contained body.
 */
export function MessagingPanel() {
  return (
    <div className="feat">
      <CommunicationPage />
    </div>
  )
}
