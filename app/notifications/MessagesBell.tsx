/**
 * The player inbox bell — the second half of the manager Communication binding. It renders
 * the player's in-app messages (operator DMs + broadcasts) from messagesStore via inboxFor,
 * with an unread badge derived from the player-side seen-store. Opening the dropdown marks
 * the inbox seen. Read-only: it only displays what an operator sent.
 */
import { useSyncExternalStore } from 'react'
import {
  Menu as DropMenu,
  MenuButton as DropButton,
  MenuItem as DropItem,
  MenuHeader as DropHeader,
} from '@szhsin/react-menu'
import { Bell } from 'lucide-react'
import { messagesStore, inboxFor } from '../../manager/communication/index.js'
import { getLastSeen, getSeenVersion, markSeen, subscribeSeen } from './seen-store.js'
import './notifications.css'

export function MessagesBell({ playerId }: { playerId: string }) {
  useSyncExternalStore(messagesStore.subscribe, messagesStore.version, messagesStore.version)
  useSyncExternalStore(subscribeSeen, getSeenVersion, getSeenVersion)

  const inbox = inboxFor(messagesStore.messages(), playerId)
  const lastSeen = getLastSeen(playerId)
  const unread = inbox.filter((m) => m.time > lastSeen).length

  return (
    <DropMenu
      transition
      align="end"
      gap={6}
      menuClassName="drop-menu pa-inbox"
      onMenuChange={(e: { open: boolean }) => {
        if (e.open) markSeen(playerId, Date.now())
      }}
      menuButton={
        <DropButton
          className="pa-bell"
          aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
        >
          <Bell size={18} aria-hidden="true" />
          {unread > 0 && <span className="pa-bell-badge">{unread > 9 ? '9+' : unread}</span>}
        </DropButton>
      }
    >
      <DropHeader className="pa-inbox-head">Messages</DropHeader>
      {inbox.length === 0 ? (
        <DropItem className="pa-inbox-empty" disabled>
          No messages yet.
        </DropItem>
      ) : (
        inbox.slice(0, 12).map((m) => (
          <DropItem key={m.id} className="pa-inbox-item">
            <span className="pa-inbox-title">{m.title || 'Message'}</span>
            <span className="pa-inbox-body">{m.body}</span>
          </DropItem>
        ))
      )}
    </DropMenu>
  )
}
