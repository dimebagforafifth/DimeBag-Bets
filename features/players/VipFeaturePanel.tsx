/**
 * VIP — ADAPTS vip/ui VipPanel (the VIP rank ladder + leaderboard + free-play),
 * ported from the old manager console. Feeds it the live player list; themed by the
 * shared console PanelShell.
 */
import { useSyncExternalStore } from 'react'
import { VipPanel } from '../../vip/ui/index.js'
import { getBookVersion, listPlayers, subscribeBook } from '../../app/book-store.js'
import { PanelShell } from '../operations/shared.js'

export function VipFeaturePanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const players = listPlayers().map((p) => ({ id: p.id, name: p.name }))
  return (
    <PanelShell onBack={onBack}>
      <VipPanel players={players} />
    </PanelShell>
  )
}
